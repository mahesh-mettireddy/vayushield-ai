import { useRef, useState, type CSSProperties } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock3 } from 'lucide-react';
import { getCpcbCategoryMeta } from '../engine/cpcbAqi';
import { getPeakWindowAdvice } from '../engine/cleanAirWindow';
import type { CleanAirWindowAnalysis, HourlyAirPoint } from '../types/airQuality';

const TICKS = [{ score: 300, label: '300+' }, { score: 200, label: '200' }, { score: 100, label: '100' }, { score: 0, label: '0' }];

export function CleanAirWindowCard({ hourly, analysis }: { hourly: HourlyAirPoint[]; analysis: CleanAirWindowAnalysis }) {
  const clean = analysis.bestWindow;
  const peak = analysis.worstWindow;
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.min(selected, hourly.length - 1);
  const active = hourly[hovered ?? selectedIndex] ?? hourly[selectedIndex];

  return (
    <section className="forecast" aria-labelledby="forecast-title">
      <div className="forecast-heading"><h3 id="forecast-title">24-hour NAQI forecast</h3><span>Local time</span></div>
      {active ? <>
        <div className="hour-readout" role="status" aria-label="Selected forecast hour" aria-atomic="true">
          <div className="hour-content" key={active.time}>
            <div className="hour-metrics">
              <span className="forecast-hour"><Clock3 size={15} aria-hidden="true" /><strong>{active.hourLabel}</strong></span>
              <span>NAQI <strong>{active.aqi}</strong></span>
              <span>PM2.5 <strong>{active.pm25}</strong> µg/m³</span>
              <span>PM10 <strong>{active.pm10}</strong> µg/m³</span>
            </div>
            <p>{getPeakWindowAdvice(active.aqi)}</p>
          </div>
        </div>
        <p id="forecast-navigation" className="sr-only">Use the arrow keys to move between hours. Home and End jump to the first or last hour.</p>
        <div className="forecast-chart">
          {TICKS.map(({ score, label }) => (
            <div className="chart-tick" aria-hidden="true" key={score} style={{ bottom: score / 5 + '%' }}><span>{label}</span><i /></div>
          ))}
          <div className="chart-bars" role="group" aria-label="Hourly NAQI chart"
            aria-describedby="forecast-navigation" style={{ gridTemplateColumns: 'repeat(' + hourly.length + ', minmax(0, 1fr))' }}>
            {hourly.map((point, i) => (
              <button type="button" className="bar-column" key={point.time}
                ref={(button) => { buttons.current[i] = button; }}
                aria-label={`${point.hourLabel}, NAQI ${point.aqi}`}
                aria-pressed={selectedIndex === i} data-active={active === point}
                tabIndex={selectedIndex === i ? 0 : -1}
                onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHovered(i); }}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => { setHovered(null); setSelected(i); }}
                onClick={() => { setHovered(null); setSelected(i); }}
                onKeyDown={(event) => {
                  const end = hourly.length - 1;
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? end
                    : event.key === 'ArrowLeft' ? Math.max(0, i - 1)
                      : event.key === 'ArrowRight' ? Math.min(end, i + 1) : null;
                  if (next === null) return;
                  event.preventDefault();
                  buttons.current[next]?.focus();
                }}>
                <span className="naqi-bar" aria-hidden="true"
                  data-band={getCpcbCategoryMeta(point.aqi).category.toLowerCase().replace(' ', '-')}
                  style={{ '--bar-height': point.aqi / 5 + '%', '--bar-delay': i * 12 + 'ms' } as CSSProperties} />
              </button>
            ))}
          </div>
        </div>
        <div className="forecast-times" aria-hidden="true">
          {[hourly[0], hourly[6], hourly[12], hourly[18], hourly.at(-1)]
            .filter((point, index, entries) => point && entries.indexOf(point) === index)
            .map((point) => <span key={point!.time}>{point!.hourLabel}</span>)}
        </div>
      </> : <p className="field-feedback">Hourly forecast unavailable.</p>}

      {clean.startLabel === 'Unavailable' ? <p className="field-feedback">{clean.advice}</p> :
        <div className="window-pills">
          {([
            { name: 'Cleanest 2h window', color: 'clean', window: clean, Icon: ArrowDownRight },
            { name: 'Peak 2h window', color: 'peak', window: peak, Icon: ArrowUpRight }
          ]).map(({ name, color, window, Icon }) => (
            <div key={name} className={'window-pill window-' + color}>
              <span className="window-icon"><Icon size={17} aria-hidden="true" /></span>
              <div>
                <h4>{name}</h4>
                <p className="window-readout"><strong>{window.startLabel} – {window.endLabel}</strong><span>NAQI {window.avgAqi}</span></p>
                <p className="window-advice">{window.advice}</p>
              </div>
            </div>
          ))}
        </div>}
    </section>
  );
}
