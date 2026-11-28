import type {
  AqiCategory,
  CpcbAqiResult,
  PollutantKey,
  PollutantReadings
} from '../types/airQuality.js';

interface BreakpointBand {
  bpLo: number;
  bpHi: number;
  iLo: number;
  iHi: number;
}

/** Ordered list of all six India CPCB National AQI pollutants. */
export const POLLUTANT_KEYS: readonly PollutantKey[] = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co'];

/** Ordered list of the six India CPCB National AQI health categories. */
export const AQI_CATEGORIES: readonly AqiCategory[] = [
  'Good',
  'Satisfactory',
  'Moderate',
  'Poor',
  'Very Poor',
  'Severe'
];

/** Display labels and concentration units for each CPCB NAQI pollutant. */
export const POLLUTANT_LABELS: Record<PollutantKey, { name: string; unit: string }> = {
  pm25: { name: 'PM2.5', unit: 'µg/m³' },
  pm10: { name: 'PM10', unit: 'µg/m³' },
  no2: { name: 'NO₂', unit: 'µg/m³' },
  so2: { name: 'SO₂', unit: 'µg/m³' },
  o3: { name: 'O₃', unit: 'µg/m³' },
  co: { name: 'CO', unit: 'mg/m³' }
};

/** Converts an AQI category name into its lowercase CSS attribute slug. */
export function toAqiBandSlug(category: AqiCategory): string {
  return category.toLowerCase().replace(' ', '-');
}

/**
 * India CPCB National AQI (NAQI) continuous breakpoint table.
 * Upper bounds are contiguous to cover fractional concentrations.
 * CO breakpoints are in mg/m³. Raw µg/m³ inputs are divided by 1000 before lookup.
 */
const CPCB_BREAKPOINTS: Record<PollutantKey, BreakpointBand[]> = {
  pm25: [
    { bpLo: 0, bpHi: 30, iLo: 0, iHi: 50 },
    { bpLo: 30, bpHi: 60, iLo: 51, iHi: 100 },
    { bpLo: 60, bpHi: 90, iLo: 101, iHi: 200 },
    { bpLo: 90, bpHi: 120, iLo: 201, iHi: 300 },
    { bpLo: 120, bpHi: 250, iLo: 301, iHi: 400 },
    { bpLo: 250, bpHi: 500, iLo: 401, iHi: 500 }
  ],
  pm10: [
    { bpLo: 0, bpHi: 50, iLo: 0, iHi: 50 },
    { bpLo: 50, bpHi: 100, iLo: 51, iHi: 100 },
    { bpLo: 100, bpHi: 250, iLo: 101, iHi: 200 },
    { bpLo: 250, bpHi: 350, iLo: 201, iHi: 300 },
    { bpLo: 350, bpHi: 430, iLo: 301, iHi: 400 },
    { bpLo: 430, bpHi: 600, iLo: 401, iHi: 500 }
  ],
  no2: [
    { bpLo: 0, bpHi: 40, iLo: 0, iHi: 50 },
    { bpLo: 40, bpHi: 80, iLo: 51, iHi: 100 },
    { bpLo: 80, bpHi: 180, iLo: 101, iHi: 200 },
    { bpLo: 180, bpHi: 280, iLo: 201, iHi: 300 },
    { bpLo: 280, bpHi: 400, iLo: 301, iHi: 400 },
    { bpLo: 400, bpHi: 600, iLo: 401, iHi: 500 }
  ],
  so2: [
    { bpLo: 0, bpHi: 40, iLo: 0, iHi: 50 },
    { bpLo: 40, bpHi: 80, iLo: 51, iHi: 100 },
    { bpLo: 80, bpHi: 380, iLo: 101, iHi: 200 },
    { bpLo: 380, bpHi: 800, iLo: 201, iHi: 300 },
    { bpLo: 800, bpHi: 1600, iLo: 301, iHi: 400 },
    { bpLo: 1600, bpHi: 2400, iLo: 401, iHi: 500 }
  ],
  o3: [
    { bpLo: 0, bpHi: 50, iLo: 0, iHi: 50 },
    { bpLo: 50, bpHi: 100, iLo: 51, iHi: 100 },
    { bpLo: 100, bpHi: 168, iLo: 101, iHi: 200 },
    { bpLo: 168, bpHi: 208, iLo: 201, iHi: 300 },
    { bpLo: 208, bpHi: 748, iLo: 301, iHi: 400 },
    { bpLo: 748, bpHi: 1000, iLo: 401, iHi: 500 }
  ],
  co: [
    { bpLo: 0, bpHi: 1.0, iLo: 0, iHi: 50 },
    { bpLo: 1.0, bpHi: 2.0, iLo: 51, iHi: 100 },
    { bpLo: 2.0, bpHi: 10.0, iLo: 101, iHi: 200 },
    { bpLo: 10.0, bpHi: 17.0, iLo: 201, iHi: 300 },
    { bpLo: 17.0, bpHi: 34.0, iLo: 301, iHi: 400 },
    { bpLo: 34.0, bpHi: 50.0, iLo: 401, iHi: 500 }
  ]
};

