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

async function fetchOpenMeteoDirect(loc: LocationOption): Promise<AirQualityPayload> {
  const res = await fetch(buildOpenMeteoAirUrl(loc.lat, loc.lon));
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
export async function searchLocations(query: string): Promise<LocationOption[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];

  try {
    const res = await fetch(`/api/air-quality?q=${encodeURIComponent(clean)}`);
    if (res.ok) {
      const results = parseApiSearchResults(await res.json());
      if (results !== null) return results;
    }
  } catch {
    // Fall back to direct Open-Meteo Geocoding when running pure `vite dev`
  }

  const direct = await fetch(buildOpenMeteoGeoUrl(clean));
  if (!direct.ok) return [];
  return parseOpenMeteoGeoResults(await direct.json());
}

/** Fetches live AQI and 24-hour forecast telemetry, falling back directly to Open-Meteo offline/locally. */
export async function fetchAirQuality(loc: LocationOption): Promise<AirQualityPayload> {
  try {
    const params = new URLSearchParams({
      lat: String(loc.lat),
      lon: String(loc.lon),
      city: loc.name,
      region: loc.region,
      country: loc.country
    });
    const res = await fetch(`/api/air-quality?${params.toString()}`);
    if (res.ok) {
      const data: unknown = await res.json();
      if (isAirQualityPayload(data)) return data;
    }
  } catch {
    // Fall back to direct Open-Meteo when running pure `vite dev` without Vercel CLI
  }

  return fetchOpenMeteoDirect(loc);
}

/** Requests a personalized routine plan from `/api/assistant` with deterministic local fallback. */
export async function requestAssistantPlan(params: {
  air: AirQualityPayload;
  profile: HouseholdProfile;
  impact: ChoiceImpactResult;
  activeChoices: string[];
  userQuestion: string;
}): Promise<AssistantPlan> {
  const { air, profile, impact, activeChoices, userQuestion } = params;
  const bestWindowLabel = formatWindowRange(air.windowAnalysis.bestWindow);
  const worstWindowLabel = formatWindowRange(air.windowAnalysis.worstWindow);
  const worstWindowAqi = air.windowAnalysis.worstWindow.avgAqi;
  const commuteLabels = {
    baselineCommuteLabel: COMMUTE_LABELS[profile.baselineCommute],
    chosenCommuteLabel: COMMUTE_LABELS[profile.chosenCommute]
  };

  try {
    const res = await fetch('/api/assistant', {
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
    });

    if (res.ok) {
      const data: unknown = await res.json();
      if (isAssistantPlan(data)) return data;
    }
  } catch {
    // Offline or pure `vite dev` fallback — never show a broken screen
  }

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
