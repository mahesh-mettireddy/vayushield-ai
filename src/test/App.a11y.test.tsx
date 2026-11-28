import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { AirQualityPayload } from '../types/airQuality';

const MOCK_AIR_PAYLOAD: AirQualityPayload = {
  location: { name: 'New Delhi', region: 'Delhi NCR', country: 'India', lat: 28.6139, lon: 77.209 },
  fetchedAt: '2026-11-24T12:00:00.000Z',
  source: 'Open-Meteo Air Quality API (CC BY 4.0)',
  current: { pm25: 165, pm10: 270, no2: 52, so2: 14, o3: 48, coUgM3: 1100 },
  cpcb: {
    aqi: 335,
    category: 'Very Poor',
    dominantPollutant: 'pm25',
    subIndices: { pm25: 335, pm10: 221, no2: 66, so2: 18, o3: 48, co: 56 },
    advisory: 'Respiratory illness risk on prolonged exposure.',
    badgeClass: 'bg-red-100 text-red-950 border-red-300',
    accentHex: '#dc2626'
  },
  hourly: [
    { time: '2026-11-24T12:00', hourLabel: '12 PM', pm25: 140, pm10: 220, aqi: 316 },
    { time: '2026-11-24T13:00', hourLabel: '1 PM', pm25: 95, pm10: 170, aqi: 218 },
    { time: '2026-11-24T14:00', hourLabel: '2 PM', pm25: 85, pm10: 150, aqi: 184 },
    { time: '2026-11-24T15:00', hourLabel: '3 PM', pm25: 190, pm10: 295, aqi: 354 }
  ],
  windowAnalysis: {
    bestWindow: {
      startLabel: '1 PM',
      endLabel: '3 PM',
      avgPm25: 90,
      avgAqi: 201,
      advice: 'Lowest smog trough of the next 24h.'
    },
    worstWindow: {
      startLabel: '2 PM',
      endLabel: '4 PM',
      avgPm25: 137.5,
      avgAqi: 269,
      advice: 'Keep windows closed during the peak and wear a well-fitted N95 if heading outside.'
    },
    exposureSavingsPct: 35
  },
  groundStation: null
};

