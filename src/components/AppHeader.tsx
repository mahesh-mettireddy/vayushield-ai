import { RefreshCw } from 'lucide-react';
import type { LocationOption } from '../types/airQuality';
import { LocationBar } from './LocationBar';

interface AppHeaderProps {
  selected: LocationOption;
  airLoading: boolean;
  onSelectCity: (city: LocationOption) => void;
  onRefresh: () => void;
}

/** Top navigation banner containing brand identity, city picker, and telemetry refresh action. */
export function AppHeader({ selected, airLoading, onSelectCity, onRefresh }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="page-width header-inner">
        <div className="brand">
          <span className="brand-mark">
            <svg
              viewBox="0 0 32 32"
              width="27"
              height="27"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.55"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M16 3.4c3.2 2.1 6.6 3.3 10 3.8v8.2c0 6.1-4.7 10.7-10 13.2-5.3-2.5-10-7.1-10-13.2V7.2c3.4-.5 6.8-1.7 10-3.8Z" />
              <path d="M9.5 13.1h9a1.7 1.7 0 1 0-1.7-1.7M8.8 16.5h13M10 20h7a1.6 1.6 0 1 1-1.6 1.6" />
            </svg>
          </span>
          <div>
            <h1>VayuShield AI</h1>
            <p>Urban air quality assistant</p>
          </div>
        </div>
        <nav className="header-controls" aria-label="Location and refresh controls">
          <LocationBar selected={selected} onSelect={onSelectCity} />
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh air quality"
            title="Refresh air quality"
            onClick={onRefresh}
            disabled={airLoading}
          >
            <RefreshCw
              size={17}
              aria-hidden="true"
              className={airLoading ? 'animate-spin' : undefined}
            />
          </button>
        </nav>
      </div>
    </header>
  );
}

/** Attribution footer citing Open-Meteo, OpenAQ, and India CPCB NAQI thresholds. */
export function AppFooter() {
  return (
    <footer className="page-width app-footer">
      <p>
        VayuShield AI · Data powered by{' '}
        <a href="https://open-meteo.com/en/docs/air-quality-api">
          Open-Meteo Air Quality API (CC BY 4.0)
        </a>
        , <a href="https://openaq.org/">OpenAQ</a>, and{' '}
        <a href="https://www.pib.gov.in/newsite/printrelease.aspx?relid=110654">India CPCB NAQI</a>.
      </p>
      <p>Forecasts and impact estimates are for general information.</p>
    </footer>
  );
}