const CATEGORY_META_BANDS: ReadonlyArray<{
  maxAqi: number;
  category: AqiCategory;
  advisory: string;
}> = [
  {
    maxAqi: 50,
    category: 'Good',
    advisory:
      'Minimal health impact. Great time for outdoor exercise and natural cross-ventilation.'
  },
  {
    maxAqi: 100,
    category: 'Satisfactory',
    advisory:
      'Minor breathing discomfort to sensitive people. Normal outdoor routines are generally safe.'
  },
  {
    maxAqi: 200,
    category: 'Moderate',
    advisory:
      'Breathing discomfort for people with asthma, children, and older adults. Shift errands to the cleanest 2-hour window.'
  },
  {
    maxAqi: 300,
    category: 'Poor',
    advisory:
      'Breathing discomfort on prolonged exposure. Limit strenuous outdoor exertion, run indoor filtration, and mask outdoors.'
  },
  {
    maxAqi: 400,
    category: 'Very Poor',
    advisory:
      'Respiratory illness risk on prolonged exposure. Keep windows sealed during peak smog, use N95 outdoors, and avoid solo car trips.'
  }
];

const MAX_CPCB_AQI = 500;
const CO_UG_TO_MG_DIVISOR = 1000;

const SEVERE_META: { category: AqiCategory; advisory: string } = {
  category: 'Severe',
  advisory:
    'Health impact even on healthy individuals. Stay indoors with filtration, avoid outdoor workouts, and postpone non-essential travel.'
};

/** Computes the continuous India CPCB NAQI sub-index (0–500) for a single pollutant reading. */
export function calculatePollutantSubIndex(pollutant: PollutantKey, concentration: number): number {
  if (!Number.isFinite(concentration) || concentration <= 0) {
    return 0;
  }

  for (const band of CPCB_BREAKPOINTS[pollutant]) {
    if (concentration <= band.bpHi) {
      const interpolated =
        ((band.iHi - band.iLo) / (band.bpHi - band.bpLo)) * (concentration - band.bpLo) + band.iLo;
      return Math.min(MAX_CPCB_AQI, Math.max(0, Math.round(interpolated)));
    }
  }

  return MAX_CPCB_AQI;
}

/** Maps a CPCB NAQI score (0–500) to its health category label and advisory message. */
export function getCpcbCategoryMeta(aqi: number): { category: AqiCategory; advisory: string } {
  const matched = CATEGORY_META_BANDS.find((band) => aqi <= band.maxAqi);
  return matched ? { category: matched.category, advisory: matched.advisory } : SEVERE_META;
}

/** Computes overall India CPCB NAQI, dominant pollutant, sub-indices, and health advisory. */
export function calculateCpcbAqi(readings: PollutantReadings): CpcbAqiResult {
  // Convert raw Open-Meteo CO (µg/m³) to CPCB NAQI unit (mg/m³)
  const coMgM3 = Math.max(0, readings.coUgM3) / CO_UG_TO_MG_DIVISOR;

  const subIndices: Record<PollutantKey, number> = {
    pm25: calculatePollutantSubIndex('pm25', readings.pm25),
    pm10: calculatePollutantSubIndex('pm10', readings.pm10),
    no2: calculatePollutantSubIndex('no2', readings.no2),
    so2: calculatePollutantSubIndex('so2', readings.so2),
    o3: calculatePollutantSubIndex('o3', readings.o3),
    co: calculatePollutantSubIndex('co', coMgM3)
  };

  let dominantPollutant: PollutantKey = 'pm25';
  let maxAqi = -1;

  for (const key of POLLUTANT_KEYS) {
    const score = subIndices[key];
    if (score > maxAqi) {
      maxAqi = score;
      dominantPollutant = key;
    }
  }

  const aqi = Math.min(MAX_CPCB_AQI, Math.max(0, maxAqi));
  const meta = getCpcbCategoryMeta(aqi);

  return {
    aqi,
    category: meta.category,
    dominantPollutant,
    subIndices,
    advisory: meta.advisory
  };
}
