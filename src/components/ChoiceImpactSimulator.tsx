import { Leaf } from 'lucide-react';
import { COMMUTE_LABELS } from '../engine/impactCalculator';
import type { ChoiceImpactResult, ChoiceToggles, CommuteMode, HouseholdProfile } from '../types/airQuality';

const HABITS: Array<{ key: keyof ChoiceToggles; label: string }> = [
  { key: 'hepaOrCorsiRosenthal', label: 'HEPA or DIY filtration' },
  { key: 'cleanCookingExhaust', label: 'Cooking exhaust and lids' },
  { key: 'smartVentilation', label: 'Ventilate in the cleanest window' },
  { key: 'n95OutdoorMask', label: 'Wear a fitted N95 outdoors' },
  { key: 'publicTransitOrWfhSwap', label: 'Use a lower-emission commute' },
  { key: 'zeroSmokeIndoor', label: 'Zero-Smoke Home — No Incense / Coils' }
];
const MODES = Object.keys(COMMUTE_LABELS) as CommuteMode[];

interface SimulatorProps {
  profile: HouseholdProfile;
  toggles: ChoiceToggles;
  impact: ChoiceImpactResult;
  hasTelemetry: boolean;
  onProfileChange: (profile: HouseholdProfile) => void;
  onToggleChange: (toggles: ChoiceToggles) => void;
}

export function ChoiceImpactSimulator({ profile, toggles, impact, hasTelemetry, onProfileChange, onToggleChange }: SimulatorProps) {
  const exposure = [
    { name: 'Before', value: impact.baselineDailyExposureUgM3, width: 100 },
    { name: 'After', value: impact.projectedDailyExposureUgM3, width: 100 - impact.exposureReductionPct }
  ];
  return (
    <div>
      <div className="panel-heading">
        <div><h2>Compare your daily choices</h2><p>Explore estimates for exposure and emissions as you change your habits.</p></div>
      </div>
      <div className="impact-results" aria-live="polite">
        <div className="exposure-result">
          <div className="exposure-title"><h3>Daily PM2.5 exposure</h3><strong>{impact.exposureReductionPct}% less</strong></div>
          {exposure.map(({ name, value, width }) => (
            <div className={'exposure-row exposure-' + name.toLowerCase()} key={name}>
              <span>{name}</span><div className="exposure-track" aria-hidden="true"><i style={{ width: width + '%' }} /></div>
              <strong>{value} <small>µg/m³</small></strong>
            </div>
          ))}
          {!hasTelemetry && <p className="field-feedback">Uses a sample PM2.5 reading until live data loads.</p>}
        </div>
        <div className="carbon-result">
          <Leaf size={19} aria-hidden="true" /><h3>Annual CO₂ saved</h3>
          <p><strong>{impact.annualCo2SavedKg.toLocaleString('en-IN')}</strong> kg</p>
        </div>
      </div>

      <fieldset className="habit-group">
        <legend>Daily habits</legend>
        <div className="habit-grid">
          {HABITS.map(({ key, label }) => (
            <label key={key} className="habit-row">
              <span>{label}</span>
              <input type="checkbox" role="switch" checked={toggles[key]}
                onChange={(event) => onToggleChange({ ...toggles, [key]: event.target.checked })} />
              <span className="switch-track" aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="commute-group">
        <legend>Commute comparison</legend>
        <div className="commute-fields">
          <label>Usual commute
            <select value={profile.baselineCommute} onChange={(event) =>
              onProfileChange({ ...profile, baselineCommute: event.target.value as CommuteMode })}>
              {MODES.map((mode) => <option key={mode} value={mode}>{COMMUTE_LABELS[mode]}</option>)}
            </select>
          </label>
          <label>Alternative commute
            <select value={profile.chosenCommute} onChange={(event) =>
              onProfileChange({ ...profile, chosenCommute: event.target.value as CommuteMode })}>
              {MODES.map((mode) => <option key={mode} value={mode}>{COMMUTE_LABELS[mode]}</option>)}
            </select>
          </label>
          <label>Round trip <strong>{profile.commuteKm} km</strong>
            <input type="range" min={0} max={60} step={2} value={profile.commuteKm}
              onChange={(event) => onProfileChange({ ...profile, commuteKm: Number(event.target.value) })} />
          </label>
        </div>
      </fieldset>

      {impact.breakdown.length > 0 && <details className="impact-breakdown">
        <summary>How the estimates are calculated</summary>
        <ul>{impact.breakdown.map((item) => <li key={item.label}><strong>{item.label}</strong><p>{item.detail}</p></li>)}</ul>
      </details>}
    </div>
  );
}