describe('App Integration & WCAG Accessibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom has no canvas. The browser smoke check runs axe against real canvas and CSS.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/air-quality')) {
        return new Response(JSON.stringify(MOCK_AIR_PAYLOAD), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('fallback', { status: 500 });
    });
  });

  it('renders telemetry, generates a grounded routine plan, and has zero axe accessibility violations', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText('335')).toBeInTheDocument();
    });
    const gauge = screen.getByRole('img', { name: 'CPCB NAQI gauge, 335 out of 500, Very Poor' });
    expect(gauge).toBeVisible();
    expect(gauge.querySelector('.gauge-stroke')).toHaveAttribute('pathLength', '100');
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Copy Family Alert' }));
    expect(await screen.findByText('Copied!')).toHaveAttribute('aria-live', 'polite');
    expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('CPCB NAQI: 335/500 (Very Poor)'));
    const chart = screen.getByRole('group', { name: 'Hourly NAQI chart' });
    const bars = within(chart).getAllByRole('button');
    const readout = screen.getByRole('status', { name: 'Selected forecast hour' });
    expect(bars).toHaveLength(4);
    await user.hover(bars[2]!);
    expect(readout).toHaveTextContent('2 PM');
    expect(readout).toHaveTextContent('NAQI 184');
    expect(readout).toHaveTextContent('PM2.5 85');
    expect(readout).toHaveTextContent('PM10 150');
    expect(readout).toHaveTextContent(/sensitive groups/i);
    await user.unhover(bars[2]!);
    expect(readout).toHaveTextContent('12 PM');
    bars[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(bars[1]).toHaveFocus();
    expect(bars[1]).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{End}');
    expect(bars[3]).toHaveFocus();
    expect(readout).toHaveTextContent('NAQI 354');
    await user.click(bars[2]!);
    expect(bars[2]).toHaveAttribute('aria-pressed', 'true');

    const tablist = screen.getByRole('tablist', { name: 'Air quality tools' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['AI Daily Plan', 'Impact Lab', 'Playbook & Local HF']);
    const [planTab, impactTab, playbookTab] = tabs;
    expect(planTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'AI Daily Plan' })).toBeVisible();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);

    const generateBtn = screen.getByRole('button', { name: 'Generate AI Routine' });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/today’s low-emission schedule/i)).toBeInTheDocument();
    });

    // Color contrast requires a browser that renders CSS and supports canvas.
    const checkAccessibility = async () => {
      const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
      expect(results.violations).toEqual([]);
    };
    await checkAccessibility();
    planTab!.focus();
    await user.keyboard('{ArrowRight}');
    expect(impactTab).toHaveFocus();
    expect(impactTab).toHaveAttribute('aria-selected', 'true');
    const impact = screen.getByRole('tabpanel', { name: 'Impact Lab' });
    expect(within(impact).getAllByRole('switch')).toHaveLength(6);
    await user.click(within(impact).getByRole('switch', { name: /Zero-Smoke Home/i }));
    expect(within(impact).getByText('85% less')).toBeVisible();
    expect(within(impact).getByText(/trees\/year/i)).toBeVisible();
    const community = screen.getByRole('region', { name: 'Community Scale' });
    const householdSlider = within(community).getByRole('slider', { name: 'Households' });
    expect(householdSlider).toHaveValue('1');
    await user.click(within(community).getByRole('button', { name: '25 Flats' }));
    expect(householdSlider).toHaveValue('25');
    expect(within(community).getByText('17.875')).toBeVisible();
    expect(within(community).getByText('851.2')).toBeVisible();
    fireEvent.change(householdSlider, { target: { value: '200' } });
    expect(householdSlider).toHaveAttribute('aria-valuetext', '200 households');
    expect(within(community).getByText('143')).toBeVisible();

    const roomSimulator = screen.getByRole('region', { name: 'Bedroom Time-to-Clean Simulator' });
    const curveChart = within(roomSimulator).getByRole('img', { name: /Bedroom PM2\.5 decay chart/i });
    expect(curveChart).toBeVisible();
    await user.click(within(roomSimulator).getByRole('button', { name: 'Small Bedroom' }));
    expect(within(roomSimulator).getByRole('button', { name: 'Small Bedroom' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(roomSimulator).getByRole('button', { name: 'True HEPA Purifier' }));
    expect(within(roomSimulator).getByRole('button', { name: 'True HEPA Purifier' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(roomSimulator).getByText(/Start your True HEPA Purifier/i)).toBeVisible();
    await user.click(within(roomSimulator).getByRole('button', { name: 'Windows Sealed Only' }));
    expect(within(roomSimulator).getByText(/Sealed windows alone cannot reach 30 µg\/m³/i)).toBeVisible();
    await checkAccessibility();

    impactTab!.focus();
    await user.keyboard('{End}');
    expect(playbookTab).toHaveFocus();
    await user.type(screen.getByRole('searchbox', { name: 'Search the playbook' }), 'quasar');
    expect(within(screen.getByRole('tabpanel', { name: 'Playbook & Local HF' })).getByRole('status'))
      .toHaveTextContent('No exact keyword matches');
    expect(screen.getByRole('button', { name: 'Local HF Semantic Match (WASM)' })).toBeEnabled();
    await checkAccessibility();
    playbookTab!.focus();
    await user.keyboard('{ArrowRight}');
    expect(planTab).toHaveFocus();
    expect(screen.getByText(/today’s low-emission schedule/i)).toBeVisible();
  });

  it('offers a labeled manual copy field when clipboard access is denied', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Clipboard access denied'));
    const { container } = render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Copy Family Alert' }));
    expect(await screen.findByText('Select and copy the alert text below.')).toHaveAttribute('aria-live', 'polite');
    const field = screen.getByRole('textbox', { name: 'Family alert text' });
    expect(field).toHaveProperty('readOnly', true);
    expect((field as HTMLTextAreaElement).value).toContain('VayuShield AI family alert — New Delhi');
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
