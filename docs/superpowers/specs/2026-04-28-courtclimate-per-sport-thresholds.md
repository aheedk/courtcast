# CourtClimate — Per-sport playability thresholds

**Date:** 2026-04-28
**Status:** Approved (autonomous, this session)
**Owner:** aheedk
**Builds on:** [2026-04-28-courtclimate-settings-page.md](./2026-04-28-courtclimate-settings-page.md)

Splits the single set of playability thresholds into a per-sport map.
Settings page Playability section gains a sport-tab row so the user
can edit each sport's thresholds independently. Score-displaying call
sites pass the relevant sport so the badge color reflects "playable
for THIS sport's rules."

## Goals

- Let users tune playability rules per sport — pickleball is more
  wind-sensitive than tennis, basketball is often indoor and rain
  shouldn't matter, etc.
- Sport tabs at the top of the Playability section, mirroring the
  rest of the app's sport-tab UX.
- All scoring on the client recomputes using the appropriate sport's
  thresholds.

## Non-goals (this round)

- Copy thresholds from one sport to another with one tap (small UX
  add; not load-bearing)
- "Apply to all sports" master switch
- Server-side per-user storage / cross-device sync
- Per-sport custom *colors* for the playability badge

## Storage

localStorage key change:

| Old | New |
|---|---|
| `courtclimate.thresholds` (a single `Thresholds` object) | `courtclimate.thresholds.bySport` (a `Record<Sport, Thresholds>`) |

Old key is **not migrated** — any prior single-thresholds tweak resets
to defaults. Acceptable: settings have only been live for a session,
no production users.

Defaults: every sport starts with `{rainMaxGood: 30, rainMaxOk: 60,
windMaxGood: 12}` — same as today's global defaults.

Read-time clamp:
- Unknown sport keys in stored map → ignored
- Missing sport keys → fall back to defaults
- Out-of-range values → clamped per existing `clampInt`

## Hook signatures

### `useThresholds(sport: Sport)`

```ts
function useThresholds(sport: Sport): [
  Thresholds,            // current thresholds for `sport`
  (next: Thresholds) => void,  // updates `sport`'s thresholds
  () => void,            // resets `sport` to defaults
];
```

Internally reads/writes the per-sport map. Update preserves other
sports' tweaks. Reset resets only the passed sport.

### `useScoreFor(weather, sport, fallback?)`

```ts
function useScoreFor(
  weather: WeatherSummary | null | undefined,
  sport: Sport,
  fallback?: PlayabilityScore | null,
): PlayabilityScore | null;
```

Reads the per-sport thresholds for `sport`, recomputes the score from
weather. Falls back to `fallback` if weather is null.

## Settings page UI

Playability section becomes:

```
Playability thresholds
Customize when GOOD / OK / BAD applies — different per sport.

[🎾 Tennis] [🏀 Basketball] [🥒 Pickleball] [📝 Custom]
                                       ↑ enabled-sports row
─────────────────────────────────────────────────────────
Rain — GOOD when below     30%
[slider]

Rain — BAD when above      60%
[slider]

Wind — GOOD when below     12 mph
[slider]

Sample (Tennis): 20% rain, 8 mph wind → 🟢 GOOD

Reset Tennis to defaults
```

- Sport-tab row at top — only enabled sports (`useEnabledSports`)
- Active tab in `useState`, default = first enabled sport
- Sliders bound to `useThresholds(activeTabSport)`
- Sample chip uses `scoreFromThresholds(sample, currentSportThresholds)`
- Reset button reads "Reset {SportName} to defaults"
- Tab styling matches other sport-tab rows in the app (pill, neutral
  for inactive, dark fill for active)

If the active tab's sport gets disabled (user toggles it off in the
Sports section just below Playability), the active tab snaps to the
first enabled sport.

## Score recomputation — call site changes

Three call sites need to pass `sport`:

