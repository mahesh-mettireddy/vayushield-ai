import type {
  ChoiceImpactResult,
  ChoiceToggles,
  CommuteMode,
  HouseholdProfile,
  ImpactBreakdownItem
} from '../types/airQuality';

/** Emission factors in kg CO₂ per passenger-kilometer (standard urban transport benchmarks). */
export const COMMUTE_EMISSION_KG_PER_KM: Record<CommuteMode, number> = {
  solo_car: 0.192,
  scooter: 0.084,
  bus: 0.068,
  metro: 0.028,
  cycle_walk: 0,
  wfh: 0
};

export const COMMUTE_LABELS: Record<CommuteMode, string> = {
  solo_car: 'Solo Petrol/Diesel Car',
  scooter: 'Two-Wheeler / Scooter',
  bus: 'City Bus / Carpool',
  metro: 'Metro / Electric Rail',
  cycle_walk: 'Walk / Cycle',
  wfh: 'Work From Home'
};

const WORKDAYS_PER_YEAR = 240;
const KG_CO2_PER_MATURE_TREE_YEAR = 21;

export function calculateChoiceImpact(
  ambientPm25: number,
  profile: HouseholdProfile,
  toggles: ChoiceToggles
): ChoiceImpactResult {
  const safeAmbient = Math.max(5, Number.isFinite(ambientPm25) ? ambientPm25 : 50);
  const safeCommuteKm = Math.max(0, Math.min(200, Number.isFinite(profile.commuteKm) ? profile.commuteKm : 0));

  // Typical unmitigated indoor/outdoor blended personal exposure ≈ 78% of ambient PM2.5
  const baselineDailyExposureUgM3 = Math.round(safeAmbient * 0.78 * 10) / 10;

  let residualFactor = 1.0;
  const breakdown: ImpactBreakdownItem[] = [];

  if (toggles.hepaOrCorsiRosenthal) {
    residualFactor *= 0.45;
    breakdown.push({
      label: 'HEPA / DIY Corsi-Rosenthal Filtration',
      detail: 'Cuts indoor PM2.5 infiltration by ~55% in bedrooms and living areas.',
      exposureDeltaPct: 55,
      co2SavedKgPerYear: 0
    });
  }

  if (toggles.cleanCookingExhaust) {
    residualFactor *= 0.65;
    breakdown.push({
      label: 'Cooking Exhaust + Lid / Induction Habit',
      detail: 'Prevents indoor PM2.5 cooking spikes (~35% lower household particulate load).',
      exposureDeltaPct: 35,
      co2SavedKgPerYear: 85
    });
  }

  if (toggles.smartVentilation) {
    residualFactor *= 0.8;
    breakdown.push({
      label: 'Clean-Air Window Ventilation',
      detail: 'Sealing windows during peak smog and airing only in the cleanest 2h window cuts indoor buildup ~20%.',
      exposureDeltaPct: 20,
      co2SavedKgPerYear: 0
    });
  }

  if (toggles.n95OutdoorMask) {
    residualFactor *= 0.8;
    breakdown.push({
      label: 'Well-Fitted N95 During Peak Outdoor Trips',
      detail: 'Blocks ≥80% of inhaled PM2.5 while commuting or running errands (~20% daily weighted exposure drop).',
      exposureDeltaPct: 20,
      co2SavedKgPerYear: 0
    });
  }

  let dailyCo2SavedKg = 0;
  if (toggles.publicTransitOrWfhSwap && safeCommuteKm > 0) {
    const baseFactor = COMMUTE_EMISSION_KG_PER_KM[profile.baselineCommute];
    const targetFactor = COMMUTE_EMISSION_KG_PER_KM[profile.chosenCommute];
    dailyCo2SavedKg = Math.max(0, (baseFactor - targetFactor) * safeCommuteKm);
    const annualCommuteCo2 = Math.round(dailyCo2SavedKg * WORKDAYS_PER_YEAR);

    if (annualCommuteCo2 > 0) {
      residualFactor *= 0.92;
      breakdown.push({
        label: `Commute Swap: ${COMMUTE_LABELS[profile.baselineCommute]} → ${COMMUTE_LABELS[profile.chosenCommute]}`,
        detail: `Avoids ${dailyCo2SavedKg.toFixed(2)} kg CO₂/day (${annualCommuteCo2} kg/yr) and trims roadside exhaust exposure.`,
        exposureDeltaPct: 8,
        co2SavedKgPerYear: annualCommuteCo2
      });
    }
  }

  const cookingCo2Annual = toggles.cleanCookingExhaust ? 85 : 0;
  const annualCo2SavedKg = Math.round(dailyCo2SavedKg * WORKDAYS_PER_YEAR + cookingCo2Annual);
  const totalDailyCo2SavedKg = Math.round((annualCo2SavedKg / WORKDAYS_PER_YEAR) * 100) / 100;

  // Cap combined personal exposure reduction at 92% to remain physically realistic
  const rawReductionPct = Math.round((1 - residualFactor) * 100);
  const exposureReductionPct = Math.max(0, Math.min(92, rawReductionPct));
  const projectedDailyExposureUgM3 =
    Math.round(baselineDailyExposureUgM3 * (1 - exposureReductionPct / 100) * 10) / 10;

  const treesEquivalentPerYear = Math.round((annualCo2SavedKg / KG_CO2_PER_MATURE_TREE_YEAR) * 10) / 10;

  return {
    baselineDailyExposureUgM3,
    projectedDailyExposureUgM3,
    exposureReductionPct,
    dailyCo2SavedKg: totalDailyCo2SavedKg,
    annualCo2SavedKg,
    treesEquivalentPerYear,
    breakdown
  };
}
