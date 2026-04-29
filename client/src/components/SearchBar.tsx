import { useEffect, useRef, useState } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { env } from '../lib/env';

const PLACES_LIBS: ('places')[] = ['places'];

type Mode = 'place' | 'keyword';

interface Props {
  onPlaceSelected: (location: { lat: number; lng: number; name: string }) => void;
  onKeywordChange: (keyword: string) => void;
  initialKeyword?: string;
}

interface Suggestion {
  description: string;
  placeId: string;
}

export function SearchBar({ onPlaceSelected, onKeywordChange, initialKeyword = '' }: Props) {
  const [mode, setMode] = useState<Mode>('place');
  const [text, setText] = useState(initialKeyword);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Share the same loader instance MapView uses (id is the cache key).
  // Without this, SearchBar's init effect ran once on mount before the
  // Maps API had finished loading and never retried, so Place autocomplete
  // silently did nothing — surfaced when location was denied because users
  // immediately started typing instead of looking at pins first.
  const { isLoaded } = useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: env.googleMapsKey,
    libraries: PLACES_LIBS,
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (!autocompleteRef.current) {
      autocompleteRef.current = new google.maps.places.AutocompleteService();
    }
    if (!placesServiceRef.current) {
      placesServiceRef.current = new google.maps.places.PlacesService(document.createElement('div'));
    }
  }, [isLoaded]);

  useEffect(() => {
    if (mode !== 'place') {
      setSuggestions([]);
      return;
    }
    if (!text.trim() || !autocompleteRef.current) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      autocompleteRef.current!.getPlacePredictions(
        { input: text, types: ['geocode'] },
        (predictions, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setSuggestions([]);
            return;
          }
          setSuggestions(
            predictions.slice(0, 5).map((p) => ({
              description: p.description,
              placeId: p.place_id,
            })),
          );
        },
      );
    }, 250);
  }, [text, mode]);

  const submitKeyword = () => {
    onKeywordChange(text.trim());
    setSuggestions([]);
  };

  const pickSuggestion = (s: Suggestion) => {
    if (!placesServiceRef.current) return;
    placesServiceRef.current.getDetails(
      { placeId: s.placeId, fields: ['geometry.location', 'name'] },
      (place, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          return;
        }
        const loc = place.geometry.location;
        onPlaceSelected({
          lat: loc.lat(),
          lng: loc.lng(),
          name: place.name ?? s.description,
        });
        setSuggestions([]);
        setText(s.description);
      },
    );
  };

  return (
    <div className="relative w-[88%] max-w-[480px] mx-auto">
      <div className="flex items-center gap-2 bg-white rounded-full shadow-md px-4 py-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && mode === 'keyword') submitKeyword();
          }}
          placeholder={mode === 'place' ? 'Search a city or address…' : 'Filter by keyword (public, indoor…)'}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400 min-w-0"
        />
        <div className="flex bg-neutral-100 rounded-full p-0.5 text-xs font-semibold shrink-0">
          <button
            onClick={() => setMode('place')}
            className={mode === 'place' ? 'bg-white text-neutral-900 px-2.5 py-1 rounded-full' : 'text-neutral-500 px-2.5 py-1'}
          >
            Place
          </button>
          <button
            onClick={() => setMode('keyword')}
            className={mode === 'keyword' ? 'bg-white text-neutral-900 px-2.5 py-1 rounded-full' : 'text-neutral-500 px-2.5 py-1'}
          >
            Keyword
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                onClick={() => pickSuggestion(s)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0"
              >
                {s.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
