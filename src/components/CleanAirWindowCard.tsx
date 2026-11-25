import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { CleanAirWindowAnalysis, HourlyAirPoint } from '../types/airQuality';

const TICKS = [{ score: 300, label: '300+' }, { score: 200, label: '200' }, { score: 100, label: '100' }, { score: 0, label: '0' }];

function barBand(aqi: number) {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'satisfactory';
  if (aqi <= 200) return 'moderate';
  if (aqi <= 300) return 'poor';
  if (aqi <= 400) return 'very-poor';
  return 'severe';
}

export function CleanAirWindowCard({ hourly, analysis }: { hourly: HourlyAirPoint[]; analysis: CleanAirWindowAnalysis }) {
  const clean = analysis.bestWindow;
  const peak = analysis.worstWindow;
  return (
    <section className="forecast" aria-labelledby="forecast-title">
      <div className="forecast-heading"><h3 id="forecast-title">24-hour NAQI forecast</h3><span>Local time</span></div>
      {hourly.length > 0 ? <>
        <div className="forecast-chart" aria-hidden="true">
          {TICKS.map(({ score, label }) => (
            <div className="chart-tick" key={score} style={{ bottom: score / 5 + '%' }}><span>{label}</span><i /></div>
          ))}
          <div className="chart-bars" style={{ gridTemplateColumns: 'repeat(' + hourly.length + ', minmax(0, 1fr))' }}>
            {hourly.map((point) => (
              <div className="bar-column" key={point.time} title={point.hourLabel + ' · NAQI ' + point.aqi}>
                <div className="naqi-bar" data-band={barBand(point.aqi)} style={{ height: point.aqi / 5 + '%' }} />
              </div>
            ))}
          </div>
        </div>
        <div className="forecast-times" aria-hidden="true">
          {[hourly[0], hourly[6], hourly[12], hourly[18], hourly.at(-1)]
            .filter((point, index, entries) => point && entries.indexOf(point) === index)
            .map((point) => <span key={point!.time}>{point!.hourLabel}</span>)}
        </div>
        <ol className="sr-only" aria-label="Hourly forecast values">
          {hourly.map((point) => <li key={point.time}>{point.hourLabel}, NAQI {point.aqi}</li>)}
        </ol>
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
