import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import airQualityHandler, { clearAirQualityCache } from '../../api/air-quality';
import assistantHandler from '../../api/assistant';
import { resetRateLimitCache } from '../../api/_lib/schemas';
import { createMockRequest, createMockResponse } from './httpMock';

const VALID_ASSISTANT_BODY = {
  city: 'New Delhi',
  aqi: 310,
  category: 'Very Poor',
  dominantPollutant: 'pm25',
  pm25: 150,
  pm10: 250,
  bestWindowLabel: '2 PM – 4 PM',
  worstWindowLabel: '7 AM – 9 AM',
  profile: {
    householdMembers: ['Children'],
    commuteMode: 'metro',
    commuteKm: 12,
    homeType: 'apartment',
    budgetTier: 'budget_diy'
  },
  activeChoices: ['HEPA'],
  impactSummary: { exposureReductionPct: 65, annualCo2SavedKg: 500 }
};

describe('API Method, Bounds, Schema Strictness & Upstream Timeout Hardening', () => {
  beforeEach(() => {
    clearAirQualityCache();
    resetRateLimitCache();
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['POST', 'PUT', 'DELETE'])(
    '/api/air-quality rejects %s with 405, Allow: GET, and no-store',
    async (method) => {
      const mock = createMockResponse();
      await airQualityHandler(createMockRequest({ method }), mock.res);
      expect(mock.status).toHaveBeenCalledWith(405);
      expect(mock.setHeader).toHaveBeenCalledWith('Allow', 'GET');
      expect(mock.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
  );

  const invalidQueries: Array<Record<string, string>> = [
    { lat: '', lon: '77.2' },
    { lat: '   ', lon: '77.2' },
    { lat: 'NaN', lon: '77.2' },
    { lat: 'Infinity', lon: '77.2' },
    { lat: '-90.1', lon: '77.2' },
    { lat: '90.1', lon: '77.2' },
    { lat: '28.6', lon: '-180.1' },
    { lat: '28.6', lon: '180.1' },
    { lat: '28.6', lon: '77.2', unexpectedField: 'injected' },
    { q: 'Pune', unexpectedField: 'injected' }
  ];

  it.each(invalidQueries)(
    '/api/air-quality rejects invalid coordinates or unknown keys (%j) with 400',
    async (query) => {
      const mock = createMockResponse();
      await airQualityHandler(createMockRequest({ query }), mock.res);
      expect(mock.status).toHaveBeenCalledWith(400);
      expect(mock.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
  );

  it('accepts extreme valid lat/lon bounds (-90..90, -180..180) and handles upstream timeouts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({
        timezone: 'UTC',
        current: { pm2_5: 15 }
      })
    );

    const boundary = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { lat: '-90', lon: '180' } }), boundary.res);
    expect(boundary.status).toHaveBeenCalledWith(200);

    clearAirQualityCache();
    const timeoutErr = new DOMException('Upstream request timed out', 'TimeoutError');
    fetchSpy.mockRejectedValueOnce(timeoutErr);

    const timedOutAir = createMockResponse();
    await airQualityHandler(
      createMockRequest({ query: { lat: '28.61', lon: '77.21' } }),
      timedOutAir.res
    );
    expect(timedOutAir.status).toHaveBeenCalledWith(502);
    expect(timedOutAir.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(timedOutAir.json).toHaveBeenCalledWith({
      error: 'Unable to fetch live air quality telemetry.'
    });

    fetchSpy.mockRejectedValueOnce(timeoutErr);
    const timedOutGeo = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { q: 'Delhi' } }), timedOutGeo.res);
    expect(timedOutGeo.status).toHaveBeenCalledWith(502);
    expect(timedOutGeo.json).toHaveBeenCalledWith({ error: 'Geocoding upstream unavailable.' });

    clearAirQualityCache();
    vi.stubEnv('OPENAQ_API_KEY', 'openaq-key');
    fetchSpy.mockImplementation(async (input) => {
      if (String(input).includes('openaq.org')) {
        return Response.json({ results: [{ name: 'Station Only' }] });
      }
      return Response.json({ timezone: 'UTC', current: { pm2_5: 25 } });
    });
    const minimalAq = createMockResponse();
    await airQualityHandler(
      createMockRequest({ query: { lat: '13.08', lon: '80.27' } }),
      minimalAq.res
    );
    expect(minimalAq.json).toHaveBeenCalledWith(
      expect.objectContaining({
        groundStation: {
          stationName: 'Station Only',
          provider: 'OpenAQ Reference Monitor',
          distanceKm: null,
          pm25: null,
          lastUpdated: null
        }
      })
    );

    clearAirQualityCache();
    fetchSpy.mockImplementation(async (input) => {
      if (String(input).includes('openaq.org')) return Response.json({ results: [{}] });
      return Response.json({ timezone: 'UTC', current: { pm2_5: 25 } });
    });
    const unnamedAq = createMockResponse();
    await airQualityHandler(
      createMockRequest({ query: { lat: '22.57', lon: '88.36' } }),
      unnamedAq.res
    );
    expect(unnamedAq.json).toHaveBeenCalledWith(expect.objectContaining({ groundStation: null }));
    vi.unstubAllEnvs();
  });

  it('/api/assistant rejects non-POST with Allow: POST, oversized body with 413, and extra fields with 400', async () => {
    const put = createMockResponse();
    await assistantHandler(createMockRequest({ method: 'PUT' }), put.res);
    expect(put.status).toHaveBeenCalledWith(405);
    expect(put.setHeader).toHaveBeenCalledWith('Allow', 'POST');

    const extraField = createMockResponse();
    await assistantHandler(
      createMockRequest({
        method: 'POST',
        body: { ...VALID_ASSISTANT_BODY, injectedAdminFlag: true }
      }),
      extraField.res
    );
    expect(extraField.status).toHaveBeenCalledWith(400);

    const nonFinite = createMockResponse();
    await assistantHandler(
      createMockRequest({
        method: 'POST',
        body: { ...VALID_ASSISTANT_BODY, aqi: Number.POSITIVE_INFINITY }
      }),
      nonFinite.res
    );
    expect(nonFinite.status).toHaveBeenCalledWith(400);
  });
});
