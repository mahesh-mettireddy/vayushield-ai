import type { HourlyAirPoint, PollutantReadings } from '../types/airQuality.js';
import { calculateCpcbAqi } from './cpcbAqi.js';

interface OpenMeteoPollutants<T> {
  pm2_5?: T;
  pm10?: T;
  nitrogen_dioxide?: T;
  sulphur_dioxide?: T;
  ozone?: T;
  carbon_monoxide?: T;
}

export interface OpenMeteoAirData {
  timezone: string;
  current?: OpenMeteoPollutants<number>;
  hourly?: OpenMeteoPollutants<Array<number | null>> & { time: number[] };
}

export function readOpenMeteoForecast(data: OpenMeteoAirData, now = Date.now()) {
  const current: PollutantReadings = {
    pm25: data.current?.pm2_5 ?? 0,
    pm10: data.current?.pm10 ?? 0,
    no2: data.current?.nitrogen_dioxide ?? 0,
    so2: data.current?.sulphur_dioxide ?? 0,
    o3: data.current?.ozone ?? 0,
    coUgM3: data.current?.carbon_monoxide ?? 0
  };

  const forecast = data.hourly;
  const hourly: HourlyAirPoint[] = [];
  const firstUpcoming = forecast?.time.findIndex((time) => time * 1000 > now) ?? -1;
  if (forecast && firstUpcoming >= 0) {
    const hourLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: data.timezone,
      hour: 'numeric',
      hour12: true
    });
    for (const [offset, time] of forecast.time.slice(firstUpcoming, firstUpcoming + 24).entries()) {
      const i = firstUpcoming + offset;
      const readings: PollutantReadings = {
        pm25: forecast.pm2_5?.[i] ?? current.pm25,
        pm10: forecast.pm10?.[i] ?? current.pm10,
        no2: forecast.nitrogen_dioxide?.[i] ?? current.no2,
        so2: forecast.sulphur_dioxide?.[i] ?? current.so2,
        o3: forecast.ozone?.[i] ?? current.o3,
        coUgM3: forecast.carbon_monoxide?.[i] ?? current.coUgM3
      };
      const timestamp = time * 1000;
      hourly.push({
        time: new Date(timestamp).toISOString(),
        hourLabel: hourLabel.format(timestamp),
        endHourLabel: hourLabel.format(timestamp + 3_600_000),
        pm25: Math.round(readings.pm25 * 10) / 10,
        pm10: Math.round(readings.pm10 * 10) / 10,
        aqi: calculateCpcbAqi(readings).aqi
      });
    }
  }

  return { current, hourly, cpcb: calculateCpcbAqi(current) };
}
