import type { CleanAirWindowAnalysis, HourlyAirPoint } from '../types/airQuality.js';

function endOfHour(point: HourlyAirPoint): string {
  if (point.endHourLabel) return point.endHourLabel;
  const match = point.hourLabel.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (!match) return point.hourLabel;
  const hour = (Number(match[1]) % 12) + (match[2]?.toUpperCase() === 'PM' ? 12 : 0);
  const next = (hour + 1) % 24;
  return `${next % 12 || 12} ${next < 12 ? 'AM' : 'PM'}`;
}

export function getPeakWindowAdvice(aqi: number): string {
  if (aqi <= 100) return 'Normal outdoor activity is generally fine.';
  if (aqi <= 200) return 'Sensitive groups should take extra care and limit prolonged outdoor exertion.';
  return 'Keep windows closed during the peak and wear a well-fitted N95 if heading outside.';
}

export function analyzeCleanAirWindows(hourly: HourlyAirPoint[]): CleanAirWindowAnalysis {
  const windows = hourly.flatMap((start, index) => {
    const end = hourly[index + 1];
    if (!end || Date.parse(end.time) - Date.parse(start.time) !== 3_600_000) return [];
    return [{
      startLabel: start.hourLabel,
      endLabel: endOfHour(end),
      avgPm25: (start.pm25 + end.pm25) / 2,
      avgAqi: (start.aqi + end.aqi) / 2
    }];
  });

  const first = windows[0];
  if (!first) {
    const unavailable = {
      startLabel: 'Unavailable',
      endLabel: 'Unavailable',
      avgPm25: 0,
      avgAqi: 0,
      advice: 'Two consecutive hourly readings are needed to identify a window.'
    };
    return { bestWindow: unavailable, worstWindow: unavailable, exposureSavingsPct: 0 };
  }

  const compare = (a: typeof first, b: typeof first) => a.avgAqi - b.avgAqi || a.avgPm25 - b.avgPm25;
  let best = first;
  let worst = first;
  for (const window of windows) {
    if (compare(window, best) < 0) best = window;
    if (compare(window, worst) > 0) worst = window;
  }

  const exposureSavingsPct = worst.avgPm25 > 0
    ? Math.max(0, Math.min(95, Math.round((1 - best.avgPm25 / worst.avgPm25) * 100)))
    : 0;
  const bestAqi = Math.round(best.avgAqi);
  const worstAqi = Math.round(worst.avgAqi);
  const advice = bestAqi <= 100
    ? 'A good time for a walk, errands, or a short period of ventilation.'
    : bestAqi <= 200
      ? 'Choose this time for brief errands and limit strenuous outdoor activity if sensitive.'
      : 'This is the lowest forecast NAQI, but pollution remains elevated. Keep trips brief and windows closed.';

  return {
    bestWindow: { ...best, avgPm25: Math.round(best.avgPm25 * 10) / 10, avgAqi: bestAqi, advice },
    worstWindow: { ...worst, avgPm25: Math.round(worst.avgPm25 * 10) / 10, avgAqi: worstAqi, advice: getPeakWindowAdvice(worstAqi) },
    exposureSavingsPct
  };
}
