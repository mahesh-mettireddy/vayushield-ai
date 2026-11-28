import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceImpactSimulator } from '../components/ChoiceImpactSimulator';
import { RoomCleanCurve } from '../components/RoomCleanCurve';
import { RoutinePlanner } from '../components/RoutinePlanner';
import { calculateChoiceImpact } from '../engine/impactCalculator';
import type { AssistantPlan, ChoiceToggles, HouseholdProfile } from '../types/airQuality';

const BASE_PROFILE: HouseholdProfile = {
  householdMembers: ['Children'],
  baselineCommute: 'solo_car',
  chosenCommute: 'metro',
  commuteKm: 16,
  homeType: 'apartment',
  budgetTier: 'budget_diy'
};

const BASE_TOGGLES: ChoiceToggles = {
  hepaOrCorsiRosenthal: true,
  smartVentilation: true,
  cleanCookingExhaust: true,
  n95OutdoorMask: true,
  publicTransitOrWfhSwap: true,
  zeroSmokeIndoor: false
};

describe('ChoiceImpactSimulator, RoutinePlanner & RoomCleanCurve', () => {
  it('ChoiceImpactSimulator updates commute selects, slider, and breakdown disclosure', async () => {
    const user = userEvent.setup();
    const onProfileChange = vi.fn();
    const onToggleChange = vi.fn();
    const impact = calculateChoiceImpact(140, BASE_PROFILE, BASE_TOGGLES);
    const allOffImpact = calculateChoiceImpact(140, BASE_PROFILE, {
      hepaOrCorsiRosenthal: false,
      smartVentilation: false,
      cleanCookingExhaust: false,
      n95OutdoorMask: false,
      publicTransitOrWfhSwap: false,
      zeroSmokeIndoor: false
    });

    const { rerender } = render(
      <ChoiceImpactSimulator
        profile={BASE_PROFILE}
        toggles={BASE_TOGGLES}
        impact={impact}
        hasTelemetry={false}
        onProfileChange={onProfileChange}
        onToggleChange={onToggleChange}
      />
    );
    expect(screen.getByLabelText('Households')).toHaveAttribute('aria-valuetext', '1 household');

    rerender(
      <ChoiceImpactSimulator
        profile={BASE_PROFILE}
        toggles={BASE_TOGGLES}
        impact={allOffImpact}
        hasTelemetry={false}
        onProfileChange={onProfileChange}
        onToggleChange={onToggleChange}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'How the estimates are calculated' })
    ).not.toBeInTheDocument();

    rerender(
      <ChoiceImpactSimulator
        profile={BASE_PROFILE}
        toggles={BASE_TOGGLES}
        impact={impact}
        hasTelemetry={false}
        onProfileChange={onProfileChange}
        onToggleChange={onToggleChange}
      />
    );
    expect(screen.getByText(/Uses a sample PM2\.5 reading/i)).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Usual commute'), 'scooter');
    expect(onProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({ baselineCommute: 'scooter' })
    );
    await user.selectOptions(screen.getByLabelText('Alternative commute'), 'wfh');
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ chosenCommute: 'wfh' }));
    fireEvent.change(screen.getByLabelText('Round trip distance'), { target: { value: '24' } });
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ commuteKm: 24 }));

    const breakdownBtn = screen.getByRole('button', { name: 'How the estimates are calculated' });
    expect(breakdownBtn).toHaveAttribute('aria-expanded', 'false');
    await user.click(breakdownBtn);
    expect(breakdownBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('RoutinePlanner toggles members, budget tier, submits question, and renders provider badges', async () => {
    const user = userEvent.setup();
    const onProfileChange = vi.fn();
    const onGenerate = vi.fn(async () => {});
    render(
      <RoutinePlanner
        profile={BASE_PROFILE}
        plan={null}
        loading={false}
        ready
        onProfileChange={onProfileChange}
        onGenerate={onGenerate}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Seniors' }));
    expect(onProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({ householdMembers: ['Children', 'Seniors'] })
    );
    await user.click(screen.getByRole('radio', { name: 'No cost' }));
    expect(onProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({ budgetTier: 'zero_cost' })
    );
    await user.type(screen.getByLabelText('Optional question for the planner'), 'Safe to jog?');
    await user.click(screen.getByRole('button', { name: 'Generate AI Routine' }));
    expect(onGenerate).toHaveBeenCalledWith('Safe to jog?');
    await user.click(screen.getByRole('button', { name: 'Children' }));
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ householdMembers: [] }));

    const samplePlan: AssistantPlan = {
      provider: 'huggingface',
      modelLabel: 'Qwen 2.5',
      summary: 'Plan summary',
      dailyRoutine: [{ timeBlock: 'Morning', action: 'Ventilate', whyItHelps: 'Low PM2.5' }],
      indoorHacks: [
        { title: 'HEPA', steps: 'Run filter', costTier: 'Standard', impact: 'Drops PM2.5' }
      ],
      sustainableSwaps: [{ swap: 'Metro', directImpact: 'Lower CO2' }],
      safetyNote: 'Informational.'
    };
    const { rerender } = render(
      <RoutinePlanner
        profile={BASE_PROFILE}
        plan={samplePlan}
        loading={false}
        ready
        onProfileChange={vi.fn()}
        onGenerate={vi.fn(async () => {})}
      />
    );
    expect(screen.getByText('Hugging Face Router')).toBeVisible();
    rerender(
      <RoutinePlanner
        profile={BASE_PROFILE}
        plan={{ ...samplePlan, provider: 'groq' }}
        loading={false}
        ready
        onProfileChange={vi.fn()}
        onGenerate={vi.fn(async () => {})}
      />
    );
    expect(screen.getByText('Groq')).toBeVisible();
    rerender(
      <RoutinePlanner
        profile={BASE_PROFILE}
        plan={{ ...samplePlan, provider: 'gemini', modelLabel: 'Gemini 2.5 Flash' }}
        loading={false}
        ready
        onProfileChange={vi.fn()}
        onGenerate={vi.fn(async () => {})}
      />
    );
    expect(screen.getByText('Gemini 2.5 Flash')).toBeVisible();
  });

  it('RoomCleanCurve handles already-safe readings, telemetry caption, and Over 2 hrs fallback', () => {
    const { rerender } = render(<RoomCleanCurve ambientPm25={24} hasTelemetry />);
    expect(screen.getByText(/\(24 µg\/m³ outdoor PM2\.5\)/)).toBeVisible();
    expect(screen.getByText('Already safe')).toBeVisible();
    expect(screen.getByText('Safe now')).toBeVisible();
    rerender(<RoomCleanCurve ambientPm25={260} hasTelemetry={false} />);
    expect(screen.getByText('Over 2 hrs')).toBeVisible();
  });
});
