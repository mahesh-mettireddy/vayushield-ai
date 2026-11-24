import { useState, type FormEvent } from 'react';
import { Cpu, Home, Leaf, Loader2, Sparkles, Users } from 'lucide-react';
import type { AssistantPlan, BudgetTier, HouseholdProfile } from '../types/airQuality';

interface RoutinePlannerProps {
  profile: HouseholdProfile;
  plan: AssistantPlan | null;
  loading: boolean;
  onProfileChange: (next: HouseholdProfile) => void;
  onGenerate: (userQuestion: string) => Promise<void>;
}

const HOUSEHOLD_GROUPS = ['Children', 'Seniors', 'Asthma / Respiratory', 'Daily Commuters', 'Pets'];

const BUDGET_OPTIONS: Array<{ value: BudgetTier; label: string }> = [
  { value: 'zero_cost', label: 'Zero-Cost Hacks' },
  { value: 'budget_diy', label: 'Budget DIY (Corsi-Rosenthal)' },
  { value: 'standard', label: 'Standard (HEPA Purifier)' }
];

export function RoutinePlanner({
  profile,
  plan,
  loading,
  onProfileChange,
  onGenerate
}: RoutinePlannerProps) {
  const [question, setQuestion] = useState('');

  function toggleMember(member: string) {
    const exists = profile.householdMembers.includes(member);
    const nextMembers = exists
      ? profile.householdMembers.filter((m) => m !== member)
      : [...profile.householdMembers, member];
    onProfileChange({
      ...profile,
      householdMembers: nextMembers.length > 0 ? nextMembers : ['Daily Commuters']
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onGenerate(question);
  }

  return (
    <section
      aria-labelledby="planner-heading"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="planner-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Sparkles className="h-5 w-5 text-sky-700" aria-hidden="true" />
            GenAI Personalized Smog-Day Routine Planner
          </h2>
          <p className="text-sm text-slate-600">
            Multi-provider GenAI (Gemini 2.5 Flash → Hugging Face Router → Groq → Deterministic fallback)
            grounded in your city&apos;s CPCB NAQI and simulator math.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <fieldset>
            <legend className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Household Profile
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {HOUSEHOLD_GROUPS.map((member) => {
                const active = profile.householdMembers.includes(member);
                return (
                  <button
                    key={member}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleMember(member)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'border-sky-700 bg-sky-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {member}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="budget-tier" className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
              Indoor Air Budget Preference
            </label>
            <select
              id="budget-tier"
              value={profile.budgetTier}
              onChange={(e) =>
                onProfileChange({ ...profile, budgetTier: e.target.value as BudgetTier })
              }
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {BUDGET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="custom-question" className="block text-xs font-semibold text-slate-700">
            Optional Household Question (e.g., school bus timing, elderly morning walk, kitchen smoke)
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              id="custom-question"
              type="text"
              maxLength={240}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., Safe routine for a 6-year-old's school drop-off and evening cooking?"
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Building Plan...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Generate AI Routine
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {plan && (
        <div className="mt-6 space-y-5 border-t border-slate-200 pt-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900 px-4 py-3 text-white">
            <span className="inline-flex items-center gap-2 text-xs font-semibold">
              <Cpu className="h-4 w-4 text-sky-400" aria-hidden="true" />
              Active Engine: {plan.modelLabel}
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium uppercase">
              {plan.provider}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-slate-800">{plan.summary}</p>

          <div>
            <h3 className="text-sm font-bold text-slate-900">Today&apos;s Low-Emission Schedule</h3>
            <ol className="mt-2.5 grid gap-3 md:grid-cols-3">
              {plan.dailyRoutine.map((step) => (
                <li
                  key={step.timeBlock}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-sky-800">
                    {step.timeBlock}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-slate-900">{step.action}</p>
                  <p className="mt-2 text-xs text-slate-600">
                    <strong>Impact:</strong> {step.whyItHelps}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                <Home className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Indoor Air Quality Hacks
              </h3>
              <ul className="mt-2.5 space-y-2.5">
                {plan.indoorHacks.map((hack) => (
                  <li key={hack.title} className="rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{hack.title}</span>
                      <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900">
                        {hack.costTier}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">{hack.steps}</p>
                    <p className="mt-1.5 text-xs font-medium text-emerald-800">{hack.impact}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                <Leaf className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                Sustainable Alternatives &amp; Direct Impact
              </h3>
              <ul className="mt-2.5 space-y-2.5">
                {plan.sustainableSwaps.map((item) => (
                  <li key={item.swap} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
                    <p className="text-sm font-semibold text-slate-900">{item.swap}</p>
                    <p className="mt-1 text-xs text-emerald-950">{item.directImpact}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs text-slate-600">
            {plan.safetyNote}
          </p>
        </div>
      )}
    </section>
  );
}
