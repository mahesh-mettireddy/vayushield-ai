import type { CleanAirWindowAnalysis, HourlyAirPoint } from '../types/airQuality';

function formatHourRangeEnd(hourLabel: string): string {
  const match = hourLabel.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (!match) return `${hourLabel} + 1h`;
  const rawHour = Number(match[1]);
  const period = (match[2] ?? 'AM').toUpperCase();
  const hour24 = (rawHour % 12) + (period === 'PM' ? 12 : 0);
  const next24 = (hour24 + 1) % 24;
  const nextPeriod = next24 >= 12 ? 'PM' : 'AM';
  const next12 = next24 % 12 === 0 ? 12 : next24 % 12;
  return `${next12} ${nextPeriod}`;
}

export function analyzeCleanAirWindows(hourly: HourlyAirPoint[]): CleanAirWindowAnalysis {
  if (hourly.length === 0) {
    return {
      bestWindow: {
        startLabel: '2 PM',
        endLabel: '4 PM',
        avgPm25: 0,
        avgAqi: 0,
        advice: 'Forecast unavailable; check local sensor readings before ventilating.'
      },
      worstWindow: {
        startLabel: '7 AM',
        endLabel: '9 AM',
        avgPm25: 0,
        avgAqi: 0
      },
      exposureSavingsPct: 0
    };
  }

  if (hourly.length === 1) {
    const only = hourly[0]!;
    return {
      bestWindow: {
        startLabel: only.hourLabel,
        endLabel: formatHourRangeEnd(only.hourLabel),
        avgPm25: Math.round(only.pm25 * 10) / 10,
        avgAqi: only.aqi,
        advice: 'Single-hour telemetry active; monitor hourly updates.'
      },
      worstWindow: {
        startLabel: only.hourLabel,
        endLabel: formatHourRangeEnd(only.hourLabel),
        avgPm25: Math.round(only.pm25 * 10) / 10,
        avgAqi: only.aqi
      },
      exposureSavingsPct: 0
    };
  }

  let bestIndex = 0;
  let worstIndex = 0;
  let bestAvgPm25 = Number.POSITIVE_INFINITY;
  let worstAvgPm25 = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < hourly.length - 1; i++) {
    const current = hourly[i]!;
    const next = hourly[i + 1]!;
    const pairAvgPm25 = (current.pm25 + next.pm25) / 2;

    if (pairAvgPm25 < bestAvgPm25) {
      bestAvgPm25 = pairAvgPm25;
      bestIndex = i;
    }
    if (pairAvgPm25 > worstAvgPm25) {
      worstAvgPm25 = pairAvgPm25;
      worstIndex = i;
    }
  }

  const bestStart = hourly[bestIndex]!;
  const bestEnd = hourly[bestIndex + 1]!;
  const worstStart = hourly[worstIndex]!;
  const worstEnd = hourly[worstIndex + 1]!;

  const bestAvgAqi = Math.round((bestStart.aqi + bestEnd.aqi) / 2);
  const worstAvgAqi = Math.round((worstStart.aqi + worstEnd.aqi) / 2);

  const exposureSavingsPct =
    worstAvgPm25 > 0
      ? Math.max(0, Math.min(95, Math.round(((worstAvgPm25 - bestAvgPm25) / worstAvgPm25) * 100)))
      : 0;

  const advice =
    bestAvgAqi <= 100
      ? 'Safe window for 15–20 min cross-ventilation, school runs, and brisk outdoor walks.'
      : bestAvgAqi <= 200
        ? 'Best slot for brief errands and 10-minute cross-ventilation; avoid heavy cardio.'
        : 'Lowest smog trough of the next 24h — keep outdoor trips brief, wear an N95, and avoid opening windows without filtration.';

  return {
    bestWindow: {
      startLabel: bestStart.hourLabel,
      endLabel: formatHourRangeEnd(bestEnd.hourLabel),
      avgPm25: Math.round(bestAvgPm25 * 10) / 10,
      avgAqi: bestAvgAqi,
      advice
    },
    worstWindow: {
      startLabel: worstStart.hourLabel,
      endLabel: formatHourRangeEnd(worstEnd.hourLabel),
      avgPm25: Math.round(worstAvgPm25 * 10) / 10,
      avgAqi: worstAvgAqi
    },
    exposureSavingsPct
  };
}
