import { AQI_CATEGORIES, POLLUTANT_KEYS } from '../engine/cpcbAqi';
import {
  mapOpenMeteoGeoResults,
  type OpenMeteoAirData,
  type OpenMeteoGeoItem
} from '../engine/openMeteoForecast';
import type {
  AirQualityPayload,
  AssistantPlan,
  LlmProviderName,
  LocationOption
} from '../types/airQuality';

const PROVIDERS: readonly LlmProviderName[] = [
  'gemini',
  'huggingface',
  'groq',
  'deterministic-fallback'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumberArray(value: unknown): value is Array<number | null> {
  return Array.isArray(value) && value.every((item) => item === null || isNumber(item));
}

function readOptionalNullableNumber(
  obj: Record<string, unknown>,
  key: string
): number | null | undefined {
  const val = obj[key];
  return val === undefined || val === null || isNumber(val) ? val : undefined;
}

function readOptionalHourlyArray(
  obj: Record<string, unknown>,
  key: string
): Array<number | null> | undefined {
  const val = obj[key];
  return isNullableNumberArray(val) ? val : undefined;
}

function parseCurrentBlock(rawCurrent: unknown): OpenMeteoAirData['current'] {
  if (!isRecord(rawCurrent)) return undefined;
  return {
    pm2_5: readOptionalNullableNumber(rawCurrent, 'pm2_5'),
    pm10: readOptionalNullableNumber(rawCurrent, 'pm10'),
    nitrogen_dioxide: readOptionalNullableNumber(rawCurrent, 'nitrogen_dioxide'),
    sulphur_dioxide: readOptionalNullableNumber(rawCurrent, 'sulphur_dioxide'),
    ozone: readOptionalNullableNumber(rawCurrent, 'ozone'),
    carbon_monoxide: readOptionalNullableNumber(rawCurrent, 'carbon_monoxide')
  };
}

function parseHourlyBlock(rawHourly: unknown): OpenMeteoAirData['hourly'] {
  if (!isRecord(rawHourly) || !Array.isArray(rawHourly.time) || !rawHourly.time.every(isNumber)) {
    return undefined;
  }
  return {
    time: rawHourly.time,
    pm2_5: readOptionalHourlyArray(rawHourly, 'pm2_5'),
    pm10: readOptionalHourlyArray(rawHourly, 'pm10'),
    nitrogen_dioxide: readOptionalHourlyArray(rawHourly, 'nitrogen_dioxide'),
    sulphur_dioxide: readOptionalHourlyArray(rawHourly, 'sulphur_dioxide'),
    ozone: readOptionalHourlyArray(rawHourly, 'ozone'),
    carbon_monoxide: readOptionalHourlyArray(rawHourly, 'carbon_monoxide')
  };
}

/** Validates an untyped direct Open-Meteo air-quality payload at the client boundary. */
export function parseOpenMeteoAirData(input: unknown): OpenMeteoAirData {
  if (!isRecord(input) || !isString(input.timezone) || !input.timezone) {
    throw new Error('Invalid Open-Meteo response.');
  }
  return {
    timezone: input.timezone,
    current: parseCurrentBlock(input.current),
    hourly: parseHourlyBlock(input.hourly)
  };
}

function isLocationOption(value: unknown): value is LocationOption {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.region) &&
    isString(value.country) &&
    isNumber(value.lat) &&
    isNumber(value.lon)
  );
}

/** Validates the JSON search response from `/api/air-quality?q=...`. */
export function parseApiSearchResults(input: unknown): LocationOption[] | null {
  if (!isRecord(input)) return null;
  if (input.results === undefined) return [];
  if (!Array.isArray(input.results) || !input.results.every(isLocationOption)) return null;
  return input.results;
}

/** Filters and maps untyped Open-Meteo geocoding items into valid `LocationOption` entries. */
export function parseOpenMeteoGeoResults(input: unknown): LocationOption[] {
  if (!isRecord(input) || !Array.isArray(input.results)) return [];
  const validItems: OpenMeteoGeoItem[] = [];
  for (const item of input.results) {
    if (
      !isRecord(item) ||
      !isString(item.name) ||
      !isNumber(item.latitude) ||
      !isNumber(item.longitude)
    )
      continue;
    validItems.push({
      name: item.name,
      admin1: isString(item.admin1) ? item.admin1 : undefined,
      country: isString(item.country) ? item.country : undefined,
      latitude: item.latitude,
      longitude: item.longitude
    });
  }
  return mapOpenMeteoGeoResults(validItems);
}

function isCpcbSummary(cpcb: unknown): boolean {
  if (!isRecord(cpcb) || !isRecord(cpcb.subIndices)) return false;
  const subIndices = cpcb.subIndices;
  return (
    isNumber(cpcb.aqi) &&
    AQI_CATEGORIES.some((cat) => cpcb.category === cat) &&
    POLLUTANT_KEYS.some((key) => cpcb.dominantPollutant === key) &&
    POLLUTANT_KEYS.every((key) => isNumber(subIndices[key]))
  );
}

/** Type guard verifying an API response conforms to `AirQualityPayload`. */
export function isAirQualityPayload(value: unknown): value is AirQualityPayload {
  if (!isRecord(value)) return false;
  if (!isLocationOption(value.location) || !isString(value.fetchedAt) || !isString(value.source))
    return false;
  if (!isRecord(value.current) || !isNumber(value.current.pm25)) return false;
  return isCpcbSummary(value.cpcb) && Array.isArray(value.hourly) && isRecord(value.windowAnalysis);
}

/** Type guard verifying an API response conforms to `AssistantPlan`. */
export function isAssistantPlan(value: unknown): value is AssistantPlan {
  if (!isRecord(value)) return false;
  return (
    PROVIDERS.some((provider) => provider === value.provider) &&
    isString(value.modelLabel) &&
    isString(value.summary) &&
    Array.isArray(value.dailyRoutine) &&
    Array.isArray(value.indoorHacks) &&
    Array.isArray(value.sustainableSwaps) &&
    isString(value.safetyNote)
  );
}
