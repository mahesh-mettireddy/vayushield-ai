import { describe, expect, it } from 'vitest';
import { formatCostTier } from '../components/RoutinePlanner';
import { calculateCpcbAqi } from '../engine/cpcbAqi';
import { formatCommunityAlert } from '../engine/communityAlert';

const air = {
  location: { name: ' Pune\n ', region: 'Maharashtra', country: 'India', lat: 18.52, lon: 73.86 },
  cpcb: calculateCpcbAqi({ pm25: 120, pm10: 0, coUgM3: 0, no2: 0, so2: 0, o3: 0 }),
  windowAnalysis: {
    bestWindow: { startLabel: '6 AM', endLabel: '8 AM', avgAqi: 62, avgPm25: 20, advice: '' },
    worstWindow: { startLabel: '4 PM', endLabel: '6 PM', avgAqi: 280, avgPm25: 100, advice: '' },
    exposureSavingsPct: 80
  }
};
const impact = {
  exposureReductionPct: 40, baselineDailyExposureUgM3: 50, projectedDailyExposureUgM3: 30, dailyCo2SavedKg: 2.98
};

describe('Family alert', () => {
  it('formats the city, CPCB score, forecast windows, and daily impact as plain text', () => {
    expect(formatCommunityAlert(air, impact).split('\n')).toEqual([
      'VayuShield AI family alert — Pune',
      'CPCB NAQI: 300/500 (Poor)',
      'Cleanest 2-hour window: 6 AM – 8 AM (NAQI 62)',
      'Peak 2-hour window to avoid: 4 PM – 6 PM (NAQI 280)',
      'Estimated household impact: 40% lower daily PM2.5 exposure (50 → 30 µg/m³) and 2.98 kg CO₂ saved per modeled workday.'
    ]);
  });

  it('prints unavailable forecasts clearly and does not flag a low peak for avoidance', () => {
    const text = formatCommunityAlert({
      ...air,
      windowAnalysis: {
        ...air.windowAnalysis,
        bestWindow: { ...air.windowAnalysis.bestWindow, startLabel: 'Unavailable', endLabel: 'Unavailable' },
        worstWindow: { ...air.windowAnalysis.worstWindow, avgAqi: 75 }
      }
    }, impact);
    expect(text).toContain('Cleanest 2-hour window: Unavailable\n');
    expect(text).toContain('Peak 2-hour window: 4 PM – 6 PM (NAQI 75)');
  });
});

describe('Cost-tier label formatting', () => {
  it.each([
    ['budget_diy', 'Budget DIY'],
    ['zero_cost', 'Zero Cost'],
    ['standard', 'Standard'],
    [' Budget DIY ', 'Budget DIY'],
    ['apartment_bulk-buy', 'Apartment Bulk Buy']
  ])('formats %s as %s', (value, expected) => {
    expect(formatCostTier(value)).toBe(expected);
  });
});
