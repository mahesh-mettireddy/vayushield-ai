import { z } from 'zod';
import type { VercelRequest, VercelResponse } from './_lib/httpTypes.js';
import { BoundedTtlCache } from './_lib/boundedCache.js';
import { analyzeCleanAirWindows } from '../src/engine/cleanAirWindow.js';
import { readOpenMeteoForecast } from '../src/engine/openMeteoForecast.js';
import type {
  AirQualityPayload,
  GroundStationOverlay,
  LocationOption
} from '../src/types/airQuality.js';
import { AirQualityQuerySchema, OpenMeteoAirDataSchema, sanitizeUserText } from './_lib/schemas.js';

const CACHE_TTL_MS = 15 * 60 * 1000;
const AIR_CACHE_MAX_ENTRIES = 500;
const airCache = new BoundedTtlCache<AirQualityPayload>(AIR_CACHE_MAX_ENTRIES);

const OpenAqLocationsResponseSchema = z.object({
  results: z.array(z.object({
    name: z.string().optional(),
    provider: z.object({ name: z.string().optional() }).optional(),
    distance: z.number().optional(),
    datetimeLast: z.object({ utc: z.string().optional() }).optional()
  })).optional()
});

const OpenMeteoGeoResponseSchema = z.object({
  results: z.array(z.object({
    name: z.string(),
    admin1: z.string().optional(),
    country: z.string().optional(),
    latitude: z.number(),
    longitude: z.number()
  })).optional()
});

export function clearAirQualityCache(): void {
  airCache.clear();
}

function sendTelemetry(res: VercelResponse, payload: AirQualityPayload, expiresAt: number): void {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  res.setHeader('Cache-Control', `public, s-maxage=${maxAge}`);
  res.status(200).json(payload);
}

async function fetchOpenAqStation(lat: number, lon: number, apiKey?: string): Promise<GroundStationOverlay | null> {
  if (!apiKey?.trim()) return null;
  try {
    const url = `https://api.openaq.org/v3/locations?coordinates=${lat.toFixed(4)},${lon.toFixed(4)}&radius=25000&limit=1`;
    const res = await fetch(url, {
      headers: { 'X-API-Key': apiKey.trim() },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;

    const parsed = OpenAqLocationsResponseSchema.safeParse(await res.json());
    if (!parsed.success) return null;

    const first = parsed.data.results?.[0];
    if (!first?.name) return null;

    return {
      stationName: first.name,
      provider: first.provider?.name ?? 'OpenAQ Reference Monitor',
      distanceKm: typeof first.distance === 'number' ? Math.round((first.distance / 1000) * 10) / 10 : null,
      // OpenAQ v3 /locations provides station proximity and freshness metadata without live PM2.5 readings;
      // quantitative hourly PM2.5 telemetry comes from Open-Meteo while OpenAQ supplies nearest-station provenance.
      pm25: null,
      lastUpdated: first.datetimeLast?.utc ?? null
    };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const parsed = AirQualityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters.', details: parsed.error.flatten() });
    return;
  }

  if ('q' in parsed.data) {
    const query = sanitizeUserText(parsed.data.q, 80);
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
      const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) });
      if (!geoRes.ok) {
        res.status(502).json({ error: 'Geocoding upstream unavailable.' });
        return;
      }

      const geoParsed = OpenMeteoGeoResponseSchema.safeParse(await geoRes.json());
      if (!geoParsed.success) {
        res.status(502).json({ error: 'Geocoding upstream returned an unexpected payload.' });
        return;
      }

      const results: LocationOption[] = (geoParsed.data.results ?? []).map((item) => ({
        name: item.name,
        region: item.admin1 ?? '',
        country: item.country ?? '',
        lat: item.latitude,
        lon: item.longitude
      }));
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
      res.status(200).json({ results });
      return;
    } catch {
      res.status(502).json({ error: 'Failed to search locations.' });
      return;
    }
  }

  const { lat, lon, city, region, country } = parsed.data;
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = airCache.getEntry(cacheKey);
  if (cached) {
    sendTelemetry(res, cached.value, cached.expiresAt);
    return;
  }

  try {
    const omUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone` +
      `&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone` +
      `&forecast_days=2&timezone=auto&timeformat=unixtime`;

    const [omRes, groundStation] = await Promise.all([
      fetch(omUrl, { signal: AbortSignal.timeout(10000) }),
      fetchOpenAqStation(lat, lon, process.env.OPENAQ_API_KEY)
    ]);

    if (!omRes.ok) {
      res.status(502).json({ error: `Open-Meteo Air Quality HTTP ${omRes.status}` });
      return;
    }

    const omParsed = OpenMeteoAirDataSchema.safeParse(await omRes.json());
    if (!omParsed.success) {
      res.status(502).json({ error: 'Open-Meteo returned an unexpected air quality payload.' });
      return;
    }

    const { current, hourly, cpcb } = readOpenMeteoForecast(omParsed.data);
    const windowAnalysis = analyzeCleanAirWindows(hourly);

    const payload: AirQualityPayload = {
      location: {
        name: sanitizeUserText(city ?? 'Selected Location', 80),
        region: sanitizeUserText(region ?? '', 80),
        country: sanitizeUserText(country ?? '', 80),
        lat,
        lon
      },
      fetchedAt: new Date().toISOString(),
      source: 'Open-Meteo Air Quality API (CC BY 4.0)',
      current,
      cpcb,
      hourly,
      windowAnalysis,
      groundStation
    };

    const firstForecastHour = hourly[0];
    const expiresAt = Math.min(
      Date.now() + CACHE_TTL_MS,
      firstForecastHour ? Date.parse(firstForecastHour.time) : Date.now()
    );
    airCache.set(cacheKey, payload, expiresAt);
    sendTelemetry(res, payload, expiresAt);
  } catch {
    res.status(502).json({ error: 'Unable to fetch live air quality telemetry.' });
  }
}
