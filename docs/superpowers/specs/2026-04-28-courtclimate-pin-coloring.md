# CourtClimate — Map pin coloring + saved-as-star

**Date:** 2026-04-28
**Status:** Approved (autonomous, this session)
**Owner:** aheedk

Color every map pin by its playability score (GOOD=green, OK=yellow,
BAD=red, gray when unknown), and switch shape from circle (unsaved)
to star (saved-for-current-sport). Sport-scoped throughout — saves
tagged for tennis don't change shape or appear on the map when the
current chip is pickleball.

## Goals

- Make the map readable at a glance: green dots = play now, red dots
  = don't bother.
- Distinguish at a glance which courts the user has saved vs everything
  else — using shape, not just outline color.
- Keep sport context strict: Tennis-tagged saves don't pollute
  Pickleball or Basketball views.

## Non-goals (this round)

- "Show only GOOD pins" filter
- Pulse / glow animations on freshly-good pins
- Per-sport star designs (every sport's star looks the same)
- Re-coloring the saved-list cards or CourtPanel by score (already
  uses `PlayabilityBadge` for that)

## Pin matrix

| | Unsaved (for current sport) | Saved (for current sport) |
|---|---|---|
| GOOD score | 🟢 green ● | 🟢 green ★ |
| OK score   | 🟡 yellow ● | 🟡 yellow ★ |
| BAD score  | 🔴 red ● | 🔴 red ★ |
| null score | ⚪ gray ● | ⚪ gray ★ |
| Selected   | same color/shape, +30% size, +2px white halo | same |

Scale: base circle ~7px radius, base star ~9px (slightly bigger so
star points read on phones). Selected = `*1.3`.

Tailwind tokens already in use:
- `good` = `#16a34a` (green-600)
- `ok` = `#eab308` (yellow-500)
- `bad` = `#dc2626` (red-600)
- gray-fallback = `#737373` (neutral-500)

## Pin set on the map

Single combined pin array, deduped by `placeId`:

```
pins = unique by placeId(
  [...placesDiscoveredCourts, ...userSavedCoursesForCurrentSport]
)
```

- **Places-discovered** = `courts.data.courts` from `/api/courts` (sport
  keyword already filters at Places).
- **User saves for current sport** =
  `savedCourts.data.courts.filter(c => c.sport === currentSport)`. Both
  custom-dropped and Places-saved entries are included.
- For each pin, compute:
  - `score`: prefer the saved entry's `score` if user has it saved
    (always populated by `/api/me/courts`); fall back to the Places
    entry's `score` (populated by `/api/courts` after this change).
  - `isSavedForSport`: true if `placeId` is in the saved-for-current-sport
    set.

Custom-mode behavior (current sport = `'custom'`):
- `/api/courts` not called (existing behavior preserved by `enabled`
  flag in `MapPage`).
- Pin set = user's saved-for-custom courts only (plus the pending drop
  pin during add-mode).

## Server changes

### `/api/courts` response shape gains score + stale per court

`Court` JSON shape changes from:

```ts
{ placeId, name, lat, lng, address }
```

to:

```ts
{ placeId, name, lat, lng, address, score: 'GOOD'|'OK'|'BAD'|null, stale: boolean }
```

### Implementation in `server/src/lib/google.ts`

After the Places call returns `CourtSummary[]`, hydrate each with
weather + score in parallel. The existing `fetchWeather` is
geohash-5-cached (10 min TTL), so most parallel calls in a small radius
hit the cache — typically 2–4 unique upstream calls per query.

```ts
const hydratedCourts = await Promise.all(
  courts.map(async (c) => {
    try {
      const w = await fetchWeather(c.lat, c.lng);
      return { ...c, score: score(w.weather), stale: w.stale };
    } catch {
      return { ...c, score: null, stale: true };
    }
  }),
);
```

Cache the **non-hydrated** version in `placesCache` (existing behavior
unchanged — places metadata is what's expensive to look up; weather is
its own cache). Hydration runs every time the cache hits Places (cheap
because weather cache covers it).

### `CourtSummary` type stays metadata-only

Don't bake score into the cached `CourtSummary` — that would mix two
caching domains. Keep:

```ts
interface CourtSummary {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
}
```

Hydration produces a separate `HydratedCourt = CourtSummary & { score, stale }`.

## Client changes

### Types

`client/src/types.ts` — extend `Court`:

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

`SavedCourtDetail extends Court` already had `score` (was non-optional);
make it consistent — it stays required there since `/api/me/courts`
always populates score (or sets null).

### MapPage

Replace the existing `customCourts` prop+pipeline with a single `pins`
array sent to MapView:

