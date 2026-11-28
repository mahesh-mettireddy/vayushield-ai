import { ChevronDown, Copy, FlaskConical, MapPin } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import { POLLUTANT_LABELS } from '../engine/cpcbAqi';
import { formatCommunityAlert } from '../engine/communityAlert';
import type { AirQualityPayload, ChoiceImpactResult, PollutantKey } from '../types/airQuality';
import { CleanAirWindowCard } from './CleanAirWindowCard';

const POLLUTANTS: PollutantKey[] = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co'];
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  left: (i * 37 + 9) % 100 + '%',
  top: (i * 23 + 12) % 100 + '%',
  animationDelay: -(i * 1.43 % 14) + 's',
  animationDuration: (10 + i % 7) + 's',
  '--particle-size': (2 + i % 3) + 'px'
}) as CSSProperties);

export function AqiHero({ air, impact }: { air: AirQualityPayload; impact: ChoiceImpactResult }) {
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; copied: boolean } | null>(null);
  const [sensorOpen, setSensorOpen] = useState(false);
  const sensorPanelId = useId();
  const { location, cpcb, current, groundStation } = air;
  const dominant = POLLUTANT_LABELS[cpcb.dominantPollutant];
  const band = cpcb.category.toLowerCase().replace(' ', '-');
  const verdict = cpcb.advisory.split(/(?<=\.)\s/)[0];
  const particleCount = Math.min(PARTICLES.length, 5 + Math.floor(Math.max(0, current.pm25) / 11));
  const alertText = formatCommunityAlert(air, impact);
  const feedback = copyFeedback?.text === alertText ? copyFeedback : null;

  async function copyAlert() {
    setCopyFeedback(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(alertText);
        setCopyFeedback({ text: alertText, copied: true });
        return;
      }
    } catch {
      // Keep the alert available for manual copying when clipboard access is blocked.
    }
    setCopyFeedback({ text: alertText, copied: false });
  }

  return (
    <section className="air-hero" data-band={band} aria-labelledby="aqi-status-heading">
      <div className="atmosphere" aria-hidden="true">
        <div className="ambient-glow" />
        {PARTICLES.slice(0, particleCount).map((style, i) => <i className="air-particle" style={style} key={i} />)}
      </div>
      <div className="hero-main">
        <div className="hero-reading" aria-live="polite">
          <p className="eyebrow"><MapPin size={14} aria-hidden="true" /> {location.name}{location.country ? ', ' + location.country : ''}</p>
          <div className="aqi-heading">
            <h2 id="aqi-status-heading">CPCB NAQI</h2>
            <span className="band-label"><span aria-hidden="true" />{cpcb.category}</span>
          </div>
          <div className="aqi-gauge" role="img" aria-label={`CPCB NAQI gauge, ${cpcb.aqi} out of 500, ${cpcb.category}`}>
            <svg viewBox="0 0 224 224" aria-hidden="true" focusable="false">
              <circle className="gauge-guide" cx="112" cy="112" r="105" />
              <circle className="gauge-track" cx="112" cy="112" r="92" />
              <g transform="rotate(-90 112 112)" style={{ '--gauge-offset': 100 - cpcb.aqi / 5 } as CSSProperties}>
                <circle className="gauge-arc gauge-halo" cx="112" cy="112" r="92" pathLength="100" />
                <circle className="gauge-arc gauge-stroke" cx="112" cy="112" r="92" pathLength="100" />
              </g>
            </svg>
            <div className="aqi-score" aria-hidden="true"><strong>{cpcb.aqi}</strong><span>out of 500</span></div>
          </div>
          <p className="hero-verdict">{verdict}</p>
          <p className="dominant-reading">Dominant pollutant <strong>{dominant.name}</strong></p>
          <div className="family-alert">
            <button type="button" className="button-secondary" onClick={() => void copyAlert()}>
              <Copy size={16} aria-hidden="true" /> Copy Family Alert
            </button>
            <p aria-live="polite">{feedback ? feedback.copied ? 'Copied!' : 'Select and copy the alert text below.' : ''}</p>
            {feedback && !feedback.copied && (
              <textarea aria-label="Family alert text" value={alertText} readOnly rows={5}
                onFocus={(event) => event.currentTarget.select()} />
            )}
          </div>
        </div>
        <CleanAirWindowCard key={`${location.lat},${location.lon}`}
          hourly={air.hourly} analysis={air.windowAnalysis} />
      </div>

      <div className="sensor-details">
        <button
          type="button"
          className="disclosure-trigger"
          aria-expanded={sensorOpen}
          aria-controls={sensorPanelId}
          onClick={() => setSensorOpen((open) => !open)}
        >
          <FlaskConical size={17} aria-hidden="true" /> 6 Pollutants &amp; Sensor Details
          <ChevronDown className="details-arrow" size={16} aria-hidden="true" />
        </button>
        <div id={sensorPanelId} className="sensor-content" hidden={!sensorOpen}>
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
      </div>
    </section>
  );
}
