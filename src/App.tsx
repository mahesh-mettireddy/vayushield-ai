import { useEffect, useRef, useState } from 'react';
import { AppFooter, AppHeader } from './components/AppHeader';
import { AqiHero } from './components/AqiHero';
import { ChoiceImpactSimulator } from './components/ChoiceImpactSimulator';
import { PlaybookSearch } from './components/PlaybookSearch';
import { RoutinePlanner } from './components/RoutinePlanner';
import { WorkspaceTabs } from './components/WorkspaceTabs';
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

const SAMPLE_PM25_UG_M3 = 120;

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
  const planController = useRef<AbortController | null>(null);
  const impact = calculateChoiceImpact(air?.current.pm25 ?? SAMPLE_PM25_UG_M3, profile, toggles);
  const statusAnnouncement = buildStatusAnnouncement(selected, air, airLoading, airError);

  useEffect(() => {
    const controller = new AbortController();
    fetchAirQuality(selected, controller.signal)
      .then(
        (data) => {
          if (!controller.signal.aborted) setAir(data);
        },
        () => {
          if (!controller.signal.aborted) setAirError(true);
        }
      )
      .finally(() => {
        if (!controller.signal.aborted) setAirLoading(false);
      });
    return () => controller.abort();
  }, [selected, refresh]);

  useEffect(() => {
    return () => {
      planController.current?.abort();
    };
  }, []);

  function selectCity(city: LocationOption) {
    if (city.name === selected.name && city.lat === selected.lat && city.lon === selected.lon)
      return;
    planRequest.current += 1;
    planController.current?.abort();
    planController.current = null;
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
    planController.current?.abort();
    const controller = new AbortController();
    planController.current = controller;
    setPlanLoading(true);
    try {
      const result = await requestAssistantPlan({
        air,
        profile,
        impact,
        activeChoices: impact.breakdown.map((choice) => choice.label),
        userQuestion,
        signal: controller.signal
      });
      if (request === planRequest.current && !controller.signal.aborted) setPlan(result);
    } catch {
      // Aborted requests are superseded by city switches or unmount.
    } finally {
      if (request === planRequest.current && !controller.signal.aborted) setPlanLoading(false);
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
      ambientPm25={air?.current.pm25 ?? SAMPLE_PM25_UG_M3}
      hasTelemetry={Boolean(air)}
      onProfileChange={setProfile}
      onToggleChange={setToggles}
    />,
    <PlaybookSearch />
  ] as const;

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
        <WorkspaceTabs tabIndex={tabIndex} onSelectTab={setTabIndex} panels={panels} />
      </main>
      <AppFooter />
    </>
  );
}
