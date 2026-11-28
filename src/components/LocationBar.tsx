import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, LocateFixed, MapPin, Search } from 'lucide-react';
import { PRESET_CITIES } from '../data/presets';
import { searchLocations } from '../services/airQualityClient';
import type { LocationOption } from '../types/airQuality';

interface LocationBarProps {
  selected: LocationOption;
  onSelect: (loc: LocationOption) => void;
}

const GEOLOCATION_TIMEOUT_MS = 8_000;
const MIN_SEARCH_QUERY_LEN = 2;

/** Accessible city selector popover supporting presets, Open-Meteo geocoding search, and geolocation. */
export function LocationBar({ selected, onSelect }: LocationBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState('');
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const citySearch = useRef<HTMLInputElement>(null);
  const geolocationRequest = useRef(0);
  const searchController = useRef<AbortController | null>(null);

  const closePopover = useCallback((restoreTriggerFocus: boolean) => {
    setOpen(false);
    geolocationRequest.current += 1;
    searchController.current?.abort();
    searchController.current = null;
    setNotice('');
    if (restoreTriggerFocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      searchController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    citySearch.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closePopover(true);
    };
    const onOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !picker.current?.contains(event.target))
        closePopover(false);
    };
    document.addEventListener('keydown', onEscape);
    document.addEventListener('pointerdown', onOutsidePointer);
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('pointerdown', onOutsidePointer);
    };
  }, [open, closePopover]);

  function choose(city: LocationOption) {
    onSelect(city);
    setQuery('');
    setResults([]);
    closePopover(true);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    if (clean.length < MIN_SEARCH_QUERY_LEN) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setNotice('');
    setSearching(true);
    setResults([]);
    try {
      const found = await searchLocations(clean, controller.signal);
      if (!controller.signal.aborted) {
        setResults(found);
        if (!found.length) setNotice('No cities found. Try a different spelling.');
      }
    } catch {
      if (!controller.signal.aborted) {
        setNotice('City search is unavailable. Choose a nearby preset.');
      }
    } finally {
      if (searchController.current === controller) {
        searchController.current = null;
        setSearching(false);
      }
    }
  }

  function useLocation() {
    if (!navigator.geolocation) {
      setNotice('This browser does not support geolocation.');
      return;
    }
    const request = ++geolocationRequest.current;
    setNotice('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request === geolocationRequest.current) {
          choose({
            name: 'My location',
            region: '',
            country: '',
            lat: coords.latitude,
            lon: coords.longitude
          });
        }
      },
      () => {
        if (request === geolocationRequest.current)
          setNotice('Location is unavailable. Search or choose a city.');
      },
      { timeout: GEOLOCATION_TIMEOUT_MS }
    );
  }

  return (
    <div
      ref={picker}
      className="city-picker"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          closePopover(false);
      }}
    >
      <button
        ref={trigger}
        className="city-trigger"
        type="button"
        aria-expanded={open}
        aria-label={'Change city: ' + selected.name}
        aria-controls="city-picker-options"
        onClick={() => (open ? closePopover(false) : setOpen(true))}
      >
        <MapPin size={17} aria-hidden="true" />
        <span>{selected.name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <div
        className="city-options"
        id="city-picker-options"
        role="region"
        aria-label="City selector"
        aria-busy={searching}
        hidden={!open}
      >
        <form role="search" aria-label="City search" className="inline-form" onSubmit={search}>
          <label className="sr-only" htmlFor="city-search">
            Search for a city
          </label>
          <input
            id="city-search"
            ref={citySearch}
            type="search"
            value={query}
            maxLength={80}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a city"
          />
          <button
            type="submit"
            className="button-secondary"
            disabled={searching || query.trim().length < 2}
          >
            <Search size={16} aria-hidden="true" /> Search
          </button>
        </form>
        {searching && (
          <p className="field-feedback" role="status">
            Searching…
          </p>
        )}
        {notice && (
          <p className="field-feedback" role="status">
            {notice}
          </p>
        )}
        {results.length > 0 && (
          <ul className="city-results" aria-label="Search results">
            {results.map((city) => (
              <li key={city.name + city.lat + city.lon}>
                <button type="button" onClick={() => choose(city)}>
                  <strong>{city.name}</strong>
                  <span>{[city.region, city.country].filter(Boolean).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="city-presets" role="group" aria-label="Quick city presets">
          {PRESET_CITIES.map((city) => (
            <button
              key={city.name}
              type="button"
              className="pill"
              aria-pressed={city.name === selected.name}
              onClick={() => choose(city)}
            >
              {city.name}
            </button>
          ))}
        </div>
        <button className="location-action" type="button" onClick={useLocation}>
          <LocateFixed size={17} aria-hidden="true" /> Use My Location
        </button>
      </div>
    </div>
  );
}
