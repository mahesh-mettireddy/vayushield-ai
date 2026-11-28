import { Timer, Wind } from 'lucide-react';
import { useState } from 'react';
import {
  CPCB_GOOD_PM25_CAP,
  FILTRATION_LIST,
  ROOM_SIZE_LIST,
  simulateRoomCleanTime
} from '../engine/roomCleanPhysics';
import type { FiltrationSetupId, RoomSizeId } from '../types/airQuality';
import { RoomCleanChartSvg } from './RoomCleanChartSvg';

interface RoomCleanCurveProps {
  ambientPm25: number;
  hasTelemetry: boolean;
}

export function RoomCleanCurve({ ambientPm25, hasTelemetry }: RoomCleanCurveProps) {
  const [roomId, setRoomId] = useState<RoomSizeId>('master_bedroom');
  const [filtrationId, setFiltrationId] = useState<FiltrationSetupId>('corsi_rosenthal');

  const simulation = simulateRoomCleanTime(ambientPm25, roomId, filtrationId);
  const { room, filtration, startPm25, endPm25At120Min, ach, minutesToSafe, headline } = simulation;

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

      <RoomCleanChartSvg
        simulation={simulation}
        ambientPm25={ambientPm25}
        curveAnimationKey={`${roomId}-${filtrationId}`}
      />

      <p className="room-clean-note">
        Model note: Single-zone ACH exponential decay estimate C(t) = C_eq + (C₀ − C_eq)·e^(−ACH·t/60) with 0.4 h⁻¹ background infiltration and {filtration.cadrM3h} m³/h CADR.
      </p>
    </section>
  );
}
