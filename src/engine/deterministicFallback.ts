import type { AssistantPlan } from '../types/airQuality';

export interface DeterministicPlanInput {
  city: string;
  aqi: number;
  category: string;
  dominantPollutant: string;
  pm25: number;
  pm10: number;
  bestWindowLabel: string;
  worstWindowLabel: string;
  householdMembers: string[];
  commuteMode: string;
  budgetTier: 'zero_cost' | 'budget_diy' | 'standard';
  exposureReductionPct: number;
  annualCo2SavedKg: number;
  userQuestion?: string;
}

export function buildDeterministicPlan(input: DeterministicPlanInput): AssistantPlan {
  const isHighSmog = input.aqi > 200;
  const hasSensitiveMembers = input.householdMembers.some((m) =>
    ['Children', 'Seniors', 'Asthma / Respiratory'].includes(m)
  );

  const summary = `In ${input.city}, India CPCB NAQI is ${input.aqi} (${input.category}, dominant pollutant: ${input.dominantPollutant.toUpperCase()} at PM2.5 ${input.pm25.toFixed(1)} µg/m³). Your active choices cut daily PM2.5 exposure by ~${input.exposureReductionPct}% and save ~${input.annualCo2SavedKg} kg CO₂/year.${
    input.userQuestion ? ` Tailored note for "${input.userQuestion.slice(0, 80)}": prioritize indoor filtration and your ${input.bestWindowLabel} clean-air slot.` : ''
  }`;

  const dailyRoutine = [
    {
      timeBlock: `Peak Smog Shield (${input.worstWindowLabel})`,
      action: isHighSmog
        ? 'Keep balcony doors and windows sealed, move workouts indoors, and wear a snug N95 if stepping out.'
        : 'Close road-facing windows during rush-hour traffic peaks and run kitchen exhaust while cooking.',
      whyItHelps: `Avoids the highest 2-hour particulate spike in ${input.city}, protecting ${
        hasSensitiveMembers ? 'children, seniors, and sensitive lungs' : 'your household'
      }.`
    },
    {
      timeBlock: `Clean-Air Window (${input.bestWindowLabel})`,
      action: isHighSmog
        ? 'Batch essential errands into this trough window and keep cross-ventilation brief (5–10 mins max).'
        : 'Open opposite windows for 15–20 minutes to flush indoor CO₂ and schedule outdoor walks or school pickups.',
      whyItHelps: 'Matches your household schedule to the lowest forecasted PM2.5 concentration in the next 24 hours.'
    },
    {
      timeBlock: 'Evening & Night Recovery (8 PM – 6 AM)',
      action:
        'Wet-mop floors instead of dry sweeping, run bedroom air filtration 30 minutes before sleep, and avoid incense or mosquito coils.',
      whyItHelps:
        'Prevents resuspended dust and nocturnal combustion smoke during the 7–8 hours your family breathes bedroom air.'
    }
  ];

  const budgetHack =
    input.budgetTier === 'zero_cost'
      ? {
          title: 'Zero-Cost Wet-Mop & Door-Draft Seal',
          steps: 'Damp-wipe window sills and floors each evening and place a rolled damp towel at the base of the main door during peak smog hours.',
          costTier: 'Zero Cost',
          impact: 'Stops settled PM10/PM2.5 from resuspending indoors and cuts hallway smog infiltration.'
        }
      : input.budgetTier === 'budget_diy'
        ? {
            title: 'DIY Corsi-Rosenthal Box Filter',
            steps: 'Tape four MERV-13 filters into a cube with a standard box fan on top pulling air upward; run on medium speed in the main bedroom.',
            costTier: 'Budget DIY',
            impact: 'Delivers CADR comparable to mid-range HEPA purifiers at a fraction of the cost (~55% indoor PM2.5 drop).'
          }
        : {
            title: 'True HEPA Bedroom Zone + Pre-Filter Rinse',
            steps: 'Size a True HEPA purifier for the bedroom floor area, place it 1 foot from walls, and vacuum the mesh pre-filter weekly.',
            costTier: 'Standard',
            impact: 'Sustains clean sleep air and prevents clogged pre-filters from halving clean-air delivery rate.'
          };

  const indoorHacks = [
    budgetHack,
    {
      title: 'Lid-On & Back-Burner Cooking Exhaust',
      steps: 'Run the kitchen chimney or exhaust fan 5 minutes before high-heat frying, cook on rear burners, and cover pans whenever possible.',
      costTier: 'Zero Cost',
      impact: 'Cuts indoor cooking PM2.5 spikes by ~35% and reduces lingering NO₂.'
    },
    {
      title: 'Zero-Smoke Indoor Air Hygiene',
      steps: 'Swap incense sticks, dhoop, and burning mosquito coils for electric vaporizers or mesh screens during smog days.',
      costTier: 'Zero Cost',
      impact: 'Eliminates avoidable indoor fine-particle sources that can push bedroom PM2.5 above outdoor smog levels.'
    }
  ];

  const sustainableSwaps = [
    {
      swap: `Shift ${input.commuteMode.replace('_', ' ')} trips toward Metro, bus, carpool, or batched errands`,
      directImpact: `Saves ~${input.annualCo2SavedKg} kg CO₂/year and cuts local tailpipe NO₂ and PM2.5 emissions in your neighborhood.`
    },
    {
      swap: 'Switch dry sweeping and leaf burning to damp mopping and community composting',
      directImpact: 'Directly prevents coarse dust (PM10) resuspension and toxic open-biomass smoke spikes.'
    },
    {
      swap: 'Use electric kettle / induction for boiling and reheating instead of prolonged open-flame gas',
      directImpact: 'Lowers indoor NO₂ buildup and trims household fossil-fuel emissions.'
    }
  ];

  return {
    provider: 'deterministic-fallback',
    modelLabel: 'Deterministic CPCB & Exposure Engine (Offline-Safe)',
    summary,
    dailyRoutine,
    indoorHacks,
    sustainableSwaps,
    safetyNote:
      'Informational guidance grounded in India CPCB NAQI thresholds and Open-Meteo forecasts; not medical advice. Consult a physician for acute asthma or breathing distress.'
  };
}
