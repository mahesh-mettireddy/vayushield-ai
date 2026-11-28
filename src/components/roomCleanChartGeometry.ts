import { sampleRoomCleanPoints } from '../engine/roomCleanPhysics';
import type { RoomCleanSimulation } from '../types/airQuality';

export const CHART_VIEW_WIDTH = 640;
export const CHART_VIEW_HEIGHT = 256;
export const CHART_PAD = { top: 32, right: 24, bottom: 38, left: 52 };
export const CHART_PLOT_WIDTH = CHART_VIEW_WIDTH - CHART_PAD.left - CHART_PAD.right;
export const CHART_PLOT_HEIGHT = CHART_VIEW_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
export const CHART_X_TICKS = [0, 30, 60, 90, 120] as const;
export const GOOD_PILL_WIDTH = 148;
export const BADGE_HALF_WIDTH = 54;

export interface RoomCurveGeometry {
  yMax: number;
  xFor: (minute: number) => number;
  yFor: (pm25: number) => number;
  linePath: string;
  areaPath: string;
  yTarget: number;
  yTicks: number[];
  safeDotX: number | null;
  safeDotY: number | null;
  badgeCenterX: number;
  badgeY: number;
  goodPillX: number;
  chartTitle: string;
  chartDescription: string;
}

export function buildRoomCurveGeometry(simulation: RoomCleanSimulation, rawAmbientPm25: number): RoomCurveGeometry {
  const { room, filtration, startPm25, endPm25At120Min, ach, targetPm25, minutesToSafe } = simulation;
  const yMax = Math.max(60, startPm25);
  const xFor = (minute: number) => CHART_PAD.left + (Math.min(120, Math.max(0, minute)) / 120) * CHART_PLOT_WIDTH;
  const yFor = (pm25: number) => CHART_PAD.top + (1 - Math.min(yMax, Math.max(0, pm25)) / yMax) * CHART_PLOT_HEIGHT;

  const finePoints = sampleRoomCleanPoints(rawAmbientPm25, room.id, filtration.id, 2.5);
  const linePath = finePoints
    .map(({ minute, pm25 }, index) => `${index === 0 ? 'M' : 'L'} ${xFor(minute).toFixed(1)} ${yFor(pm25).toFixed(1)}`)
    .join(' ');
  const baselineY = (CHART_PAD.top + CHART_PLOT_HEIGHT).toFixed(1);
  const areaPath = `${linePath} L ${xFor(120).toFixed(1)} ${baselineY} L ${xFor(0).toFixed(1)} ${baselineY} Z`;

  const yTarget = yFor(targetPm25);
  const yMid = Math.round(yMax / 2);
  const yTicks = [0, targetPm25, yMid, Math.round(yMax)]
    .filter((tick, index, list) =>
      list.indexOf(tick) === index && (tick === 0 || tick === Math.round(yMax) || Math.abs(tick - targetPm25) >= 12 || tick === targetPm25)
    )
    .sort((a, b) => a - b);

  const safeDotX = minutesToSafe !== null ? xFor(minutesToSafe) : null;
  const safeDotY = minutesToSafe !== null ? yFor(minutesToSafe === 0 ? startPm25 : targetPm25) : null;
  const badgeCenterX = safeDotX !== null
    ? Math.min(CHART_PAD.left + CHART_PLOT_WIDTH - BADGE_HALF_WIDTH, Math.max(CHART_PAD.left + BADGE_HALF_WIDTH, safeDotX))
    : 0;
  const badgeY = safeDotY !== null ? (safeDotY < CHART_PAD.top + 38 ? safeDotY + 14 : safeDotY - 32) : 0;
  const placeThresholdLeft = safeDotX !== null && safeDotX >= CHART_PAD.left + CHART_PLOT_WIDTH - 190;
  const goodPillX = placeThresholdLeft ? CHART_PAD.left + 8 : CHART_PAD.left + CHART_PLOT_WIDTH - GOOD_PILL_WIDTH - 6;

  const chartTitle = `Bedroom PM2.5 decay chart for ${room.label} with ${filtration.label}`;
  const chartDescription = minutesToSafe === 0
    ? `Starting indoor PM2.5 is ${startPm25} µg/m³, already within the ${targetPm25} µg/m³ CPCB Good limit.`
    : minutesToSafe !== null
      ? `Indoor PM2.5 drops from ${startPm25} to ${endPm25At120Min} µg/m³ over 120 minutes at ${ach} air changes per hour, reaching ${targetPm25} µg/m³ CPCB Good in ${minutesToSafe} minutes.`
      : `Indoor PM2.5 changes from ${startPm25} to ${endPm25At120Min} µg/m³ over 120 minutes at ${ach} air changes per hour, remaining above the ${targetPm25} µg/m³ CPCB Good line.`;

  return {
    yMax,
    xFor,
    yFor,
    linePath,
    areaPath,
    yTarget,
    yTicks,
    safeDotX,
    safeDotY,
    badgeCenterX,
    badgeY,
    goodPillX,
    chartTitle,
    chartDescription
  };
}
