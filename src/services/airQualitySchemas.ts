import type { OpenMeteoAirData } from '../engine/openMeteoForecast';
import type {
  AirQualityPayload,
  AqiCategory,
  AssistantPlan,
  LlmProviderName,
  LocationOption,
  PollutantKey
} from '../types/airQuality';

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

function readOptionalNullableNumber(obj: Record<string, unknown>, key: string): number | null | undefined {
  const val = obj[key];
  if (val === undefined || val === null || isNumber(val)) return val;
  return undefined;
}

function readOptionalHourlyArray(obj: Record<string, unknown>, key: string): Array<number | null> | undefined {
  const val = obj[key];
  return isNullableNumberArray(val) ? val : undefined;
}

export function parseOpenMeteoAirData(input: unknown): OpenMeteoAirData {
  if (!isRecord(input) || !isString(input.timezone) || !input.timezone) {
    throw new Error('Invalid Open-Meteo response.');
  }

  const current = isRecord(input.current)
    ? {
        pm2_5: readOptionalNullableNumber(input.current, 'pm2_5'),
        pm10: readOptionalNullableNumber(input.current, 'pm10'),
        nitrogen_dioxide: readOptionalNullableNumber(input.current, 'nitrogen_dioxide'),
        sulphur_dioxide: readOptionalNullableNumber(input.current, 'sulphur_dioxide'),
        ozone: readOptionalNullableNumber(input.current, 'ozone'),
        carbon_monoxide: readOptionalNullableNumber(input.current, 'carbon_monoxide')
      }
    : undefined;

  const hourly = isRecord(input.hourly) && Array.isArray(input.hourly.time) && input.hourly.time.every(isNumber)
    ? {
        time: input.hourly.time,
        pm2_5: readOptionalHourlyArray(input.hourly, 'pm2_5'),
        pm10: readOptionalHourlyArray(input.hourly, 'pm10'),
        nitrogen_dioxide: readOptionalHourlyArray(input.hourly, 'nitrogen_dioxide'),
        sulphur_dioxide: readOptionalHourlyArray(input.hourly, 'sulphur_dioxide'),
        ozone: readOptionalHourlyArray(input.hourly, 'ozone'),
        carbon_monoxide: readOptionalHourlyArray(input.hourly, 'carbon_monoxide')
      }
    : undefined;

  return { timezone: input.timezone, current, hourly };
}

function isLocationOption(value: unknown): value is LocationOption {
  return isRecord(value)
    && isString(value.name)
    && isString(value.region)
    && isString(value.country)
    && isNumber(value.lat)
    && isNumber(value.lon);
}

export function parseApiSearchResults(input: unknown): LocationOption[] | null {
  if (!isRecord(input)) return null;
  if (input.results === undefined) return [];
  if (!Array.isArray(input.results) || !input.results.every(isLocationOption)) return null;
  return input.results;
}

export function parseOpenMeteoGeoResults(input: unknown): LocationOption[] {
  if (!isRecord(input) || !Array.isArray(input.results)) return [];
  const options: LocationOption[] = [];
  for (const item of input.results) {
    if (!isRecord(item) || !isString(item.name) || !isNumber(item.latitude) || !isNumber(item.longitude)) continue;
    options.push({
      name: item.name,
      region: isString(item.admin1) ? item.admin1 : '',
      country: isString(item.country) ? item.country : '',
      lat: item.latitude,
      lon: item.longitude
    });
  }
  return options;
}

const POLLUTANTS: readonly PollutantKey[] = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co'];
const CATEGORIES: readonly AqiCategory[] = ['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe'];
const PROVIDERS: readonly LlmProviderName[] = ['gemini', 'huggingface', 'groq', 'deterministic-fallback'];

export function isAirQualityPayload(value: unknown): value is AirQualityPayload {
  if (!isRecord(value)) return false;
  if (!isLocationOption(value.location) || !isString(value.fetchedAt) || !isString(value.source)) return false;
  if (!isRecord(value.current) || !isRecord(value.cpcb) || !Array.isArray(value.hourly) || !isRecord(value.windowAnalysis)) {
    return false;
  }
  return POLLUTANTS.every((key) => isRecord(value.cpcb) && isRecord(value.cpcb.subIndices) && isNumber(value.cpcb.subIndices[key]))
    && CATEGORIES.some((cat) => isRecord(value.cpcb) && value.cpcb.category === cat)
    && POLLUTANTS.some((key) => isRecord(value.cpcb) && value.cpcb.dominantPollutant === key)
    && isNumber(value.cpcb.aqi)
    && isNumber(value.current.pm25);
}

export function isAssistantPlan(value: unknown): value is AssistantPlan {
  if (!isRecord(value)) return false;
  return PROVIDERS.some((p) => p === value.provider)
    && isString(value.modelLabel)
    && isString(value.summary)
    && Array.isArray(value.dailyRoutine)
    && Array.isArray(value.indoorHacks)
    && Array.isArray(value.sustainableSwaps)
    && isString(value.safetyNote);
}
