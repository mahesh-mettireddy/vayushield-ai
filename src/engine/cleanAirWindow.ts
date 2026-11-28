import type { CleanAirWindowAnalysis, HourlyAirPoint } from '../types/airQuality.js';

interface WindowPair {
  startLabel: string;
  endLabel: string;
  avgPm25: number;
  avgAqi: number;
}

const UNAVAILABLE_WINDOW = {
  startLabel: 'Unavailable',
  endLabel: 'Unavailable',
  avgPm25: 0,
  avgAqi: 0,
  advice: 'Two consecutive hourly readings are needed to identify a window.'
};

function endOfHour(point: HourlyAirPoint): string {
  if (point.endHourLabel) return point.endHourLabel;
  const match = point.hourLabel.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (!match) return point.hourLabel;
  const hour = (Number(match[1]) % 12) + (match[2]?.toUpperCase() === 'PM' ? 12 : 0);
  const next = (hour + 1) % 24;
  return `${next % 12 || 12} ${next < 12 ? 'AM' : 'PM'}`;
}

function buildWindowPairs(hourly: HourlyAirPoint[]): WindowPair[] {
  return hourly.flatMap((start, index) => {
    const end = hourly[index + 1];
    if (!end || Date.parse(end.time) - Date.parse(start.time) !== 3_600_000) return [];
    return [
      {
        startLabel: start.hourLabel,
        endLabel: endOfHour(end),
        avgPm25: (start.pm25 + end.pm25) / 2,
        avgAqi: (start.aqi + end.aqi) / 2
      }
    ];
  });
}

function getBestWindowAdvice(bestAqi: number): string {
  if (bestAqi <= 100) return 'A good time for a walk, errands, or a short period of ventilation.';
  if (bestAqi <= 200)
    return 'Choose this time for brief errands and limit strenuous outdoor activity if sensitive.';
  return 'This is the lowest forecast NAQI, but pollution remains elevated. Keep trips brief and windows closed.';
}

/** Formats a 2-hour forecast window label range or returns `'Unavailable'`. */
export function formatWindowRange(window: { startLabel: string; endLabel: string }): string {
  return window.startLabel === 'Unavailable'
    ? 'Unavailable'
    : `${window.startLabel} – ${window.endLabel}`;
}

/** Returns short outdoor guidance for a peak forecast NAQI value. */
export function getPeakWindowAdvice(aqi: number): string {
  if (aqi <= 100) return 'Normal outdoor activity is generally fine.';
  if (aqi <= 200)
    return 'Sensitive groups should take extra care and limit prolonged outdoor exertion.';
  return 'Keep windows closed during the peak and wear a well-fitted N95 if heading outside.';
}

/**
 * Analyzes consecutive 2-hour windows in an upcoming hourly forecast, ranking by
 * overall NAQI first and breaking ties by PM2.5.
 */
export function analyzeCleanAirWindows(hourly: HourlyAirPoint[]): CleanAirWindowAnalysis {
  const windows = buildWindowPairs(hourly);
  const first = windows[0];
  if (!first) {
    return {
      bestWindow: UNAVAILABLE_WINDOW,
      worstWindow: UNAVAILABLE_WINDOW,
      exposureSavingsPct: 0
    };
  }

  const compare = (a: WindowPair, b: WindowPair) => a.avgAqi - b.avgAqi || a.avgPm25 - b.avgPm25;
  let best = first;
  let worst = first;
  for (const window of windows) {
    if (compare(window, best) < 0) best = window;
    if (compare(window, worst) > 0) worst = window;
  }

  const exposureSavingsPct =
    worst.avgPm25 > 0
      ? Math.max(0, Math.min(95, Math.round((1 - best.avgPm25 / worst.avgPm25) * 100)))
      : 0;
  const bestAqi = Math.round(best.avgAqi);
  const worstAqi = Math.round(worst.avgAqi);

  return {
    bestWindow: {
      ...best,
      avgPm25: Math.round(best.avgPm25 * 10) / 10,
      avgAqi: bestAqi,
      advice: getBestWindowAdvice(bestAqi)
    },
    worstWindow: {
      ...worst,
      avgPm25: Math.round(worst.avgPm25 * 10) / 10,
      avgAqi: worstAqi,
      advice: getPeakWindowAdvice(worstAqi)
    },
    exposureSavingsPct
  };
}
