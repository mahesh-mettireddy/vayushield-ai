import { analyzeCleanAirWindows } from '../engine/cleanAirWindow';
import { buildDeterministicPlan } from '../engine/deterministicFallback';
import { COMMUTE_LABELS } from '../engine/impactCalculator';
import { readOpenMeteoForecast } from '../engine/openMeteoForecast';
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
  const omUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${loc.lat.toFixed(4)}&longitude=${loc.lon.toFixed(4)}` +
    `&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone` +
    `&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone` +
    `&forecast_days=2&timezone=auto&timeformat=unixtime`;

  const res = await fetch(omUrl);
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

  const direct = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=6&language=en&format=json`
  );
  if (!direct.ok) return [];
  return parseOpenMeteoGeoResults(await direct.json());
}

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

export async function requestAssistantPlan(params: {
  air: AirQualityPayload;
  profile: HouseholdProfile;
  impact: ChoiceImpactResult;
  activeChoices: string[];
  userQuestion: string;
}): Promise<AssistantPlan> {
  const { air, profile, impact, activeChoices, userQuestion } = params;
  const labelFor = ({ startLabel, endLabel }: { startLabel: string; endLabel: string }) =>
    startLabel === 'Unavailable' ? startLabel : `${startLabel} – ${endLabel}`;
  const bestWindowLabel = labelFor(air.windowAnalysis.bestWindow);
  const worstWindowLabel = labelFor(air.windowAnalysis.worstWindow);
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
