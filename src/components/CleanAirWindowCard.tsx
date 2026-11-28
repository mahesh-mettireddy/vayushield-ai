import { useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock3 } from 'lucide-react';
import { getCpcbCategoryMeta, toAqiBandSlug } from '../engine/cpcbAqi';
import { formatWindowRange, getPeakWindowAdvice } from '../engine/cleanAirWindow';
import type { CleanAirWindowAnalysis, HourlyAirPoint } from '../types/airQuality';

const TICKS = [
  { score: 300, label: '300+' },
  { score: 200, label: '200' },
  { score: 100, label: '100' },
  { score: 0, label: '0' }
];

function resolveBarNavigationTarget(index: number, total: number, key: string): number | null {
  const end = total - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return end;
  if (key === 'ArrowLeft') return Math.max(0, index - 1);
  if (key === 'ArrowRight') return Math.min(end, index + 1);
  return null;
}

function ForecastWindowPills({ analysis }: { analysis: CleanAirWindowAnalysis }) {
  const { bestWindow: clean, worstWindow: peak } = analysis;
  if (clean.startLabel === 'Unavailable') {
    return <p className="field-feedback">{clean.advice}</p>;
  }
  return (
    <div className="window-pills">
      {[
        { name: 'Cleanest 2h window', color: 'clean', window: clean, Icon: ArrowDownRight },
        { name: 'Peak 2h window', color: 'peak', window: peak, Icon: ArrowUpRight }
      ].map(({ name, color, window, Icon }) => (
        <div key={name} className={'window-pill window-' + color}>
          <span className="window-icon">
            <Icon size={17} aria-hidden="true" />
          </span>
          <div>
            <h4>{name}</h4>
            <p className="window-readout">
              <strong>{formatWindowRange(window)}</strong>
              <span>NAQI {window.avgAqi}</span>
            </p>
            <p className="window-advice">{window.advice}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Interactive 24-hour NAQI bar chart and best/worst 2-hour planning windows. */
export function CleanAirWindowCard({
  hourly,
  analysis
}: {
  hourly: HourlyAirPoint[];
  analysis: CleanAirWindowAnalysis;
}) {
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.min(selected, hourly.length - 1);
  const active = hourly[hovered ?? selectedIndex] ?? hourly[selectedIndex];

  return (
    <section className="forecast" aria-labelledby="forecast-title">
      <div className="forecast-heading">
        <h3 id="forecast-title">24-hour NAQI forecast</h3>
        <span>Local time</span>
      </div>
      {active ? (
        <>
          <div
            className="hour-readout"
            role="status"
            aria-label="Selected forecast hour"
            aria-atomic="true"
          >
            <div className="hour-content" key={active.time}>
              <div className="hour-metrics">
                <span className="forecast-hour">
                  <Clock3 size={15} aria-hidden="true" />
                  <strong>{active.hourLabel}</strong>
                </span>
                <span>
                  NAQI <strong>{active.aqi}</strong>
                </span>
                <span>
                  PM2.5 <strong>{active.pm25}</strong> µg/m³
                </span>
                <span>
                  PM10 <strong>{active.pm10}</strong> µg/m³
                </span>
              </div>
              <p>{getPeakWindowAdvice(active.aqi)}</p>
            </div>
          </div>
          <p id="forecast-navigation" className="sr-only">
            Use the arrow keys to move between hours. Home and End jump to the first or last hour.
          </p>
          <div className="forecast-chart">
            {TICKS.map(({ score, label }) => (
              <div className={`chart-tick tick-${score}`} aria-hidden="true" key={score}>
                <span>{label}</span>
                <i />
              </div>
            ))}
            <div
              className="chart-bars"
              role="group"
              aria-label="Hourly NAQI chart"
              aria-describedby="forecast-navigation"
            >
              {hourly.map((point, i) => {
                const height = point.aqi / 5;
                return (
                  <button
                    type="button"
                    className="bar-column"
                    key={point.time}
                    ref={(button) => {
                      buttons.current[i] = button;
                    }}
                    aria-label={`${point.hourLabel}, NAQI ${point.aqi}`}
                    aria-pressed={selectedIndex === i}
                    data-active={active === point}
                    tabIndex={selectedIndex === i ? 0 : -1}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== 'touch') setHovered(i);
                    }}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={() => {
                      setHovered(null);
                      setSelected(i);
                    }}
                    onClick={() => {
                      setHovered(null);
                      setSelected(i);
                    }}
                    onKeyDown={(event) => {
                      const next = resolveBarNavigationTarget(i, hourly.length, event.key);
                      if (next === null) return;
                      event.preventDefault();
                      buttons.current[next]?.focus();
                    }}
                  >
                    <svg
                      className="naqi-bar-svg"
                      aria-hidden="true"
                      viewBox="0 0 10 100"
                      preserveAspectRatio="none"
                      focusable="false"
                    >
                      <rect
                        className="naqi-bar"
                        data-band={toAqiBandSlug(getCpcbCategoryMeta(point.aqi).category)}
                        x="0"
                        y={100 - height}
                        width="10"
                        height={height}
                        rx="1.5"
                      />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="forecast-times" aria-hidden="true">
            {[hourly[0], hourly[6], hourly[12], hourly[18], hourly.at(-1)]
              .filter(
                (point, index, entries): point is HourlyAirPoint =>
                  Boolean(point) && entries.indexOf(point) === index
              )
              .map((point) => (
                <span key={point.time}>{point.hourLabel}</span>
              ))}
          </div>
        </>
      ) : (
        <p className="field-feedback">Hourly forecast unavailable.</p>
      )}
      <ForecastWindowPills analysis={analysis} />
    </section>
  );
}