| Call site | Sport to pass |
|---|---|
| `MapPage` pin-building (per pin) | current chip sport (`sport` from `useSport()`) |
| `CourtPanel` badge | current chip sport (the user's browsing context) |
| `SavedCourtCard` badge | `court.sport` (the tag the save was made under) |

Rationale:
- **Map pins / CourtPanel** — the user picked a sport on the chip
  row. They want to know "is this place good for what I'm looking
  for right now?" → use the chip sport.
- **SavedCourtCard** — the saved entry was tagged with a specific
  sport. The card is about that saved entry. → use the entry's sport.

This means the same court (with the same weather) can show as 🟢 GOOD
in the Pickleball tab on My Courts and 🟡 OK on the map (when chip
is set to Tennis). That's the correct semantic — different sport,
different rules.

## File changes

### `client/src/stores/thresholds.ts`

Replace the entire file. Key shape change:

```ts
import { useEffect, useState } from 'react';
import type { PlayabilityScore, Sport, WeatherSummary } from '../types';
import { SPORTS } from '../types';
import { DEFAULT_THRESHOLDS, scoreFromThresholds, type Thresholds } from '../lib/playability';

const KEY = 'courtclimate.thresholds.bySport';
const CHANGED_EVENT = 'courtclimate.thresholds.changed';

type ThresholdsBySport = Record<Sport, Thresholds>;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampThresholds(t: unknown): Thresholds {
  const raw = (t && typeof t === 'object') ? (t as Partial<Thresholds>) : {};
  return {
    rainMaxGood: clampInt(raw.rainMaxGood, 0, 60, DEFAULT_THRESHOLDS.rainMaxGood),
    rainMaxOk: clampInt(raw.rainMaxOk, 30, 100, DEFAULT_THRESHOLDS.rainMaxOk),
    windMaxGood: clampInt(raw.windMaxGood, 0, 25, DEFAULT_THRESHOLDS.windMaxGood),
  };
}

function defaultMap(): ThresholdsBySport {
  return Object.fromEntries(SPORTS.map((s) => [s, { ...DEFAULT_THRESHOLDS }])) as ThresholdsBySport;
}

function readAll(): ThresholdsBySport {
  const out = defaultMap();
  if (typeof window === 'undefined') return out;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return out;
    for (const sport of SPORTS) {
      if (sport in parsed) {
        out[sport] = clampThresholds(parsed[sport]);
      }
    }
    return out;
  } catch {
    return out;
  }
}

function writeAll(map: ThresholdsBySport) {
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function useThresholds(sport: Sport): [Thresholds, (next: Thresholds) => void, () => void] {
  const [all, setAll] = useState<ThresholdsBySport>(defaultMap);

  useEffect(() => {
    setAll(readAll());
  }, []);

  useEffect(() => {
    const onChange = () => setAll(readAll());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  const t = all[sport] ?? { ...DEFAULT_THRESHOLDS };

  const update = (next: Thresholds) => {
    const merged: ThresholdsBySport = { ...all, [sport]: next };
    setAll(merged);
    writeAll(merged);
  };

  const reset = () => update({ ...DEFAULT_THRESHOLDS });

  return [t, update, reset];
}

export function useScoreFor(
  weather: WeatherSummary | null | undefined,
  sport: Sport,
  fallback: PlayabilityScore | null = null,
): PlayabilityScore | null {
  const [t] = useThresholds(sport);
  if (!weather) return fallback;
  return scoreFromThresholds(weather, t);
}
```

### `client/src/routes/SettingsPage.tsx`

Changes inside the Playability section only:

1. New local state `const [activeSport, setActiveSport] = useState<Sport>(enabledSports[0])`
   — defaults to first enabled sport.
2. If `activeSport` is no longer in `enabledSports` (user disabled
   it), snap to `enabledSports[0]`. `useEffect` triggered by
   `enabledSports`.
3. `useThresholds(activeSport)` instead of `useThresholds()`.
4. Sport-tab row above the sliders (small chip row).
5. Reset button label: `Reset {SPORT_LABEL[activeSport]} to defaults`.
6. Sample chip text shows the active sport: `Sample ({SPORT_LABEL[activeSport]}): …`.

### `client/src/routes/MapPage.tsx`

`scoreFromThresholds(w, thresholds)` calls in pin-building become a
sport-aware lookup. Two clean ways:

- Read all thresholds at top via internal helper, OR
- Use the existing `useThresholds(sport)` for the current chip sport
  (same `sport` used for /api/courts query keys)

Going with the latter — pin-building in `MapPage` always uses the
**current chip sport**, since that's what the map view represents.
Saved courts get the same treatment when displayed on the map (the
user picked Tennis, they want to know if these places work for
tennis right now — even courts they tagged as basketball).

```tsx
const [thresholds] = useThresholds(sport);
// pins use scoreFromThresholds(w, thresholds) as before
```

### `client/src/components/CourtPanel.tsx`

```tsx
const userScore = useScoreFor(detail.data?.weather, sport, detail.data?.score ?? null);
```

(Same `sport` from `useSport()`.)

### `client/src/components/SavedCourtCard.tsx`

```tsx
const userScore = useScoreFor(court.weather, court.sport, court.score);
```

The saved entry's own sport tag.

## Errors and edge cases

- **Active threshold tab's sport gets disabled** — `useEffect` in
  Settings snaps `activeSport` to `enabledSports[0]`. Slider values
  jump to that sport's thresholds. No data loss.
- **Stored map missing some sports** (e.g., when sports are added in
  a future round) — `readAll` falls back to defaults for missing
  sports.
- **Stored map with weird shapes / partial data** — `clampThresholds`
  defensively handles each field.
- **No enabled sports** — defensively impossible per `useEnabledSports`
  invariant; if it somehow happened, Settings would fail to render
  the tab row but defaults would still apply globally. We won't add
  defense for an impossible case.

## Testing

- Manual: tweak Tennis threshold → switch to Pickleball tab → confirm
  Pickleball is unaffected. Save a tennis court → switch to
  Pickleball chip on map → that pin recolors using Pickleball
  thresholds. Open My Courts → tennis-tab card uses Tennis
  thresholds; pickleball-tab card uses Pickleball thresholds.
- No automated tests — no test runner on the client. Server tests
  unaffected (no server change).

## Risks

- **Migration loss** — users with single-thresholds tweaks lose them.
  Acceptable for current scale.
- **localStorage size** — 9 sports × 3 numbers ≈ 200 bytes JSON.
  Negligible.
- **Mental model** — same court showing different scores in
  different views (My Courts tab vs map chip) is intentional but
  could surprise. Settings copy + tab labels make the per-sport
  intent obvious.
