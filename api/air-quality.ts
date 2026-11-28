import { z } from 'zod';
import type { VercelRequest, VercelResponse } from './_lib/httpTypes.js';
import { BoundedTtlCache } from './_lib/boundedCache.js';
import { analyzeCleanAirWindows } from '../src/engine/cleanAirWindow.js';
import {
  buildOpenMeteoAirUrl,
  buildOpenMeteoGeoUrl,
  mapOpenMeteoGeoResults,
  readOpenMeteoForecast
} from '../src/engine/openMeteoForecast.js';
import type {
  AirQualityPayload,
  GroundStationOverlay,
  LocationOption
} from '../src/types/airQuality.js';
import {
  AirQualityQuerySchema,
  OpenMeteoAirDataSchema,
  checkRateLimit,
  extractClientIp,
  sanitizeUserText
} from './_lib/schemas.js';

const CACHE_TTL_MS = 15 * 60 * 1000;
const AIR_CACHE_MAX_ENTRIES = 500;
const airCache = new BoundedTtlCache<AirQualityPayload>(AIR_CACHE_MAX_ENTRIES);

const OpenAqLocationSchema = z.object({
  name: z.string().optional(),
  provider: z.object({ name: z.string().optional() }).optional(),
  distance: z.number().optional(),
  datetimeLast: z.object({ utc: z.string().optional() }).optional()
});

const OpenAqLocationsResponseSchema = z.object({
  results: z.array(OpenAqLocationSchema).optional()
});

const OpenMeteoGeoResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        admin1: z.string().optional(),
        country: z.string().optional(),
        latitude: z.number(),
        longitude: z.number()
      })
    )
    .optional()
});

/** Clears the bounded in-memory air-quality telemetry cache (primarily for test isolation). */
export function clearAirQualityCache(): void {
  airCache.clear();
}

function sendTelemetry(res: VercelResponse, payload: AirQualityPayload, expiresAt: number): void {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  res.setHeader('Cache-Control', `public, s-maxage=${maxAge}`);
  res.status(200).json(payload);
}

function mapOpenAqStation(
  first: z.infer<typeof OpenAqLocationSchema> | undefined
): GroundStationOverlay | null {
  if (!first?.name) return null;
  const distanceKm =
    typeof first.distance === 'number' ? Math.round((first.distance / 1000) * 10) / 10 : null;
  return {
    stationName: first.name,
    provider: first.provider?.name ?? 'OpenAQ Reference Monitor',
    distanceKm,
    // OpenAQ v3 /locations provides station proximity and freshness metadata without live PM2.5 readings;
    // quantitative hourly PM2.5 telemetry comes from Open-Meteo while OpenAQ supplies nearest-station provenance.
    pm25: null,
    lastUpdated: first.datetimeLast?.utc ?? null
  };
}

async function fetchOpenAqStation(
  lat: number,
  lon: number,
  apiKey?: string
): Promise<GroundStationOverlay | null> {
  const cleanKey = apiKey?.trim();
  if (!cleanKey) return null;
  try {
    const url = `https://api.openaq.org/v3/locations?coordinates=${lat.toFixed(4)},${lon.toFixed(4)}&radius=25000&limit=1`;
    const res = await fetch(url, {
      headers: { 'X-API-Key': cleanKey },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;

    const parsed = OpenAqLocationsResponseSchema.safeParse(await res.json());
    return parsed.success ? mapOpenAqStation(parsed.data.results?.[0]) : null;
  } catch (error) {
    console.error(
      '[air-quality] OpenAQ lookup skipped:',
      error instanceof Error ? error.name : 'request failed'
    );
    return null;
  }
}

async function handleGeoSearch(rawQuery: string, res: VercelResponse): Promise<void> {
  const query = sanitizeUserText(rawQuery, 80);
  try {
    const geoRes = await fetch(buildOpenMeteoGeoUrl(query), { signal: AbortSignal.timeout(8000) });
    if (!geoRes.ok) {
      res.status(502).json({ error: 'Geocoding upstream unavailable.' });
      return;
    }

    const geoParsed = OpenMeteoGeoResponseSchema.safeParse(await geoRes.json());
    if (!geoParsed.success) {
      res.status(502).json({ error: 'Geocoding upstream returned an unexpected payload.' });
      return;
    }

    const results: LocationOption[] = mapOpenMeteoGeoResults(geoParsed.data.results ?? []);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    res.status(200).json({ results });
  } catch (error) {
    console.error(
      '[air-quality] Geocoding failure:',
      error instanceof Error ? error.name : 'request failed'
    );
    res.status(502).json({ error: 'Failed to search locations.' });
  }
}

function computeCacheExpiry(hourly: AirQualityPayload['hourly']): number {
  const firstForecastHour = hourly[0];
  const parsedTime = firstForecastHour ? Date.parse(firstForecastHour.time) : Number.NaN;
  return Math.min(Date.now() + CACHE_TTL_MS, Number.isFinite(parsedTime) ? parsedTime : Date.now());
}

async function handleTelemetryLookup(
  params: { lat: number; lon: number; city?: string; region?: string; country?: string },
  res: VercelResponse
): Promise<void> {
  const { lat, lon, city, region, country } = params;
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = airCache.getEntry(cacheKey);
  if (cached) {
    sendTelemetry(res, cached.value, cached.expiresAt);
    return;
  }

  try {
    const [omRes, groundStation] = await Promise.all([
      fetch(buildOpenMeteoAirUrl(lat, lon), { signal: AbortSignal.timeout(10000) }),
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
      windowAnalysis: analyzeCleanAirWindows(hourly),
      groundStation
    };

    const expiresAt = computeCacheExpiry(hourly);
    airCache.set(cacheKey, payload, expiresAt);
    sendTelemetry(res, payload, expiresAt);
  } catch (error) {
    console.error(
      '[air-quality] Telemetry fetch failure:',
      error instanceof Error ? error.name : 'request failed'
    );
    res.status(502).json({ error: 'Unable to fetch live air quality telemetry.' });
  }
}

/**
 * Vercel serverless GET endpoint serving Open-Meteo geocoding (`?q=...`) or live AQI
 * telemetry with optional OpenAQ reference station metadata (`?lat=&lon=`).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const rate = checkRateLimit(`air:${extractClientIp(req)}`, 60, 5 * 60 * 1000);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return;
  }

  const parsed = AirQualityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters.', details: parsed.error.flatten() });
    return;
  }

  if ('q' in parsed.data) {
    await handleGeoSearch(parsed.data.q, res);
    return;
  }

  await handleTelemetryLookup(parsed.data, res);
}
