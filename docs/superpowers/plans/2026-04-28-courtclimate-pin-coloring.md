# Map pin coloring + saved-as-star — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Color every map pin by playability (green/yellow/red/gray) and switch its shape from circle to star when the court is saved for the currently-selected sport.

**Architecture:** Server hydrates score per court in `/api/courts` (parallel `fetchWeather`, geohash-5 cached). Client merges Places-discovered + saved-for-current-sport into one `pins` array, deduped by placeId. `MapView` renders shape from `isSavedForSport` and color from `score` via Google Maps `Symbol` icons (built-in CIRCLE path + a custom 5-point star path).

**Tech Stack:** No new libraries.

**Spec:** `docs/superpowers/specs/2026-04-28-courtclimate-pin-coloring.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/src/lib/google.ts` | Modify | Hydrate score+stale per court after Places call |
| `client/src/types.ts` | Modify | `Court` gains optional `score` + `stale` |
| `client/src/components/MapView.tsx` | Modify | Drop `customCourts` prop; accept single `pins` array; star path constant; color logic |
| `client/src/routes/MapPage.tsx` | Modify | Build combined `pins` array sport-scoped |
| `client/src/components/MapLegend.tsx` | Modify | Update legend copy |

---

## Task 1: Server — hydrate score per court in /api/courts

**Files:**
- Modify: `server/src/lib/google.ts`

- [ ] **Step 1: Add score+stale to the response type**

In `server/src/lib/google.ts`, find the `CourtSummary` interface. Leave it unchanged (cached version stays metadata-only). Add a new exported type below it:

```ts
import type { PlayabilityScore } from './playability';

export interface HydratedCourt extends CourtSummary {
  score: PlayabilityScore | null;
  stale: boolean;
}
```

- [ ] **Step 2: Update fetchNearbyCourts return shape + body**

In the same file, find `fetchNearbyCourts`. Change its return type from
`Promise<{ courts: CourtSummary[]; stale: boolean }>` to
`Promise<{ courts: HydratedCourt[]; stale: boolean }>` and add the
hydration step right before each `return` statement.

Add the import for `score` and `fetchWeather` at the top if not already present:

```ts
import { fetchWeather } from './openweather';
import { score } from './playability';
```

Then locate the existing return paths and wrap with hydration. The existing function has these return points (after refactoring the whole tail):

Replace the **entire** end of the `try` block (from the `courts` mapping through the upserts and the `return`) with:

```ts
    const courts: CourtSummary[] = (data.results ?? []).map((r) => ({
      placeId: r.place_id,
      name: r.name,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      address: r.vicinity ?? null,
    }));

    if (!hasUserKeyword) {
      await putCached('placesCache', cacheKey, courts);
    }

    // Upsert into Court table so SavedCourt FK is always satisfiable.
    await Promise.all(
      courts.map((c) =>
        prisma.court.upsert({
          where: { placeId: c.placeId },
          create: c,
          update: { name: c.name, lat: c.lat, lng: c.lng, address: c.address, fetchedAt: new Date() },
        }),
      ),
    );

    const hydrated = await hydrateCourts(courts);
    return { courts: hydrated, stale: false };
```

And update the catch block's stale-fallback:

```ts
  } catch (err) {
    if (cached) {
      const hydrated = await hydrateCourts(cached.payload);
      return { courts: hydrated, stale: true };
    }
    throw err;
  }
```

And update the cache-hit early return:

```ts
  if (cached && !cached.stale) {
    const hydrated = await hydrateCourts(cached.payload);
    return { courts: hydrated, stale: false };
  }
```

- [ ] **Step 3: Add the hydrateCourts helper**

At the bottom of `server/src/lib/google.ts`, add:

```ts
async function hydrateCourts(courts: CourtSummary[]): Promise<HydratedCourt[]> {
  return Promise.all(
    courts.map(async (c) => {
      try {
        const w = await fetchWeather(c.lat, c.lng);
        return { ...c, score: score(w.weather), stale: w.stale };
      } catch {
        return { ...c, score: null, stale: true };
      }
    }),
  );
}
```

- [ ] **Step 4: Build + tests pass**

