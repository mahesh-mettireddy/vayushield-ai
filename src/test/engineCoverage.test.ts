import { describe, expect, it } from 'vitest';
import { buildDeterministicPlan } from '../engine/deterministicFallback';
import { mapOpenMeteoGeoResults, readOpenMeteoForecast } from '../engine/openMeteoForecast';

describe('deterministicFallback & openMeteoForecast edge coverage', () => {
  const baseInput = {
    city: 'Delhi',
    aqi: 320,
    category: 'Very Poor',
    dominantPollutant: 'pm25',
    pm25: 150,
    pm10: 250,
    bestWindowLabel: '2 PM – 4 PM',
    worstWindowLabel: '7 AM – 9 AM',
    worstWindowAqi: 350,
    householdMembers: ['Children'],
    baselineCommuteLabel: 'Solo Petrol/Diesel Car',
    chosenCommuteLabel: 'Metro / Electric Rail',
    budgetTier: 'zero_cost' as const,
    exposureReductionPct: 72,
    annualCo2SavedKg: 650
  };

  it('covers all budget tiers, smog severities, and fallback labels in buildDeterministicPlan', () => {
    const zeroCost = buildDeterministicPlan(baseInput);
    expect(zeroCost.indoorHacks[0]?.costTier).toBe('Zero Cost');
    expect(zeroCost.dailyRoutine[1]?.action).toMatch(/5–10 mins max/);
    expect(zeroCost.dailyRoutine[0]?.whyItHelps).toMatch(/sensitive household members/);
    expect(zeroCost.sustainableSwaps[0]?.swap).toContain(
      'Compare Solo Petrol/Diesel Car with Metro / Electric Rail'
    );

    const diy = buildDeterministicPlan({
      ...baseInput,
      aqi: 95,
      category: 'Satisfactory',
      dominantPollutant: 'unknown_pollutant',
      worstWindowLabel: 'Unavailable',
      householdMembers: [],
      baselineCommuteLabel: 'Metro / Electric Rail',
      chosenCommuteLabel: 'Metro / Electric Rail',
      budgetTier: 'budget_diy'
    });
    expect(diy.summary).toContain('Dominant pollutant: Unavailable');
    expect(diy.indoorHacks[0]?.costTier).toBe('Budget DIY');
    expect(diy.dailyRoutine[0]?.action).toMatch(/Check the next available forecast/);
    expect(diy.dailyRoutine[0]?.whyItHelps).toMatch(/adjust outdoor plans/);
    expect(diy.dailyRoutine[1]?.action).toMatch(/15–20 minutes/);
    expect(diy.sustainableSwaps[0]?.swap).toBe('Keep using Metro / Electric Rail');

    const standard = buildDeterministicPlan({ ...baseInput, budgetTier: 'standard' });
    expect(standard.indoorHacks[0]?.costTier).toBe('Standard');
  });

  it('handles missing current/hourly fields and null hourly entries in readOpenMeteoForecast', () => {
    const empty = readOpenMeteoForecast({ timezone: 'UTC' }, Date.UTC(2026, 10, 24, 12));
    expect(empty.current).toEqual({ pm25: 0, pm10: 0, no2: 0, so2: 0, o3: 0, coUgM3: 0 });
    expect(empty.hourly).toEqual([]);
    expect(empty.cpcb.aqi).toBe(0);

    const nowMs = Date.UTC(2026, 10, 24, 10, 0, 0);
    const futureSec = Math.floor(nowMs / 1000) + 3600;
    const partial = readOpenMeteoForecast(
      {
        timezone: 'Asia/Kolkata',
        current: {
          pm2_5: 45,
          pm10: 80,
          nitrogen_dioxide: 20,
          sulphur_dioxide: 10,
          ozone: 25,
          carbon_monoxide: 1000
        },
        hourly: {
          time: [futureSec],
          pm2_5: [null],
          pm10: [null],
          nitrogen_dioxide: [null],
          sulphur_dioxide: [null],
          ozone: [null],
          carbon_monoxide: [null]
        }
      },
      nowMs
    );
    expect(partial.hourly).toHaveLength(1);
    expect(partial.hourly[0]?.pm25).toBe(45);
    expect(partial.hourly[0]?.pm10).toBe(80);
    expect(partial.current.coUgM3).toBe(1000);

    const omittedSeries = readOpenMeteoForecast(
      {
        timezone: 'UTC',
        current: { pm2_5: 12 },
        hourly: { time: [futureSec] }
      },
      nowMs
    );
    expect(omittedSeries.hourly[0]?.pm25).toBe(12);

    const pastOnly = readOpenMeteoForecast(
      {
        timezone: 'UTC',
        hourly: { time: [Math.floor(nowMs / 1000) - 600] }
      },
      nowMs
    );
    expect(pastOnly.hourly).toEqual([]);

    expect(mapOpenMeteoGeoResults([{ name: 'Kochi', latitude: 9.93, longitude: 76.26 }])).toEqual([
      { name: 'Kochi', region: '', country: '', lat: 9.93, lon: 76.26 }
    ]);
  });
});
