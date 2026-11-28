import { describe, expect, it } from 'vitest';
import {
  CPCB_GOOD_PM25_CAP,
  FILTRATION_PRESETS,
  ROOM_SIZE_PRESETS,
  simulateRoomCleanTime
} from '../engine/roomCleanPhysics';

describe('Bedroom Time-to-Clean ACH Physics Engine', () => {
  it('returns minutesToSafe = 0 when starting indoor air is already within CPCB Good (<= 30 µg/m³)', () => {
    const clean = simulateRoomCleanTime(25, 'master_bedroom', 'sealed_only');
    expect(clean.startPm25).toBe(19.5);
    expect(clean.minutesToSafe).toBe(0);
    expect(clean.targetPm25).toBe(CPCB_GOOD_PM25_CAP);
    expect(clean.headline).toContain('already within the CPCB Good zone');

    const borderline = simulateRoomCleanTime(38, 'small_bedroom', 'corsi_rosenthal');
    expect(borderline.startPm25).toBe(29.6);
    expect(borderline.minutesToSafe).toBe(0);

    const floorClamped = simulateRoomCleanTime(0, 'small_bedroom', 'sealed_only');
    expect(floorClamped.startPm25).toBe(5);
    expect(floorClamped.minutesToSafe).toBe(0);
  });

  it('produces 13 sampled points from t=0 to t=120 with monotonic PM2.5 decay', () => {
    const result = simulateRoomCleanTime(140, 'master_bedroom', 'true_hepa');
    expect(result.points).toHaveLength(13);
    expect(result.points[0]?.minute).toBe(0);
    expect(result.points.at(-1)?.minute).toBe(120);
    expect(result.points[0]?.pm25).toBe(result.startPm25);
    expect(result.points.at(-1)?.pm25).toBe(result.endPm25At120Min);

    for (let i = 1; i < result.points.length; i += 1) {
      expect(result.points[i]!.minute - result.points[i - 1]!.minute).toBe(10);
      expect(result.points[i]!.pm25).toBeLessThanOrEqual(result.points[i - 1]!.pm25);
    }
    expect(result.endPm25At120Min).toBeLessThan(result.startPm25);
  });

  it('shows DIY Corsi-Rosenthal and True HEPA outperform sealed windows alone on severe smog (180 µg/m³)', () => {
    const sealed = simulateRoomCleanTime(180, 'master_bedroom', 'sealed_only');
    const corsi = simulateRoomCleanTime(180, 'master_bedroom', 'corsi_rosenthal');
    const hepa = simulateRoomCleanTime(180, 'master_bedroom', 'true_hepa');

    expect(sealed.ach).toBe(0.5);
    expect(sealed.minutesToSafe).toBeNull();
    expect(sealed.headline).toContain('Sealed windows alone cannot reach 30 µg/m³');

    expect(corsi.endPm25At120Min).toBeLessThan(sealed.endPm25At120Min * 0.35);
    expect(hepa.endPm25At120Min).toBeLessThan(sealed.endPm25At120Min * 0.3);
    expect(hepa.minutesToSafe).not.toBeNull();
    expect(hepa.minutesToSafe!).toBeGreaterThan(0);
    expect(hepa.minutesToSafe!).toBeLessThanOrEqual(120);
  });

  it('takes longer in a larger living room than a small bedroom for the same purifier', () => {
    const small = simulateRoomCleanTime(130, 'small_bedroom', 'corsi_rosenthal');
    const master = simulateRoomCleanTime(130, 'master_bedroom', 'corsi_rosenthal');
    const living = simulateRoomCleanTime(130, 'living_room', 'corsi_rosenthal');

    expect(small.ach).toBeGreaterThan(master.ach);
    expect(master.ach).toBeGreaterThan(living.ach);
    expect(small.minutesToSafe).not.toBeNull();
    expect(master.minutesToSafe).not.toBeNull();
    expect(living.minutesToSafe).not.toBeNull();
    expect(living.minutesToSafe!).toBeGreaterThan(master.minutesToSafe!);
    expect(master.minutesToSafe!).toBeGreaterThan(small.minutesToSafe!);
    expect(master.headline).toContain('DIY Corsi-Rosenthal Box');
    expect(master.headline).toContain(`${master.minutesToSafe} minutes before bedtime`);
  });

  it('matches specified room volumes, CADR specs, and handles non-finite inputs safely', () => {
    expect(ROOM_SIZE_PRESETS.small_bedroom.volumeCuFt).toBe(1080);
    expect(ROOM_SIZE_PRESETS.small_bedroom.volumeM3).toBe(30.6);
    expect(ROOM_SIZE_PRESETS.master_bedroom.volumeCuFt).toBe(1800);
    expect(ROOM_SIZE_PRESETS.master_bedroom.volumeM3).toBe(51);
    expect(ROOM_SIZE_PRESETS.living_room.volumeCuFt).toBe(2880);
    expect(ROOM_SIZE_PRESETS.living_room.volumeM3).toBe(81.6);

    expect(FILTRATION_PRESETS.sealed_only.cadrM3h).toBe(0);
    expect(FILTRATION_PRESETS.corsi_rosenthal.cadrM3h).toBe(340);
    expect(FILTRATION_PRESETS.true_hepa.cadrM3h).toBe(260);

    const invalid = simulateRoomCleanTime(Number.NaN, 'master_bedroom', 'true_hepa');
    expect(invalid.ambientPm25).toBe(50);
    expect(Number.isFinite(invalid.startPm25)).toBe(true);
    expect(invalid.minutesToSafe).toBeGreaterThan(0);
  });
});
