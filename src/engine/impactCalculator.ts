import type {
  ChoiceImpactResult,
  ChoiceToggles,
  CommuteMode,
  HouseholdProfile,
  ImpactBreakdownItem
} from '../types/airQuality.js';

/** Ordered list of supported daily commute modes. */
export const COMMUTE_MODES: readonly CommuteMode[] = [
  'solo_car',
  'scooter',
  'bus',
  'metro',
  'cycle_walk',
  'wfh'
];

/** Emission factors in kg CO₂ per passenger-kilometer (standard urban transport benchmarks). */
export const COMMUTE_EMISSION_KG_PER_KM: Record<CommuteMode, number> = {
  solo_car: 0.192,
  scooter: 0.084,
  bus: 0.068,
  metro: 0.028,
  cycle_walk: 0,
  wfh: 0
};

/** Human-readable labels for each supported commute mode. */
export const COMMUTE_LABELS: Record<CommuteMode, string> = {
  solo_car: 'Solo Petrol/Diesel Car',
  scooter: 'Two-Wheeler / Scooter',
  bus: 'City Bus / Carpool',
  metro: 'Metro / Electric Rail',
  cycle_walk: 'Walk / Cycle',
  wfh: 'Work From Home'
};

interface HabitImpactRule {
  key: keyof ChoiceToggles;
  residualMultiplier: number;
  label: string;
  detail: string;
  exposureDeltaPct: number;
  co2SavedKgPerYear: number;
}

const HABIT_IMPACT_RULES: ReadonlyArray<HabitImpactRule> = [
  {
    key: 'hepaOrCorsiRosenthal',
    residualMultiplier: 0.45,
    label: 'HEPA / DIY Corsi-Rosenthal Filtration',
    detail: 'Cuts indoor PM2.5 infiltration by ~55% in bedrooms and living areas.',
    exposureDeltaPct: 55,
    co2SavedKgPerYear: 0
  },
  {
    key: 'cleanCookingExhaust',
    residualMultiplier: 0.65,
    label: 'Cooking Exhaust + Lid / Induction Habit',
    detail: 'Prevents indoor PM2.5 cooking spikes (~35% lower household particulate load).',
    exposureDeltaPct: 35,
    co2SavedKgPerYear: 85
  },
  {
    key: 'smartVentilation',
    residualMultiplier: 0.8,
    label: 'Clean-Air Window Ventilation',
    detail:
      'Sealing windows during peak smog and airing only in the cleanest 2h window cuts indoor buildup ~20%.',
    exposureDeltaPct: 20,
    co2SavedKgPerYear: 0
  },
  {
    key: 'n95OutdoorMask',
    residualMultiplier: 0.8,
    label: 'Well-Fitted N95 During Peak Outdoor Trips',
    detail:
      'Blocks ≥80% of inhaled PM2.5 while commuting or running errands (~20% daily weighted exposure drop).',
    exposureDeltaPct: 20,
    co2SavedKgPerYear: 0
  },
  {
    key: 'zeroSmokeIndoor',
    residualMultiplier: 0.85,
    label: 'Zero-Smoke Home — No Incense / Coils',
    detail:
      'Removing incense and mosquito coil smoke is modeled as a 15% reduction in indoor PM2.5.',
    exposureDeltaPct: 15,
    co2SavedKgPerYear: 0
  }
];

const WORKDAYS_PER_YEAR = 240;
const KG_CO2_PER_MATURE_TREE_YEAR = 21;

