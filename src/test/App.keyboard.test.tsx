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

describe('Keyboard Navigation, Disclosures & RoomClean SVG Semantics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/api/air-quality')) {
        return new Response(JSON.stringify(MOCK_AIR), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('fallback', { status: 500 });
    });
  });

  it('supports Tab, Enter, and Escape keyboard navigation on city picker and disclosure triggers', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText('335')).toBeInTheDocument();
    });

    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    await user.tab();
    expect(skipLink).toHaveFocus();

    const cityTrigger = screen.getByRole('button', { name: /Change city: New Delhi/i });
    expect(cityTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(cityTrigger).toHaveAttribute('aria-controls', 'city-picker-options');

    await user.tab();
    expect(cityTrigger).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(cityTrigger).toHaveAttribute('aria-expanded', 'true');
    const searchInput = screen.getByRole('searchbox', { name: 'Search for a city' });
    expect(searchInput).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(cityTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(cityTrigger).toHaveFocus();

    await user.keyboard('{Enter}');
    const mumbaiPreset = screen.getByRole('button', { name: 'Mumbai' });
    act(() => {
      mumbaiPreset.focus();
    });
    await user.keyboard('{Enter}');
    expect(cityTrigger).toHaveAttribute('aria-label', 'Change city: Mumbai');
    await waitFor(() => {
      expect(screen.getByText('335')).toBeInTheDocument();
    });

    const sensorTrigger = screen.getByRole('button', { name: /6 Pollutants & Sensor Details/i });
    expect(sensorTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(sensorTrigger.getAttribute('aria-controls')).toBeTruthy();
    act(() => {
      sensorTrigger.focus();
    });
    await user.keyboard('{Enter}');
    expect(sensorTrigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Generate AI Routine' }));
    await waitFor(() => {
      expect(screen.getByText(/today’s low-emission schedule/i)).toBeInTheDocument();
    });

    const hacksBtn = screen.getByRole('button', { name: /Indoor air hacks/i });
    const swapsBtn = screen.getByRole('button', { name: /Sustainable swaps/i });
    expect(hacksBtn).toHaveAttribute('aria-expanded', 'false');
    expect(swapsBtn).toHaveAttribute('aria-expanded', 'false');
    await user.click(hacksBtn);
    await user.click(swapsBtn);
    expect(hacksBtn).toHaveAttribute('aria-expanded', 'true');
    expect(swapsBtn).toHaveAttribute('aria-expanded', 'true');

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('renders RoomCleanCurve SVG with accessible title/desc and continuous curve across presets', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText('335')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: 'Impact Lab' }));

    const roomSimulator = screen.getByRole('region', { name: 'Bedroom Time-to-Clean Simulator' });
    const curveChart = within(roomSimulator).getByRole('img', {
      name: /Bedroom PM2\.5 decay chart/i
    });
    expect(curveChart.tagName.toLowerCase()).toBe('svg');
    expect(curveChart).toHaveAttribute(
      'aria-labelledby',
      'room-clean-curve-title room-clean-curve-desc'
    );
    expect(curveChart.parentElement).not.toHaveAttribute('role');
    expect(curveChart.querySelector('#room-clean-curve-title')?.textContent).toContain(
      'Bedroom PM2.5 decay chart'
    );
    expect(curveChart.querySelector('#room-clean-curve-desc')?.textContent).toContain('CPCB Good');

    const assertContinuousCurve = () => {
      const line = curveChart.querySelector('.room-curve-line');
      expect(line).not.toBeNull();
      expect(line).not.toHaveAttribute('pathLength');
      expect(line).not.toHaveAttribute('stroke-dasharray');
      const d = line?.getAttribute('d') ?? '';
      expect(d).toMatch(/^M 52\.0 \d+\.\d+ .* L 616\.0 \d+\.\d+$/);
      expect(curveChart.querySelectorAll('.room-sample-dot')).toHaveLength(13);
    };

    assertContinuousCurve();
    await user.click(within(roomSimulator).getByRole('button', { name: 'Small Bedroom' }));
    assertContinuousCurve();
    await user.click(within(roomSimulator).getByRole('button', { name: 'True HEPA Purifier' }));
    expect(within(roomSimulator).getByText(/Start your True HEPA Purifier/i)).toBeVisible();
    assertContinuousCurve();
    await user.click(within(roomSimulator).getByRole('button', { name: 'Living Room' }));
    assertContinuousCurve();
    await user.click(within(roomSimulator).getByRole('button', { name: 'Windows Sealed Only' }));
    expect(
      within(roomSimulator).getByText(/Sealed windows alone cannot reach 30 µg\/m³/i)
    ).toBeVisible();
    assertContinuousCurve();

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('displays error alert when air telemetry fails and recovers on refresh', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Live readings couldn’t load/i);

    fetchSpy.mockImplementation(async (input) => {
      if (String(input).includes('/api/air-quality')) {
        return new Response(JSON.stringify(MOCK_AIR), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('fallback', { status: 500 });
    });

    await user.click(screen.getByRole('button', { name: 'Refresh air quality' }));
    await waitFor(() => {
      expect(screen.getByText('335')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
