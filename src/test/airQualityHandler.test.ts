import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import airQualityHandler, { clearAirQualityCache } from '../../api/air-quality';
import type { VercelRequest, VercelResponse } from '../../api/_lib/httpTypes';

function createMockRequest(options: {
  method?: string;
  query?: Record<string, string | string[]>;
} = {}): VercelRequest {
  const req = new IncomingMessage(new Socket());
  req.method = options.method ?? 'GET';
  return Object.assign(req, { query: options.query ?? {}, body: undefined });
}

function createMockResponse() {
  const raw = new ServerResponse(new IncomingMessage(new Socket()));
  const status = vi.fn();
  const json = vi.fn();
  const setHeader = vi.fn((_name: string, _value: number | string | readonly string[]): VercelResponse => res);
  const res: VercelResponse = Object.assign(raw, {
    setHeader,
    status: (code: number) => {
      status(code);
      return res;
    },
    json: (body: unknown) => {
      json(body);
      return res;
    }
  });
  return { res, status, json, setHeader };
}

describe('GET /api/air-quality', () => {
  beforeEach(() => {
    clearAirQualityCache();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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

  it('handles geocoding search, empty results, and upstream errors', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
      results: [{ name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.52, longitude: 73.86 }]
    }));

    const ok = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { q: 'Pune' } }), ok.res);
    expect(ok.status).toHaveBeenCalledWith(200);
    expect(ok.json).toHaveBeenCalledWith({
      results: [{ name: 'Pune', region: 'Maharashtra', country: 'India', lat: 18.52, lon: 73.86 }]
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockResolvedValueOnce(new Response('bad gateway', { status: 503 }));
    const fail = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { q: 'Pune' } }), fail.res);
    expect(fail.status).toHaveBeenCalledWith(502);

    fetchSpy.mockResolvedValueOnce(Response.json({ results: 'invalid' }));
    const badShape = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { q: 'Pune' } }), badShape.res);
    expect(badShape.status).toHaveBeenCalledWith(502);
  });

  it('returns live telemetry with OpenAQ overlay and serves subsequent requests from bounded cache', async () => {
    vi.useFakeTimers();
    const fixedNow = Date.parse('2026-11-24T12:00:00Z');
    vi.setSystemTime(fixedNow);
    vi.stubEnv('OPENAQ_API_KEY', 'openaq-test-key');

    const futureHourSec = Math.floor(fixedNow / 1000) + 3600;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('openaq.org')) {
        return Response.json({
          results: [{
            name: 'ITO CPCB Station',
            provider: { name: 'CPCB' },
            distance: 2340,
            datetimeLast: { utc: '2026-11-24T11:55:00Z' }
          }]
        });
      }
      return Response.json({
        timezone: 'Asia/Kolkata',
        current: { pm2_5: 150, pm10: 240, nitrogen_dioxide: 45, sulphur_dioxide: 12, ozone: 30, carbon_monoxide: 1000 },
        hourly: {
          time: [futureHourSec, futureHourSec + 3600],
          pm2_5: [120, 100],
          pm10: [200, 180]
        }
      });
    });

    const first = createMockResponse();
    await airQualityHandler(createMockRequest({
      query: { lat: '28.6139', lon: '77.2090', city: 'New Delhi', region: 'Delhi NCR', country: 'India' }
    }), first.res);

    expect(first.status).toHaveBeenCalledWith(200);
    expect(first.json).toHaveBeenCalledWith(expect.objectContaining({
      location: expect.objectContaining({ name: 'New Delhi' }),
      cpcb: expect.objectContaining({ aqi: 324, category: 'Very Poor' }),
      groundStation: {
        stationName: 'ITO CPCB Station',
        provider: 'CPCB',
        distanceKm: 2.3,
        pm25: null,
        lastUpdated: '2026-11-24T11:55:00Z'
      }
    }));
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const second = createMockResponse();
    await airQualityHandler(createMockRequest({
      query: { lat: '28.6139', lon: '77.2090', city: 'New Delhi' }
    }), second.res);
    expect(second.status).toHaveBeenCalledWith(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when Open-Meteo fails or returns unvalidated data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('error', { status: 500 }));
    const fail = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { lat: '19.076', lon: '72.8777' } }), fail.res);
    expect(fail.status).toHaveBeenCalledWith(502);

    fetchSpy.mockResolvedValueOnce(Response.json({ invalid: true }));
    const invalid = createMockResponse();
    await airQualityHandler(createMockRequest({ query: { lat: '19.076', lon: '72.8777' } }), invalid.res);
    expect(invalid.status).toHaveBeenCalledWith(502);
  });
});
