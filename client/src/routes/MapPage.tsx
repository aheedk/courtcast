import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import { useSport } from '../stores/sport';
import { useGeolocation } from '../hooks/useGeolocation';
import { useThresholds } from '../stores/thresholds';
import { useEnabledSports } from '../stores/enabledSports';
import { scoreFromThresholds } from '../lib/playability';
import { MapView, type PinForMap } from '../components/MapView';
import { CourtPanel } from '../components/CourtPanel';
import { SearchBar } from '../components/SearchBar';
import { SportChips } from '../components/SportChips';
import { AddSpotFab } from '../components/AddSpotFab';
import { AddSpotSheet } from '../components/AddSpotSheet';
import { MapLegend } from '../components/MapLegend';
import type { User } from '../types';

export function MapPage({ user }: { user: User | null }) {
  const { position: geoPosition, source } = useGeolocation();
  const { selectedPlaceId, selectCourt } = useUi();
  const [sport, setSport] = useSport();
  const [thresholds] = useThresholds();
  const [enabledSports] = useEnabledSports();

  const [center, setCenter] = useState(geoPosition);
  useEffect(() => {
    setCenter(geoPosition);
  }, [geoPosition.lat, geoPosition.lng]);

  const [keyword, setKeyword] = useState<string>('');
  const [addMode, setAddMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null);

  const customEmpty = sport === 'custom' && !keyword.trim();

  const courts = useQuery({
    queryKey: queryKeys.nearbyCourts(center.lat, center.lng, sport, keyword),
    queryFn: () => api.nearbyCourts(center.lat, center.lng, sport, keyword || undefined),
    staleTime: 60 * 60 * 1000,
    enabled: !customEmpty,
  });

  const saved = useQuery({
    queryKey: queryKeys.savedCourts,
    queryFn: api.savedCourts,
    enabled: !!user,
  });

  // Build the unified pin set, sport-scoped:
  //   1) Places-discovered courts at the current map center
  //   2) Plus any of the user's saved-for-current-sport courts not in 1
  // Each pin carries a score (from saved entry if available, else from
  // the Places hydration) and a flag for star-vs-circle rendering.
  const savedForSport = (saved.data?.courts ?? []).filter((c) => c.sport === sport);
  const placesPins = courts.data?.courts ?? [];
  const savedById = new Map(savedForSport.map((s) => [s.placeId, s]));

  const pins: PinForMap[] = [
    ...placesPins.map((c) => {
      const s = savedById.get(c.placeId);
      const w = s?.weather ?? c.weather ?? null;
      return {
        placeId: c.placeId,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        score: w
          ? scoreFromThresholds(w, thresholds)
          : (s?.score ?? c.score ?? null),
        isSavedForSport: !!s,
      };
    }),
    ...savedForSport
      .filter((s) => !placesPins.some((p) => p.placeId === s.placeId))
      .map((s) => ({
        placeId: s.placeId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        score: s.weather
          ? scoreFromThresholds(s.weather, thresholds)
          : (s.score ?? null),
        isSavedForSport: true,
      })),
  ];

  return (
    <div className="relative h-[calc(100dvh-3.5rem)]">
      <div className="absolute top-3 left-0 right-0 z-20 flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto">
          <SearchBar
            onPlaceSelected={(loc) => {
              setCenter({ lat: loc.lat, lng: loc.lng });
              setKeyword('');
            }}
            onKeywordChange={(k) => setKeyword(k)}
          />
        </div>
        <div className="pointer-events-auto">
          <SportChips value={sport} onChange={setSport} sports={enabledSports} />
        </div>
      </div>

      {addMode && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 bg-neutral-900 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-md">
          Tap the map to drop a pin
        </div>
      )}

      <MapView
        center={center}
        pins={pins}
        selectedPlaceId={selectedPlaceId}
        onSelect={selectCourt}
        addMode={addMode}
        pendingPin={pendingPin}
        onMapClick={(loc) => setPendingPin(loc)}
      />

      {!!user && <MapLegend />}

      {source === 'default' && !addMode && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-10 bg-white shadow-md border border-neutral-200 rounded-full px-4 py-1 text-[11px] text-neutral-600">
          Default location — enable location for nearby courts
        </div>
      )}

      {customEmpty && !addMode && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-10 bg-white shadow-md border border-neutral-200 rounded-full px-4 py-1 text-[11px] text-neutral-600">
          Custom mode — search a place or use + Add a spot
        </div>
      )}

      {courts.isError && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-white shadow-md rounded-full px-4 py-1.5 text-sm text-bad">
          Couldn't fetch courts. Try again.
        </div>
      )}

      {!courts.isLoading && !customEmpty && pins.length === 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-white shadow-md rounded-full px-4 py-1.5 text-sm text-neutral-600">
          No {sport} courts found here. Try another spot or sport.
        </div>
      )}

      <AddSpotFab
        active={addMode}
        authed={!!user}
        onActivate={() => {
          setAddMode(true);
          setPendingPin(null);
        }}
        onCancel={() => {
          setAddMode(false);
          setPendingPin(null);
        }}
      />

      {pendingPin && addMode && (
        <AddSpotSheet
          pin={pendingPin}
          sport={sport}
          onClose={() => setPendingPin(null)}
          onSaved={() => {
            setPendingPin(null);
            setAddMode(false);
          }}
        />
      )}

      {selectedPlaceId && !addMode && (
        <CourtPanel placeId={selectedPlaceId} user={user} onClose={() => selectCourt(null)} />
      )}
    </div>
  );
}
