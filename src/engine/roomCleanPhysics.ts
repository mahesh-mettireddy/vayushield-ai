import type {
  FiltrationPreset,
  FiltrationSetupId,
  RoomCleanPoint,
  RoomCleanSimulation,
  RoomSizeId,
  RoomSizePreset
} from '../types/airQuality.js';

/** India CPCB Good 24h PM2.5 threshold (µg/m³). */
export const CPCB_GOOD_PM25_CAP = 30;
const HORIZON_MINUTES = 120;
const SAMPLE_STEP_MINUTES = 10;
const BACKGROUND_INFILTRATION_ACH = 0.4;
const MIN_TOTAL_ACH = 0.5;
const CUBIC_FEET_TO_M3 = 0.028316846592;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Room geometry presets assuming a standard 9 ft ceiling. */
export const ROOM_SIZE_PRESETS: Record<RoomSizeId, RoomSizePreset> = {
  small_bedroom: {
    id: 'small_bedroom',
    label: 'Small Bedroom (120 sq ft)',
    shortLabel: 'Small Bedroom',
    areaSqFt: 120,
    ceilingFt: 9,
    volumeCuFt: 1080,
    volumeM3: round1(1080 * CUBIC_FEET_TO_M3)
  },
  master_bedroom: {
    id: 'master_bedroom',
    label: 'Master Bedroom (200 sq ft)',
    shortLabel: 'Master Bedroom',
    areaSqFt: 200,
    ceilingFt: 9,
    volumeCuFt: 1800,
    volumeM3: round1(1800 * CUBIC_FEET_TO_M3)
  },
  living_room: {
    id: 'living_room',
    label: 'Living Room (320 sq ft)',
    shortLabel: 'Living Room',
    areaSqFt: 320,
    ceilingFt: 9,
    volumeCuFt: 2880,
    volumeM3: round1(2880 * CUBIC_FEET_TO_M3)
  }
};

/** Clean-air delivery rate (CADR) and infiltration presets for bedroom air cleaning. */
export const FILTRATION_PRESETS: Record<FiltrationSetupId, FiltrationPreset> = {
  sealed_only: {
    id: 'sealed_only',
    label: 'Windows Sealed Only',
    shortLabel: 'Windows Sealed Only',
    cadrM3h: 0,
    equilibriumFactor: 0.65,
    summary: 'Natural settling & infiltration (~0.5 ACH)'
  },
  corsi_rosenthal: {
    id: 'corsi_rosenthal',
    label: 'DIY Corsi-Rosenthal Box (MERV-13)',
    shortLabel: 'DIY Corsi-Rosenthal Box',
    cadrM3h: 340,
    equilibriumFactor: 0.18,
    summary: '340 m³/h CADR MERV-13 cube fan'
  },
  true_hepa: {
    id: 'true_hepa',
    label: 'True HEPA Purifier (Mid-Size)',
    shortLabel: 'True HEPA Purifier',
    cadrM3h: 260,
    equilibriumFactor: 0.14,
    summary: '260 m³/h CADR sealed HEPA filter'
  }
};

/** Ordered room size presets for UI selector pills. */
export const ROOM_SIZE_LIST: RoomSizePreset[] = [
  ROOM_SIZE_PRESETS.small_bedroom,
  ROOM_SIZE_PRESETS.master_bedroom,
  ROOM_SIZE_PRESETS.living_room
];

/** Ordered filtration setup presets for UI selector pills. */
export const FILTRATION_LIST: FiltrationPreset[] = [
  FILTRATION_PRESETS.sealed_only,
  FILTRATION_PRESETS.corsi_rosenthal,
  FILTRATION_PRESETS.true_hepa
];

/**
 * Evaluates indoor PM2.5 (µg/m³) at `minute` under a single-zone well-mixed
 * exponential ACH decay model: C(t) = C_eq + (C_0 - C_eq) * exp(-totalAch * (t / 60)).
 */
function evaluateIndoorPm25AtMinute(
  startPm25Raw: number,
  equilibriumPm25Raw: number,
  totalAch: number,
  minute: number
): number {
  const clampedMinute = Math.max(0, minute);
  return (
    equilibriumPm25Raw +
    (startPm25Raw - equilibriumPm25Raw) * Math.exp(-totalAch * (clampedMinute / 60))
  );
}

function resolvePhysicsParameters(
  ambientPm25: number,
  roomId: RoomSizeId,
  filtrationId: FiltrationSetupId
) {
  const room = ROOM_SIZE_PRESETS[roomId];
  const filtration = FILTRATION_PRESETS[filtrationId];
  const safeAmbient = Number.isFinite(ambientPm25) ? Math.max(0, ambientPm25) : 50;
  const c0 = Math.max(5, safeAmbient * 0.78);
  const cadrAch = filtration.cadrM3h / room.volumeM3;
  const totalAch = Math.max(MIN_TOTAL_ACH, cadrAch + BACKGROUND_INFILTRATION_ACH);
  const cEq = Math.max(4, safeAmbient * filtration.equilibriumFactor);
  return { room, filtration, safeAmbient, c0, totalAch, cEq };
}