```bash
cd server && npm run build && npm test
```

Expected: clean build, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/google.ts
git commit -m "feat(server): hydrate score+stale per court in /api/courts"
```

---

## Task 2: Client types — Court gains score + stale

**Files:**
- Modify: `client/src/types.ts`

- [ ] **Step 1: Extend Court interface**

In `client/src/types.ts`, find the `Court` interface and add two optional fields:

```ts
export interface Court {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  isCustom?: boolean;
  addedByUserId?: string | null;
  score?: PlayabilityScore | null;
  stale?: boolean;
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean (existing consumers don't reference score yet; SavedCourtDetail extends Court and already overrides score with a non-optional version which is compatible).

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat(client): Court gains optional score + stale"
```

---

## Task 3: MapView — single `pins` prop, star + color logic

**Files:**
- Modify: `client/src/components/MapView.tsx`

- [ ] **Step 1: Replace MapView.tsx**

Full replacement of `client/src/components/MapView.tsx`:

```tsx
import { useEffect, useMemo, useRef } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import type { PlayabilityScore } from '../types';
import { env } from '../lib/env';

export interface PinForMap {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  score: PlayabilityScore | null;
  isSavedForSport: boolean;
}

interface Props {
  center: { lat: number; lng: number };
  pins: PinForMap[];
  selectedPlaceId: string | null;
  onSelect: (placeId: string) => void;
  addMode?: boolean;
  onMapClick?: (loc: { lat: number; lng: number }) => void;
  pendingPin?: { lat: number; lng: number } | null;
}

const containerStyle = { width: '100%', height: '100%' };

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
};

const PLACES_LIBS: ('places')[] = ['places'];

const COLOR: Record<PlayabilityScore, string> = {
  GOOD: '#16a34a',
  OK: '#eab308',
  BAD: '#dc2626',
};
const GRAY = '#737373';

// 5-point star path in unit space (outer radius = 1). With Google
// Maps Symbol `scale`, this matches CIRCLE's "scale = radius in px"
// convention so circles and stars sit at comparable visual weights.
const STAR_PATH =
  'M 0,-1 L 0.294,-0.309 1.039,-0.309 0.445,0.118 0.618,0.809 0,0.45 -0.618,0.809 -0.445,0.118 -1.039,-0.309 -0.294,-0.309 Z';

function colorFor(score: PlayabilityScore | null): string {
  return score ? COLOR[score] : GRAY;
}

export function MapView({
  center,
  pins,
  selectedPlaceId,
  onSelect,
  addMode = false,
  onMapClick,
  pendingPin,
}: Props) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: env.googleMapsKey,
    libraries: PLACES_LIBS,
  });

  const memoCenter = useMemo(() => center, [center.lat, center.lng]);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo(memoCenter);
    }
  }, [memoCenter]);

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-center text-bad">
        Failed to load Google Maps. Check VITE_GOOGLE_MAPS_KEY in client/.env.
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="w-full h-full flex items-center justify-center text-neutral-500">Loading map…</div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={memoCenter}
      zoom={13}
      options={{
        ...mapOptions,
        draggableCursor: addMode ? 'crosshair' : undefined,
      }}
      onLoad={(m) => {
        mapRef.current = m;
      }}
      onClick={(e) => {
        if (!addMode || !onMapClick || !e.latLng) return;
        onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }}
    >
      {pins.map((p) => {
        const isSelected = p.placeId === selectedPlaceId;
        const baseScale = p.isSavedForSport ? 9 : 7;
        const scale = isSelected ? baseScale * 1.3 : baseScale;
        return (
          <Marker
            key={p.placeId}
            position={{ lat: p.lat, lng: p.lng }}
            title={p.name}
            onClick={() => onSelect(p.placeId)}
            icon={{
              path: p.isSavedForSport ? STAR_PATH : google.maps.SymbolPath.CIRCLE,
              scale,
              fillColor: colorFor(p.score),
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: isSelected ? 3 : 2,
            }}
          />
        );
      })}

      {pendingPin && (
        <Marker
          position={pendingPin}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#16a34a',
            fillOpacity: 0.6,
            strokeColor: '#16a34a',
            strokeWeight: 3,
          }}
          animation={google.maps.Animation.DROP}
        />
      )}
    </GoogleMap>
  );
}
```

- [ ] **Step 2: Type-check (expect MapPage error since props changed)**

```bash
cd client && npx tsc --noEmit
```

Expected: errors in `MapPage.tsx` because it still passes `courts` + `customCourts` instead of `pins`. Task 4 fixes.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/MapView.tsx
git commit -m "feat(client): MapView accepts single pins array; star+color rendering"
```

