# CourtClimate — Customizable sport tabs (toggles)

**Date:** 2026-04-28
**Status:** Approved (autonomous, this session)
**Owner:** aheedk

Expands the built-in sport list from 4 to 9 (adds soccer, volleyball,
football, baseball, hockey) and adds a per-user "Sports" section in
`/settings` where the user picks which subset to show as tabs on
`My Courts` and chips on the map.

The user's primary ask: "remove pickleball and add soccer." This
spec lets them do that (plus a few more options) without the bigger
lift of fully user-defined sports.

## Goals

- Let users hide / show built-in sports independently per device.
- Default behavior unchanged: existing users see exactly the 4 sports
  they had today (tennis, basketball, pickleball, custom).
- Saved courts under a now-hidden sport stay in the database and
  remain visible in the **All** tab; re-enabling the sport restores
  them in that sport's tab.

## Non-goals

- Truly user-defined sports (custom label / emoji / keyword) — a
  separate follow-up feature
- Reordering tabs (fixed order in code)
- Per-sport playability rules (one global rule)
- Server-side per-user sport enablement (settings stay localStorage)

## Sport library — expanded

`Sport` type union grows to 9 values. Server and client both expand.

| id | label | emoji | placesKeyword | default ON |
|---|---|---|---|---|
| `tennis` | Tennis | 🎾 | `tennis court` | yes |
| `basketball` | Basketball | 🏀 | `basketball court` | yes |
| `pickleball` | Pickleball | 🥒 | `pickleball court` | yes |
| `soccer` | Soccer | ⚽ | `soccer field` | no |
| `volleyball` | Volleyball | 🏐 | `volleyball court` | no |
| `football` | Football | 🏈 | `football field` | no |
| `baseball` | Baseball | ⚾ | `baseball field` | no |
| `hockey` | Hockey | 🏑 | `hockey rink` | no |
| `custom` | Custom | 📝 | _(empty — no Places query)_ | yes |

`SPORTS` order in code defines display order. Custom stays last (the
"none-of-the-above" tag).

## Storage

New localStorage key: `courtclimate.enabledSports` — JSON array of
sport ids. Default: `["tennis","basketball","pickleball","custom"]`.

Read-time clamp: any unknown ids in the stored array are dropped;
if the resulting list is empty, fall back to the default. Maintains
the "must have at least one" invariant defensively.

## `useEnabledSports()` hook

```ts
function useEnabledSports(): [Sport[], (next: Sport[]) => void]
```

Returns the enabled sports in `SPORTS`-defined order (not insertion
order). Same shape pattern as `useSport`, `useThresholds`: hydrate on
mount, write to localStorage on update, broadcast a custom event so
other mounted consumers re-read.

A small wrapper helper exposed alongside:

```ts
function isEnabled(sport: Sport, enabled: Sport[]): boolean
function toggleSport(sport: Sport, enabled: Sport[]): Sport[]
```

`toggleSport` enforces the **min-1** rule: trying to disable the only
remaining enabled sport returns the unchanged array.

## `useSport()` clamp behavior

`useSport` already returns `[Sport, (s: Sport) => void]`. Update its
read path:

- If the stored sport is not in `enabledSports`, return the first
  enabled sport instead.
- The localStorage value stays as-is — if the user re-enables their
  preferred sport later, they snap right back to it.

This means the on-screen chip selection always corresponds to a
visible chip; users never end up "selected on a hidden sport."

## UI

### `/settings` — new "Sports" section

Placed between "Playability thresholds" and "Default sport" (sports
toggles logically come before the "default sport" picker, since the
picker only shows enabled sports).

```
┌─ Sports ─────────────────────────────────────┐
│ Pick which sports show as tabs and chips.    │
│                                              │
│  ✓🎾 Tennis  ✓🏀 Basketball  ✓🥒 Pickleball  │
│  ⚪⚽ Soccer  ⚪🏐 Volleyball  ⚪🏈 Football   │
│  ⚪⚾ Baseball  ⚪🏑 Hockey  ✓📝 Custom        │
└──────────────────────────────────────────────┘
```

- 9 chips in a wrap layout (3-per-row on phones, more per row on wider
  screens).
- Each chip: emoji + label, with green fill when enabled, white
  background + neutral border when disabled.
