import { Activity, AlertTriangle, CheckCircle2, Radio, ShieldAlert } from 'lucide-react';
import { POLLUTANT_LABELS } from '../engine/cpcbAqi';
import type { AirQualityPayload, PollutantKey } from '../types/airQuality';

interface AqiHeroProps {
  air: AirQualityPayload;
}

export function AqiHero({ air }: AqiHeroProps) {
  const { cpcb, current, location, groundStation } = air;
  const dominantLabel = POLLUTANT_LABELS[cpcb.dominantPollutant].name;

  const pollutantRows: Array<{ key: PollutantKey; displayValue: string }> = [
    { key: 'pm25', displayValue: current.pm25.toFixed(1) },
    { key: 'pm10', displayValue: current.pm10.toFixed(1) },
    { key: 'no2', displayValue: current.no2.toFixed(1) },
    { key: 'so2', displayValue: current.so2.toFixed(1) },
    { key: 'o3', displayValue: current.o3.toFixed(1) },
    { key: 'co', displayValue: (current.coUgM3 / 1000).toFixed(2) }
  ];

  const StatusIcon = cpcb.aqi <= 100 ? CheckCircle2 : cpcb.aqi <= 300 ? AlertTriangle : ShieldAlert;

  return (
    <section
      aria-labelledby="aqi-status-heading"
      aria-live="polite"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            Live India CPCB NAQI Telemetry
          </p>
          <h2 id="aqi-status-heading" className="mt-1 text-2xl font-bold text-slate-900">
            {location.name}
            {location.region ? <span className="font-normal text-slate-600">, {location.region}</span> : null}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-700">{cpcb.advisory}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-800">
              <Activity className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
              Dominant Pollutant: <strong>{dominantLabel}</strong>
            </span>
            {groundStation && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-900">
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                OpenAQ Station: {groundStation.stationName}
                {groundStation.distanceKm !== null ? ` (${groundStation.distanceKm} km)` : ''}
              </span>
            )}
          </div>
        </div>

        <div
          className={`flex min-w-[200px] flex-col items-center justify-center rounded-2xl border-2 px-6 py-4 text-center ${cpcb.badgeClass}`}
        >
          <span className="text-xs font-semibold uppercase tracking-wide">CPCB NAQI</span>
          <span className="mt-1 text-5xl font-extrabold tabular-nums">{cpcb.aqi}</span>
          <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold">
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            {cpcb.category}
          </span>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {pollutantRows.map(({ key, displayValue }) => {
          const meta = POLLUTANT_LABELS[key];
          const subAqi = cpcb.subIndices[key];
          const isDominant = key === cpcb.dominantPollutant;
          return (
            <div
              key={key}
              className={`rounded-xl border p-3 ${
                isDominant ? 'border-sky-400 bg-sky-50/70' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <dt className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>{meta.name}</span>
                <span className="text-[11px] font-medium text-slate-500">Sub-AQI {subAqi}</span>
              </dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {displayValue}{' '}
                <span className="text-xs font-normal text-slate-600">{meta.unit}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
