import type { HourlyAirPoint, LocationOption, PollutantReadings } from '../types/airQuality.js';
import { calculateCpcbAqi } from './cpcbAqi.js';

interface OpenMeteoPollutants<T> {
  pm2_5?: T;
  pm10?: T;
  nitrogen_dioxide?: T;
  sulphur_dioxide?: T;
  ozone?: T;
  carbon_monoxide?: T;
}

/** Validated subset of Open-Meteo Air Quality API current and hourly telemetry. */
export interface OpenMeteoAirData {
  timezone: string;
  current?: OpenMeteoPollutants<number | null>;
  hourly?: OpenMeteoPollutants<Array<number | null>> & { time: number[] };
}

/** Geocoding candidate returned by the Open-Meteo search endpoint. */
export interface OpenMeteoGeoItem {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

function metricValue(value: number | null | undefined, fallback: number): number {
  return value ?? fallback;
}

function seriesValue(
  series: Array<number | null> | undefined,
  index: number,
  fallback: number
): number {
  return series?.[index] ?? fallback;
}

function readCurrentPollutants(rawCurrent: OpenMeteoAirData['current']): PollutantReadings {
  const src = rawCurrent ?? {};
  return {
    pm25: metricValue(src.pm2_5, 0),
    pm10: metricValue(src.pm10, 0),
    no2: metricValue(src.nitrogen_dioxide, 0),
    so2: metricValue(src.sulphur_dioxide, 0),
    o3: metricValue(src.ozone, 0),
    coUgM3: metricValue(src.carbon_monoxide, 0)
  };
}

function readHourlyPollutants(
  forecast: NonNullable<OpenMeteoAirData['hourly']>,
  index: number,
  fallback: PollutantReadings
): PollutantReadings {
  return {
    pm25: seriesValue(forecast.pm2_5, index, fallback.pm25),
    pm10: seriesValue(forecast.pm10, index, fallback.pm10),
    no2: seriesValue(forecast.nitrogen_dioxide, index, fallback.no2),
    so2: seriesValue(forecast.sulphur_dioxide, index, fallback.so2),
    o3: seriesValue(forecast.ozone, index, fallback.o3),
    coUgM3: seriesValue(forecast.carbon_monoxide, index, fallback.coUgM3)
  };
}

const MS_PER_SECOND = 1000;
const MS_PER_HOUR = 3_600_000;
const FORECAST_HOURS_COUNT = 24;

function buildUpcomingHourly(
  forecast: OpenMeteoAirData['hourly'],
  timezone: string,
  current: PollutantReadings,
  now: number
): HourlyAirPoint[] {
  if (!forecast) return [];
  const firstUpcoming = forecast.time.findIndex((time) => time * MS_PER_SECOND > now);
  if (firstUpcoming < 0) return [];

  const hourLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: true
  });

  return forecast.time
    .slice(firstUpcoming, firstUpcoming + FORECAST_HOURS_COUNT)
    .map((time, offset) => {
      const readings = readHourlyPollutants(forecast, firstUpcoming + offset, current);
      const timestamp = time * MS_PER_SECOND;
      return {
        time: new Date(timestamp).toISOString(),
        hourLabel: hourLabel.format(timestamp),
        endHourLabel: hourLabel.format(timestamp + MS_PER_HOUR),
        pm25: Math.round(readings.pm25 * 10) / 10,
        pm10: Math.round(readings.pm10 * 10) / 10,
        aqi: calculateCpcbAqi(readings).aqi
      };
    });
}

/** Builds the Open-Meteo Air Quality forecast URL for the given coordinates. */
export function buildOpenMeteoAirUrl(lat: number, lon: number): string {
  return (
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone` +
    `&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone` +
    `&forecast_days=2&timezone=auto&timeformat=unixtime`
  );
}

/** Builds the Open-Meteo city geocoding URL for a sanitized query string. */
export function buildOpenMeteoGeoUrl(query: string): string {
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
}

/** Maps validated Open-Meteo geocoding items into normalized `LocationOption` records. */
export function mapOpenMeteoGeoResults(items: ReadonlyArray<OpenMeteoGeoItem>): LocationOption[] {
  return items.map((item) => ({
    name: item.name,
    region: item.admin1 ?? '',
    country: item.country ?? '',
    lat: item.latitude,
    lon: item.longitude
  }));
}

/**
 * Extracts current pollutant readings, CPCB NAQI summary, and strictly upcoming
 * 24-hour forecast points formatted in the city's local timezone.
 */
export function readOpenMeteoForecast(data: OpenMeteoAirData, now = Date.now()) {
  const current = readCurrentPollutants(data.current);
  const hourly = buildUpcomingHourly(data.hourly, data.timezone, current, now);
  return { current, hourly, cpcb: calculateCpcbAqi(current) };
}
