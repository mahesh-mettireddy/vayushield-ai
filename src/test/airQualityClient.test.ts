import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateCpcbAqi } from '../engine/cpcbAqi';
import {
  isAirQualityPayload,
  isAssistantPlan,
  parseApiSearchResults,
  parseOpenMeteoAirData,
  parseOpenMeteoGeoResults
} from '../services/airQualitySchemas';
import {
  fetchAirQuality,
  requestAssistantPlan,
  searchLocations
} from '../services/airQualityClient';
import type {
  AirQualityPayload,
  ChoiceImpactResult,
  HouseholdProfile,
  LocationOption
} from '../types/airQuality';

const LOC: LocationOption = {
  name: 'Bengaluru',
  region: 'Karnataka',
  country: 'India',
  lat: 12.9716,
  lon: 77.5946
};

const PROFILE: HouseholdProfile = {
  householdMembers: ['Children'],
  baselineCommute: 'solo_car',
  chosenCommute: 'metro',
  commuteKm: 12,
  homeType: 'apartment',
  budgetTier: 'standard'
};

const IMPACT: ChoiceImpactResult = {
  baselineDailyExposureUgM3: 70,
  projectedDailyExposureUgM3: 24,
  exposureReductionPct: 66,
  dailyCo2SavedKg: 1.97,
  annualCo2SavedKg: 472,
  treesEquivalentPerYear: 22.5,
  breakdown: []
};

const MOCK_PAYLOAD: AirQualityPayload = {
  location: LOC,
  fetchedAt: '2026-11-24T12:00:00.000Z',
  source: 'Open-Meteo Air Quality API (CC BY 4.0)',
  current: { pm25: 42, pm10: 68, no2: 24, so2: 8, o3: 32, coUgM3: 550 },
  cpcb: calculateCpcbAqi({ pm25: 42, pm10: 68, no2: 24, so2: 8, o3: 32, coUgM3: 550 }),
  hourly: [],
  windowAnalysis: {
    bestWindow: {
      startLabel: 'Unavailable',
      endLabel: 'Unavailable',
      avgPm25: 0,
      avgAqi: 0,
      advice: 'Unavailable'
    },
    worstWindow: {
      startLabel: 'Unavailable',
      endLabel: 'Unavailable',
      avgPm25: 0,
      avgAqi: 0,
      advice: 'Unavailable'
    },
    exposureSavingsPct: 0
  },
  groundStation: null
};

