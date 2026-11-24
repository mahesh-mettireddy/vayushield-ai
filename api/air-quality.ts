import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeCleanAirWindows } from '../src/engine/cleanAirWindow';
import { readOpenMeteoForecast, type OpenMeteoAirData } from '../src/engine/openMeteoForecast';
import type {
  AirQualityPayload,
  GroundStationOverlay,
  LocationOption
} from '../src/types/airQuality';
import { AirQualityQuerySchema, sanitizeUserText } from './_lib/schemas';

interface CacheEntry {
  expiresAt: number;
  payload: AirQualityPayload;
}

const airCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function sendTelemetry(res: VercelResponse, { expiresAt, payload }: CacheEntry): void {
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
    const data = (await res.json()) as {
      results?: Array<{
        name?: string;
        provider?: { name?: string };
        distance?: number;
        datetimeLast?: { utc?: string };
      }>;
    };
    const first = data.results?.[0];
    if (!first?.name) return null;
    return {
      stationName: first.name,
      provider: first.provider?.name ?? 'OpenAQ Reference Monitor',
      distanceKm: typeof first.distance === 'number' ? Math.round((first.distance / 1000) * 10) / 10 : null,
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
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const parsed = AirQualityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters.', details: parsed.error.flatten() });
    return;
  }

  // Geocoding search branch (Open-Meteo Geocoding API — free, no API key)
  if ('q' in parsed.data) {
    const query = sanitizeUserText(parsed.data.q, 80);
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
      const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) });
      if (!geoRes.ok) {
        res.status(502).json({ error: 'Geocoding upstream unavailable.' });
        return;
      }
      const geoData = (await geoRes.json()) as {
        results?: Array<{
          name: string;
          admin1?: string;
          country?: string;
          latitude: number;
          longitude: number;
        }>;
      };
      const results: LocationOption[] = (geoData.results ?? []).map((item) => ({
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

  // Air quality telemetry branch (Open-Meteo Air Quality API — free, no API key)
  const { lat, lon, city, region, country } = parsed.data;
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = airCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    sendTelemetry(res, cached);
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

    const { current, hourly, cpcb } = readOpenMeteoForecast(await omRes.json() as OpenMeteoAirData);

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
    const entry = { expiresAt, payload };
    airCache.set(cacheKey, entry);
    sendTelemetry(res, entry);
  } catch {
    res.status(502).json({ error: 'Unable to fetch live air quality telemetry.' });
  }
}
