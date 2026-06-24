import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import { useSport } from '../stores/sport';
import { useGeolocation } from '../hooks/useGeolocation';
import { useThresholds } from '../stores/thresholds';
import { useEnabledSports } from '../stores/enabledSports';
import { useSelectedTime } from '../stores/selectedTime';
import { slotAt, rainPctOverWindow, SLIDER_STEP_HOURS } from '../lib/forecast';
import { scoreFromThresholds } from '../lib/playability';
import { MapView, type MapViewport, type PinForMap } from '../components/MapView';
import { CourtPanel } from '../components/CourtPanel';
import { SearchBar } from '../components/SearchBar';
import { SportChips } from '../components/SportChips';
import { AddSpotFab } from '../components/AddSpotFab';
import { AddSpotSheet } from '../components/AddSpotSheet';
import { MapLegend } from '../components/MapLegend';
import { TimeScrubber } from '../components/TimeScrubber';
import { LocateMeButton } from '../components/LocateMeButton';
import type { User } from '../types';

const MIN_REFRESH_ZOOM = 11;
const MIN_REFRESH_RADIUS_METERS = 4_000;
const MAX_REFRESH_RADIUS_METERS = 45_000;

function clampRadius(radiusMeters: number | null): number | undefined {
  if (radiusMeters === null) return undefined;
  return Math.max(
    MIN_REFRESH_RADIUS_METERS,
    Math.min(MAX_REFRESH_RADIUS_METERS, radiusMeters),
  );
}

function zoomForRefresh(viewport: MapViewport): number {
  const zoomForMin = Math.max(viewport.zoom, MIN_REFRESH_ZOOM);
  if (viewport.radiusMeters === null || viewport.radiusMeters <= MAX_REFRESH_RADIUS_METERS) {
    return zoomForMin;
  }

  const zoomIncrease = Math.ceil(
    Math.log2(viewport.radiusMeters / MAX_REFRESH_RADIUS_METERS),
  );
  return Math.ceil(Math.max(zoomForMin, viewport.zoom + zoomIncrease));
}

