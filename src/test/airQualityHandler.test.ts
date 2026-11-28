import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import airQualityHandler, { clearAirQualityCache } from '../../api/air-quality';
import { resetRateLimitCache } from '../../api/_lib/schemas';
import { createMockRequest, createMockResponse } from './httpMock';

describe('GET /api/air-quality', () => {
  beforeEach(() => {
    clearAirQualityCache();
    resetRateLimitCache();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects non-GET methods with 405 and returns 400 on invalid query parameters', async () => {
    const post = createMockResponse();
    await airQualityHandler(createMockRequest({ method: 'POST' }), post.res);
    expect(post.status).toHaveBeenCalledWith(405);
    expect(post.setHeader).toHaveBeenCalledWith('Allow', 'GET');

    const bad = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { lat: '999', lon: '77' } }), bad.res);
    expect(bad.status).toHaveBeenCalledWith(400);
  });

  it('enforces bounded rate limiting on /api/air-quality', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ results: [] }));
    for (let i = 0; i < 60; i++) {
      const ok = createMockResponse();
      await airQualityHandler(
        createMockRequest({
          headers: { 'x-real-ip': '203.0.113.55' },
          query: { q: 'Pune' }
        }),
        ok.res
      );
      expect(ok.status).toHaveBeenCalledWith(200);
    }

    const limited = createMockResponse();
    await airQualityHandler(
      createMockRequest({
        headers: { 'x-real-ip': '203.0.113.55' },
        query: { q: 'Pune' }
      }),
      limited.res
    );
    expect(limited.status).toHaveBeenCalledWith(429);
    expect(limited.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('handles geocoding search, empty results, and upstream failures', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
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

    const ok = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { q: 'Pune' } }), ok.res);
    expect(ok.status).toHaveBeenCalledWith(200);
    expect(ok.json).toHaveBeenCalledWith({
      results: [{ name: 'Pune', region: 'Maharashtra', country: 'India', lat: 18.52, lon: 73.86 }]
    });

    fetchSpy.mockResolvedValueOnce(new Response('bad gateway', { status: 503 }));
    const fail = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { q: 'Pune' } }), fail.res);
    expect(fail.status).toHaveBeenCalledWith(502);

    fetchSpy.mockResolvedValueOnce(Response.json({ results: 'invalid' }));
    const badShape = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { q: 'Pune' } }), badShape.res);
    expect(badShape.status).toHaveBeenCalledWith(502);

    fetchSpy.mockRejectedValueOnce(new Error('network error'));
    const netFail = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { q: 'Pune' } }), netFail.res);
    expect(netFail.status).toHaveBeenCalledWith(502);
  });

  it('returns live telemetry with OpenAQ overlay and serves subsequent requests from bounded cache', async () => {
    vi.useFakeTimers();
    const fixedNow = Date.parse('2026-11-24T12:00:00Z');
    vi.setSystemTime(fixedNow);
    vi.stubEnv('OPENAQ_API_KEY', 'openaq-test-key');

    const futureHourSec = Math.floor(fixedNow / 1000) + 3600;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('openaq.org')) {
        return Response.json({
          results: [
            {
              name: 'ITO CPCB Station',
              provider: { name: 'CPCB' },
              distance: 2340,
              datetimeLast: { utc: '2026-11-24T11:55:00Z' }
            }
          ]
        });
      }
      return Response.json({
        timezone: 'Asia/Kolkata',
        current: {
          pm2_5: 150,
          pm10: 240,
          nitrogen_dioxide: 45,
          sulphur_dioxide: 12,
          ozone: 30,
          carbon_monoxide: 1000
        },
        hourly: { time: [futureHourSec, futureHourSec + 3600], pm2_5: [120, 100], pm10: [200, 180] }
      });
    });

    const first = createMockResponse();
    await airQualityHandler(
      createMockRequest({
        query: {
          lat: '28.6139',
          lon: '77.2090',
          city: 'New Delhi',
          region: 'Delhi NCR',
          country: 'India'
        }
      }),
      first.res
    );

    expect(first.status).toHaveBeenCalledWith(200);
    expect(first.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cpcb: expect.objectContaining({ aqi: 324, category: 'Very Poor' }),
        groundStation: {
          stationName: 'ITO CPCB Station',
          provider: 'CPCB',
          distanceKm: 2.3,
          pm25: null,
          lastUpdated: '2026-11-24T11:55:00Z'
        }
      })
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const second = createMockResponse();
    await airQualityHandler(
      createMockRequest({
        query: { lat: '28.6139', lon: '77.2090', city: 'New Delhi' }
      }),
      second.res
    );
    expect(second.status).toHaveBeenCalledWith(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('degrades OpenAQ errors to null and returns 502 on Open-Meteo failures', async () => {
    vi.stubEnv('OPENAQ_API_KEY', 'openaq-key');
    const futureHourSec = Math.floor(Date.now() / 1000) + 3600;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('openaq.org')) {
        throw new Error('openaq timeout');
      }
      return Response.json({
        timezone: 'UTC',
        current: { pm2_5: 40 },
        hourly: { time: [futureHourSec], pm2_5: [40] }
      });
    });

    const okWithNullAq = createMockResponse();
    await airQualityHandler(
      createMockRequest({ query: { lat: '18.52', lon: '73.86' } }),
      okWithNullAq.res
    );
    expect(okWithNullAq.status).toHaveBeenCalledWith(200);
    expect(okWithNullAq.json).toHaveBeenCalledWith(
      expect.objectContaining({ groundStation: null })
    );

    clearAirQualityCache();
    fetchSpy.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const fail = createMockResponse();
    await airQualityHandler(
      createMockRequest({ query: { lat: '19.076', lon: '72.8777' } }),
      fail.res
    );
    expect(fail.status).toHaveBeenCalledWith(502);

    fetchSpy.mockResolvedValueOnce(Response.json({ invalid: true }));
    const invalid = createMockResponse();
    await airQualityHandler(
      createMockRequest({ query: { lat: '19.076', lon: '72.8777' } }),
      invalid.res
    );
    expect(invalid.status).toHaveBeenCalledWith(502);

    fetchSpy.mockRejectedValueOnce(new Error('network error'));
    const thrown = createMockResponse();
    await airQualityHandler(
      createMockRequest({ query: { lat: '19.076', lon: '72.8777' } }),
      thrown.res
    );
    expect(thrown.status).toHaveBeenCalledWith(502);

    clearAirQualityCache();
    fetchSpy.mockImplementation(async (input) => {
      if (String(input).includes('openaq.org')) return new Response('no', { status: 404 });
      return Response.json({ timezone: 'UTC', current: { pm2_5: 15 } });
    });
    const noAq = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { lat: '12.97', lon: '77.59' } }), noAq.res);
    expect(noAq.status).toHaveBeenCalledWith(200);
    expect(noAq.json).toHaveBeenCalledWith(
      expect.objectContaining({ groundStation: null, hourly: [] })
    );
  });
});
