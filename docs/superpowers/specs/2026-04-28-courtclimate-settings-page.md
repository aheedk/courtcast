# CourtClimate — Settings page + customizable thresholds

**Date:** 2026-04-28
**Status:** Approved (autonomous, this session)
**Owner:** aheedk

Replaces the avatar's current sign-out-only behavior with a `/settings`
page that hosts account info, customizable playability thresholds,
default sport selection, and the sign-out button.

The headline feature is **customizable thresholds**: users can tweak
when GOOD / OK / BAD applies (rain ceiling, rain floor, wind ceiling),
and the change immediately re-colors all pins and badges across the app.

## Goals

- Give the user a place to see who they're signed in as and to manage
  per-device preferences without leaving the app.
- Let the user adjust the playability scoring rule to match their own
  tolerance ("I play in light rain — green should still apply at 40%").
- Surface "default sport" management so the chip the user sees on app
  open matches their primary interest.

## Non-goals (this round)

- Cross-device settings sync (settings are localStorage-only)
- Per-sport thresholds (one global rule)
- Notification prefs / account delete / theme / unit prefs (mi vs km,
  °F vs °C)
- Editing display name or email (sourced from Google)
- Settings deep-link sections (`/settings#thresholds`) — single page
  for now

## UI

### Trigger

`TopBar` avatar (the existing `<button>` for signed-in users) becomes
a `<NavLink to="/settings">`. Anonymous users still see the **Sign in**
button as today — they can't reach `/settings` without an account.

### Page layout (`/settings`)

```
┌────────────────────────────────────────────┐
│ Settings                                   │
│                                            │
│ ┌─ Account ───────────────────────────────┐│
│ │ [avatar]                                ││
│ │ Aheed Kamil                             ││
│ │ kaheed@gmail.com                        ││
│ └─────────────────────────────────────────┘│
│                                            │
│ ┌─ Playability thresholds ────────────────┐│
│ │ Customize when GOOD / OK / BAD applies. ││
│ │                                         ││
│ │ Rain — GOOD when below     30%          ││
│ │ ▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬             ││
│ │                                         ││
│ │ Rain — BAD when above      60%          ││
│ │ ▬▬▬▬▬▬▬▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬▬▬▬             ││
│ │                                         ││
│ │ Wind — GOOD when below     12 mph       ││
│ │ ▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬             ││
│ │                                         ││
│ │ Sample: 20% rain, 8 mph wind → 🟢 GOOD  ││
│ │                                         ││
│ │ Reset to defaults                       ││
│ └─────────────────────────────────────────┘│
│                                            │
│ ┌─ Default sport ─────────────────────────┐│
│ │ The sport chip selected on app open.    ││
│ │ [🎾 Tennis] [🏀 Basketball] [🥒 ...]    ││
│ └─────────────────────────────────────────┘│
│                                            │
│         [ Sign out ]                       │
└────────────────────────────────────────────┘
```

### Sliders

Native `<input type="range">` styled with Tailwind. Snap to integers.
Numeric value rendered to the right of the label. Updating any slider
immediately re-renders the live preview chip below.

### Default sport

Reuses the existing `SportChips` component. Bound to the same
`useSport()` hook the map page uses — so changing it here changes
the sport on next map open (and also right now, if the map is
already mounted).

### Account section

Shows `user.avatarUrl` (Google profile photo or letter avatar fallback
that Google generates), `user.name`, `user.email`. No "Edit" affordance.

### Sign out