describe('airQualityClient service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searches locations via /api/air-quality and falls back to direct Open-Meteo geocoding', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await searchLocations('a')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockResolvedValueOnce(Response.json({ results: [LOC] }));
    expect(await searchLocations('Bengaluru')).toEqual([LOC]);

    fetchSpy.mockRejectedValueOnce(new Error('No /api route'));
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        results: [
          {
            name: 'Pune',
            admin1: 'Maharashtra',
            country: 'India',
            latitude: 18.52,
            longitude: 73.86
          }
        ]
      })
    );
    expect(await searchLocations('Pune')).toEqual([
      { name: 'Pune', region: 'Maharashtra', country: 'India', lat: 18.52, lon: 73.86 }
    ]);

    fetchSpy.mockResolvedValueOnce(new Response('err', { status: 500 }));
    fetchSpy.mockResolvedValueOnce(new Response('err', { status: 502 }));
    expect(await searchLocations('Mumbai')).toEqual([]);

    fetchSpy.mockResolvedValueOnce(Response.json({ results: 'invalid' }));
    fetchSpy.mockResolvedValueOnce(
      Response.json({ results: [{ name: 'Kochi', latitude: 9.93, longitude: 76.26 }] })
    );
    expect(await searchLocations('Kochi')).toEqual([
      { name: 'Kochi', region: '', country: '', lat: 9.93, lon: 76.26 }
    ]);
  });

  it('fetches air quality via /api/air-quality and falls back to direct Open-Meteo telemetry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(MOCK_PAYLOAD));
    expect(await fetchAirQuality(LOC)).toEqual(MOCK_PAYLOAD);

    const futureSec = Math.floor(Date.now() / 1000) + 3600;
    fetchSpy.mockResolvedValueOnce(Response.json({ unexpected: true }));
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        timezone: 'Asia/Kolkata',
        current: {
          pm2_5: 55,
          pm10: 85,
          nitrogen_dioxide: 20,
          sulphur_dioxide: 8,
          ozone: 30,
          carbon_monoxide: 500
        },
        hourly: { time: [futureSec, futureSec + 3600], pm2_5: [48, 42], pm10: [70, 65] }
      })
    );

    const direct = await fetchAirQuality(LOC);
    expect(direct.source).toBe('Open-Meteo Air Quality API (Direct)');
    expect(direct.cpcb.aqi).toBeGreaterThan(0);
    expect(direct.hourly).toHaveLength(2);

    fetchSpy.mockResolvedValueOnce(new Response('err', { status: 500 }));
    fetchSpy.mockResolvedValueOnce(new Response('err', { status: 503 }));
    await expect(fetchAirQuality(LOC)).rejects.toThrow('Open-Meteo HTTP 503');
  });

  it('requests assistant plan from /api/assistant and falls back deterministically when unavailable', async () => {
    const validPlan = {
      provider: 'gemini',
      modelLabel: 'Gemini 2.5 Flash',
      summary: 'Summary',
      dailyRoutine: [{ timeBlock: 'Morning', action: 'Walk', whyItHelps: 'Low PM2.5' }],
      indoorHacks: [
        { title: 'Vent', steps: 'Open windows', costTier: 'Zero Cost', impact: 'Fresh air' }
      ],
      sustainableSwaps: [{ swap: 'Metro', directImpact: 'Lower CO2' }],
      safetyNote: 'Informational only.'
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(validPlan));
    const apiResult = await requestAssistantPlan({
      air: MOCK_PAYLOAD,
      profile: PROFILE,
      impact: IMPACT,
      activeChoices: ['HEPA'],
      userQuestion: 'Walk time?'
    });
    expect(apiResult).toEqual(validPlan);

    fetchSpy.mockResolvedValueOnce(Response.json({ invalid: true }));
    const invalidShapeFallback = await requestAssistantPlan({
      air: MOCK_PAYLOAD,
      profile: PROFILE,
      impact: IMPACT,
      activeChoices: [],
      userQuestion: ''
    });
    expect(invalidShapeFallback.provider).toBe('deterministic-fallback');

    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    const fallbackResult = await requestAssistantPlan({
      air: MOCK_PAYLOAD,
      profile: PROFILE,
      impact: IMPACT,
      activeChoices: [],
      userQuestion: ''
    });
    expect(fallbackResult.provider).toBe('deterministic-fallback');
    expect(fallbackResult.summary).toContain('Bengaluru');
  });

  it('validates malformed client schemas cleanly', () => {
    expect(() => parseOpenMeteoAirData({ timezone: '' })).toThrow('Invalid Open-Meteo response.');
    expect(
      parseOpenMeteoAirData({ timezone: 'UTC', current: { pm2_5: 'bad' } }).current?.pm2_5
    ).toBeUndefined();
    expect(parseApiSearchResults('bad')).toBeNull();
    expect(parseApiSearchResults({})).toEqual([]);
    expect(parseApiSearchResults({ results: [{ bad: true }] })).toBeNull();
    expect(parseOpenMeteoGeoResults({ results: [{ name: 123 }] })).toEqual([]);
    expect(isAirQualityPayload('bad')).toBe(false);
    expect(isAirQualityPayload({ ...MOCK_PAYLOAD, current: 'bad' })).toBe(false);
    expect(isAirQualityPayload({ ...MOCK_PAYLOAD, hourly: 'bad' })).toBe(false);
    expect(
      isAirQualityPayload({ ...MOCK_PAYLOAD, cpcb: { ...MOCK_PAYLOAD.cpcb, subIndices: 'bad' } })
    ).toBe(false);
    expect(isAssistantPlan('bad')).toBe(false);
  });
});
