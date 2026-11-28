import { useEffect, useRef, useState } from 'react';
import { BookOpen, SlidersHorizontal, Sparkles } from 'lucide-react';
import { AppFooter, AppHeader } from './components/AppHeader';
import { AqiHero } from './components/AqiHero';
import { ChoiceImpactSimulator } from './components/ChoiceImpactSimulator';
import { PlaybookSearch } from './components/PlaybookSearch';
import { RoutinePlanner } from './components/RoutinePlanner';
import { PRESET_CITIES } from './data/presets';
import { POLLUTANT_LABELS } from './engine/cpcbAqi';
import { calculateChoiceImpact } from './engine/impactCalculator';
import { fetchAirQuality, requestAssistantPlan } from './services/airQualityClient';
import type {
  AirQualityPayload,
  AssistantPlan,
  ChoiceToggles,
  HouseholdProfile,
  LocationOption
} from './types/airQuality';

const DEFAULT_PROFILE: HouseholdProfile = {
  householdMembers: ['Children', 'Daily Commuters'],
  baselineCommute: 'solo_car',
  chosenCommute: 'metro',
  commuteKm: 16,
  homeType: 'apartment',
  budgetTier: 'budget_diy'
};

const DEFAULT_TOGGLES: ChoiceToggles = {
  hepaOrCorsiRosenthal: true,
  smartVentilation: true,
  cleanCookingExhaust: true,
  n95OutdoorMask: true,
  publicTransitOrWfhSwap: true,
  zeroSmokeIndoor: false
};

const TABS = [
  { id: 'plan', label: 'AI Daily Plan', icon: Sparkles },
  { id: 'impact', label: 'Impact Lab', icon: SlidersHorizontal },
  { id: 'playbook', label: 'Playbook & Local HF', icon: BookOpen }
] as const;

const DEFAULT_CITY: LocationOption = PRESET_CITIES[0] ?? {
  name: 'New Delhi',
  region: 'Delhi NCR',
  country: 'India',
  lat: 28.6139,
  lon: 77.209
};

function buildStatusAnnouncement(
  selected: LocationOption,
  air: AirQualityPayload | null,
  airLoading: boolean,
  airError: boolean
): string {
  if (airLoading) return `Loading air quality and 24-hour forecast for ${selected.name}.`;
  if (airError) return `Could not load live air quality telemetry for ${selected.name}.`;
  if (!air) return '';
  const dominantName = POLLUTANT_LABELS[air.cpcb.dominantPollutant].name;
  return `${air.location.name} air quality loaded: CPCB NAQI ${air.cpcb.aqi}, ${air.cpcb.category}. Dominant pollutant ${dominantName}.`;
}

function resolveNextTabIndex(current: number, key: string): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return TABS.length - 1;
  if (key === 'ArrowRight') return (current + 1) % TABS.length;
  if (key === 'ArrowLeft') return (current + TABS.length - 1) % TABS.length;
  return null;
}

/** Root VayuShield AI application shell coordinating telemetry, planning, impact modeling, and WCAG landmarks. */
export default function App() {
  const [selected, setSelected] = useState<LocationOption>(DEFAULT_CITY);
  const [refresh, setRefresh] = useState(0);
  const [air, setAir] = useState<AirQualityPayload | null>(null);
  const [airLoading, setAirLoading] = useState(true);
  const [airError, setAirError] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const planRequest = useRef(0);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const impact = calculateChoiceImpact(air?.current.pm25 ?? 120, profile, toggles);
  const statusAnnouncement = buildStatusAnnouncement(selected, air, airLoading, airError);

  useEffect(() => {
    let active = true;
    fetchAirQuality(selected)
      .then(
        (data) => {
          if (active) setAir(data);
        },
        () => {
          if (active) setAirError(true);
        }
      )
      .finally(() => {
        if (active) setAirLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected, refresh]);

  function selectCity(city: LocationOption) {
    if (city.name === selected.name && city.lat === selected.lat && city.lon === selected.lon)
      return;
    planRequest.current += 1;
    setSelected(city);
    setAir(null);
    setAirLoading(true);
    setAirError(false);
    setPlan(null);
    setPlanLoading(false);
  }

  function refreshAir() {
    setAirError(false);
    setAirLoading(true);
    setRefresh((value) => value + 1);
  }

  async function generatePlan(userQuestion: string) {
    if (!air || airLoading || planLoading) return;
    const request = ++planRequest.current;
    setPlanLoading(true);
    try {
      const result = await requestAssistantPlan({
        air,
        profile,
        impact,
        activeChoices: impact.breakdown.map((choice) => choice.label),
        userQuestion
      });
      if (request === planRequest.current) setPlan(result);
    } finally {
      if (request === planRequest.current) setPlanLoading(false);
    }
  }

  const panels = [
    <RoutinePlanner
      profile={profile}
      plan={plan}
      loading={planLoading}
      ready={Boolean(air) && !airLoading}
      onProfileChange={setProfile}
      onGenerate={generatePlan}
    />,
    <ChoiceImpactSimulator
      profile={profile}
      toggles={toggles}
      impact={impact}
      ambientPm25={air?.current.pm25 ?? 120}
      hasTelemetry={Boolean(air)}
      onProfileChange={setProfile}
      onToggleChange={setToggles}
    />,
    <PlaybookSearch />
  ];

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <AppHeader
        selected={selected}
        airLoading={airLoading}
        onSelectCity={selectCity}
        onRefresh={refreshAir}
      />
      <main id="main-content" tabIndex={-1} className="page-width main-layout">
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Air quality status updates"
        >
          {statusAnnouncement}
        </p>
        {airError && (
          <p className="notice" role="alert">
            Live readings couldn’t load. Try refreshing or switching cities.
          </p>
        )}
        {air ? (
          <AqiHero air={air} impact={impact} />
        ) : (
          <section
            className="air-hero hero-placeholder"
            aria-label="Air quality"
            aria-busy={airLoading}
          >
            <h2>{selected.name}</h2>
            {airLoading && <p>Loading air quality and forecast…</p>}
          </section>
        )}
        <section className="workspace" aria-label="Air quality workspace">
          <div
            className="workspace-tabs"
            role="tablist"
            aria-label="Air quality tools"
            data-active-tab={tabIndex}
          >
            <span className="tab-indicator" aria-hidden="true" />
            {TABS.map(({ id, label, icon: Icon }, index) => (
              <button
                type="button"
                id={'tab-' + id}
                key={id}
                role="tab"
                ref={(button) => {
                  tabButtons.current[index] = button;
                }}
                aria-selected={tabIndex === index}
                aria-controls={'panel-' + id}
                tabIndex={tabIndex === index ? 0 : -1}
                onClick={() => setTabIndex(index)}
                onKeyDown={(event) => {
                  const next = resolveNextTabIndex(index, event.key);
                  if (next === null) return;
                  event.preventDefault();
                  setTabIndex(next);
                  tabButtons.current[next]?.focus();
                }}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {TABS.map(({ id }, index) => (
            <div
              id={'panel-' + id}
              key={id}
              role="tabpanel"
              aria-labelledby={'tab-' + id}
              className="workspace-panel"
              tabIndex={0}
              hidden={tabIndex !== index}
            >
              {panels[index]}
            </div>
          ))}
        </section>
      </main>
      <AppFooter />
    </>
  );
}
