import { ChevronDown, Copy, FlaskConical, MapPin } from 'lucide-react';
import { useId, useState } from 'react';
import { POLLUTANT_KEYS, POLLUTANT_LABELS, toAqiBandSlug } from '../engine/cpcbAqi';
import { formatCommunityAlert } from '../engine/communityAlert';
import type { AirQualityPayload, ChoiceImpactResult } from '../types/airQuality';
import { CleanAirWindowCard } from './CleanAirWindowCard';

const MAX_PARTICLES = 20;

function AqiGaugeDial({ aqi, category }: { aqi: number; category: string }) {
  const gaugeTitleId = useId();
  const gaugeOffset = 100 - aqi / 5;
  return (
    <div className="aqi-gauge">
      <svg role="img" aria-labelledby={gaugeTitleId} viewBox="0 0 224 224" focusable="false">
        <title id={gaugeTitleId}>
          CPCB NAQI gauge, {aqi} out of 500, {category}
        </title>
        <circle className="gauge-guide" cx="112" cy="112" r="105" />
        <circle className="gauge-track" cx="112" cy="112" r="92" />
        <g transform="rotate(-90 112 112)">
          <circle
            className="gauge-arc gauge-halo"
            cx="112"
            cy="112"
            r="92"
            pathLength="100"
            strokeDashoffset={gaugeOffset}
          />
          <circle
            className="gauge-arc gauge-stroke"
            cx="112"
            cy="112"
            r="92"
            pathLength="100"
            strokeDashoffset={gaugeOffset}
          />
        </g>
      </svg>
      <div className="aqi-score" aria-hidden="true">
        <strong>{aqi}</strong>
        <span>out of 500</span>
      </div>
    </div>
  );
}

function SensorDetailsDisclosure({ air }: { air: AirQualityPayload }) {
  const [sensorOpen, setSensorOpen] = useState(false);
  const sensorPanelId = useId();
  const { current, groundStation } = air;
  return (
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
          {POLLUTANT_KEYS.map((key) => (
            <div key={key}>
              <dt>{POLLUTANT_LABELS[key].name}</dt>
              <dd>
                {key === 'co' ? (current.coUgM3 / 1000).toFixed(2) : current[key].toFixed(1)}{' '}
                <small>{POLLUTANT_LABELS[key].unit}</small>
              </dd>
            </div>
          ))}
        </dl>
        <p>{air.source}</p>
        {groundStation && (
          <p>
            {groundStation.stationName} · {groundStation.provider}
            {groundStation.distanceKm !== null && ' · ' + groundStation.distanceKm + ' km away'}
          </p>
        )}
      </div>
    </div>
  );
}

/** Hero banner showing live India CPCB NAQI score, gauge, Family Alert action, 24h forecast, and sensor details. */
export function AqiHero({ air, impact }: { air: AirQualityPayload; impact: ChoiceImpactResult }) {
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; copied: boolean } | null>(null);
  const { location, cpcb, current } = air;
  const dominant = POLLUTANT_LABELS[cpcb.dominantPollutant];
  const verdict = cpcb.advisory.split(/(?<=\.)\s/)[0];
  const particleCount = Math.min(MAX_PARTICLES, 5 + Math.floor(Math.max(0, current.pm25) / 11));
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
    <section
      className="air-hero"
      data-band={toAqiBandSlug(cpcb.category)}
      aria-labelledby="aqi-status-heading"
    >
      <div className="atmosphere" aria-hidden="true">
        <div className="ambient-glow" />
        {Array.from({ length: particleCount }, (_, i) => (
          <i className="air-particle" key={i} />
        ))}
      </div>
      <div className="hero-main">
        <div className="hero-reading">
          <p className="eyebrow">
            <MapPin size={14} aria-hidden="true" /> {location.name}
            {location.country ? ', ' + location.country : ''}
          </p>
          <div className="aqi-heading">
            <h2 id="aqi-status-heading">CPCB NAQI</h2>
            <span className="band-label">
              <span aria-hidden="true" />
              {cpcb.category}
            </span>
          </div>
          <AqiGaugeDial aqi={cpcb.aqi} category={cpcb.category} />
          <p className="hero-verdict">{verdict}</p>
          <p className="dominant-reading">
            Dominant pollutant <strong>{dominant.name}</strong>
          </p>
          <div className="family-alert">
            <button type="button" className="button-secondary" onClick={() => void copyAlert()}>
              <Copy size={16} aria-hidden="true" /> Copy Family Alert
            </button>
            <p aria-live="polite">
              {feedback
                ? feedback.copied
                  ? 'Copied!'
                  : 'Select and copy the alert text below.'
                : ''}
            </p>
            {feedback && !feedback.copied && (
              <textarea
                aria-label="Family alert text"
                value={alertText}
                readOnly
                rows={5}
                onFocus={(event) => event.currentTarget.select()}
              />
            )}
          </div>
        </div>
        <CleanAirWindowCard
          key={`${location.lat},${location.lon}`}
          hourly={air.hourly}
          analysis={air.windowAnalysis}
        />
      </div>
      <SensorDetailsDisclosure air={air} />
    </section>
  );
}
