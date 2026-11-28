import { Building2, Trees } from 'lucide-react';
import { useId } from 'react';
import {
  calculateCommunityImpact,
  COMMUTE_LABELS,
  COMMUTE_MODES
} from '../engine/impactCalculator';
import type { ChoiceImpactResult, CommuteMode, HouseholdProfile } from '../types/airQuality';

const COMMUNITY_PRESETS = [
  { count: 1, label: '1 Family' },
  { count: 25, label: '25 Flats' },
  { count: 100, label: '100 Flats' }
];
const tonnesFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

function parseCommuteMode(value: string): CommuteMode | undefined {
  return COMMUTE_MODES.find((mode) => mode === value);
}

/** Exposure progress SVG bars and annual CO₂ tree-ring summary card. */
export function ImpactSummaryCards({
  impact,
  hasTelemetry,
  savingsShare
}: {
  impact: ChoiceImpactResult;
  hasTelemetry: boolean;
  savingsShare: number;
}) {
  const exposure = [
    { name: 'Before', value: impact.baselineDailyExposureUgM3, width: 100 },
    {
      name: 'After',
      value: impact.projectedDailyExposureUgM3,
      width: 100 - impact.exposureReductionPct
    }
  ];
  return (
    <div className="impact-results" aria-live="polite">
      <div className="exposure-result">
        <div className="exposure-title">
          <h3>Daily PM2.5 exposure</h3>
          <strong>{impact.exposureReductionPct}% less</strong>
        </div>
        {exposure.map(({ name, value, width }) => (
          <div className={'exposure-row exposure-' + name.toLowerCase()} key={name}>
            <span>{name}</span>
            <svg
              className="exposure-track"
              aria-hidden="true"
              viewBox="0 0 100 8"
              preserveAspectRatio="none"
              focusable="false"
            >
              <rect className="exposure-fill" x="0" y="0" width={width} height="8" rx="4" />
            </svg>
            <strong>
              {value} <small>µg/m³</small>
            </strong>
          </div>
        ))}
        {!hasTelemetry && (
          <p className="field-feedback">Uses a sample PM2.5 reading until live data loads.</p>
        )}
      </div>
      <div className="carbon-result">
        <div className="carbon-ring" aria-hidden="true">
          <svg viewBox="0 0 72 72" focusable="false">
            <circle className="carbon-track" cx="36" cy="36" r="30" />
            <circle
              className="carbon-arc"
              cx="36"
              cy="36"
              r="30"
              pathLength="100"
              strokeDashoffset={100 - savingsShare}
              transform="rotate(-90 36 36)"
            />
          </svg>
          <Trees size={22} />
        </div>
        <div>
          <h3>Annual CO₂ saved</h3>
          <p>
            <strong>{impact.annualCo2SavedKg.toLocaleString('en-IN')}</strong> kg
          </p>
          <p className="carbon-trees">
            ≈ {impact.treesEquivalentPerYear.toLocaleString('en-IN')} trees/year
          </p>
          <p className="carbon-share">
            {savingsShare}% of modeled commute and cooking savings for your distance
          </p>
        </div>
      </div>
    </div>
  );
}

/** Commute baseline, alternative mode, and round-trip distance controls. */
export function CommuteSection({
  profile,
  onProfileChange
}: {
  profile: HouseholdProfile;
  onProfileChange: (profile: HouseholdProfile) => void;
}) {
  const baselineSelectId = useId();
  const chosenSelectId = useId();
  const commuteKmId = useId();
  return (
    <fieldset className="commute-group">
      <legend>Commute comparison</legend>
      <div className="commute-fields">
        <div>
          <label htmlFor={baselineSelectId}>Usual commute</label>
          <select
            id={baselineSelectId}
            value={profile.baselineCommute}
            onChange={(event) => {
              const mode = parseCommuteMode(event.target.value);
              if (mode) onProfileChange({ ...profile, baselineCommute: mode });
            }}
          >
            {COMMUTE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {COMMUTE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={chosenSelectId}>Alternative commute</label>
          <select
            id={chosenSelectId}
            value={profile.chosenCommute}
            onChange={(event) => {
              const mode = parseCommuteMode(event.target.value);
              if (mode) onProfileChange({ ...profile, chosenCommute: mode });
            }}
          >
            {COMMUTE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {COMMUTE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="commute-distance-head">
            <label htmlFor={commuteKmId}>Round trip distance</label>
            <strong aria-hidden="true">{profile.commuteKm} km</strong>
          </div>
          <input
            id={commuteKmId}
            type="range"
            min={0}
            max={60}
            step={2}
            value={profile.commuteKm}
            aria-valuetext={`${profile.commuteKm} km`}
            onChange={(event) =>
              onProfileChange({ ...profile, commuteKm: Number(event.target.value) })
            }
          />
        </div>
      </div>
    </fieldset>
  );
}

/** Interactive 1–200 household Community Scale CO₂ multiplier section. */
export function CommunityScaleSection({
  annualCo2SavedKg,
  households,
  onHouseholdsChange
}: {
  annualCo2SavedKg: number;
  households: number;
  onHouseholdsChange: (count: number) => void;
}) {
  const community = calculateCommunityImpact(annualCo2SavedKg, households);
  return (
    <section className="community-scale" aria-labelledby="community-scale-heading">
      <div className="community-controls">
        <h3 id="community-scale-heading">
          <Building2 size={17} aria-hidden="true" /> Community Scale
        </h3>
        <p>Estimate the savings if nearby households make the same choices.</p>
        <div className="community-range-label">
          <label htmlFor="community-households">Households</label>
          <strong aria-hidden="true">{households}</strong>
        </div>
        <input
          id="community-households"
          type="range"
          min={1}
          max={200}
          step={1}
          value={households}
          aria-valuetext={`${households} ${households === 1 ? 'household' : 'households'}`}
          onChange={(event) => onHouseholdsChange(event.target.valueAsNumber)}
        />
        <div className="pill-row" role="group" aria-label="Community size presets">
          {COMMUNITY_PRESETS.map(({ count, label }) => (
            <button
              className="pill"
              key={count}
              type="button"
              aria-pressed={households === count}
              onClick={() => onHouseholdsChange(count)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <dl className="community-results" aria-live="polite" aria-atomic="true">
        <div>
          <dt>Tonnes CO₂ saved per year</dt>
          <dd>{tonnesFormat.format(community.annualCo2Tonnes)}</dd>
        </div>
        <div>
          <dt>Mature-tree equivalents per year</dt>
          <dd>{community.treesEquivalent.toLocaleString('en-IN')}</dd>
        </div>
      </dl>
    </section>
  );
}
