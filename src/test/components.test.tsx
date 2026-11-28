import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CleanAirWindowCard } from '../components/CleanAirWindowCard';
import { LocationBar } from '../components/LocationBar';
import { PlaybookSearch, getSafeExternalHref } from '../components/PlaybookSearch';
import { PRESET_CITIES } from '../data/presets';
import { resetSemanticExtractorCache } from '../services/semanticPlaybook';

const { mockPipeline, envMock } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
  envMock: { useWasmCache: true }
}));

vi.mock('@huggingface/transformers', () => ({
  env: envMock,
  pipeline: mockPipeline
}));

describe('Interactive UI Components', () => {
  beforeEach(() => {
    resetSemanticExtractorCache();
    mockPipeline.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('LocationBar handles search results, empty/error feedback, geolocation errors, and outside clicks', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        results: [
          { name: 'Jaipur', region: 'Rajasthan', country: 'India', lat: 26.9124, lon: 75.7873 }
        ]
      })
    );

    const city = PRESET_CITIES[0];
    if (!city) throw new Error('Expected preset city');
    render(<LocationBar selected={city} onSelect={onSelect} />);

    const trigger = screen.getByRole('button', { name: /Change city/i });
    await user.click(trigger);
    await user.type(screen.getByRole('searchbox', { name: 'Search for a city' }), 'Jaipur');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Jaipur/i })).toBeVisible();
    });
    await user.click(screen.getByRole('button', { name: /Jaipur/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jaipur' }));

    await user.click(trigger);
    fetchSpy.mockResolvedValueOnce(Response.json({ results: [] }));
    await user.type(screen.getByRole('searchbox', { name: 'Search for a city' }), 'NowhereCity');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/No cities found/i)).toBeVisible();

    fetchSpy.mockRejectedValueOnce(new Error('api offline'));
    fetchSpy.mockRejectedValueOnce(new Error('direct offline'));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/City search is unavailable/i)).toBeVisible();

    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Use My Location' }));
    expect(screen.getByText(/does not support geolocation/i)).toBeVisible();

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_ok: unknown, err: () => void) => err()
      },
      configurable: true
    });
    await user.click(screen.getByRole('button', { name: 'Use My Location' }));
    expect(screen.getByText(/Location is unavailable/i)).toBeVisible();

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (
          ok: (pos: { coords: { latitude: number; longitude: number } }) => void
        ) => ok({ coords: { latitude: 19.1, longitude: 72.8 } })
      },
      configurable: true
    });
    await user.click(screen.getByRole('button', { name: 'Use My Location' }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My location', lat: 19.1, lon: 72.8 })
    );

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    const searchForm = screen.getByRole('search', { name: 'City search' });
    fireEvent.submit(searchForm);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.blur(searchForm, { relatedTarget: document.body });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('CleanAirWindowCard handles empty/single-hour forecasts, touch hover, and Home/ArrowLeft keys', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CleanAirWindowCard
        hourly={[]}
        analysis={{
          bestWindow: {
            startLabel: 'Unavailable',
            endLabel: 'Unavailable',
            avgPm25: 0,
            avgAqi: 0,
            advice: 'Need two hours.'
          },
          worstWindow: {
            startLabel: 'Unavailable',
            endLabel: 'Unavailable',
            avgPm25: 0,
            avgAqi: 0,
            advice: 'Need two hours.'
          },
          exposureSavingsPct: 0
        }}
      />
    );
    expect(screen.getByText('Hourly forecast unavailable.')).toBeVisible();
    expect(screen.getByText('Need two hours.')).toBeVisible();

    rerender(
      <CleanAirWindowCard
        hourly={[
          { time: '2026-11-24T12:00Z', hourLabel: '12 PM', pm25: 90, pm10: 140, aqi: 200 },
          { time: '2026-11-24T13:00Z', hourLabel: '1 PM', pm25: 70, pm10: 110, aqi: 133 }
        ]}
        analysis={{
          bestWindow: {
            startLabel: '12 PM',
            endLabel: '2 PM',
            avgPm25: 80,
            avgAqi: 167,
            advice: 'Brief errands.'
          },
          worstWindow: {
            startLabel: '12 PM',
            endLabel: '2 PM',
            avgPm25: 80,
            avgAqi: 167,
            advice: 'Take care.'
          },
          exposureSavingsPct: 0
        }}
      />
    );
    const bars = screen.getAllByRole('button');
    const bar1 = bars[1];
    if (!bar1) throw new Error('Expected second bar');
    const touchMove = new MouseEvent('mouseover', { bubbles: true });
    Object.defineProperty(touchMove, 'pointerType', { value: 'touch' });
    fireEvent(bar1, touchMove);
    expect(screen.getByRole('status', { name: 'Selected forecast hour' })).toHaveTextContent(
      '12 PM'
    );
    await user.click(bar1);
    fireEvent.keyDown(bar1, { key: 'Enter' });
    await user.keyboard('{ArrowLeft}');
    expect(bars[0]).toHaveFocus();
    await user.keyboard('{End}{Home}');
    expect(bars[0]).toHaveFocus();
  });

  it('PlaybookSearch runs semantic WASM search, handles errors/stale queries, and toggles disclosures', async () => {
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

    // Changing the query mid-flight discards stale semantic results cleanly
    resetSemanticExtractorCache();
    let resolveExtractor:
      ((fn: (text: string) => Promise<{ data: Float32Array }>) => void) | undefined;
    mockPipeline.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveExtractor = resolve;
        })
    );
    await user.click(screen.getByRole('button', { name: 'Local HF Semantic Match (WASM)' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search the playbook' }), 'x');
    resolveExtractor?.(async () => ({ data: new Float32Array([1, 0]) }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Local HF Semantic Match (WASM)' })).toBeEnabled();
    });
    expect(screen.queryByText('Match 100%')).not.toBeInTheDocument();

    expect(getSafeExternalHref('https://openaq.org/')).toBe('https://openaq.org/');
    expect(getSafeExternalHref('javascript:alert(1)')).toBe('#');
    expect(getSafeExternalHref('not a url')).toBe('#');
  });
});