function computeCommuteImpact(
  safeCommuteKm: number,
  profile: HouseholdProfile,
  enabled: boolean
): { dailyCo2SavedKg: number; residualMultiplier: number; item: ImpactBreakdownItem | null } {
  if (!enabled || safeCommuteKm <= 0) {
    return { dailyCo2SavedKg: 0, residualMultiplier: 1, item: null };
  }
  const baseFactor = COMMUTE_EMISSION_KG_PER_KM[profile.baselineCommute];
  const targetFactor = COMMUTE_EMISSION_KG_PER_KM[profile.chosenCommute];
  const dailyCo2SavedKg = Math.max(0, (baseFactor - targetFactor) * safeCommuteKm);
  const annualCommuteCo2 = Math.round(dailyCo2SavedKg * WORKDAYS_PER_YEAR);
  if (annualCommuteCo2 <= 0) {
    return { dailyCo2SavedKg, residualMultiplier: 1, item: null };
  }
  return {
    dailyCo2SavedKg,
    residualMultiplier: 0.92,
    item: {
      label: `Commute Swap: ${COMMUTE_LABELS[profile.baselineCommute]} → ${COMMUTE_LABELS[profile.chosenCommute]}`,
      detail: `Avoids ${dailyCo2SavedKg.toFixed(2)} kg CO₂/day (${annualCommuteCo2} kg/yr) and trims roadside exhaust exposure.`,
      exposureDeltaPct: 8,
      co2SavedKgPerYear: annualCommuteCo2
    }
  };
}

/** Scales single-household annual CO₂ savings across `1–200` households into tonnes and tree equivalents. */
export function calculateCommunityImpact(annualCo2SavedKg: number, households: number) {
  const count = Number.isFinite(households) ? Math.max(1, Math.floor(households)) : 1;
  const perHouseholdKg = Number.isFinite(annualCo2SavedKg) ? Math.max(0, annualCo2SavedKg) : 0;
  const annualCo2Kg = perHouseholdKg * count;
  return {
    households: count,
    annualCo2Tonnes: annualCo2Kg / 1000,
    annualCo2Kg,
    treesEquivalent: Math.round((annualCo2Kg / KG_CO2_PER_MATURE_TREE_YEAR) * 10) / 10
  };
}

/**
 * Estimates daily PM2.5 exposure reduction (capped at 92%) and annual commute/cooking CO₂
 * savings for the active household habits and commute comparison.
 */
export function calculateChoiceImpact(
  ambientPm25: number,
  profile: HouseholdProfile,
  toggles: ChoiceToggles
): ChoiceImpactResult {
  const safeAmbient = Math.max(5, Number.isFinite(ambientPm25) ? ambientPm25 : 50);
  const safeCommuteKm = Math.max(
    0,
    Math.min(200, Number.isFinite(profile.commuteKm) ? profile.commuteKm : 0)
  );
  // Typical unmitigated indoor/outdoor blended personal exposure ≈ 78% of ambient PM2.5
  const baselineDailyExposureUgM3 = Math.round(safeAmbient * 0.78 * 10) / 10;

  let residualFactor = 1.0;
  const breakdown: ImpactBreakdownItem[] = [];
  for (const rule of HABIT_IMPACT_RULES) {
    if (!toggles[rule.key]) continue;
    residualFactor *= rule.residualMultiplier;
    breakdown.push({
      label: rule.label,
      detail: rule.detail,
      exposureDeltaPct: rule.exposureDeltaPct,
      co2SavedKgPerYear: rule.co2SavedKgPerYear
    });
  }

  const commute = computeCommuteImpact(safeCommuteKm, profile, toggles.publicTransitOrWfhSwap);
  residualFactor *= commute.residualMultiplier;
  if (commute.item) breakdown.push(commute.item);

  const annualCo2SavedKg = Math.round(
    commute.dailyCo2SavedKg * WORKDAYS_PER_YEAR + (toggles.cleanCookingExhaust ? 85 : 0)
  );
  const dailyCo2SavedKg = Math.round((annualCo2SavedKg / WORKDAYS_PER_YEAR) * 100) / 100;
  const exposureReductionPct = Math.max(0, Math.min(92, Math.round((1 - residualFactor) * 100)));
  const projectedDailyExposureUgM3 =
    Math.round(baselineDailyExposureUgM3 * (1 - exposureReductionPct / 100) * 10) / 10;

  return {
    baselineDailyExposureUgM3,
    projectedDailyExposureUgM3,
    exposureReductionPct,
    dailyCo2SavedKg,
    annualCo2SavedKg,
    treesEquivalentPerYear: calculateCommunityImpact(annualCo2SavedKg, 1).treesEquivalent,
    breakdown
  };
}
