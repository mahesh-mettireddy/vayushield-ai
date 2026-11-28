import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { calculateChoiceImpact } from '../engine/impactCalculator';
import type { ChoiceImpactResult, ChoiceToggles, HouseholdProfile } from '../types/airQuality';
import { CommuteSection, CommunityScaleSection, ImpactSummaryCards } from './ChoiceImpactCards';
import { RoomCleanCurve } from './RoomCleanCurve';

const HABITS: Array<{ key: keyof ChoiceToggles; label: string }> = [
  { key: 'hepaOrCorsiRosenthal', label: 'HEPA or DIY filtration' },
  { key: 'cleanCookingExhaust', label: 'Cooking exhaust and lids' },
  { key: 'smartVentilation', label: 'Ventilate in the cleanest window' },
  { key: 'n95OutdoorMask', label: 'Wear a fitted N95 outdoors' },
  { key: 'publicTransitOrWfhSwap', label: 'Use a lower-emission commute' },
  { key: 'zeroSmokeIndoor', label: 'Zero-Smoke Home — No Incense / Coils' }
];

interface SimulatorProps {
  profile: HouseholdProfile;
  toggles: ChoiceToggles;
  impact: ChoiceImpactResult;
  ambientPm25?: number;
  hasTelemetry: boolean;
  onProfileChange: (profile: HouseholdProfile) => void;
  onToggleChange: (toggles: ChoiceToggles) => void;
}

/** Interactive Impact Lab combining habit switches, commute swaps, community scaling, and room decay physics. */
export function ChoiceImpactSimulator({
  profile,
  toggles,
  impact,
  ambientPm25 = 120,
  hasTelemetry,
  onProfileChange,
  onToggleChange
}: SimulatorProps) {
  const [households, setHouseholds] = useState(1);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const breakdownId = useId();
  const maximumSavings = calculateChoiceImpact(
    0,
    { ...profile, chosenCommute: 'wfh' },
    { ...toggles, publicTransitOrWfhSwap: true, cleanCookingExhaust: true }
  ).annualCo2SavedKg;
  const savingsShare = Math.min(100, Math.round((impact.annualCo2SavedKg / maximumSavings) * 100));

  return (
    <div>
      <div className="panel-heading">
        <div>
          <h2>Compare your daily choices</h2>
          <p>Explore estimates for exposure and emissions as you change your habits.</p>
        </div>
      </div>
      <ImpactSummaryCards impact={impact} hasTelemetry={hasTelemetry} savingsShare={savingsShare} />
      <fieldset className="habit-group">
        <legend>Daily habits</legend>
        <div className="habit-grid">
          {HABITS.map(({ key, label }) => (
            <label key={key} className="habit-row">
              <span>{label}</span>
              <input
                type="checkbox"
                role="switch"
                checked={toggles[key]}
                onChange={(event) => onToggleChange({ ...toggles, [key]: event.target.checked })}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>
      <CommuteSection profile={profile} onProfileChange={onProfileChange} />
      <CommunityScaleSection
        annualCo2SavedKg={impact.annualCo2SavedKg}
        households={households}
        onHouseholdsChange={setHouseholds}
      />
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
            {impact.breakdown.map((item) => (
              <li key={item.label}>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
