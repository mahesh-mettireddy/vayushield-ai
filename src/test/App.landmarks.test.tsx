import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { AirQualityPayload } from '../types/airQuality';

const MOCK_AIR: AirQualityPayload = {
  location: { name: 'New Delhi', region: 'Delhi NCR', country: 'India', lat: 28.6139, lon: 77.209 },
  fetchedAt: '2026-11-24T12:00:00.000Z',
  source: 'Open-Meteo Air Quality API (CC BY 4.0)',
  current: { pm25: 165, pm10: 270, no2: 52, so2: 14, o3: 48, coUgM3: 1100 },
  cpcb: {
    aqi: 335,
    category: 'Very Poor',
    dominantPollutant: 'pm25',
    subIndices: { pm25: 335, pm10: 221, no2: 66, so2: 18, o3: 48, co: 56 },
    advisory: 'Respiratory illness risk on prolonged exposure.'
  },
  hourly: [
    { time: '2026-11-24T12:00', hourLabel: '12 PM', pm25: 140, pm10: 220, aqi: 316 },
    { time: '2026-11-24T13:00', hourLabel: '1 PM', pm25: 95, pm10: 170, aqi: 218 }
  ],
  windowAnalysis: {
    bestWindow: {
      startLabel: '12 PM',
      endLabel: '2 PM',
      avgPm25: 117.5,
      avgAqi: 267,
      advice: 'Lowest trough.'
    },
    worstWindow: {
      startLabel: '12 PM',
      endLabel: '2 PM',
      avgPm25: 117.5,
      avgAqi: 267,
      advice: 'Keep windows closed.'
    },
    exposureSavingsPct: 0
  },
  groundStation: null
};

describe('WCAG Landmarks, Skip Link Focus Order, Tablist & Live Status', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('lands first Tab on Skip to main content from initial load, enforces tablist arrow navigation, and exposes landmarks', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let resolvePendingPlan: ((res: Response) => void) | undefined;

    fetchSpy.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/assistant')) {
        return new Promise<Response>((resolve) => {
          resolvePendingPlan = resolve;
        });
      }
      if (url.includes('Mumbai')) {
        return Promise.resolve(
          Response.json({
            ...MOCK_AIR,
            location: {
              name: 'Mumbai',
              region: 'Maharashtra',
              country: '',
              lat: 19.076,
              lon: 72.8777
            },
            cpcb: { ...MOCK_AIR.cpcb, aqi: 180, category: 'Moderate' },
            groundStation: {
              stationName: 'Bandra Kurla Reference',
              provider: 'CPCB',
              distanceKm: null,
              pm25: null,
              lastUpdated: null
            }
          })
        );
      }
      return Promise.resolve(Response.json(MOCK_AIR));
    });

    const { container } = render(<App />);
    // Verify nothing steals focus on initial mount and the very first Tab hits the skip link
    expect(document.activeElement).toBe(document.body);
    await user.tab();
    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skipLink).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Change city: New Delhi/i })).toHaveFocus();

    const liveStatus = screen.getByRole('status', { name: 'Air quality status updates' });
    expect(liveStatus).toHaveAttribute('aria-live', 'polite');

    await waitFor(() => {
      expect(liveStatus).toHaveTextContent(
        /New Delhi air quality loaded: CPCB NAQI 335, Very Poor/i
      );
    });

    expect(skipLink).toHaveAttribute('href', '#main-content');
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Location and refresh controls' })
    ).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const levels = Array.from(container.querySelectorAll('h1, h2, h3, h4')).map((h) =>
      Number(h.tagName.slice(1))
    );
    expect(levels.every((lvl, i) => i === 0 || lvl <= (levels[i - 1] ?? 1) + 1)).toBe(true);

    // Full ARIA tablist roving tabindex + Left/Right/Home/End keyboard navigation
    const tablist = screen.getByRole('tablist', { name: 'Air quality tools' });
    const tabs = within(tablist).getAllByRole('tab');
    const [planTab, impactTab, playbookTab] = tabs;
    if (!planTab || !impactTab || !playbookTab) throw new Error('Expected 3 workspace tabs');
    expect(planTab).toHaveAttribute('tabindex', '0');
    expect(impactTab).toHaveAttribute('tabindex', '-1');
    expect(playbookTab).toHaveAttribute('tabindex', '-1');

    act(() => {
      planTab.focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(impactTab).toHaveFocus();
    expect(impactTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Impact Lab' })).toHaveAttribute(
      'aria-labelledby',
      impactTab.id
    );
    await user.keyboard('{ArrowLeft}');
    expect(planTab).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(playbookTab).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(planTab).toHaveFocus();
    await user.keyboard('{End}');
    expect(playbookTab).toHaveFocus();
    await user.keyboard('{Home}');
    expect(planTab).toHaveFocus();

    // Trigger an in-flight plan, switch city before it settles, then verify Mumbai telemetry updates
    await user.click(screen.getByRole('button', { name: 'Generate AI Routine' }));
    await user.click(screen.getByRole('button', { name: /Change city: New Delhi/i }));
    await user.click(screen.getByRole('button', { name: 'Mumbai' }));
    resolvePendingPlan?.(new Response('late', { status: 500 }));

    await waitFor(() => {
      expect(liveStatus).toHaveTextContent(/Mumbai air quality loaded: CPCB NAQI 180, Moderate/i);
    });
    expect(screen.getByText(/Bandra Kurla Reference · CPCB/)).toBeInTheDocument();

    const callCountAfterMumbai = fetchSpy.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /Change city: Mumbai/i }));
    await user.click(screen.getByRole('button', { name: 'Mumbai' }));
    expect(fetchSpy.mock.calls.length).toBe(callCountAfterMumbai);

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);

    act(() => {
      main.focus();
    });
    expect(main).toHaveFocus();
  });
});
