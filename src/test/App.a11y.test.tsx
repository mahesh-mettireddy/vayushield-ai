import { render, screen, waitFor } from '@testing-library/react';
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
      avgAqi: 269
    },
    exposureSavingsPct: 35
  },
  groundStation: null
};

describe('App Integration & WCAG Accessibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

    const generateBtn = screen.getByRole('button', { name: /generate ai routine/i });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/today's low-emission schedule/i)).toBeInTheDocument();
    });

    // Color contrast requires a browser that renders CSS and supports canvas.
    const a11yResults = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(a11yResults.violations).toEqual([]);
  });
});
