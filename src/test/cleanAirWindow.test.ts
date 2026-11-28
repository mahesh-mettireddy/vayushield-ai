import { describe, expect, it } from 'vitest';
import { analyzeCleanAirWindows, formatWindowRange } from '../engine/cleanAirWindow';
import { readOpenMeteoForecast } from '../engine/openMeteoForecast';
import type { HourlyAirPoint } from '../types/airQuality';

describe('24-Hour Clean-Air Window Finder', () => {
  it('takes only the next 24 hours and formats them in the selected city’s timezone', () => {
    const now = Date.parse('2026-11-24T18:30:00Z');
    const time = Array.from({ length: 27 }, (_, i) => now / 1000 + (i - 1) * 3600);
    const pm2_5 = time.map((_, i) => i + 10);
    const forecast = readOpenMeteoForecast(
      { timezone: 'Asia/Kolkata', hourly: { time, pm2_5 } },
      now
    );
    expect(forecast.hourly).toHaveLength(24);
    expect(forecast.hourly[0]).toMatchObject({
      time: '2026-11-24T19:30:00.000Z',
      hourLabel: '1 AM',
      pm25: 12
    });
    expect(forecast.hourly.at(-1)?.hourLabel).toBe('12 AM');
  });

  it('does not reuse past forecast hours when the series is exhausted', () => {
    const old = Date.parse('2026-11-24T18:30:00Z');
    const forecast = readOpenMeteoForecast(
      { timezone: 'Asia/Kolkata', hourly: { time: [old / 1000] } },
      old + 1000
    );
    expect(forecast.hourly).toEqual([]);
  });

  it('identifies the lowest and highest NAQI windows and skips gaps between hours', () => {
    const sample: HourlyAirPoint[] = [
      { time: '2026-11-24T07:00', hourLabel: '7 AM', pm25: 220, pm10: 320, aqi: 377 },
      { time: '2026-11-24T08:00', hourLabel: '8 AM', pm25: 200, pm10: 300, aqi: 362 },
      { time: '2026-11-24T13:00', hourLabel: '1 PM', pm25: 75, pm10: 140, aqi: 151 },
      { time: '2026-11-24T14:00', hourLabel: '2 PM', pm25: 65, pm10: 120, aqi: 118 }
    ];

    const analysis = analyzeCleanAirWindows(sample);
    expect(analysis.bestWindow.startLabel).toBe('1 PM');
    expect(analysis.bestWindow.avgPm25).toBe(70);
    expect(analysis.worstWindow.startLabel).toBe('7 AM');
    expect(analysis.worstWindow.avgPm25).toBe(210);
    expect(analysis.exposureSavingsPct).toBe(67);
  });

  it('uses overall NAQI before PM2.5 on ozone-dominated days', () => {
    const hours: HourlyAirPoint[] = [
      { time: '2026-11-24T07:00Z', hourLabel: '7 AM', pm25: 10, pm10: 20, aqi: 225 },
      { time: '2026-11-24T08:00Z', hourLabel: '8 AM', pm25: 12, pm10: 24, aqi: 235 },
      { time: '2026-11-24T09:00Z', hourLabel: '9 AM', pm25: 27, pm10: 39, aqi: 80 },
      { time: '2026-11-24T10:00Z', hourLabel: '10 AM', pm25: 28, pm10: 42, aqi: 90 }
    ];
    const analysis = analyzeCleanAirWindows(hours);
    expect(analysis.bestWindow).toMatchObject({ startLabel: '9 AM', avgAqi: 85, avgPm25: 27.5 });
    expect(analysis.worstWindow).toMatchObject({ startLabel: '7 AM', avgAqi: 230, avgPm25: 11 });
    expect(analysis.exposureSavingsPct).toBe(0);
  });

  it('breaks equal NAQI ties by PM2.5 and gives routine advice for a low peak', () => {
    const hours: HourlyAirPoint[] = [40, 30, 20].map((pm25, i) => ({
      time: new Date(Date.UTC(2026, 10, 24, 7 + i)).toISOString(),
      hourLabel: 7 + i + ' AM',
      pm25,
      pm10: 2 * pm25,
      aqi: 95
    }));
    const analysis = analyzeCleanAirWindows(hours);
    expect(analysis.bestWindow.startLabel).toBe('8 AM');
    expect(analysis.worstWindow.startLabel).toBe('7 AM');
    expect(analysis.worstWindow.advice).toMatch(/normal outdoor activity/i);
    expect(
      analyzeCleanAirWindows(hours.map((hour) => ({ ...hour, aqi: 150 }))).worstWindow.advice
    ).toMatch(/sensitive groups/i);
  });

  it('handles empty arrays gracefully without throwing', () => {
    const analysis = analyzeCleanAirWindows([]);
    expect(analysis.exposureSavingsPct).toBe(0);
    expect(analysis.bestWindow.avgPm25).toBe(0);
    expect(formatWindowRange(analysis.bestWindow)).toBe('Unavailable');
  });

  it('derives end labels when omitted, handles zero PM2.5, and advises appropriately for high smog troughs', () => {
    const wrapHours: HourlyAirPoint[] = [
      { time: '2026-11-24T11:00Z', hourLabel: '11 AM', pm25: 0, pm10: 0, aqi: 0 },
      { time: '2026-11-24T12:00Z', hourLabel: '12 PM', pm25: 0, pm10: 0, aqi: 0 },
      { time: '2026-11-24T23:00Z', hourLabel: '11 PM', pm25: 0, pm10: 0, aqi: 0 },
      { time: '2026-11-25T00:00Z', hourLabel: '12 AM', pm25: 0, pm10: 0, aqi: 0 }
    ];
    const zeroAnalysis = analyzeCleanAirWindows(wrapHours);
    expect(zeroAnalysis.exposureSavingsPct).toBe(0);
    expect(formatWindowRange(zeroAnalysis.bestWindow)).toBe('11 AM – 1 PM');

    const oddLabelHours: HourlyAirPoint[] = [
      { time: '2026-11-24T14:00Z', hourLabel: '14:00', pm25: 140, pm10: 210, aqi: 315 },
      { time: '2026-11-24T15:00Z', hourLabel: '15:00', pm25: 150, pm10: 220, aqi: 325 }
    ];
    const highAnalysis = analyzeCleanAirWindows(oddLabelHours);
    expect(highAnalysis.bestWindow.endLabel).toBe('15:00');
    expect(highAnalysis.bestWindow.advice).toMatch(/lowest forecast NAQI/i);
  });
});
