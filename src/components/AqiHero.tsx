import { ChevronDown, FlaskConical, MapPin } from 'lucide-react';
import { POLLUTANT_LABELS } from '../engine/cpcbAqi';
import type { AirQualityPayload, PollutantKey } from '../types/airQuality';
import { CleanAirWindowCard } from './CleanAirWindowCard';

const POLLUTANTS: PollutantKey[] = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co'];

export function AqiHero({ air }: { air: AirQualityPayload }) {
  const { location, cpcb, current, groundStation } = air;
  const dominant = POLLUTANT_LABELS[cpcb.dominantPollutant];
  const band = cpcb.category.toLowerCase().replace(' ', '-');
  const verdict = cpcb.advisory.split(/(?<=\.)\s/)[0];

  return (
    <section className="air-hero" data-band={band} aria-labelledby="aqi-status-heading">
      <div className="hero-main">
        <div className="hero-reading" aria-live="polite">
          <p className="eyebrow"><MapPin size={14} aria-hidden="true" /> {location.name}{location.country ? ', ' + location.country : ''}</p>
          <div className="aqi-heading">
            <h2 id="aqi-status-heading">CPCB NAQI</h2>
            <span className="band-label"><span aria-hidden="true" />{cpcb.category}</span>
          </div>
          <p className="aqi-score"><strong>{cpcb.aqi}</strong><span> / 500</span></p>
          <p className="hero-verdict">{verdict}</p>
          <div className="aqi-scale" aria-hidden="true">
            <div className="scale-track"><span style={{ left: cpcb.aqi / 5 + '%' }} /></div>
            <div className="scale-labels"><span>0</span><span>500</span></div>
          </div>
          <p className="dominant-reading">Dominant pollutant <strong>{dominant.name}</strong></p>
        </div>
        <CleanAirWindowCard hourly={air.hourly} analysis={air.windowAnalysis} />
      </div>

      <details className="sensor-details">
        <summary><FlaskConical size={17} aria-hidden="true" /> 6 Pollutants &amp; Sensor Details
          <ChevronDown className="details-arrow" size={16} aria-hidden="true" /></summary>
        <div className="sensor-content">
          <dl className="pollutants">
            {POLLUTANTS.map((key) => (
              <div key={key}><dt>{POLLUTANT_LABELS[key].name}</dt>
                <dd>{key === 'co' ? (current.coUgM3 / 1000).toFixed(2) : current[key].toFixed(1)}{' '}
                  <small>{POLLUTANT_LABELS[key].unit}</small></dd>
              </div>
            ))}
          </dl>
          <p>{air.source}</p>
          {groundStation && <p>{groundStation.stationName} · {groundStation.provider}
            {groundStation.distanceKm !== null && ' · ' + groundStation.distanceKm + ' km away'}
          </p>}
        </div>
      </details>
    </section>
  );
}
