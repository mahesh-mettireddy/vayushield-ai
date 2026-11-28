import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { AqiHero } from './components/AqiHero';
import { ChoiceImpactSimulator } from './components/ChoiceImpactSimulator';
import { LocationBar } from './components/LocationBar';
import { PlaybookSearch } from './components/PlaybookSearch';
import { RoutinePlanner } from './components/RoutinePlanner';
import { PRESET_CITIES } from './data/presets';
import { calculateChoiceImpact } from './engine/impactCalculator';
import { fetchAirQuality, requestAssistantPlan } from './services/airQualityClient';
import type { AirQualityPayload, AssistantPlan, ChoiceToggles, HouseholdProfile, LocationOption } from './types/airQuality';

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

export default function App() {
  const [selected, setSelected] = useState<LocationOption>(PRESET_CITIES[0]!);
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

  useEffect(() => {
    let active = true;
    fetchAirQuality(selected).then(
      (data) => { if (active) setAir(data); },
      () => { if (active) setAirError(true); }
    ).finally(() => { if (active) setAirLoading(false); });
    return () => { active = false; };
  }, [selected, refresh]);

  function selectCity(city: LocationOption) {
    if (city === selected) return;
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
    <RoutinePlanner profile={profile} plan={plan} loading={planLoading} ready={Boolean(air) && !airLoading}
      onProfileChange={setProfile} onGenerate={generatePlan} />,
    <ChoiceImpactSimulator profile={profile} toggles={toggles} impact={impact}
      ambientPm25={air?.current.pm25 ?? 120} hasTelemetry={Boolean(air)}
      onProfileChange={setProfile} onToggleChange={setToggles} />,
    <PlaybookSearch />
  ];

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="app-header">
        <div className="page-width header-inner">
          <div className="brand">
            <span className="brand-mark">
              <svg viewBox="0 0 32 32" width="27" height="27" fill="none" stroke="currentColor"
                strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 3.4c3.2 2.1 6.6 3.3 10 3.8v8.2c0 6.1-4.7 10.7-10 13.2-5.3-2.5-10-7.1-10-13.2V7.2c3.4-.5 6.8-1.7 10-3.8Z" />
                <path d="M9.5 13.1h9a1.7 1.7 0 1 0-1.7-1.7M8.8 16.5h13M10 20h7a1.6 1.6 0 1 1-1.6 1.6" />
              </svg>
            </span>
            <div><h1>VayuShield AI</h1><p>Urban air quality assistant</p></div>
          </div>
          <div className="header-controls">
            <LocationBar selected={selected} onSelect={selectCity} />
            <button className="icon-button" type="button" aria-label="Refresh air quality"
              title="Refresh air quality" onClick={refreshAir} disabled={airLoading}>
              <RefreshCw size={17} aria-hidden="true" className={airLoading ? 'animate-spin' : undefined} />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="page-width main-layout">
        {airError && <p className="notice" role="alert">Live readings couldn’t load. Try refreshing or switching cities.</p>}
        {air ? <AqiHero air={air} impact={impact} /> : (
          <section className="air-hero hero-placeholder" aria-label="Air quality">
            <h2>{selected.name}</h2>
            {airLoading && <p role="status">Loading air quality and forecast…</p>}
          </section>
        )}

        <section className="workspace" aria-label="Air quality workspace">
          <div className="workspace-tabs" role="tablist" aria-label="Air quality tools"
            style={{ '--active-tab': tabIndex } as CSSProperties}>
            <span className="tab-indicator" aria-hidden="true" />
            {TABS.map(({ id, label, icon: Icon }, index) => (
              <button type="button" id={'tab-' + id} key={id} role="tab"
                ref={(button) => { tabButtons.current[index] = button; }}
                aria-selected={tabIndex === index} aria-controls={'panel-' + id}
                tabIndex={tabIndex === index ? 0 : -1}
                onClick={() => setTabIndex(index)}
                onKeyDown={(event) => {
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
                    : event.key === 'ArrowRight' ? (index + 1) % TABS.length
                      : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : null;
                  if (next === null) return;
                  event.preventDefault();
                  setTabIndex(next);
                  tabButtons.current[next]?.focus();
                }}>
                <Icon size={17} aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </div>
          {TABS.map(({ id }, index) => (
            <div id={'panel-' + id} key={id} role="tabpanel" aria-labelledby={'tab-' + id}
              className="workspace-panel" tabIndex={0} hidden={tabIndex !== index}>
              {panels[index]}
            </div>
          ))}
        </section>
      </main>

      <footer className="page-width app-footer">
        <p>VayuShield AI · Data powered by <a href="https://open-meteo.com/en/docs/air-quality-api">Open-Meteo Air Quality API (CC BY 4.0)</a>, <a href="https://openaq.org/">OpenAQ</a>, and <a href="https://www.pib.gov.in/newsite/printrelease.aspx?relid=110654">India CPCB NAQI</a>.</p>
        <p>Forecasts and impact estimates are for general information.</p>
      </footer>
    </>
  );
}
