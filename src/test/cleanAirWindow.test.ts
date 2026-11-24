import { describe, expect, it } from 'vitest';
import { analyzeCleanAirWindows } from '../engine/cleanAirWindow';
import { readOpenMeteoForecast } from '../engine/openMeteoForecast';
import type { HourlyAirPoint } from '../types/airQuality';

describe('24-Hour Clean-Air Window Finder', () => {
  it('takes only the next 24 hours and formats them in the selected city’s timezone', () => {
    const now = Date.parse('2026-11-24T18:30:00Z');
    const time = Array.from({ length: 27 }, (_, i) => now / 1000 + (i - 1) * 3600);
    const pm2_5 = time.map((_, i) => i + 10);
    const forecast = readOpenMeteoForecast({ timezone: 'Asia/Kolkata', hourly: { time, pm2_5 } }, now);
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

  it('identifies the lowest and highest 2-hour PM2.5 windows and exposure savings', () => {
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

  it('handles empty arrays gracefully without throwing', () => {
    const analysis = analyzeCleanAirWindows([]);
    expect(analysis.exposureSavingsPct).toBe(0);
    expect(analysis.bestWindow.avgPm25).toBe(0);
  });
});
