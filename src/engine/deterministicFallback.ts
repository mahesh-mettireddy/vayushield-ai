import type {
  AssistantPlan,
  IndoorHack,
  RoutineStep,
  SustainableSwap
} from '../types/airQuality.js';
import { getPeakWindowAdvice } from './cleanAirWindow.js';
import { POLLUTANT_LABELS } from './cpcbAqi.js';

/** Grounded telemetry and household parameters for deterministic routine synthesis. */
export interface DeterministicPlanInput {
  city: string;
  aqi: number;
  category: string;
  dominantPollutant: string;
  pm25: number;
  pm10: number;
  bestWindowLabel: string;
  worstWindowLabel: string;
  worstWindowAqi: number;
  householdMembers: string[];
  baselineCommuteLabel: string;
  chosenCommuteLabel: string;
  budgetTier: 'zero_cost' | 'budget_diy' | 'standard';
  exposureReductionPct: number;
  annualCo2SavedKg: number;
}

const BUDGET_HACK_BY_TIER: Record<DeterministicPlanInput['budgetTier'], IndoorHack> = {
  zero_cost: {
    title: 'Zero-Cost Wet-Mop & Door-Draft Seal',
    steps:
      'Damp-wipe window sills and floors each evening and place a rolled damp towel at the base of the main door during peak smog hours.',
    costTier: 'Zero Cost',
    impact: 'Stops settled PM10/PM2.5 from resuspending indoors and cuts hallway smog infiltration.'
  },
  budget_diy: {
    title: 'DIY Corsi-Rosenthal Box Filter',
    steps:
      'Tape four MERV-13 filters into a cube with a standard box fan on top pulling air upward; run on medium speed in the main bedroom.',
    costTier: 'Budget DIY',
    impact:
      'Delivers CADR comparable to mid-range HEPA purifiers at a fraction of the cost (~55% indoor PM2.5 drop).'
  },
  standard: {
    title: 'True HEPA Bedroom Zone + Pre-Filter Rinse',
    steps:
      'Size a True HEPA purifier for the bedroom floor area, place it 1 foot from walls, and vacuum the mesh pre-filter weekly.',
    costTier: 'Standard',
    impact:
      'Sustains clean sleep air and prevents clogged pre-filters from halving clean-air delivery rate.'
  }
};

function resolveDominantName(key: string): string {
  const entry = Object.entries(POLLUTANT_LABELS).find(([k]) => k === key);
  return entry ? entry[1].name : 'Unavailable';
}

function buildRoutineSteps(input: DeterministicPlanInput): RoutineStep[] {
  const hasSensitive = input.householdMembers.some((m) =>
    ['Children', 'Seniors', 'Asthma / Respiratory'].includes(m)
  );
  return [
    {
      timeBlock: `Peak window · ${input.worstWindowLabel}`,
      action:
        input.worstWindowLabel === 'Unavailable'
          ? 'Check the next available forecast before planning outdoor activities.'
          : getPeakWindowAdvice(input.worstWindowAqi),
      whyItHelps: hasSensitive
        ? 'Use the peak NAQI to plan around the needs of sensitive household members.'
        : 'Use the peak NAQI to decide when to adjust outdoor plans.'
    },
    {
      timeBlock: `Clean-Air Window (${input.bestWindowLabel})`,
      action:
        input.aqi > 200
          ? 'Batch essential errands into this trough window and keep cross-ventilation brief (5–10 mins max).'
          : 'Open opposite windows for 15–20 minutes to flush indoor CO₂ and schedule outdoor walks or school pickups.',
      whyItHelps: 'Matches your household schedule to the lowest two-hour forecast NAQI.'
    },
    {
      timeBlock: 'Evening & Night Recovery (8 PM – 6 AM)',
      action:
        'Wet-mop floors instead of dry sweeping, run bedroom air filtration 30 minutes before sleep, and avoid incense or mosquito coils.',
      whyItHelps:
        'Prevents resuspended dust and nocturnal combustion smoke during the 7–8 hours your family breathes bedroom air.'
    }
  ];
}

function buildIndoorHacks(budgetTier: DeterministicPlanInput['budgetTier']): IndoorHack[] {
  return [
    BUDGET_HACK_BY_TIER[budgetTier],
    {
      title: 'Lid-On & Back-Burner Cooking Exhaust',
      steps:
        'Run the kitchen chimney or exhaust fan 5 minutes before high-heat frying, cook on rear burners, and cover pans whenever possible.',
      costTier: 'Zero Cost',
      impact: 'Cuts indoor cooking PM2.5 spikes by ~35% and reduces lingering NO₂.'
    },
    {
      title: 'Zero-Smoke Indoor Air Hygiene',
      steps:
        'Swap incense sticks, dhoop, and burning mosquito coils for electric vaporizers or mesh screens during smog days.',
      costTier: 'Zero Cost',
      impact:
        'Eliminates avoidable indoor fine-particle sources that can push bedroom PM2.5 above outdoor smog levels.'
    }
  ];
}

function buildSustainableSwaps(input: DeterministicPlanInput): SustainableSwap[] {
  return [
    {
      swap:
        input.baselineCommuteLabel === input.chosenCommuteLabel
          ? `Keep using ${input.chosenCommuteLabel}`
          : `Compare ${input.baselineCommuteLabel} with ${input.chosenCommuteLabel}`,
      directImpact:
        'Use the Impact Lab to compare the emissions and exposure estimates for the two commutes.'
    },
    {
      swap: 'Switch dry sweeping and leaf burning to damp mopping and community composting',
      directImpact:
        'Directly prevents coarse dust (PM10) resuspension and toxic open-biomass smoke spikes.'
    },
    {
      swap: 'Use electric kettle / induction for boiling and reheating instead of prolonged open-flame gas',
      directImpact: 'Lowers indoor NO₂ buildup and trims household fossil-fuel emissions.'
    }
  ];
}

/**
 * Generates an offline-safe, grounded daily air-quality plan when upstream LLM providers
 * are unconfigured or unavailable.
 */
export function buildDeterministicPlan(input: DeterministicPlanInput): AssistantPlan {
  const dominant = resolveDominantName(input.dominantPollutant);
  const summary = `In ${input.city}, CPCB NAQI is ${input.aqi} (${input.category}). Dominant pollutant: ${dominant}. Current PM2.5: ${input.pm25.toFixed(1)} µg/m³. Your active choices are estimated to reduce daily PM2.5 exposure by ${input.exposureReductionPct}% and save ${input.annualCo2SavedKg} kg CO₂ per year.`;

  return {
    provider: 'deterministic-fallback',
    modelLabel: 'Deterministic CPCB & Exposure Engine (Offline-Safe)',
    summary,
    dailyRoutine: buildRoutineSteps(input),
    indoorHacks: buildIndoorHacks(input.budgetTier),
    sustainableSwaps: buildSustainableSwaps(input),
    safetyNote:
      'Informational guidance grounded in India CPCB NAQI thresholds and Open-Meteo forecasts; not medical advice. Consult a physician for acute asthma or breathing distress.'
  };
}