```ts
const savedForSport = saved.data?.courts.filter(c => c.sport === sport) ?? [];
const placesPins = courts.data?.courts ?? [];

const savedById = new Map(savedForSport.map(s => [s.placeId, s]));
const pins: PinForMap[] = [
  // Places results first; mark saved if also in savedById
  ...placesPins.map(c => ({
    placeId: c.placeId, name: c.name, lat: c.lat, lng: c.lng,
    score: savedById.get(c.placeId)?.score ?? c.score ?? null,
    isSavedForSport: savedById.has(c.placeId),
  })),
  // Then any saved-for-sport courts NOT in Places
  ...savedForSport
    .filter(s => !placesPins.some(p => p.placeId === s.placeId))
    .map(s => ({
      placeId: s.placeId, name: s.name, lat: s.lat, lng: s.lng,
      score: s.score ?? null,
      isSavedForSport: true,
    })),
];
```

`PinForMap` is a small local type — kept inside MapPage so it doesn't
leak into other components.

### MapView

Drops `customCourts` prop. New `pins: PinForMap[]` prop. Renders each
pin via a single `Marker` map:

```tsx
const COLOR: Record<PlayabilityScore, string> = {
  GOOD: '#16a34a',
  OK:   '#eab308',
  BAD:  '#dc2626',
};
function colorFor(score: PlayabilityScore | null) {
  return score ? COLOR[score] : '#737373';
}

{pins.map(p => (
  <Marker
    key={p.placeId}
    position={{ lat: p.lat, lng: p.lng }}
    title={p.name}
    onClick={() => onSelect(p.placeId)}
    icon={{
      path: p.isSavedForSport
        ? STAR_PATH        // SVG path for a 5-point star
        : google.maps.SymbolPath.CIRCLE,
      scale: (p.placeId === selectedPlaceId ? 1.3 : 1) * (p.isSavedForSport ? 9 : 7) / (p.isSavedForSport ? 9 : 7) * (p.isSavedForSport ? 1 : 1),
      // ^^ simplified in implementation; see actual code in plan
      fillColor: colorFor(p.score),
      fillOpacity: 1,
      strokeColor: p.placeId === selectedPlaceId ? '#fff' : '#fff',
      strokeWeight: p.placeId === selectedPlaceId ? 3 : 2,
    }}
  />
))}
```

(Spec-level pseudo; the plan will show the cleanly-formed scale logic.)

The 5-point-star path constant lives in `MapView.tsx`:

```ts
const STAR_PATH =
  'M 0,-10 L 2.94,-3.09 10.39,-3.09 4.45,1.18 6.18,8.09 0,4.5 -6.18,8.09 -4.45,1.18 -10.39,-3.09 -2.94,-3.09 Z';
```

(Sized roughly to match a circle scale of 9 — looks right alongside
the existing 7-radius circles.)

### MapLegend update

Was: `● Places · ○ Yours`
Now: `● unsaved · ★ saved · color = playability (green/yellow/red)`

Always visible (not conditional on having custom saves).

## Edge cases

- **Weather fetch fails for a Places-discovered court** → server returns
  `score: null, stale: true` for that court. Pin renders as gray.
- **User has a saved court but `/api/me/courts` weather hydration
  failed** → that saved entry has `score: null` already; gray pin.
- **A court is in *both* Places and user's saved-for-sport** → dedup keeps
  the Places entry's metadata but uses the saved entry's score (which
  is more likely fresh; both are cached anyway). Shape is star.
- **Places returns 0 courts and user has 0 saves for current sport** →
  empty map. Existing "No \<sport\> courts found here" banner still
  fires from MapPage.
- **Custom mode with no keyword** → `pins = savedForSport only` (all
  stars). Banner "Custom mode — search a place or use + Add a spot"
  still applies.

## Testing

- Unit (`server/test`): existing playability tests cover scoring; no
  new unit tests needed (the change in google.ts is plumbing).
- Smoke (`server/test/api.smoke.test.ts`): no new endpoints; existing
  validation tests still cover `/api/courts` shape from a parsing
  perspective. (We don't need a new test that confirms the score field
  is *present* in response — too brittle for a smoke test that mocks
  Places.)
- Manual:
  - Load map in Tampa (Tennis chip). Verify pins are colored.
  - Save one court. Verify it becomes a star, color preserved.
  - Switch to Pickleball chip. Verify the previously-saved tennis
    court is back to a circle (not a star).
  - Force a weather error (block OWM in DevTools network) and verify
    pins go gray instead of disappearing.

## Risks

- **OpenWeatherMap quota on cold area loads.** First call to a new
  geohash-5 cell costs 1 OWM call. A query that spans 4 cells = 4
  fresh OWM calls. With 1000/day free tier and typical user behavior
  (a few different areas per day), still a wide margin.
- **Marker icon path performance.** Google Maps re-renders all markers
  on prop changes. With 20 pins this is fine; if pin counts grow past
  ~100 we'd want to use the legacy MarkerClusterer or AdvancedMarkers,
  but that's a separate problem.
- **Color-blindness.** Green/yellow/red is the worst combo for
  red-green colorblindness. Shape (circle vs star) is the saved
  signal, not score, so colorblind users still get the saved
  information. Score gets reinforced in the `CourtPanel`'s
  `PlayabilityBadge` when they click a pin. Acceptable.