/** Samples the indoor PM2.5 decay curve from 0 to 120 minutes at the requested step interval. */
export function sampleRoomCleanPoints(
  ambientPm25: number,
  roomId: RoomSizeId,
  filtrationId: FiltrationSetupId,
  stepMinutes = SAMPLE_STEP_MINUTES
): RoomCleanPoint[] {
  const { c0, totalAch, cEq } = resolvePhysicsParameters(ambientPm25, roomId, filtrationId);
  const safeStep = Math.max(1, stepMinutes);
  const points: RoomCleanPoint[] = [];
  for (let minute = 0; minute <= HORIZON_MINUTES + 1e-9; minute += safeStep) {
    const clampedMinute = Math.min(HORIZON_MINUTES, Math.round(minute * 100) / 100);
    points.push({
      minute: clampedMinute,
      pm25: round1(evaluateIndoorPm25AtMinute(c0, cEq, totalAch, clampedMinute))
    });
  }
  return points;
}

function buildHeadline(params: {
  room: RoomSizePreset;
  filtration: FiltrationPreset;
  startRaw: number;
  startPm25: number;
  endPm25At120Min: number;
  minutesToSafe: number | null;
}): string {
  const { room, filtration, startRaw, startPm25, endPm25At120Min, minutesToSafe } = params;
  if (minutesToSafe === 0) {
    return `Indoor air is already within the CPCB Good zone (≤ ${CPCB_GOOD_PM25_CAP} µg/m³).`;
  }

  const startDisplay = startPm25 <= CPCB_GOOD_PM25_CAP ? startRaw.toFixed(1) : String(startPm25);
  const spaceName = room.id === 'living_room' ? 'living room PM2.5' : 'bedroom PM2.5';

  if (minutesToSafe !== null) {
    const unit = minutesToSafe === 1 ? 'minute' : 'minutes';
    if (filtration.id === 'sealed_only') {
      return `Keep windows sealed for ${minutesToSafe} ${unit} to bring ${spaceName} from ${startDisplay} → ${CPCB_GOOD_PM25_CAP} µg/m³.`;
    }
    return `Start your ${filtration.shortLabel} ${minutesToSafe} ${unit} before bedtime to bring ${spaceName} from ${startDisplay} → ${CPCB_GOOD_PM25_CAP} µg/m³.`;
  }

  if (filtration.id === 'sealed_only') {
    return `Sealed windows alone cannot reach ${CPCB_GOOD_PM25_CAP} µg/m³ in 2 hours — add DIY or HEPA filtration.`;
  }

  return `${filtration.shortLabel} lowers ${spaceName} from ${startDisplay} → ${endPm25At120Min} µg/m³ in 2 hours; seal window gaps or add airflow to reach ${CPCB_GOOD_PM25_CAP} µg/m³.`;
}

/**
 * Pure deterministic indoor particulate decay simulator.
 * Models how quickly sealed rooms, DIY Corsi-Rosenthal boxes, or True HEPA purifiers
 * clear bedroom PM2.5 toward the India CPCB Good threshold (30 µg/m³).
 */
export function simulateRoomCleanTime(
  ambientPm25: number,
  roomId: RoomSizeId,
  filtrationId: FiltrationSetupId
): RoomCleanSimulation {
  const { room, filtration, safeAmbient, c0, totalAch, cEq } = resolvePhysicsParameters(
    ambientPm25,
    roomId,
    filtrationId
  );
  const points = sampleRoomCleanPoints(ambientPm25, roomId, filtrationId, SAMPLE_STEP_MINUTES);

  const startPm25 = round1(c0);
  const endPm25At120Min =
    points.at(-1)?.pm25 ?? round1(evaluateIndoorPm25AtMinute(c0, cEq, totalAch, HORIZON_MINUTES));
  const equilibriumPm25 = round1(cEq);

  let minutesToSafe: number | null;
  if (c0 <= CPCB_GOOD_PM25_CAP) {
    minutesToSafe = 0;
  } else if (cEq >= CPCB_GOOD_PM25_CAP) {
    minutesToSafe = null;
  } else {
    const exactMinutes = (60 / totalAch) * Math.log((c0 - cEq) / (CPCB_GOOD_PM25_CAP - cEq));
    const roundedUp = Math.ceil(exactMinutes);
    minutesToSafe = roundedUp <= HORIZON_MINUTES ? roundedUp : null;
  }

  const headline = buildHeadline({
    room,
    filtration,
    startRaw: c0,
    startPm25,
    endPm25At120Min,
    minutesToSafe
  });

  return {
    room,
    filtration,
    ambientPm25: round1(safeAmbient),
    points,
    startPm25,
    endPm25At120Min,
    equilibriumPm25,
    ach: round1(totalAch),
    targetPm25: CPCB_GOOD_PM25_CAP,
    minutesToSafe,
    headline
  };
}
