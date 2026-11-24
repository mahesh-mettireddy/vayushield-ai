import { Clock, TrendingDown, Wind } from 'lucide-react';
import type { CleanAirWindowAnalysis, HourlyAirPoint } from '../types/airQuality';

interface CleanAirWindowCardProps {
  hourly: HourlyAirPoint[];
  analysis: CleanAirWindowAnalysis;
}

export function CleanAirWindowCard({ hourly, analysis }: CleanAirWindowCardProps) {
  const maxPm25 = Math.max(30, ...hourly.map((h) => h.pm25));

  return (
    <section
      aria-labelledby="clean-window-heading"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="clean-window-heading" className="text-lg font-bold text-slate-900">
            24-Hour Clean-Air Window Finder
          </h2>
          <p className="text-sm text-slate-600">
            Upcoming hourly PM2.5 forecast — time your walks, school runs, and window ventilation.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
          <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
          Up to {analysis.exposureSavingsPct}% lower PM2.5 vs peak hour
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-900">
            <Wind className="h-4 w-4" aria-hidden="true" />
            Cleanest 2-Hour Window
          </p>
          <p className="mt-1 text-xl font-bold text-emerald-950">
            {analysis.bestWindow.startLabel} – {analysis.bestWindow.endLabel}
          </p>
          <p className="mt-1 text-xs font-medium text-emerald-900">
            Avg PM2.5: {analysis.bestWindow.avgPm25} µg/m³ · Est. NAQI {analysis.bestWindow.avgAqi}
          </p>
          <p className="mt-2 text-xs text-emerald-950">{analysis.bestWindow.advice}</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-950">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Peak Smog Window to Avoid
          </p>
          <p className="mt-1 text-xl font-bold text-amber-950">
            {analysis.worstWindow.startLabel} – {analysis.worstWindow.endLabel}
          </p>
          <p className="mt-1 text-xs font-medium text-amber-900">
            Avg PM2.5: {analysis.worstWindow.avgPm25} µg/m³ · Est. NAQI {analysis.worstWindow.avgAqi}
          </p>
          <p className="mt-2 text-xs text-amber-950">
            Keep road-facing windows closed, avoid outdoor cardio, and wear a fitted N95 if commuting.
          </p>
        </div>
      </div>

      <div
        className="mt-5 overflow-x-auto rounded-xl pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
        role="region"
        aria-label="Hourly PM2.5 forecast"
        // Keyboard focus enables native scrolling where browsers do not focus overflow regions.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        <div
          className="flex h-36 min-w-[540px] items-end gap-1.5 rounded-xl bg-slate-50 p-3"
          role="img"
          aria-label={`24-hour PM2.5 forecast bar chart. Cleanest window is ${analysis.bestWindow.startLabel} to ${analysis.bestWindow.endLabel} at ${analysis.bestWindow.avgPm25} micrograms per cubic meter.`}
        >
          {hourly.map((point) => {
            const heightPct = Math.max(8, Math.round((point.pm25 / maxPm25) * 100));
            const barColor =
              point.aqi <= 100
                ? 'bg-emerald-600'
                : point.aqi <= 200
                  ? 'bg-amber-500'
                  : point.aqi <= 300
                    ? 'bg-orange-600'
                    : 'bg-red-600';

            return (
              <div key={point.time} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-24 w-full items-end justify-center">
                  <div
                    className={`w-full max-w-[18px] rounded-t-md ${barColor}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${point.hourLabel}: PM2.5 ${point.pm25} µg/m³ (NAQI ${point.aqi})`}
                  />
                </div>
                <span className="text-[10px] font-medium text-slate-600">
                  {point.hourLabel.replace(' ', '')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
