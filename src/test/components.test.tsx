import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChoiceImpactSimulator } from '../components/ChoiceImpactSimulator';
import { LocationBar } from '../components/LocationBar';
import { PlaybookSearch } from '../components/PlaybookSearch';
import { RoutinePlanner } from '../components/RoutinePlanner';
import { PRESET_CITIES } from '../data/presets';
import { calculateChoiceImpact } from '../engine/impactCalculator';
import { resetSemanticExtractorCache } from '../services/semanticPlaybook';
import type { ChoiceToggles, HouseholdProfile } from '../types/airQuality';

const { mockPipeline, envMock } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
  envMock: { useWasmCache: true }
}));

vi.mock('@huggingface/transformers', () => ({
  env: envMock,
  pipeline: mockPipeline
}));

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

describe('Interactive UI Components', () => {
  beforeEach(() => {
    resetSemanticExtractorCache();
    mockPipeline.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('LocationBar handles city search results, empty state, and geolocation', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        results: [{ name: 'Jaipur', region: 'Rajasthan', country: 'India', lat: 26.9124, lon: 75.7873 }]
      })
    );

    const city = PRESET_CITIES[0];
    if (!city) throw new Error('Expected preset city');
    render(<LocationBar selected={city} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /Change city/i }));
    await user.type(screen.getByRole('searchbox', { name: 'Search for a city' }), 'Jaipur');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Jaipur/i })).toBeVisible();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Jaipur/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jaipur' }));

    await user.click(screen.getByRole('button', { name: /Change city/i }));
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (ok: (pos: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: 19.1, longitude: 72.8 } })
      },
      configurable: true
    });
    await user.click(screen.getByRole('button', { name: 'Use My Location' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'My location', lat: 19.1, lon: 72.8 }));
  });

  it('PlaybookSearch runs semantic WASM search, handles errors, and toggles tip disclosures', async () => {
    const user = userEvent.setup();
    mockPipeline.mockResolvedValueOnce(async () => ({ data: new Float32Array([1, 0]) }));
    render(<PlaybookSearch />);

    const firstDisclosure = screen.getAllByRole('button', { name: 'How to do it' })[0];
    if (!firstDisclosure) throw new Error('Expected disclosure');
    expect(firstDisclosure).toHaveAttribute('aria-expanded', 'false');
    await user.click(firstDisclosure);
    expect(firstDisclosure).toHaveAttribute('aria-expanded', 'true');

    await user.type(screen.getByRole('searchbox', { name: 'Search the playbook' }), 'purifier');
    await user.click(screen.getByRole('button', { name: 'Local HF Semantic Match (WASM)' }));

    await waitFor(() => {
      expect(screen.getAllByText('Match 100%').length).toBeGreaterThan(0);
    });

    resetSemanticExtractorCache();
    mockPipeline.mockRejectedValueOnce(new Error('WASM blocked'));
    await user.type(screen.getByRole('searchbox', { name: 'Search the playbook' }), ' filter');
    expect(screen.queryByText('Match 100%')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Local HF Semantic Match (WASM)' }));
    await waitFor(() => {
      expect(screen.getByText(/local model couldn’t load/i)).toBeVisible();
    });
  });

  it('ChoiceImpactSimulator updates commute selects, slider, and breakdown disclosure', async () => {
    const user = userEvent.setup();
    const onProfileChange = vi.fn();
    const onToggleChange = vi.fn();
    const impact = calculateChoiceImpact(140, BASE_PROFILE, BASE_TOGGLES);

    render(
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
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ baselineCommute: 'scooter' }));

    await user.selectOptions(screen.getByLabelText('Alternative commute'), 'wfh');
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ chosenCommute: 'wfh' }));

    fireEvent.change(screen.getByLabelText(/Round trip/i), { target: { value: '24' } });
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ commuteKm: 24 }));

    const breakdownBtn = screen.getByRole('button', { name: 'How the estimates are calculated' });
    expect(breakdownBtn).toHaveAttribute('aria-expanded', 'false');
    await user.click(breakdownBtn);
    expect(breakdownBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('RoutinePlanner updates household members, budget tier, and submits custom question', async () => {
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
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({
      householdMembers: ['Children', 'Seniors']
    }));

    await user.click(screen.getByRole('radio', { name: 'No cost' }));
    expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({ budgetTier: 'zero_cost' }));

    await user.type(screen.getByLabelText('Optional question for the planner'), 'Safe to jog?');
    await user.click(screen.getByRole('button', { name: 'Generate AI Routine' }));
    expect(onGenerate).toHaveBeenCalledWith('Safe to jog?');
  });
});