---

## Task 4: MapPage — build combined `pins` array

**Files:**
- Modify: `client/src/routes/MapPage.tsx`

- [ ] **Step 1: Replace MapPage.tsx**

Full replacement of `client/src/routes/MapPage.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import { useSport } from '../stores/sport';
import { useGeolocation } from '../hooks/useGeolocation';
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
      return {
        placeId: c.placeId,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        score: s?.score ?? c.score ?? null,
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
        score: s.score,
        isSavedForSport: true,
      })),
  ];

  return (
    <div className="relative h-[calc(100vh-3.5rem)]">
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
```

Notable changes vs current:
- Drops the separate `customCourts` derivation (no longer needed; saved-for-sport flows into the unified pins array).
- Empty-results banner now keys off `pins.length === 0` (unified) instead of `courts.data.courts.length === 0`.
- `MapLegend` shows whenever the user is signed in (always relevant now, not gated on having custom saves).

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean tsc, vite build passes.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MapPage.tsx
git commit -m "feat(client): MapPage builds unified sport-scoped pins array"
```

---

## Task 5: MapLegend — update copy

**Files:**
- Modify: `client/src/components/MapLegend.tsx`

- [ ] **Step 1: Replace MapLegend.tsx**

Full replacement of `client/src/components/MapLegend.tsx`:

```tsx
export function MapLegend() {
  return (
    <div className="absolute bottom-6 left-4 z-20 bg-white/90 backdrop-blur rounded-xl shadow-md px-3 py-2 text-[11px] text-neutral-600 flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-500" />
          unsaved
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="text-neutral-700">★</span>
          saved
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-good" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-ok" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-bad" />
        <span className="ml-1">playability</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/MapLegend.tsx
git commit -m "feat(client): MapLegend explains shape + color"
```

---

## Task 6: Final verify + push

**Files:** none

- [ ] **Step 1: Server build + tests**

```bash
cd server && npm run build && npm test
```

Expected: clean, all tests pass.

- [ ] **Step 2: Client tsc + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Confirm no env files staged**

```bash
git diff --name-only --staged | grep -E '\.env$' && echo "ABORT" || echo "ok"
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Server hydrates score+stale per court → Task 1
- ✅ `Court` (client) gains score+stale → Task 2
- ✅ Star path constant in MapView → Task 3
- ✅ Shape from isSavedForSport, color from score → Task 3
- ✅ Selected = +30% size + thicker halo → Task 3 (`baseScale * 1.3`, `strokeWeight: 3`)
- ✅ Single combined pin array, deduped by placeId → Task 4
- ✅ Saved score wins over Places score during dedup → Task 4 (`s?.score ?? c.score ?? null`)
- ✅ Saved-for-sport overlay also filtered by current sport → Task 4
- ✅ Empty-results banner unified via `pins.length === 0` → Task 4
- ✅ MapLegend shows shape + color key → Task 5
- ✅ MapLegend always shown when signed in (not gated on having custom saves) → Task 4

**Type consistency:**
- `PinForMap` defined and exported from `MapView.tsx` Task 3, imported by `MapPage.tsx` Task 4.
- `HydratedCourt` defined in `server/src/lib/google.ts` Task 1; the `/api/courts` route consumes whatever `fetchNearbyCourts` returns and JSON-serializes it, so the response carries `score` + `stale` per court without further server-side wiring.
- Client `Court` Task 2 gains optional score/stale; the `nearbyCourts` API client already returns `Court[]`, so the response now naturally carries the new fields. No api.ts change needed.
- `selectedPlaceId` semantics unchanged.

**Placeholder scan:** none.

**Migration safety:** No schema change.
