import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Shield, Wind } from 'lucide-react';
import { AqiHero } from './components/AqiHero';
import { ChoiceImpactSimulator } from './components/ChoiceImpactSimulator';
import { CleanAirWindowCard } from './components/CleanAirWindowCard';
import { LocationBar } from './components/LocationBar';
import { PlaybookSearch } from './components/PlaybookSearch';
import { RoutinePlanner } from './components/RoutinePlanner';
import { PRESET_CITIES } from './data/presets';
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
  publicTransitOrWfhSwap: true
};

export default function App() {
  const [selectedCity, setSelectedCity] = useState<LocationOption>(PRESET_CITIES[0]!);
  const [air, setAir] = useState<AirQualityPayload | null>(null);
  const [airLoading, setAirLoading] = useState(true);
  const [airError, setAirError] = useState<string | null>(null);

  const [profile, setProfile] = useState<HouseholdProfile>(DEFAULT_PROFILE);
  const [toggles, setToggles] = useState<ChoiceToggles>(DEFAULT_TOGGLES);

  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const ambientPm25 = air?.current.pm25 ?? 120;
  const impact = useMemo(
    () => calculateChoiceImpact(ambientPm25, profile, toggles),
    [ambientPm25, profile, toggles]
  );

  const loadCityAir = useCallback(async (loc: LocationOption) => {
    setAirLoading(true);
    setAirError(null);
    try {
      const data = await fetchAirQuality(loc);
      setAir(data);
    } catch {
      setAirError('Could not reach live air quality telemetry. Please retry in a moment.');
    } finally {
      setAirLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCityAir(selectedCity);
  }, [selectedCity, loadCityAir]);

  async function handleGeneratePlan(userQuestion: string) {
    if (!air) return;
    setPlanLoading(true);
    try {
      const activeChoices = impact.breakdown.map((b) => b.label);
      const result = await requestAssistantPlan({
        air,
        profile,
        impact,
        activeChoices,
        userQuestion
      });
      setPlan(result);
    } finally {
      setPlanLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-sky-800 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-700 text-white">
              <Shield className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                VayuShield AI
              </h1>
              <p className="text-xs text-slate-600">
                Urban Air Quality Assistant · CPCB NAQI + Clean-Air Windows + Choice Impact
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadCityAir(selectedCity)}
            disabled={airLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${airLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh Telemetry
          </button>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <LocationBar
          selected={selectedCity}
          loading={airLoading}
          onSelect={(loc) => {
            setSelectedCity(loc);
            setPlan(null);
          }}
        />

        {airError && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {airError}
          </div>
        )}

        {airLoading && !air && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600"
          >
            <Wind className="h-5 w-5 animate-pulse text-sky-700" aria-hidden="true" />
            Loading live air quality and 24-hour clean-air windows for {selectedCity.name}...
          </div>
        )}

        {air && (
          <>
            <AqiHero air={air} />
            <CleanAirWindowCard hourly={air.hourly} analysis={air.windowAnalysis} />
            <ChoiceImpactSimulator
              profile={profile}
              toggles={toggles}
              impact={impact}
              onProfileChange={setProfile}
              onToggleChange={setToggles}
            />
            <RoutinePlanner
              profile={profile}
              plan={plan}
              loading={planLoading}
              onProfileChange={setProfile}
              onGenerate={handleGeneratePlan}
            />
          </>
        )}

        <PlaybookSearch />
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Built for <strong>PromptWars Challenge 06</strong>. Data powered by{' '}
            <a
              href="https://open-meteo.com/en/docs/air-quality-api"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sky-800 underline"
            >
              Open-Meteo Air Quality API (CC BY 4.0)
            </a>
            ,{' '}
            <a
              href="https://openaq.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sky-800 underline"
            >
              OpenAQ
            </a>
            , and{' '}
            <a
              href="https://www.pib.gov.in/newsite/printrelease.aspx?relid=110654"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sky-800 underline"
            >
              India CPCB NAQI
            </a>
            .
          </p>
          <p>Informational guidance only — not medical advice.</p>
        </div>
      </footer>
    </div>
  );
}