Same mutation that's currently in TopBar — moves here. Destructive
red text, confirmation prompt is fine to skip for MVP (existing
behavior didn't have one either).

## Storage

All settings live in `localStorage`. No DB schema, no endpoints, no
sync. Keys:

| Key | Type | Default |
|---|---|---|
| `courtclimate.thresholds.rainMaxGood` | int 0–60 | `30` |
| `courtclimate.thresholds.rainMaxOk` | int 30–100 | `60` |
| `courtclimate.thresholds.windMaxGood` | int 0–25 | `12` |
| `courtclimate.sport` | enum `Sport` | `'tennis'` (existing) |

Constraints applied at write time: rainMaxGood < rainMaxOk; otherwise
GOOD becomes unreachable. Slider min/max enforces this softly (the
GOOD slider caps at the current OK floor − 1; the OK slider's min
is the current GOOD ceiling + 1).

## Score recomputation (architecture)

Today the server computes `score: PlayabilityScore | null` for every
court the API returns. With user-customizable thresholds, the score
must be recomputable on the client.

### Flow

1. `/api/courts` response gains `weather: WeatherSummary | null` per
   court (in addition to existing `score` + `stale`). The server
   already calls `fetchWeather` per court for its own score
   computation; just include the weather payload in the response.
2. `/api/me/courts`, `/api/court/:id`, `/api/me/lists/:id` already
   include `weather` per court. No server change needed there.
3. New client lib `playability.ts` with two exports:
   - `Thresholds` type
   - `scoreFromThresholds(weather, thresholds): PlayabilityScore`
4. New `useScoreFor(weather, fallback?)` hook that reads thresholds
   from `useThresholds()` and returns the recomputed score, falling
   back to a server-provided `fallback` if weather is null.
5. Components that display a score use the hook:
   - `MapPage` pin-building uses `useScoreFor` per pin to derive the
     pin's color
   - `CourtPanel` uses `useScoreFor` for the badge
   - `SavedCourtCard` uses `useScoreFor` for the badge

### Where the server's score still matters

- Anonymous users (no thresholds tweaked yet) still see consistent
  scores everywhere — defaults match the server's defaults
- When weather is null (transient API failure) — fall back to server's
  `score` field so the UI doesn't go fully gray for one bad request

## Server changes

### `/api/courts` response

`HydratedCourt` interface in `server/src/lib/google.ts`:

```ts
export interface HydratedCourt extends CourtSummary {
  score: PlayabilityScore | null;
  stale: boolean;
  weather: WeatherSummary | null;  // NEW
}
```

The `hydrateCourts` helper already calls `fetchWeather`; just pass the
weather payload through:

```ts
async function hydrateCourts(courts: CourtSummary[]): Promise<HydratedCourt[]> {
  return Promise.all(
    courts.map(async (c) => {
      try {
        const w = await fetchWeather(c.lat, c.lng);
        return { ...c, score: score(w.weather), stale: w.stale, weather: w.weather };
      } catch {
        return { ...c, score: null, stale: true, weather: null };
      }
    }),
  );
}
```

### Other endpoints

No change. `/api/me/courts`, `/api/court/:id`, and
`/api/me/lists/:id` already include weather per court.

## Client architecture

### `client/src/lib/playability.ts` (NEW)

```ts
import type { PlayabilityScore, WeatherSummary } from '../types';

export interface Thresholds {
  rainMaxGood: number;
  rainMaxOk: number;
  windMaxGood: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  rainMaxGood: 30,
  rainMaxOk: 60,
  windMaxGood: 12,
};

export function scoreFromThresholds(
  weather: WeatherSummary,
  t: Thresholds,
): PlayabilityScore {
  if (weather.rainPctNext2h >= t.rainMaxOk) return 'BAD';
  if (weather.rainPctNext2h < t.rainMaxGood && weather.windMph < t.windMaxGood) return 'GOOD';
  return 'OK';
}
```

Note: rule is the same as server's — `GOOD` requires both rain and
wind under their respective ceilings; `BAD` requires rain at-or-above
the OK ceiling (so rainMaxOk acts as the BAD floor); else `OK`.

### `client/src/stores/thresholds.ts` (NEW)

```ts
import { useEffect, useState } from 'react';
import type { Thresholds } from '../lib/playability';
import { DEFAULT_THRESHOLDS } from '../lib/playability';

const KEY = 'courtclimate.thresholds';

function read(): Thresholds {
  if (typeof window === 'undefined') return DEFAULT_THRESHOLDS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const parsed = JSON.parse(raw);
    return {
      rainMaxGood: clampInt(parsed.rainMaxGood, 0, 60, DEFAULT_THRESHOLDS.rainMaxGood),
      rainMaxOk: clampInt(parsed.rainMaxOk, 30, 100, DEFAULT_THRESHOLDS.rainMaxOk),
      windMaxGood: clampInt(parsed.windMaxGood, 0, 25, DEFAULT_THRESHOLDS.windMaxGood),
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function useThresholds(): [Thresholds, (next: Thresholds) => void, () => void] {
  const [t, setT] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  useEffect(() => { setT(read()); }, []);
  const update = (next: Thresholds) => {
    setT(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('courtclimate.thresholds.changed'));
  };
  const reset = () => update(DEFAULT_THRESHOLDS);
  // Listen for changes from other components in the same tab.
  useEffect(() => {
    const onChange = () => setT(read());
    window.addEventListener('courtclimate.thresholds.changed', onChange);
    return () => window.removeEventListener('courtclimate.thresholds.changed', onChange);
  }, []);
  return [t, update, reset];
}

export function useScoreFor(weather: WeatherSummary | null, fallback?: PlayabilityScore | null) {
  const [t] = useThresholds();
  if (!weather) return fallback ?? null;
  return scoreFromThresholds(weather, t);
}
```

(`useScoreFor` referenced separately at top of the file — same file
exports, just for clarity in the spec. In the code it's all one module.)

### `client/src/routes/SettingsPage.tsx` (NEW)

Single component, four sections. Uses `useThresholds`, `useSport`,
and the existing `useMutation` for logout (relocated from TopBar).
Returns user to `/` after logout.

### Routing

`App.tsx` registers `/settings` as a protected route (gated by
`AuthGate`). If an anonymous user lands there, they get redirected to
`/login`.

### `TopBar.tsx`

The signed-in branch becomes a NavLink to `/settings` instead of the
current logout button:

```tsx
{user ? (
  <NavLink
    to="/settings"
    className="ml-1 flex items-center gap-2 px-1 py-1 rounded-full hover:bg-neutral-100"
    title="Settings"
  >
    {user.avatarUrl && <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />}
    <span className="text-sm text-neutral-600 hidden sm:inline">{user.name?.split(' ')[0] ?? 'You'}</span>
  </NavLink>
) : (
  /* existing Sign in NavLink */
)}
```

(Drops the logout `useMutation` from TopBar entirely; it moves to
SettingsPage.)

### Score-display swaps

Three places switch from server's `score` to client-recomputed via
`useScoreFor(weather, fallback)`:

- `MapPage` pin-building: each pin's `score` becomes
  `useScoreFor(weather, c.score ?? null)`. The pin object grows a
  `weather` field for this. (Or pull weather from the source data
  during pin assembly.)
- `CourtPanel`: badge uses `useScoreFor(detail.data.weather, detail.data.score)`
- `SavedCourtCard`: badge uses `useScoreFor(court.weather, court.score)`

`useScoreFor` is a hook so these calls happen at component top-level.
For MapPage's pin-building (which iterates pins), we materialize the
hook value via the parent and apply per-pin in plain code:

```tsx
const [thresholds] = useThresholds();
// ...
const pins = ... .map(c => ({
  ...,
  score: c.weather ? scoreFromThresholds(c.weather, thresholds) : c.score ?? null,
}));
```

So the pin-building loop uses the pure `scoreFromThresholds` directly
to keep React hook rules clean.

### Types

`client/src/types.ts` — `Court` gains optional `weather`:

```ts
export interface Court {
  // ...existing fields
  score?: PlayabilityScore | null;
  stale?: boolean;
  weather?: WeatherSummary | null;  // NEW
}
```

`SavedCourtDetail` already extends `Court` and overrides `weather` as
required; no change needed there.

## Errors and edge cases

- User sets `rainMaxGood >= rainMaxOk` via direct localStorage edit →
  `clampInt` + the slider min-max constraints prevent the UI flow,
  but if it happens, scoring returns `OK` for everything in that band
  (acceptable degraded behavior).
- Weather fetch fails → `weather: null`, fallback to server's `score`
  field (which is also null in that case → gray pin / no badge).
- Anonymous user hits `/settings` directly (link share) → AuthGate
  redirects to `/login`.
- Slider ranges:
  - `rainMaxGood`: min 0, max `rainMaxOk - 1` (or capped at 60)
  - `rainMaxOk`: min `rainMaxGood + 1` (or 30 floor), max 100
  - `windMaxGood`: min 0, max 25 (extreme winds beyond 25 mph are
    almost universally BAD anyway, no need for finer control)
- "Reset to defaults" snaps all three sliders back to 30 / 60 / 12.

## Testing

- Unit: client `playability.ts` table-driven tests mirroring the
  server's existing tests + a few cases with custom thresholds (e.g.,
  thresholds={rain:50, ok:80, wind:18}, weather={rain:40, wind:15} → GOOD).
- Manual:
  - Open `/settings` (signed in). Move sliders. Verify live preview
    updates.
  - Go back to `/`. Pin colors should reflect new thresholds without
    a refetch.
  - Reload page. Settings persist.
  - Sign out from settings page. Verify redirect to `/login`.
  - Anonymous user navigates to `/settings` → bounces to `/login`.

## Risks

- **Settings divergence** between server-rendered score (default thresholds)
  and client-rendered score (user thresholds). The fallback is the only
  place this surfaces, and it only fires when weather is null. Acceptable.
- **localStorage quotas** — the entire settings blob is ~80 bytes.
  Negligible.
- **`weather` payload bump on `/api/courts`** — adds 3 numbers per
  court. With ~20 pins, ~240 bytes added per response. Trivial.
- **No cross-device sync** — explicitly accepted; can promote to
  server-side storage later if it becomes an ask.
