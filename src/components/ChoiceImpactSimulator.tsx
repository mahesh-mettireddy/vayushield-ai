import { Building2, ChevronDown, Trees } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import { calculateChoiceImpact, calculateCommunityImpact, COMMUTE_LABELS } from '../engine/impactCalculator';
import type { ChoiceImpactResult, ChoiceToggles, CommuteMode, HouseholdProfile } from '../types/airQuality';
import { RoomCleanCurve } from './RoomCleanCurve';

const HABITS: Array<{ key: keyof ChoiceToggles; label: string }> = [
  { key: 'hepaOrCorsiRosenthal', label: 'HEPA or DIY filtration' },
  { key: 'cleanCookingExhaust', label: 'Cooking exhaust and lids' },
  { key: 'smartVentilation', label: 'Ventilate in the cleanest window' },
  { key: 'n95OutdoorMask', label: 'Wear a fitted N95 outdoors' },
  { key: 'publicTransitOrWfhSwap', label: 'Use a lower-emission commute' },
  { key: 'zeroSmokeIndoor', label: 'Zero-Smoke Home — No Incense / Coils' }
];
const COMMUTE_MODES: readonly CommuteMode[] = ['solo_car', 'scooter', 'bus', 'metro', 'cycle_walk', 'wfh'];
const COMMUNITY_PRESETS = [
  { count: 1, label: '1 Family' },
  { count: 25, label: '25 Flats' },
  { count: 100, label: '100 Flats' }
];
const tonnesFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

function parseCommuteMode(value: string): CommuteMode | undefined {
  return COMMUTE_MODES.find((mode) => mode === value);
}

interface SimulatorProps {
  profile: HouseholdProfile;
  toggles: ChoiceToggles;
  impact: ChoiceImpactResult;
  ambientPm25?: number;
  hasTelemetry: boolean;
  onProfileChange: (profile: HouseholdProfile) => void;
  onToggleChange: (toggles: ChoiceToggles) => void;
}

export function ChoiceImpactSimulator({ profile, toggles, impact, ambientPm25 = 120, hasTelemetry, onProfileChange, onToggleChange }: SimulatorProps) {
  const [households, setHouseholds] = useState(1);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const breakdownId = useId();
  const baselineSelectId = useId();
  const chosenSelectId = useId();
  const commuteKmId = useId();

  const community = calculateCommunityImpact(impact.annualCo2SavedKg, households);
  const exposure = [
    { name: 'Before', value: impact.baselineDailyExposureUgM3, width: 100 },
    { name: 'After', value: impact.projectedDailyExposureUgM3, width: 100 - impact.exposureReductionPct }
  ];
  const maximumSavings = calculateChoiceImpact(0, { ...profile, chosenCommute: 'wfh' }, {
    ...toggles, publicTransitOrWfhSwap: true, cleanCookingExhaust: true
  }).annualCo2SavedKg;
  const savingsShare = Math.min(100, Math.round(impact.annualCo2SavedKg / maximumSavings * 100));

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
              <span>{name}</span><div className="exposure-track" aria-hidden="true"><i
                style={{ '--exposure-ratio': width / 100 } as CSSProperties} /></div>
              <strong>{value} <small>µg/m³</small></strong>
            </div>
          ))}
          {!hasTelemetry && <p className="field-feedback">Uses a sample PM2.5 reading until live data loads.</p>}
        </div>
        <div className="carbon-result">
          <div className="carbon-ring" aria-hidden="true">
            <svg viewBox="0 0 72 72" focusable="false">
              <circle className="carbon-track" cx="36" cy="36" r="30" />
              <circle className="carbon-arc" cx="36" cy="36" r="30" pathLength="100"
                strokeDashoffset={100 - savingsShare} transform="rotate(-90 36 36)" />
            </svg>
            <Trees size={22} />
          </div>
          <div>
            <h3>Annual CO₂ saved</h3>
            <p><strong>{impact.annualCo2SavedKg.toLocaleString('en-IN')}</strong> kg</p>
            <p className="carbon-trees">≈ {impact.treesEquivalentPerYear.toLocaleString('en-IN')} trees/year</p>
            <p className="carbon-share">{savingsShare}% of modeled commute and cooking savings for your distance</p>
          </div>
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
          <div>
            <label htmlFor={baselineSelectId}>Usual commute</label>
            <select id={baselineSelectId} value={profile.baselineCommute} onChange={(event) => {
              const mode = parseCommuteMode(event.target.value);
              if (mode) onProfileChange({ ...profile, baselineCommute: mode });
            }}>
              {COMMUTE_MODES.map((mode) => <option key={mode} value={mode}>{COMMUTE_LABELS[mode]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={chosenSelectId}>Alternative commute</label>
            <select id={chosenSelectId} value={profile.chosenCommute} onChange={(event) => {
              const mode = parseCommuteMode(event.target.value);
              if (mode) onProfileChange({ ...profile, chosenCommute: mode });
            }}>
              {COMMUTE_MODES.map((mode) => <option key={mode} value={mode}>{COMMUTE_LABELS[mode]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={commuteKmId}>Round trip <strong>{profile.commuteKm} km</strong></label>
            <input id={commuteKmId} type="range" min={0} max={60} step={2} value={profile.commuteKm}
              aria-valuetext={`${profile.commuteKm} km`}
              onChange={(event) => onProfileChange({ ...profile, commuteKm: Number(event.target.value) })} />
          </div>
        </div>
      </fieldset>

      <section className="community-scale" aria-labelledby="community-scale-heading">
        <div className="community-controls">
          <h3 id="community-scale-heading"><Building2 size={17} aria-hidden="true" /> Community Scale</h3>
          <p>Estimate the savings if nearby households make the same choices.</p>
          <div className="community-range-label">
            <label htmlFor="community-households">Households</label><strong aria-hidden="true">{households}</strong>
          </div>
          <input id="community-households" type="range" min={1} max={200} step={1} value={households}
            aria-valuetext={`${households} ${households === 1 ? 'household' : 'households'}`}
            onChange={(event) => setHouseholds(event.target.valueAsNumber)} />
          <div className="pill-row" role="group" aria-label="Community size presets">
            {COMMUNITY_PRESETS.map(({ count, label }) => (
              <button className="pill" key={count} type="button" aria-pressed={households === count}
                onClick={() => setHouseholds(count)}>{label}</button>
            ))}
          </div>
        </div>
        <dl className="community-results" aria-live="polite" aria-atomic="true">
          <div><dt>Tonnes CO₂ saved per year</dt><dd>{tonnesFormat.format(community.annualCo2Tonnes)}</dd></div>
          <div><dt>Mature-tree equivalents per year</dt><dd>{community.treesEquivalent.toLocaleString('en-IN')}</dd></div>
        </dl>
      </section>

      <RoomCleanCurve ambientPm25={ambientPm25} hasTelemetry={hasTelemetry} />

      {impact.breakdown.length > 0 && (
        <div className="impact-breakdown">
          <button
            type="button"
            className="disclosure-trigger"
            aria-expanded={breakdownOpen}
            aria-controls={breakdownId}
            onClick={() => setBreakdownOpen((open) => !open)}
          >
            How the estimates are calculated
            <ChevronDown size={16} aria-hidden="true" className="details-arrow" />
          </button>
          <ul id={breakdownId} hidden={!breakdownOpen}>
            {impact.breakdown.map((item) => <li key={item.label}><strong>{item.label}</strong><p>{item.detail}</p></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