export function MapPage({ user }: { user: User | null }) {
  const { position: geoPosition, source } = useGeolocation();
  const { selectedPlaceId, selectCourt } = useUi();
  const [sport, setSport] = useSport();
  const [thresholds] = useThresholds(sport);
  const [enabledSports] = useEnabledSports();

  const [center, setCenter] = useState(geoPosition);
  useEffect(() => {
    setCenter(geoPosition);
  }, [geoPosition.lat, geoPosition.lng]);

  const [keyword, setKeyword] = useState<string>('');
  const [addMode, setAddMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null);
  const [searchRadius, setSearchRadius] = useState<number | undefined>(undefined);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [zoomRequest, setZoomRequest] = useState<{ id: number; zoom: number; center: { lat: number; lng: number } } | null>(null);
  const [refreshAfterZoom, setRefreshAfterZoom] = useState(false);
  // Captured GPS position from the locate-me button. Re-set on each tap;
  // the marker stays at the captured spot when the map is panned away.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const customEmpty = sport === 'custom' && !keyword.trim();
  const nearbyKey = queryKeys.nearbyCourts(center.lat, center.lng, sport, keyword, searchRadius);
  const refreshTooWide = !!viewport && (
    viewport.zoom < MIN_REFRESH_ZOOM ||
    (viewport.radiusMeters !== null && viewport.radiusMeters > MAX_REFRESH_RADIUS_METERS)
  );

  useEffect(() => {
    if (!refreshMessage || refreshTooWide) return;
    setRefreshMessage(null);
  }, [refreshMessage, refreshTooWide]);

  useEffect(() => {
    if (!refreshAfterZoom || !viewport || refreshTooWide || customEmpty) return;
    refreshViewport(viewport);
    setRefreshAfterZoom(false);
  }, [customEmpty, refreshAfterZoom, refreshTooWide, viewport]);

  const courts = useQuery({
    queryKey: [...nearbyKey, refreshNonce] as const,
    queryFn: () => api.nearbyCourts(
      center.lat,
      center.lng,
      sport,
      keyword || undefined,
      searchRadius,
    ),
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

  const visiblePlaceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of placesPins) ids.add(c.placeId);
    for (const s of savedForSport) ids.add(s.placeId);
    return [...ids];
  }, [placesPins, savedForSport]);

  const reports = useQuery({
    queryKey: queryKeys.courtReportsBatch(visiblePlaceIds),
    queryFn: () => api.courtReportsBatch(visiblePlaceIds),
    enabled: visiblePlaceIds.length > 0,
    staleTime: 60_000,
  });

  const [selectedMs] = useSelectedTime();

  function scorePin(forecast: typeof placesPins[number]['forecast'] | null, fallback: typeof placesPins[number]['score'] | null = null) {
    const slot = slotAt(forecast ?? null, selectedMs);
    if (slot) {
      // For slider-selected times, score against the max rain over the
      // 2-hour bucket so pin colors match what the panel/cards display.
      const rainPctNext2h = selectedMs !== null
        ? (rainPctOverWindow(forecast ?? null, selectedMs, SLIDER_STEP_HOURS) ?? slot.rainPct)
        : slot.rainPct;
      return scoreFromThresholds(
        { tempF: slot.tempF, windMph: slot.windMph, rainPctNext2h },
        thresholds,
      );
    }
    // No slot: out of window when selectedMs is set, or no forecast at all.
    return selectedMs !== null ? null : (fallback ?? null);
  }

  const reportMap = reports.data?.reports ?? {};
  const hasReport = (placeId: string) => !!reportMap[placeId];

  function refreshViewport(nextViewport: MapViewport) {
    setRefreshMessage(null);
    setCenter(nextViewport.center);
    setSearchRadius(clampRadius(nextViewport.radiusMeters));
    setRefreshNonce((n) => n + 1);
  }

  function handleRefreshArea() {
    if (!viewport || customEmpty) return;
    const radius = clampRadius(viewport.radiusMeters);
    if (refreshTooWide) {
      setRefreshMessage(null);
      setRefreshAfterZoom(true);
      setZoomRequest({
        id: Date.now(),
        zoom: zoomForRefresh(viewport),
        center: viewport.center,
      });
      return;
    }

    refreshViewport({ ...viewport, radiusMeters: radius ?? viewport.radiusMeters });
  }

  const pins: PinForMap[] = [
    ...placesPins.map((c) => {
      const s = savedById.get(c.placeId);
      return {
        placeId: c.placeId,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        score: scorePin(s?.forecast ?? c.forecast ?? null, s?.score ?? c.score ?? null),
        isSavedForSport: !!s,
        hasFreshReport: hasReport(c.placeId),
      };
    }),
    ...savedForSport
      .filter((s) => !placesPins.some((p) => p.placeId === s.placeId))
      .map((s) => ({
        placeId: s.placeId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        score: scorePin(s.forecast ?? null, s.score ?? null),
        isSavedForSport: true,
        hasFreshReport: hasReport(s.placeId),
      })),
  ];

  return (
    <div className="relative h-[calc(100dvh-4rem)] bg-sky-50">
      <div className="absolute top-3 left-0 right-0 z-20 flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto">
          <SearchBar
            onPlaceSelected={(loc) => {
              setCenter({ lat: loc.lat, lng: loc.lng });
              setSearchRadius(undefined);
              setRefreshMessage(null);
              setRefreshAfterZoom(false);
              setKeyword('');
            }}
            onKeywordChange={(k) => {
              setKeyword(k);
              setRefreshMessage(null);
              setRefreshAfterZoom(false);
            }}
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
        onViewportChanged={setViewport}
        zoomRequest={zoomRequest}
        addMode={addMode}
        pendingPin={pendingPin}
        userLocation={userLocation}
        onMapClick={(loc) => setPendingPin(loc)}
      />

      <div
        aria-hidden
        className="absolute inset-x-0 top-0 z-10 h-44 pointer-events-none bg-gradient-to-b from-emerald-50/80 via-sky-50/35 to-transparent"
      />

      {!addMode && !customEmpty && (
        <div className="absolute top-[7.25rem] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto">
          <button
            onClick={handleRefreshArea}
            disabled={courts.isFetching || !viewport || refreshAfterZoom}
            className="rounded-full bg-gradient-to-r from-white/95 via-amber-50/95 to-emerald-50/95 backdrop-blur border border-emerald-100 shadow-md shadow-emerald-950/10 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:from-white hover:to-emerald-50 disabled:opacity-70"
          >
            {courts.isFetching
              ? 'Refreshing…'
              : refreshAfterZoom
                ? 'Zooming…'
                : refreshTooWide
                ? 'Zoom in to refresh'
                : 'Refresh this area'}
          </button>
          {refreshMessage && (
            <div className="rounded-full bg-emerald-950 text-white px-3 py-1 text-[11px] font-semibold shadow-md shadow-emerald-950/20">
              {refreshMessage}
            </div>
          )}
        </div>
      )}

      {!!user && <MapLegend />}

      {source === 'default' && !addMode && (
        <div className="absolute top-40 left-1/2 -translate-x-1/2 z-10 bg-gradient-to-r from-white/95 to-amber-50/95 shadow-md shadow-amber-950/10 border border-amber-100 rounded-full px-4 py-1 text-[11px] text-amber-900">
          Default location — enable location for nearby courts
        </div>
      )}

      {customEmpty && !addMode && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-10 bg-gradient-to-r from-white/95 to-sky-50/95 shadow-md shadow-sky-950/10 border border-sky-100 rounded-full px-4 py-1 text-[11px] text-sky-900">
          Custom mode — search a place or use + Add a spot
        </div>
      )}

      {courts.isError && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-white/95 border border-red-100 shadow-md rounded-full px-4 py-1.5 text-sm text-bad">
          Couldn't fetch courts. Try again.
        </div>
      )}

      {!courts.isLoading && !customEmpty && pins.length === 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-white/95 border border-emerald-100 shadow-md rounded-full px-4 py-1.5 text-sm text-emerald-900">
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

      <LocateMeButton
        onLocate={(loc) => {
          setUserLocation(loc);
          setCenter(loc);
          setSearchRadius(undefined);
          setRefreshMessage(null);
          setRefreshAfterZoom(false);
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

      {!addMode && (
        <div className="absolute bottom-3 left-3 right-3 z-20 pointer-events-auto">
          <TimeScrubber />
        </div>
      )}

      {selectedPlaceId && !addMode && (
        <CourtPanel placeId={selectedPlaceId} user={user} onClose={() => selectCourt(null)} />
      )}
    </div>
  );
}
