import { z } from 'zod';
import {
  buildOpenMeteoGeoUrl,
  mapOpenMeteoGeoResults
} from '../../src/engine/openMeteoForecast.js';
import type { GroundStationOverlay, LocationOption } from '../../src/types/airQuality.js';

const CACHE_TTL_MS = 15 * 60 * 1000;
const OPENAQ_RADIUS_METERS = 25_000;
const OPENAQ_TIMEOUT_MS = 5_000;
const GEOCODE_TIMEOUT_MS = 8_000;
const METERS_PER_KM = 1000;

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

function mapOpenAqStation(
  first: z.infer<typeof OpenAqLocationSchema> | undefined
): GroundStationOverlay | null {
  if (!first?.name) return null;
  const distanceKm =
    typeof first.distance === 'number'
      ? Math.round((first.distance / METERS_PER_KM) * 10) / 10
      : null;
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

/** Fetches optional nearest-station provenance metadata from OpenAQ v3 within 25 km. */
export async function fetchOpenAqStation(
  lat: number,
  lon: number,
  apiKey?: string
): Promise<GroundStationOverlay | null> {
  const cleanKey = apiKey?.trim();
  if (!cleanKey) return null;
  try {
    const url = `https://api.openaq.org/v3/locations?coordinates=${lat.toFixed(4)},${lon.toFixed(4)}&radius=${OPENAQ_RADIUS_METERS}&limit=1`;
    const res = await fetch(url, {
      headers: { 'X-API-Key': cleanKey },
      signal: AbortSignal.timeout(OPENAQ_TIMEOUT_MS)
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

/** Queries Open-Meteo Geocoding with a strict upstream schema check and timeout. */
export async function fetchGeocodingLocations(
  query: string
): Promise<LocationOption[] | 'upstream-error'> {
  try {
    const geoRes = await fetch(buildOpenMeteoGeoUrl(query), {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS)
    });
    if (!geoRes.ok) return 'upstream-error';

    const geoParsed = OpenMeteoGeoResponseSchema.safeParse(await geoRes.json());
    if (!geoParsed.success) return 'upstream-error';

    return mapOpenMeteoGeoResults(geoParsed.data.results ?? []);
  } catch (error) {
    console.error(
      '[air-quality] Geocoding failure:',
      error instanceof Error ? error.name : 'request failed'
    );
    return 'upstream-error';
  }
}

/** Caps cache expiration to at most 15 minutes or the start of the first forecast hour. */
export function computeAirCacheExpiry(firstForecastTime?: string): number {
  const parsedTime = firstForecastTime ? Date.parse(firstForecastTime) : Number.NaN;
  return Math.min(Date.now() + CACHE_TTL_MS, Number.isFinite(parsedTime) ? parsedTime : Date.now());
}
