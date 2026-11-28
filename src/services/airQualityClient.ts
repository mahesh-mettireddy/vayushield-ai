import { analyzeCleanAirWindows, formatWindowRange } from '../engine/cleanAirWindow';
import { buildDeterministicPlan } from '../engine/deterministicFallback';
import { COMMUTE_LABELS } from '../engine/impactCalculator';
import {
  buildOpenMeteoAirUrl,
  buildOpenMeteoGeoUrl,
  readOpenMeteoForecast
} from '../engine/openMeteoForecast';
import type {
  AirQualityPayload,
  AssistantPlan,
  ChoiceImpactResult,
  HouseholdProfile,
  LocationOption
} from '../types/airQuality';
import {
  isAirQualityPayload,
  isAssistantPlan,
  parseApiSearchResults,
  parseOpenMeteoAirData,
  parseOpenMeteoGeoResults
} from './airQualitySchemas';

const CLIENT_FETCH_TIMEOUT_MS = 10_000;
const ASSISTANT_FETCH_TIMEOUT_MS = 25_000;
const MIN_SEARCH_QUERY_LENGTH = 2;

function createAbortError(message = 'Aborted'): Error {
  return new DOMException(message, 'AbortError');
}

function isAbortFailure(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === 'AbortError');
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  externalSignal?: AbortSignal,
  timeoutMs = CLIENT_FETCH_TIMEOUT_MS
): Promise<Response> {
  if (externalSignal?.aborted) {
    throw createAbortError();
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

async function fetchOpenMeteoDirect(
  loc: LocationOption,
  signal?: AbortSignal
): Promise<AirQualityPayload> {
  const res = await fetchWithTimeout(buildOpenMeteoAirUrl(loc.lat, loc.lon), undefined, signal);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

  const omData = parseOpenMeteoAirData(await res.json());
  const { current, hourly, cpcb } = readOpenMeteoForecast(omData);

  return {
    location: loc,
    fetchedAt: new Date().toISOString(),
    source: 'Open-Meteo Air Quality API (Direct)',
    current,
    cpcb,
    hourly,
    windowAnalysis: analyzeCleanAirWindows(hourly),
    groundStation: null
  };
}

/** Searches matching cities via `/api/air-quality` with direct Open-Meteo Geocoding fallback. */
export async function searchLocations(
  query: string,
  signal?: AbortSignal
): Promise<LocationOption[]> {
  const clean = query.trim();
  if (clean.length < MIN_SEARCH_QUERY_LENGTH) return [];

  try {
    const res = await fetchWithTimeout(
      `/api/air-quality?q=${encodeURIComponent(clean)}`,
      undefined,
      signal
    );
    if (res.ok) {
      const results = parseApiSearchResults(await res.json());
      if (results !== null) return results;
    }
  } catch (error) {
    if (isAbortFailure(error, signal)) throw error;
    // Fall back to direct Open-Meteo Geocoding when running pure `vite dev`
  }

  const direct = await fetchWithTimeout(buildOpenMeteoGeoUrl(clean), undefined, signal);
  if (!direct.ok) return [];
  return parseOpenMeteoGeoResults(await direct.json());
}

/** Fetches live AQI and 24-hour forecast telemetry, falling back directly to Open-Meteo offline/locally. */
export async function fetchAirQuality(
  loc: LocationOption,
  signal?: AbortSignal
): Promise<AirQualityPayload> {
  try {
    const params = new URLSearchParams({
      lat: String(loc.lat),
      lon: String(loc.lon),
      city: loc.name,
      region: loc.region,
      country: loc.country
    });
    const res = await fetchWithTimeout(`/api/air-quality?${params.toString()}`, undefined, signal);
    if (res.ok) {
      const data: unknown = await res.json();
      if (isAirQualityPayload(data)) return data;
    }
  } catch (error) {
    if (isAbortFailure(error, signal)) throw error;
    // Fall back to direct Open-Meteo when running pure `vite dev` without Vercel CLI
  }

  return fetchOpenMeteoDirect(loc, signal);
}

/** Requests a personalized routine plan from `/api/assistant` with deterministic local fallback. */
export async function requestAssistantPlan(params: {
  air: AirQualityPayload;
  profile: HouseholdProfile;
  impact: ChoiceImpactResult;
  activeChoices: string[];
  userQuestion: string;
  signal?: AbortSignal;
}): Promise<AssistantPlan> {
  const { air, profile, impact, activeChoices, userQuestion, signal } = params;
  const bestWindowLabel = formatWindowRange(air.windowAnalysis.bestWindow);
  const worstWindowLabel = formatWindowRange(air.windowAnalysis.worstWindow);
  const worstWindowAqi = air.windowAnalysis.worstWindow.avgAqi;
  const commuteLabels = {
    baselineCommuteLabel: COMMUTE_LABELS[profile.baselineCommute],
    chosenCommuteLabel: COMMUTE_LABELS[profile.chosenCommute]
  };

  try {
    const res = await fetchWithTimeout(
      '/api/assistant',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: air.location.name,
          aqi: air.cpcb.aqi,
          category: air.cpcb.category,
          dominantPollutant: air.cpcb.dominantPollutant,
          pm25: air.current.pm25,
          pm10: air.current.pm10,
          bestWindowLabel,
          worstWindowLabel,
          worstWindowAqi,
          profile: {
            householdMembers: profile.householdMembers,
            commuteMode: profile.chosenCommute,
            ...commuteLabels,
            commuteKm: profile.commuteKm,
            homeType: profile.homeType,
            budgetTier: profile.budgetTier
          },
          activeChoices,
          impactSummary: {
            exposureReductionPct: impact.exposureReductionPct,
            annualCo2SavedKg: impact.annualCo2SavedKg
          },
          userQuestion: userQuestion.trim() || undefined
        })
      },
      signal,
      ASSISTANT_FETCH_TIMEOUT_MS
    );

    if (res.ok) {
      const data: unknown = await res.json();
      if (isAssistantPlan(data)) return data;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    // Offline or pure `vite dev` fallback — never show a broken screen
  }

  if (signal?.aborted) throw createAbortError();

  return buildDeterministicPlan({
    city: air.location.name,
    aqi: air.cpcb.aqi,
    category: air.cpcb.category,
    dominantPollutant: air.cpcb.dominantPollutant,
    pm25: air.current.pm25,
    pm10: air.current.pm10,
    bestWindowLabel,
    worstWindowLabel,
    worstWindowAqi,
    householdMembers: profile.householdMembers,
    ...commuteLabels,
    budgetTier: profile.budgetTier,
    exposureReductionPct: impact.exposureReductionPct,
    annualCo2SavedKg: impact.annualCo2SavedKg
  });
}
