import { useState, type FormEvent } from 'react';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { PRESET_CITIES } from '../data/presets';
import { searchLocations } from '../services/airQualityClient';
import type { LocationOption } from '../types/airQuality';

interface LocationBarProps {
  selected: LocationOption;
  loading: boolean;
  onSelect: (loc: LocationOption) => void;
}

export function LocationBar({ selected, loading, onSelect }: LocationBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setGeoError(null);
    try {
      const found = await searchLocations(query);
      setResults(found);
      if (found.length === 0) {
        setGeoError(`No cities matched "${query.trim()}". Try another city name.`);
      }
    } catch {
      setGeoError('City search temporarily unavailable. Select a preset city below.');
    } finally {
      setSearching(false);
    }
  }

  function handleUseMyLocation() {
    if (!('geolocation' in navigator)) {
      setGeoError('Browser geolocation is not supported on this device.');
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSelect({
          name: 'My Current Location',
          region: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
          country: '',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        });
        setResults([]);
      },
      () => {
        setGeoError('Location permission denied. Search for your city or pick a preset below.');
      },
      { timeout: 8000 }
    );
  }

  return (
    <section
      aria-labelledby="location-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="location-heading" className="text-base font-semibold text-slate-900">
            Choose Your City or Neighborhood
          </h2>
          <p className="text-sm text-slate-600">
            Live hourly telemetry powered by Open-Meteo Air Quality &amp; India CPCB NAQI thresholds.
          </p>
        </div>

        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60"
        >
          <LocateFixed className="h-4 w-4 text-sky-700" aria-hidden="true" />
          Use My Location
        </button>
      </div>

      <form onSubmit={handleSearch} className="mt-4 flex flex-col gap-2 sm:flex-row" role="search">
        <label htmlFor="city-search-input" className="sr-only">
          Search city name
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="city-search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any city (e.g., Gurugram, Pune, Patna, Lahore, Beijing)..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600"
          />
        </div>
        <button
          type="submit"
          disabled={searching || query.trim().length < 2}
          className="rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {geoError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {geoError}
        </p>
      )}

      {results.length > 0 && (
        <ul
          aria-label="Matching cities"
          className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50"
        >
          {results.map((item) => (
            <li key={`${item.name}-${item.lat}-${item.lon}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  setResults([]);
                  setQuery('');
                }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-sky-50"
              >
                <span className="font-medium text-slate-900">
                  {item.name}
                  {item.region ? `, ${item.region}` : ''}
                  {item.country ? ` (${item.country})` : ''}
                </span>
                <span className="text-xs text-slate-500">
                  {item.lat.toFixed(2)}, {item.lon.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Quick city presets">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Quick select:
        </span>
        {PRESET_CITIES.map((city) => {
          const isActive = city.name === selected.name;
          return (
            <button
              key={city.name}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setResults([]);
                onSelect(city);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? 'border-sky-700 bg-sky-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {city.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
