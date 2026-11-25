import { useState } from 'react';
import { ArrowUpRight, CalendarDays, ChevronDown, Leaf, Lightbulb, Sparkles } from 'lucide-react';
import type { AssistantPlan, BudgetTier, HouseholdProfile } from '../types/airQuality';

const MEMBERS = ['Children', 'Seniors', 'Asthma / Respiratory', 'Daily Commuters', 'Pets'];
const BUDGETS: Array<{ value: BudgetTier; label: string }> = [
  { value: 'zero_cost', label: 'No cost' },
  { value: 'budget_diy', label: 'Budget DIY' },
  { value: 'standard', label: 'Standard' }
];

interface RoutinePlannerProps {
  profile: HouseholdProfile;
  plan: AssistantPlan | null;
  loading: boolean;
  ready: boolean;
  onProfileChange: (profile: HouseholdProfile) => void;
  onGenerate: (question: string) => Promise<void>;
}

export function RoutinePlanner({ profile, plan, loading, ready, onProfileChange, onGenerate }: RoutinePlannerProps) {
  const [question, setQuestion] = useState('');

  function toggleMember(member: string) {
    const householdMembers = profile.householdMembers.includes(member)
      ? profile.householdMembers.filter((item) => item !== member)
      : [...profile.householdMembers, member];
    onProfileChange({ ...profile, householdMembers });
  }

  return (
    <div>
      <div className="panel-heading">
        <div><h2>Plan your day</h2><p>Get a routine based on your city’s air quality and household needs.</p></div>
        {plan && <span className="provider-badge" title={plan.modelLabel}><Sparkles size={15} aria-hidden="true" />
          {({ gemini: 'Gemini', huggingface: 'Hugging Face', groq: 'Groq', 'deterministic-fallback': 'Built-in planner' })[plan.provider]}</span>}
      </div>
      <form className="plan-form" onSubmit={(event) => { event.preventDefault(); void onGenerate(question); }}>
        <div className="profile-fields">
          <fieldset>
            <legend>Household</legend>
            <div className="pill-row">
              {MEMBERS.map((member) => <button key={member} type="button" className="pill"
                aria-pressed={profile.householdMembers.includes(member)} onClick={() => toggleMember(member)}>{member}</button>)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Budget</legend>
            <div className="pill-row">
              {BUDGETS.map(({ value, label }) => (
                <label key={value} className="radio-pill">
                  <input type="radio" name="budget" value={value} checked={profile.budgetTier === value}
                    onChange={() => onProfileChange({ ...profile, budgetTier: value })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="inline-form question-form">
          <label htmlFor="plan-question" className="sr-only">Optional question for the planner</label>
          <input type="text" id="plan-question" value={question} maxLength={300}
            onChange={(event) => setQuestion(event.target.value)} placeholder="Optional: When should we go for a walk?" />
          <button type="submit" className="button-primary" disabled={loading || !ready}>
            {loading ? 'Generating…' : 'Generate plan'}<ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </div>
        {loading && <p className="sr-only" role="status">Preparing your daily plan</p>}
      </form>

      {plan && (
        <div className="plan-result" aria-live="polite">
          <p className="plan-summary">{plan.summary}</p>
          <h3><CalendarDays size={18} aria-hidden="true" /> Today’s low-emission schedule</h3>
          <ol className="timeline">
            {plan.dailyRoutine.map((step, i) => <li key={step.timeBlock + i}>
              <h4>{step.timeBlock}</h4><p>{step.action}</p><p className="muted">{step.whyItHelps}</p>
            </li>)}
          </ol>
          <div className="plan-disclosures">
            <details>
              <summary><Lightbulb size={18} aria-hidden="true" /> Indoor air hacks <ChevronDown size={17} aria-hidden="true" className="details-arrow" /></summary>
              <ul>
                {plan.indoorHacks.map((hack, i) => <li key={hack.title + i}>
                  <h4>{hack.title}</h4><p>{hack.steps}</p><p className="muted">{hack.costTier} · {hack.impact}</p>
                </li>)}
              </ul>
            </details>
            <details>
              <summary><Leaf size={18} aria-hidden="true" /> Sustainable swaps <ChevronDown size={17} aria-hidden="true" className="details-arrow" /></summary>
              <ul>
                {plan.sustainableSwaps.map((swap, i) => <li key={swap.swap + i}>
                  <h4>{swap.swap}</h4><p>{swap.directImpact}</p>
                </li>)}
              </ul>
            </details>
          </div>
          <p className="safety-note">{plan.safetyNote}</p>
        </div>
      )}
    </div>
  );
}