- Tap to toggle.
- The single remaining enabled chip is rendered with `disabled` styling
  + `aria-disabled="true"` and ignores tap (with a tiny hint text below
  if it's the last one).

The existing **Default sport** section (just below) automatically
shrinks its chip row to enabled sports only — same `useEnabledSports`
flow.

### `SportChips.tsx` — render only enabled

Already takes `value` + `onChange` props. The set it iterates changes
from the global `SPORTS` constant to a prop or to a local
`useEnabledSports` call.

For consistency with the existing pattern (chip set determined by
caller, not the chip component), pass enabled sports as a prop:

```tsx
interface SportChipsProps {
  value: Sport;
  onChange: (s: Sport) => void;
  sports?: readonly Sport[];  // defaults to SPORTS for back-compat
}
```

`MapPage` and `SettingsPage` pass `sports={enabledSports}`. The full
list `SPORTS` is still the default for any caller that wants the
whole picker (the Settings page's "Sports" section uses a different
component since it shows enabled-state per chip).

### `MyCourtsPage` tabs

Already maps `SPORTS.map(s => ...)` to build the tab list. Replace
with `enabledSports.map(...)`. The "All" tab stays at the front.

### Map page when active sport gets disabled

Triggered by `useSport`'s clamp behavior — the active chip jumps
to the first enabled sport. The map's `/api/courts` query
auto-refetches because its `queryKey` includes `sport`.

## Server changes

### `server/src/lib/sport.ts` — extended

```ts
export type Sport =
  | 'tennis' | 'basketball' | 'pickleball'
  | 'soccer' | 'volleyball' | 'football' | 'baseball' | 'hockey'
  | 'custom';

export const SPORTS: readonly Sport[] = [
  'tennis', 'basketball', 'pickleball',
  'soccer', 'volleyball', 'football', 'baseball', 'hockey',
  'custom',
] as const;

const SPORT_KEYWORD: Record<Sport, string> = {
  tennis: 'tennis court',
  basketball: 'basketball court',
  pickleball: 'pickleball court',
  soccer: 'soccer field',
  volleyball: 'volleyball court',
  football: 'football field',
  baseball: 'baseball field',
  hockey: 'hockey rink',
  custom: '',
};
```

`buildPlacesKeyword` and `SPORTS` zod enum validation (in
`courts.ts`, `meCourts.ts`, `meLists.ts`) automatically pick up the
new values — no other server code changes.

### `server/test/sport.test.ts` — extended

Add cases for the 5 new sports. Verify `SPORTS` length === 9.

## Client changes

### `client/src/types.ts` — extended

```ts
export type Sport =
  | 'tennis' | 'basketball' | 'pickleball'
  | 'soccer' | 'volleyball' | 'football' | 'baseball' | 'hockey'
  | 'custom';

export const SPORTS: readonly Sport[] = [
  'tennis', 'basketball', 'pickleball',
  'soccer', 'volleyball', 'football', 'baseball', 'hockey',
  'custom',
] as const;

export const SPORT_LABEL: Record<Sport, string> = {
  tennis: 'Tennis',
  basketball: 'Basketball',
  pickleball: 'Pickleball',
  soccer: 'Soccer',
  volleyball: 'Volleyball',
  football: 'Football',
  baseball: 'Baseball',
  hockey: 'Hockey',
  custom: 'Custom',
};

export const SPORT_EMOJI: Record<Sport, string> = {
  tennis: '🎾',
  basketball: '🏀',
  pickleball: '🥒',
  soccer: '⚽',
  volleyball: '🏐',
  football: '🏈',
  baseball: '⚾',
  hockey: '🏑',
  custom: '📝',
};
```

### `client/src/stores/enabledSports.ts` (NEW)

```ts
import { useEffect, useState } from 'react';
import { SPORTS, type Sport } from '../types';

const KEY = 'courtclimate.enabledSports';
const CHANGED_EVENT = 'courtclimate.enabledSports.changed';

const DEFAULT_ENABLED: Sport[] = ['tennis', 'basketball', 'pickleball', 'custom'];

function read(): Sport[] {
  if (typeof window === 'undefined') return DEFAULT_ENABLED;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ENABLED;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return DEFAULT_ENABLED;
    const set = new Set(arr.filter((s): s is Sport => SPORTS.includes(s)));
    if (set.size === 0) return DEFAULT_ENABLED;
    return SPORTS.filter((s) => set.has(s));
  } catch {
    return DEFAULT_ENABLED;
  }
}

export function useEnabledSports(): [Sport[], (next: Sport[]) => void] {
  const [v, setV] = useState<Sport[]>(DEFAULT_ENABLED);
  useEffect(() => { setV(read()); }, []);
  useEffect(() => {
    const onChange = () => setV(read());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);
  const update = (next: Sport[]) => {
    const ordered = SPORTS.filter((s) => next.includes(s));
    const safe = ordered.length > 0 ? ordered : DEFAULT_ENABLED;
    setV(safe);
    window.localStorage.setItem(KEY, JSON.stringify(safe));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  };
  return [v, update];
}

export function toggleSport(sport: Sport, enabled: Sport[]): Sport[] {
  const set = new Set(enabled);
  if (set.has(sport)) {
    if (enabled.length === 1) return enabled; // min-1 invariant
    set.delete(sport);
  } else {
    set.add(sport);
  }
  return Array.from(set);
}
```

### `client/src/stores/sport.ts` — clamped read

```ts
// Inside read() (existing function), after parsing the stored value:
const enabled = readEnabledSports(); // imported from enabledSports.ts internal helper or shared
if (!enabled.includes(stored)) {
  return enabled[0] ?? 'tennis';
}
```

(Implementation note: `read()` in sport.ts becomes `read(enabledSports)`; the `useSport()` hook calls it with current enabled list.)

### `client/src/components/SportChips.tsx` — accept sports prop

```tsx
interface Props {
  value: Sport;
  onChange: (s: Sport) => void;
  sports?: readonly Sport[];
}
export function SportChips({ value, onChange, sports = SPORTS }: Props) {
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {sports.map((s) => { /* existing chip render */ })}
    </div>
  );
}
```

`flex-wrap` so the chip row gracefully wraps if many sports are
enabled at once on a narrow phone.

### `client/src/routes/MapPage.tsx`

```tsx
const [enabledSports] = useEnabledSports();
// ...
<SportChips value={sport} onChange={setSport} sports={enabledSports} />
```

### `client/src/routes/MyCourtsPage.tsx`

Replace `SPORTS.map(...)` with `enabledSports.map(...)` in the tab
list. The "All" / "📝 Custom" handling already works because Custom
is in the enabled set by default (and stays a regular `Sport` value).

### `client/src/routes/SettingsPage.tsx`

Add a new section before "Default sport". Render a new local
component `SportTogglePanel` that maps over the full `SPORTS` list
and renders each as a toggleable chip. Tapping calls
`update(toggleSport(s, enabledSports))`.

The existing `<SportChips value={sport} onChange={setSport} />` in
the Default sport section now passes `sports={enabledSports}` so
the picker only shows sports the user has enabled.

## Errors and edge cases

- **User disables all sports** — defensive clamp in
  `useEnabledSports.update()` falls back to `DEFAULT_ENABLED`
  rather than allowing an empty list. UI also blocks the last-toggle
  click, so this is double-protected.
- **Saved courts under a disabled sport** — still in the DB; appear
  in the **All** tab. The sport-specific tab is gone. Re-enabling
  brings the dedicated tab back with those courts visible.
- **Active map sport disabled** — `useSport` returns the first
  enabled sport. Map refetches.
- **Lists containing courts with disabled sport tags** — list
  membership unchanged; courts still render inside the list view
  (which doesn't depend on enabled sports).
- **User on iPhone has many sports enabled** — chip row uses
  `flex-wrap` so it wraps to multiple lines instead of overflowing.

## Testing

- Unit (`server/test/sport.test.ts`):
  - `buildPlacesKeyword('soccer')` → `"soccer field"`
  - All 5 new sports map to their expected keywords
  - `SPORTS.length === 9`
- Manual:
  - Settings → Sports → disable Pickleball → confirm pickleball chip
    disappears from map and pickleball tab disappears from My Courts
  - Re-enable Pickleball → both reappear, with previously-saved
    pickleball courts visible
  - Disable everything → settings stops you at the last one (toast/
    visual indication that this can't be turned off)
  - Switch to Pickleball, then disable it → map snaps to first
    enabled (Tennis); refresh; sport persists as last enabled
  - Enable Soccer → search "Tampa" in Place mode → soccer-fields
    pins should appear

## Risks

- **Sport-tab churn confusion.** Disabling a sport hides its tab; if
  the user has saves there, those go to All only. Mitigated by the
  fact that re-enabling restores the tab transparently.
- **Mobile chip wrap.** With 6+ enabled sports, the chip row on a
  phone wraps to 2 lines, eating ~30px of vertical space. Acceptable.
  If it becomes an issue we can switch to a horizontal scroll
  on phones.
- **Server <> client `Sport` type drift.** Both stacks define the same
  union; expanding both at once (this round) is the only safe path.
  If they ever diverge, the zod enum on server rejects the unknown
  client value with 400.
