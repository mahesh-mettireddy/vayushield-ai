import { describe, expect, it } from 'vitest';
import { calculateCpcbAqi, calculatePollutantSubIndex } from '../engine/cpcbAqi';

describe('India CPCB NAQI Engine', () => {
  it('computes Good band accurately for clean air', () => {
    const result = calculateCpcbAqi({
      pm25: 15,
      pm10: 25,
      no2: 18,
      so2: 10,
      o3: 20,
      coUgM3: 400 // 0.4 mg/m³
    });
    expect(result.aqi).toBe(25);
    expect(result.category).toBe('Good');
    expect(result.dominantPollutant).toBe('pm25');
  });

  it('handles continuous decimal breakpoints without gaps (Goldfish Catch #2)', () => {
    expect(calculatePollutantSubIndex('pm25', 30)).toBe(50);
    expect(calculatePollutantSubIndex('pm25', 30.4)).toBeGreaterThanOrEqual(51);
    expect(calculatePollutantSubIndex('pm25', 30.4)).toBeLessThanOrEqual(52);
  });

  it('converts Open-Meteo CO from µg/m³ to mg/m³ before CPCB lookup (Goldfish Catch #1)', () => {
    const result = calculateCpcbAqi({
      pm25: 20,
      pm10: 30,
      no2: 15,
      so2: 8,
      o3: 25,
      coUgM3: 1500 // 1.5 mg/m³ -> Satisfactory (~76), NOT Severe 500
    });
    expect(result.subIndices.co).toBeGreaterThanOrEqual(70);
    expect(result.subIndices.co).toBeLessThanOrEqual(80);
    expect(result.category).toBe('Satisfactory');
  });

  it('clamps extreme winter smog readings to 500 Severe', () => {
    const result = calculateCpcbAqi({
      pm25: 680,
      pm10: 820,
      no2: 120,
      so2: 40,
      o3: 60,
      coUgM3: 2200
    });
    expect(result.aqi).toBe(500);
    expect(result.category).toBe('Severe');
  });
});
