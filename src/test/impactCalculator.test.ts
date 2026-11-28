import { describe, expect, it } from 'vitest';
import { calculateChoiceImpact, calculateCommunityImpact } from '../engine/impactCalculator';
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
    expect(
      result.breakdown.find((item) => item.label.startsWith('Zero-Smoke'))?.exposureDeltaPct
    ).toBe(15);
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

  it('sanitizes non-finite inputs, clamps commuteKm, and omits commute savings when alternative emits more', () => {
    const result = calculateChoiceImpact(
      Number.NaN,
      { ...BASE_PROFILE, baselineCommute: 'wfh', chosenCommute: 'solo_car', commuteKm: 500 },
      {
        hepaOrCorsiRosenthal: false,
        smartVentilation: false,
        cleanCookingExhaust: false,
        n95OutdoorMask: false,
        publicTransitOrWfhSwap: true,
        zeroSmokeIndoor: false
      }
    );
    expect(result.baselineDailyExposureUgM3).toBe(39);
    expect(result.annualCo2SavedKg).toBe(0);
    expect(result.exposureReductionPct).toBe(0);
    expect(result.breakdown).toHaveLength(0);
  });
});

describe('Community impact', () => {
  it('scales kilograms before converting to tonnes and tree equivalents', () => {
    expect(calculateCommunityImpact(715, 25)).toEqual({
      households: 25,
      annualCo2Tonnes: 17.875,
      annualCo2Kg: 17875,
      treesEquivalent: 851.2
    });
    expect(calculateCommunityImpact(715, 1).treesEquivalent).toBe(34);
  });

  it('keeps zero and fractional savings and uses whole households', () => {
    expect(calculateCommunityImpact(0, 200)).toEqual({
      households: 200,
      annualCo2Tonnes: 0,
      annualCo2Kg: 0,
      treesEquivalent: 0
    });
    expect(calculateCommunityImpact(12.5, 5.9).annualCo2Kg).toBe(62.5);
  });

  it('uses the one-household minimum and ignores invalid savings', () => {
    expect(calculateCommunityImpact(-4, 0)).toEqual({
      households: 1,
      annualCo2Tonnes: 0,
      annualCo2Kg: 0,
      treesEquivalent: 0
    });
    expect(calculateCommunityImpact(Number.NaN, Number.POSITIVE_INFINITY).households).toBe(1);
  });
});
