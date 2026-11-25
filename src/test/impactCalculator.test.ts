import { describe, expect, it } from 'vitest';
import { calculateChoiceImpact } from '../engine/impactCalculator';
import type { ChoiceToggles, HouseholdProfile } from '../types/airQuality';

const BASE_PROFILE: HouseholdProfile = {
  householdMembers: ['Children', 'Daily Commuters'],
  baselineCommute: 'solo_car',
  chosenCommute: 'metro',
  commuteKm: 20,
  homeType: 'apartment',
  budgetTier: 'budget_diy'
};

describe('Choice-Impact Simulator Engine', () => {
  it('computes verifiable annual CO2 savings and PM2.5 exposure drop', () => {
    const toggles: ChoiceToggles = {
      hepaOrCorsiRosenthal: true,
      smartVentilation: true,
      cleanCookingExhaust: true,
      n95OutdoorMask: true,
      publicTransitOrWfhSwap: true,
      zeroSmokeIndoor: true
    };

    const result = calculateChoiceImpact(200, BASE_PROFILE, toggles);
    // Commute: (0.192 - 0.028) * 20 * 240 = 787.2 + 85 cooking = 872 kg CO2/yr
    expect(result.annualCo2SavedKg).toBe(872);
    expect(result.exposureReductionPct).toBe(85);
    expect(result.projectedDailyExposureUgM3).toBe(23.4);
    expect(result.breakdown).toHaveLength(6);
    expect(result.breakdown.find((item) => item.label.startsWith('Zero-Smoke'))?.exposureDeltaPct).toBe(15);
  });

  it('returns zero reduction when all toggles are off', () => {
    const allOff: ChoiceToggles = {
      hepaOrCorsiRosenthal: false,
      smartVentilation: false,
      cleanCookingExhaust: false,
      n95OutdoorMask: false,
      publicTransitOrWfhSwap: false,
      zeroSmokeIndoor: false
    };

    const result = calculateChoiceImpact(150, BASE_PROFILE, allOff);
    expect(result.exposureReductionPct).toBe(0);
    expect(result.annualCo2SavedKg).toBe(0);
    expect(result.breakdown).toHaveLength(0);
  });
});
