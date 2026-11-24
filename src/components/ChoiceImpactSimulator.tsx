import { Leaf, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { COMMUTE_LABELS } from '../engine/impactCalculator';
import type {
  ChoiceImpactResult,
  ChoiceToggles,
  CommuteMode,
  HouseholdProfile
} from '../types/airQuality';

interface ChoiceImpactSimulatorProps {
  profile: HouseholdProfile;
  toggles: ChoiceToggles;
  impact: ChoiceImpactResult;
  onProfileChange: (next: HouseholdProfile) => void;
  onToggleChange: (next: ChoiceToggles) => void;
}

const TOGGLE_ITEMS: Array<{ key: keyof ChoiceToggles; title: string; subtitle: string }> = [
  {
    key: 'hepaOrCorsiRosenthal',
    title: 'HEPA Purifier or DIY Corsi-Rosenthal Box',
    subtitle: 'Runs in bedroom/living zone (~55% lower indoor PM2.5)'
  },
  {
    key: 'cleanCookingExhaust',
    title: 'Pre-Start Kitchen Exhaust + Lid-On / Induction',
    subtitle: 'Cuts indoor cooking PM2.5 (~35%) & saves ~85 kg CO₂/yr'
  },
  {
    key: 'smartVentilation',
    title: 'Ventilate Only in Clean-Air Window',
    subtitle: 'Seals peak smog hours (~20% lower indoor buildup)'
  },
  {
    key: 'n95OutdoorMask',
    title: 'Fitted N95 / KN95 for Peak Outdoor Trips',
    subtitle: 'Blocks ≥80% inhaled PM2.5 outdoors'
  },
  {
    key: 'publicTransitOrWfhSwap',
    title: 'Apply Low-Emission Commute Swap',
    subtitle: 'Tracks your daily & annual CO₂ reduction below'
  }
];

const COMMUTE_MODES = Object.keys(COMMUTE_LABELS) as CommuteMode[];

export function ChoiceImpactSimulator({
  profile,
  toggles,
  impact,
  onProfileChange,
  onToggleChange
}: ChoiceImpactSimulatorProps) {
  return (
    <section
      aria-labelledby="simulator-heading"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="simulator-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <SlidersHorizontal className="h-5 w-5 text-sky-700" aria-hidden="true" />
            Choice-Impact Simulator
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Toggle daily routines and commute swaps to see the direct, deterministic impact on your
            family&apos;s PM2.5 exposure and CO₂ emissions.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-live="polite">
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-sky-900">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            PM2.5 Exposure Drop
          </p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-sky-950">
            -{impact.exposureReductionPct}%
          </p>
          <p className="mt-1 text-xs text-sky-900">
            {impact.baselineDailyExposureUgM3} → <strong>{impact.projectedDailyExposureUgM3} µg/m³</strong> daily avg
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-emerald-900">
            <Leaf className="h-4 w-4" aria-hidden="true" />
            Annual CO₂ Saved
          </p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-emerald-950">
            {impact.annualCo2SavedKg} kg
          </p>
          <p className="mt-1 text-xs text-emerald-900">
            ~{impact.dailyCo2SavedKg} kg/workday · ≈ {impact.treesEquivalentPerYear} mature trees/yr
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase text-slate-700">Active Choices</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900">
            {impact.breakdown.length}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Fed directly into the AI Routine Planner so every recommendation stays grounded.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="baseline-commute" className="block text-xs font-semibold text-slate-700">
            Usual Commute Mode
          </label>
          <select
            id="baseline-commute"
            value={profile.baselineCommute}
            onChange={(e) =>
              onProfileChange({ ...profile, baselineCommute: e.target.value as CommuteMode })
            }
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {COMMUTE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {COMMUTE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="chosen-commute" className="block text-xs font-semibold text-slate-700">
            Smog-Day Sustainable Swap
          </label>
          <select
            id="chosen-commute"
            value={profile.chosenCommute}
            onChange={(e) =>
              onProfileChange({ ...profile, chosenCommute: e.target.value as CommuteMode })
            }
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {COMMUTE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {COMMUTE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="commute-km" className="block text-xs font-semibold text-slate-700">
            Round-Trip Distance ({profile.commuteKm} km/day)
          </label>
          <input
            id="commute-km"
            type="range"
            min={0}
            max={60}
            step={2}
            value={profile.commuteKm}
            onChange={(e) =>
              onProfileChange({ ...profile, commuteKm: Number(e.target.value) })
            }
            className="mt-2.5 w-full accent-sky-700"
          />
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          Daily Protection &amp; Low-Emission Habits
        </legend>
        <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
          {TOGGLE_ITEMS.map((item) => {
            const checked = toggles[item.key];
            return (
              <label
                key={item.key}
                className={`grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-xl border p-3 transition ${
                  checked
                    ? 'border-sky-500 bg-sky-50/50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    onToggleChange({ ...toggles, [item.key]: e.target.checked })
                  }
                  className="row-span-2 mt-1 h-4 w-4 rounded border-slate-300 accent-sky-700"
                  aria-labelledby={`choice-${item.key}-title`}
                  aria-describedby={`choice-${item.key}-description`}
                />
                <span id={`choice-${item.key}-title`} className="block text-sm font-semibold text-slate-900">
                  {item.title}
                </span>
                <span id={`choice-${item.key}-description`} className="block text-xs text-slate-600">
                  {item.subtitle}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {impact.breakdown.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Why Your Choices Work (Verified Math Breakdown)
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
            {impact.breakdown.map((row) => (
              <li key={row.label} className="flex flex-col sm:flex-row sm:justify-between">
                <span>
                  <strong className="text-slate-900">{row.label}:</strong> {row.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
