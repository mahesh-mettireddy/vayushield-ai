import { Timer, Wind } from 'lucide-react';
import { useId, useState } from 'react';
import {
  CPCB_GOOD_PM25_CAP,
  FILTRATION_LIST,
  ROOM_SIZE_LIST,
  sampleRoomCleanPoints,
  simulateRoomCleanTime
} from '../engine/roomCleanPhysics';
import type { FiltrationSetupId, RoomSizeId } from '../types/airQuality';

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 248;
const PAD = { top: 26, right: 24, bottom: 38, left: 52 };
const PLOT_WIDTH = VIEW_WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = VIEW_HEIGHT - PAD.top - PAD.bottom;
const X_TICKS = [0, 30, 60, 90, 120];

interface RoomCleanCurveProps {
  ambientPm25: number;
  hasTelemetry: boolean;
}

export function RoomCleanCurve({ ambientPm25, hasTelemetry }: RoomCleanCurveProps) {
  const [roomId, setRoomId] = useState<RoomSizeId>('master_bedroom');
  const [filtrationId, setFiltrationId] = useState<FiltrationSetupId>('corsi_rosenthal');
  const gradientId = useId();

  const simulation = simulateRoomCleanTime(ambientPm25, roomId, filtrationId);
  const { room, filtration, points, startPm25, endPm25At120Min, ach, targetPm25, minutesToSafe, headline } = simulation;

  const yMax = Math.max(60, startPm25);
  const xFor = (minute: number) => PAD.left + (Math.min(120, Math.max(0, minute)) / 120) * PLOT_WIDTH;
  const yFor = (pm25: number) => PAD.top + (1 - Math.min(yMax, Math.max(0, pm25)) / yMax) * PLOT_HEIGHT;

  const finePoints = sampleRoomCleanPoints(ambientPm25, roomId, filtrationId, 2.5);
  const linePath = finePoints
    .map(({ minute, pm25 }, index) => `${index === 0 ? 'M' : 'L'} ${xFor(minute).toFixed(1)} ${yFor(pm25).toFixed(1)}`)
    .join(' ');
  const baselineY = (PAD.top + PLOT_HEIGHT).toFixed(1);
  const areaPath = `${linePath} L ${xFor(120).toFixed(1)} ${baselineY} L ${xFor(0).toFixed(1)} ${baselineY} Z`;

  const yTarget = yFor(targetPm25);
  const yMid = Math.round(yMax / 2);
  const yTicks = [0, targetPm25, yMid, Math.round(yMax)].filter(
    (tick, index, list) => list.indexOf(tick) === index && (tick === 0 || tick === Math.round(yMax) || Math.abs(tick - targetPm25) >= 12 || tick === targetPm25)
  ).sort((a, b) => a - b);

  const safeDotX = minutesToSafe !== null ? xFor(minutesToSafe) : null;
  const safeDotY = minutesToSafe !== null ? yFor(minutesToSafe === 0 ? startPm25 : targetPm25) : null;
  const badgeHalfWidth = 54;
  const badgeCenterX = safeDotX !== null
    ? Math.min(PAD.left + PLOT_WIDTH - badgeHalfWidth, Math.max(PAD.left + badgeHalfWidth, safeDotX))
    : 0;
  const badgeY = safeDotY !== null ? (safeDotY < PAD.top + 38 ? safeDotY + 14 : safeDotY - 32) : 0;
  const placeThresholdLeft = safeDotX !== null && safeDotX >= PAD.left + PLOT_WIDTH - 190;

  const chartAriaLabel = minutesToSafe === 0
    ? `Bedroom PM2.5 decay chart for ${room.label} with ${filtration.label}: starting indoor PM2.5 is ${startPm25} µg/m³, already within the ${targetPm25} µg/m³ CPCB Good limit.`
    : minutesToSafe !== null
      ? `Bedroom PM2.5 decay chart for ${room.label} with ${filtration.label}: indoor PM2.5 drops from ${startPm25} to ${endPm25At120Min} µg/m³ over 120 minutes at ${ach} air changes per hour, reaching ${targetPm25} µg/m³ CPCB Good in ${minutesToSafe} minutes.`
      : `Bedroom PM2.5 decay chart for ${room.label} with ${filtration.label}: indoor PM2.5 changes from ${startPm25} to ${endPm25At120Min} µg/m³ over 120 minutes at ${ach} air changes per hour, remaining above the ${targetPm25} µg/m³ CPCB Good line.`;

  return (
    <section className="room-clean-card" aria-labelledby="room-clean-heading">
      <div className="room-clean-header">
        <div>
          <h3 id="room-clean-heading"><Timer size={18} aria-hidden="true" /> Bedroom Time-to-Clean Simulator</h3>
          <p>
            Calculate how long before bedtime to start air cleaning for your room size
            {!hasTelemetry ? ' (using sample 120 µg/m³ ambient PM2.5 until live data loads)' : ` (${simulation.ambientPm25} µg/m³ outdoor PM2.5)`}.
          </p>
        </div>
        <span className="room-ach-badge" title={`${room.volumeCuFt.toLocaleString('en-IN')} cu ft (${room.volumeM3} m³)`}>
          <Wind size={15} aria-hidden="true" /> {ach} ACH
        </span>
      </div>

      <div className="room-clean-controls">
        <div className="room-control-group">
          <span className="control-label" id="room-size-label">Room Size (9 ft ceiling)</span>
          <div className="pill-row" role="group" aria-labelledby="room-size-label">
            {ROOM_SIZE_LIST.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="pill"
                aria-pressed={roomId === preset.id}
                onClick={() => setRoomId(preset.id)}
              >
                {preset.shortLabel}
              </button>
            ))}
          </div>
          <p className="control-meta">
            {room.areaSqFt} sq ft · {room.volumeCuFt.toLocaleString('en-IN')} cu ft ({room.volumeM3} m³)
          </p>
        </div>

        <div className="room-control-group">
          <span className="control-label" id="filtration-setup-label">Filtration Setup</span>
          <div className="pill-row" role="group" aria-labelledby="filtration-setup-label">
            {FILTRATION_LIST.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="pill"
                aria-pressed={filtrationId === preset.id}
                onClick={() => setFiltrationId(preset.id)}
              >
                {preset.shortLabel}
              </button>
            ))}
          </div>
          <p className="control-meta">{filtration.summary}</p>
        </div>
      </div>

      <p className="room-clean-headline" aria-live="polite">{headline}</p>

      <dl className="room-clean-stats" aria-live="polite">
        <div>
          <dt>Start indoor PM2.5</dt>
          <dd>{startPm25} <small>µg/m³</small></dd>
        </div>
        <div>
          <dt>After 2 hours</dt>
          <dd>{endPm25At120Min} <small>µg/m³</small></dd>
        </div>
        <div>
          <dt>Time to CPCB Good ({CPCB_GOOD_PM25_CAP} µg/m³)</dt>
          <dd>{minutesToSafe === 0 ? 'Already safe' : minutesToSafe !== null ? `${minutesToSafe} min` : 'Over 2 hrs'}</dd>
        </div>
      </dl>

      <div className="room-curve-chart" role="img" aria-label={chartAriaLabel}>
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#116456" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#116456" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = yFor(tick);
            const isTarget = tick === targetPm25;
            return (
              <g key={tick}>
                {!isTarget && (
                  <line
                    x1={PAD.left}
                    x2={PAD.left + PLOT_WIDTH}
                    y1={y}
                    y2={y}
                    className="room-grid-line"
                  />
                )}
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" className={isTarget ? 'room-axis-label room-axis-good' : 'room-axis-label'}>
                  {tick}
                </text>
              </g>
            );
          })}

          {X_TICKS.map((minute) => {
            const x = xFor(minute);
            return (
              <g key={minute}>
                <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + PLOT_HEIGHT} className="room-grid-line room-grid-vertical" />
                <text x={x} y={VIEW_HEIGHT - 12} textAnchor="middle" className="room-axis-label">
                  {minute}m
                </text>
              </g>
            );
          })}

          <text x={14} y={PAD.top + 10} className="room-axis-unit">µg/m³</text>

          {/* Dashed emerald reference line at CPCB Good (30 µg/m³) */}
          <line
            x1={PAD.left}
            x2={PAD.left + PLOT_WIDTH}
            y1={yTarget}
            y2={yTarget}
            className="room-good-threshold"
          />
          <text
            x={placeThresholdLeft ? PAD.left + 6 : PAD.left + PLOT_WIDTH - 4}
            y={yTarget - 6}
            textAnchor={placeThresholdLeft ? 'start' : 'end'}
            className="room-good-label"
          >
            CPCB Good · {targetPm25} µg/m³
          </text>

          <g key={`${roomId}-${filtrationId}-${Math.round(ambientPm25)}`}>
            <path d={areaPath} fill={`url(#${gradientId})`} className="room-curve-area" />
            <path d={linePath} fill="none" pathLength={100} className="room-curve-line" />
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

          {safeDotX !== null && safeDotY !== null && (
            <g className="room-safe-callout">
              {minutesToSafe !== null && minutesToSafe > 0 && (
                <line
                  x1={safeDotX}
                  x2={safeDotX}
                  y1={safeDotY}
                  y2={PAD.top + PLOT_HEIGHT}
                  className="room-safe-guide"
                />
              )}
              <circle cx={safeDotX} cy={safeDotY} r={9} className="room-safe-halo" />
              <circle cx={safeDotX} cy={safeDotY} r={5} className="room-safe-dot" />
              <rect
                x={badgeCenterX - badgeHalfWidth}
                y={badgeY}
                width={badgeHalfWidth * 2}
                height={22}
                rx={11}
                className="room-safe-badge"
              />
              <text x={badgeCenterX} y={badgeY + 14.5} textAnchor="middle" className="room-safe-badge-text">
                {minutesToSafe === 0 ? 'Safe now' : `Safe at ${minutesToSafe}m`}
              </text>
            </g>
          )}
        </svg>
      </div>

      <p className="room-clean-note">
        Model note: Single-zone ACH exponential decay estimate C(t) = C_eq + (C₀ − C_eq)·e^(−ACH·t/60) with 0.4 h⁻¹ background infiltration and {filtration.cadrM3h} m³/h CADR.
      </p>
    </section>
  );
}
