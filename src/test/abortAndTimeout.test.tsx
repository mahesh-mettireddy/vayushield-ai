import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { calculateCpcbAqi } from '../engine/cpcbAqi';
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

const DELHI_AIR: AirQualityPayload = {
  location: { name: 'New Delhi', region: 'Delhi NCR', country: 'India', lat: 28.6139, lon: 77.209 },
  fetchedAt: '2026-11-24T12:00:00.000Z',
  source: 'Open-Meteo Air Quality API (CC BY 4.0)',
  current: { pm25: 165, pm10: 270, no2: 52, so2: 14, o3: 48, coUgM3: 1100 },
  cpcb: {
    aqi: 335,
    category: 'Very Poor',
    dominantPollutant: 'pm25',
    subIndices: { pm25: 335, pm10: 221, no2: 66, so2: 18, o3: 48, co: 56 },
    advisory: 'Respiratory illness risk on prolonged exposure.'
  },
  hourly: [
    { time: '2026-11-24T12:00', hourLabel: '12 PM', pm25: 140, pm10: 220, aqi: 316 },
    { time: '2026-11-24T13:00', hourLabel: '1 PM', pm25: 95, pm10: 170, aqi: 218 }
  ],
  windowAnalysis: {
    bestWindow: {
      startLabel: '12 PM',
      endLabel: '2 PM',
      avgPm25: 117.5,
      avgAqi: 267,
      advice: 'Lowest trough.'
    },
    worstWindow: {
      startLabel: '12 PM',
      endLabel: '2 PM',
      avgPm25: 117.5,
      avgAqi: 267,
      advice: 'Peak smog.'
    },
    exposureSavingsPct: 0
  },
  groundStation: null
};

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

describe('AbortController Race Protection & Fetch Timeout Guards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aborts in-flight Delhi telemetry and ignores stale responses on rapid switch to Mumbai', async () => {
    const user = userEvent.setup();
    let delhiSignal: AbortSignal | undefined;
    let resolveDelhi: ((res: Response) => void) | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('New+Delhi')) {
        delhiSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveDelhi = resolve;
        });
      }
      if (url.includes('Mumbai')) {
        return Promise.resolve(
          Response.json({
            ...DELHI_AIR,
            location: {
              name: 'Mumbai',
              region: 'Maharashtra',
              country: 'India',
              lat: 19.076,
              lon: 72.8777
            },
            cpcb: { ...DELHI_AIR.cpcb, aqi: 142, category: 'Moderate' }
          })
        );
      }
      return Promise.resolve(Response.json(DELHI_AIR));
    });

    render(<App />);
    await waitFor(() => {
      expect(delhiSignal).toBeDefined();
    });
    expect(delhiSignal?.aborted).toBe(false);

    await user.click(screen.getByRole('button', { name: /Change city: New Delhi/i }));
    await user.click(screen.getByRole('button', { name: 'Mumbai' }));

    expect(delhiSignal?.aborted).toBe(true);
    await waitFor(() => {
      expect(screen.getByText('142')).toBeInTheDocument();
    });

    // Even if a non-aborting transport delivers Delhi late, Mumbai remains active
    resolveDelhi?.(Response.json(DELHI_AIR));
    await Promise.resolve();
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.queryByText('335')).not.toBeInTheDocument();
  });

  it('propagates caller AbortSignal immediately without falling back to Open-Meteo', async () => {
    const preAborted = new AbortController();
    preAborted.abort();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(fetchAirQuality(LOC, preAborted.signal)).rejects.toThrow();
    await expect(searchLocations('Delhi', preAborted.signal)).rejects.toThrow();
    await expect(
      requestAssistantPlan({
        air: {
          ...DELHI_AIR,
          location: LOC,
          cpcb: calculateCpcbAqi({ pm25: 40, pm10: 60, no2: 20, so2: 5, o3: 30, coUgM3: 400 })
        },
        profile: PROFILE,
        impact: IMPACT,
        activeChoices: [],
        userQuestion: '',
        signal: preAborted.signal
      })
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();

    // Mid-flight external abort must not trigger direct fallback
    const midFlight = new AbortController();
    fetchSpy.mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const pendingAir = fetchAirQuality(LOC, midFlight.signal);
    midFlight.abort();
    await expect(pendingAir).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const searchAbort = new AbortController();
    const pendingSearch = searchLocations('Bengaluru', searchAbort.signal);
    searchAbort.abort();
    await expect(pendingSearch).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('aborts hung upstream client fetches when timeout expires', async () => {
    vi.useFakeTimers();
    const capturedSignals: AbortSignal[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      if (init?.signal) capturedSignals.push(init.signal);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Request timed out', 'TimeoutError'));
        });
      });
    });

    const planPromise = requestAssistantPlan({
      air: { ...DELHI_AIR, location: LOC },
      profile: PROFILE,
      impact: IMPACT,
      activeChoices: [],
      userQuestion: ''
    });

    await vi.advanceTimersByTimeAsync(25_000);
    const plan = await planPromise;
    expect(capturedSignals[0]?.aborted).toBe(true);
    expect(plan.provider).toBe('deterministic-fallback');
  });
});
