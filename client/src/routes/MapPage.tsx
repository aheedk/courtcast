import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import { useSport } from '../stores/sport';
import { useGeolocation } from '../hooks/useGeolocation';
import { MapView } from '../components/MapView';
import { CourtPanel } from '../components/CourtPanel';
import { SearchBar } from '../components/SearchBar';
import { SportChips } from '../components/SportChips';
import { AddSpotFab } from '../components/AddSpotFab';
import { AddSpotSheet } from '../components/AddSpotSheet';
import { MapLegend } from '../components/MapLegend';
import type { User, Court } from '../types';

export function MapPage({ user }: { user: User | null }) {
  const { position: geoPosition, source } = useGeolocation();
  const { selectedPlaceId, selectCourt } = useUi();
  const [sport, setSport] = useSport();

  // Map center can be overridden by Place selections; defaults to geo.
  const [center, setCenter] = useState(geoPosition);
  useEffect(() => {
    setCenter(geoPosition);
  }, [geoPosition.lat, geoPosition.lng]);

  const [keyword, setKeyword] = useState<string>('');
  const [addMode, setAddMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null);

  // Custom mode with no keyword → don't auto-fetch. The user is
  // expected to either type a keyword in search, drop a custom pin,
  // or rely on their already-saved custom courts (rendered separately
  // via customCourts).
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

  // Custom courts owned by the current user — pulled from the saved list.
  const customCourts: Court[] =
    saved.data?.courts
      .filter((c) => c.isCustom)
      .map((c) => ({
        placeId: c.placeId,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        address: c.address,
        isCustom: true,
        addedByUserId: c.addedByUserId,
      })) ?? [];

  return (
    <div className="relative h-[calc(100vh-3.5rem)]">
      {/* Overlays */}
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
          <SportChips value={sport} onChange={setSport} />
        </div>
      </div>

      {addMode && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 bg-neutral-900 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-md">
          Tap the map to drop a pin
        </div>
      )}

      <MapView
        center={center}
        courts={courts.data?.courts ?? []}
        customCourts={customCourts}
        selectedPlaceId={selectedPlaceId}
        onSelect={selectCourt}
        addMode={addMode}
        pendingPin={pendingPin}
        onMapClick={(loc) => setPendingPin(loc)}
      />

      {!!user && customCourts.length > 0 && <MapLegend />}

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

      {courts.data && courts.data.courts.length === 0 && !courts.isLoading && !customEmpty && (
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
