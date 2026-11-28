import type { VercelRequest, VercelResponse } from './_lib/httpTypes.js';
import { BoundedTtlCache } from './_lib/boundedCache.js';
import { analyzeCleanAirWindows } from '../src/engine/cleanAirWindow.js';
import { buildOpenMeteoAirUrl, readOpenMeteoForecast } from '../src/engine/openMeteoForecast.js';
import type { AirQualityPayload } from '../src/types/airQuality.js';
import {
  AirQualityQuerySchema,
  OpenMeteoAirDataSchema,
  checkRateLimit,
  extractClientIp,
  sanitizeUserText
} from './_lib/schemas.js';
import {
  computeAirCacheExpiry,
  fetchGeocodingLocations,
  fetchOpenAqStation
} from './_lib/upstream.js';

const AIR_CACHE_MAX_ENTRIES = 500;
const OPEN_METEO_TIMEOUT_MS = 10_000;
const AIR_RATE_LIMIT_MAX = 60;
const AIR_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_QUERY_TEXT_LENGTH = 80;
const MS_PER_SECOND = 1000;
const GEOCODE_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=600';
const airCache = new BoundedTtlCache<AirQualityPayload>(AIR_CACHE_MAX_ENTRIES);

/** Clears the bounded in-memory air-quality telemetry cache (primarily for test isolation). */
export function clearAirQualityCache(): void {
  airCache.clear();
}

function sendError(res: VercelResponse, statusCode: number, body: Record<string, unknown>): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(statusCode).json(body);
}

function sendTelemetry(res: VercelResponse, payload: AirQualityPayload, expiresAt: number): void {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / MS_PER_SECOND));
  res.setHeader('Cache-Control', `public, s-maxage=${maxAge}`);
  res.status(200).json(payload);
}

async function handleGeoSearch(rawQuery: string, res: VercelResponse): Promise<void> {
  const query = sanitizeUserText(rawQuery, MAX_QUERY_TEXT_LENGTH);
  const results = await fetchGeocodingLocations(query);
  if (results === 'upstream-error') {
    sendError(res, 502, { error: 'Geocoding upstream unavailable.' });
    return;
  }

  res.setHeader('Cache-Control', GEOCODE_CACHE_CONTROL);
  res.status(200).json({ results });
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
      fetch(buildOpenMeteoAirUrl(lat, lon), {
        signal: AbortSignal.timeout(OPEN_METEO_TIMEOUT_MS)
      }),
      fetchOpenAqStation(lat, lon, process.env.OPENAQ_API_KEY)
    ]);

    if (!omRes.ok) {
      sendError(res, 502, { error: 'Open-Meteo Air Quality upstream error.' });
      return;
    }

    const omParsed = OpenMeteoAirDataSchema.safeParse(await omRes.json());
    if (!omParsed.success) {
      sendError(res, 502, { error: 'Open-Meteo returned an unexpected air quality payload.' });
      return;
    }

    const { current, hourly, cpcb } = readOpenMeteoForecast(omParsed.data);
    const payload: AirQualityPayload = {
      location: {
        name: sanitizeUserText(city ?? 'Selected Location', MAX_QUERY_TEXT_LENGTH),
        region: sanitizeUserText(region ?? '', MAX_QUERY_TEXT_LENGTH),
        country: sanitizeUserText(country ?? '', MAX_QUERY_TEXT_LENGTH),
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

    const expiresAt = computeAirCacheExpiry(hourly[0]?.time);
    airCache.set(cacheKey, payload, expiresAt);
    sendTelemetry(res, payload, expiresAt);
  } catch (error) {
    console.error(
      '[air-quality] Telemetry fetch failure:',
      error instanceof Error ? error.name : 'request failed'
    );
    sendError(res, 502, { error: 'Unable to fetch live air quality telemetry.' });
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
    sendError(res, 405, { error: 'Method not allowed. Use GET.' });
    return;
  }

  const rate = checkRateLimit(
    `air:${extractClientIp(req)}`,
    AIR_RATE_LIMIT_MAX,
    AIR_RATE_LIMIT_WINDOW_MS
  );
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    sendError(res, 429, { error: 'Too many requests. Please wait a moment and try again.' });
    return;
  }

  const parsed = AirQualityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, { error: 'Invalid query parameters.', details: parsed.error.flatten() });
    return;
  }

  if ('q' in parsed.data) {
    await handleGeoSearch(parsed.data.q, res);
    return;
  }

  await handleTelemetryLookup(parsed.data, res);
}
