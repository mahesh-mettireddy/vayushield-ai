import type { AirQualityPayload, ChoiceImpactResult } from '../types/airQuality';

type AlertAir = Pick<AirQualityPayload, 'location' | 'cpcb' | 'windowAnalysis'>;
type AlertImpact = Pick<ChoiceImpactResult,
  'baselineDailyExposureUgM3' | 'projectedDailyExposureUgM3' | 'exposureReductionPct' | 'dailyCo2SavedKg'>;

export function formatCommunityAlert(air: AlertAir, impact: AlertImpact): string {
  const { bestWindow, worstWindow } = air.windowAnalysis;
  const city = air.location.name.replace(/\s+/g, ' ').trim();
  const windowLabel = (window: typeof bestWindow) => window.startLabel === 'Unavailable'
    ? 'Unavailable'
    : `${window.startLabel} – ${window.endLabel} (NAQI ${window.avgAqi})`;
  const peakLabel = worstWindow.startLabel !== 'Unavailable' && worstWindow.avgAqi > 100
    ? 'Peak 2-hour window to avoid'
    : 'Peak 2-hour window';

  return [
    `VayuShield AI family alert — ${city}`,
    `CPCB NAQI: ${air.cpcb.aqi}/500 (${air.cpcb.category})`,
    `Cleanest 2-hour window: ${windowLabel(bestWindow)}`,
    `${peakLabel}: ${windowLabel(worstWindow)}`,
    `Estimated household impact: ${impact.exposureReductionPct}% lower daily PM2.5 exposure (${impact.baselineDailyExposureUgM3} → ${impact.projectedDailyExposureUgM3} µg/m³) and ${impact.dailyCo2SavedKg} kg CO₂ saved per modeled workday.`
  ].join('\n');
}
