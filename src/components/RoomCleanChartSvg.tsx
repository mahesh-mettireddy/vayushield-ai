import { useId } from 'react';
import type { RoomCleanSimulation } from '../types/airQuality';
import {
  BADGE_HALF_WIDTH,
  CHART_PAD,
  CHART_PLOT_HEIGHT,
  CHART_PLOT_WIDTH,
  CHART_VIEW_HEIGHT,
  CHART_VIEW_WIDTH,
  CHART_X_TICKS,
  GOOD_PILL_WIDTH,
  buildRoomCurveGeometry,
  type RoomCurveGeometry
} from './roomCleanChartGeometry';

interface RoomCleanChartSvgProps {
  simulation: RoomCleanSimulation;
  ambientPm25: number;
  curveAnimationKey: string;
}

function ChartGridLayers({
  geometry,
  targetPm25
}: {
  geometry: RoomCurveGeometry;
  targetPm25: number;
}) {
  const { xFor, yFor, yTicks, yTarget } = geometry;
  return (
    <>
      {yTicks.map((tick) => {
        const y = yFor(tick);
        const isTarget = tick === targetPm25;
        return (
          <g key={tick}>
            {!isTarget && (
              <line
                x1={CHART_PAD.left}
                x2={CHART_PAD.left + CHART_PLOT_WIDTH}
                y1={y}
                y2={y}
                className="room-grid-line"
              />
            )}
            <text
              x={CHART_PAD.left - 8}
              y={y + 4}
              textAnchor="end"
              className={isTarget ? 'room-axis-label room-axis-good' : 'room-axis-label'}
            >
              {tick}
            </text>
          </g>
        );
      })}
      {CHART_X_TICKS.map((minute) => {
        const x = xFor(minute);
        return (
          <g key={minute}>
            <line
              x1={x}
              x2={x}
              y1={CHART_PAD.top}
              y2={CHART_PAD.top + CHART_PLOT_HEIGHT}
              className="room-grid-line room-grid-vertical"
            />
            <text x={x} y={CHART_VIEW_HEIGHT - 12} textAnchor="middle" className="room-axis-label">
              {minute}m
            </text>
          </g>
        );
      })}
      <line
        x1={CHART_PAD.left}
        x2={CHART_PAD.left + CHART_PLOT_WIDTH}
        y1={yTarget}
        y2={yTarget}
        className="room-good-threshold"
      />
    </>
  );
}

function SafeMilestoneCallout({
  geometry,
  minutesToSafe
}: {
  geometry: RoomCurveGeometry;
  minutesToSafe: number | null;
}) {
  const { safeDotX, safeDotY, badgeCenterX, badgeY } = geometry;
  if (safeDotX === null || safeDotY === null) return null;
  return (
    <g className="room-safe-callout">
      {minutesToSafe !== null && minutesToSafe > 0 && (
        <line
          x1={safeDotX}
          x2={safeDotX}
          y1={safeDotY}
          y2={CHART_PAD.top + CHART_PLOT_HEIGHT}
          className="room-safe-guide"
        />
      )}
      <circle cx={safeDotX} cy={safeDotY} r={9} className="room-safe-halo" />
      <circle cx={safeDotX} cy={safeDotY} r={5} className="room-safe-dot" />
      <rect
        x={badgeCenterX - BADGE_HALF_WIDTH}
        y={badgeY}
        width={BADGE_HALF_WIDTH * 2}
        height={22}
        rx={11}
        className="room-safe-badge"
      />
      <text x={badgeCenterX} y={badgeY + 14.5} textAnchor="middle" className="room-safe-badge-text">
        {minutesToSafe === 0 ? 'Safe now' : `Safe at ${minutesToSafe}m`}
      </text>
    </g>
  );
}

/** Accessible 0–120m SVG particulate decay chart for the Bedroom Time-to-Clean Simulator. */
export function RoomCleanChartSvg({
  simulation,
  ambientPm25,
  curveAnimationKey
}: RoomCleanChartSvgProps) {
  const gradientId = useId();
  const { points, targetPm25, minutesToSafe } = simulation;
  const geometry = buildRoomCurveGeometry(simulation, ambientPm25);
  const { xFor, yFor, linePath, areaPath, yTarget, goodPillX, chartTitle, chartDescription } =
    geometry;

  return (
    <div className="room-curve-chart">
      <div className="room-chart-header" aria-hidden="true">
        <span>Indoor PM2.5 (µg/m³)</span>
        <span>0–120 min timeline</span>
      </div>
      <svg
        role="img"
        aria-labelledby="room-clean-curve-title room-clean-curve-desc"
        viewBox={`0 0 ${CHART_VIEW_WIDTH} ${CHART_VIEW_HEIGHT}`}
        focusable="false"
      >
        <title id="room-clean-curve-title">{chartTitle}</title>
        <desc id="room-clean-curve-desc">{chartDescription}</desc>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#116456" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#116456" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <ChartGridLayers geometry={geometry} targetPm25={targetPm25} />
        <g key={curveAnimationKey} className="room-curve-group">
          <path d={areaPath} fill={`url(#${gradientId})`} className="room-curve-area" />
          <path d={linePath} fill="none" className="room-curve-line" />
        </g>
        {points.map((point) => (
          <circle
            key={point.minute}
            cx={xFor(point.minute)}
            cy={yFor(point.pm25)}
            r={point.minute === 0 || point.minute === 120 ? 3.5 : 2}
            className="room-sample-dot"
          />
        ))}
        <g className="room-good-callout">
          <rect
            x={goodPillX}
            y={yTarget + 2}
            width={GOOD_PILL_WIDTH}
            height={17}
            rx={8.5}
            className="room-good-pill"
          />
          <text
            x={goodPillX + GOOD_PILL_WIDTH / 2}
            y={yTarget + 14}
            textAnchor="middle"
            className="room-good-label"
          >
            CPCB Good · {targetPm25} µg/m³
          </text>
        </g>
        <SafeMilestoneCallout geometry={geometry} minutesToSafe={minutesToSafe} />
      </svg>
    </div>
  );
}
