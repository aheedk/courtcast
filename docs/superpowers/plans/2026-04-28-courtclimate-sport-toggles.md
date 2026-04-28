# Customizable sport tabs (toggles) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand built-in sports from 4 to 9, and let users pick which subset to show as map chips and My Courts tabs from `/settings`.

**Architecture:** Sport union extended on both stacks. New `useEnabledSports()` localStorage hook controls visibility. `useSport()` clamps the active sport to whatever is enabled. Settings page gains a "Sports" toggle section. SportChips accepts an optional `sports` prop so callers control which subset to render.

**Tech Stack:** Same — no new libraries.

**Spec:** `docs/superpowers/specs/2026-04-28-courtclimate-sport-toggles.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/src/lib/sport.ts` | Modify | Sport union + SPORTS array + SPORT_KEYWORD expand to 9 |
| `server/test/sport.test.ts` | Modify | 5 new sport cases + length assertion |
| `client/src/types.ts` | Modify | Sport union + SPORTS + SPORT_LABEL + SPORT_EMOJI expand to 9 |
| `client/src/stores/enabledSports.ts` | Create | `useEnabledSports()` + `toggleSport` + exported `readEnabledSports` |
| `client/src/stores/sport.ts` | Modify | Clamp active sport to first enabled when stored sport is disabled |
| `client/src/components/SportChips.tsx` | Modify | Accept optional `sports` prop, default = full SPORTS |
| `client/src/routes/MapPage.tsx` | Modify | Pass `sports={enabledSports}` to SportChips |
| `client/src/routes/MyCourtsPage.tsx` | Modify | Build tabs from `enabledSports` |
| `client/src/routes/SettingsPage.tsx` | Modify | Add Sports section with toggleable chips; default-sport row uses enabledSports |

---

## Task 1: Server — expand sport library to 9 sports

**Files:**
- Modify: `server/src/lib/sport.ts`
- Modify: `server/test/sport.test.ts`

- [ ] **Step 1: Update sport.test.ts (failing cases)**

Replace `server/test/sport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPlacesKeyword, SPORTS } from '../src/lib/sport';

describe('buildPlacesKeyword', () => {
  it('tennis no keyword → "tennis court"', () => {
    expect(buildPlacesKeyword('tennis')).toBe('tennis court');
  });
  it('basketball no keyword → "basketball court"', () => {
    expect(buildPlacesKeyword('basketball')).toBe('basketball court');
  });
  it('pickleball no keyword → "pickleball court"', () => {
    expect(buildPlacesKeyword('pickleball')).toBe('pickleball court');
  });
  it('soccer no keyword → "soccer field"', () => {
    expect(buildPlacesKeyword('soccer')).toBe('soccer field');
  });
  it('volleyball no keyword → "volleyball court"', () => {
    expect(buildPlacesKeyword('volleyball')).toBe('volleyball court');
  });
  it('football no keyword → "football field"', () => {
    expect(buildPlacesKeyword('football')).toBe('football field');
  });
  it('baseball no keyword → "baseball field"', () => {
    expect(buildPlacesKeyword('baseball')).toBe('baseball field');
  });
  it('hockey no keyword → "hockey rink"', () => {
    expect(buildPlacesKeyword('hockey')).toBe('hockey rink');
  });
  it('custom no keyword → ""', () => {
    expect(buildPlacesKeyword('custom')).toBe('');
  });
  it('soccer + "indoor" → "soccer field indoor"', () => {
    expect(buildPlacesKeyword('soccer', 'indoor')).toBe('soccer field indoor');
  });
  it('SPORTS array exposes all nine in fixed order', () => {
    expect(SPORTS).toEqual([
      'tennis', 'basketball', 'pickleball',
      'soccer', 'volleyball', 'football', 'baseball', 'hockey',
      'custom',
    ]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npm test -- sport
```

Expected: 6 of the new tests fail (5 sport keyword cases + the SPORTS-equals-9 assertion).

- [ ] **Step 3: Update sport.ts**

Replace `server/src/lib/sport.ts`:

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

export function buildPlacesKeyword(sport: Sport, userKeyword?: string): string {
  const trimmed = (userKeyword ?? '').trim();
  return [SPORT_KEYWORD[sport], trimmed].filter(Boolean).join(' ');
}
```

- [ ] **Step 4: Run tests — expect all PASS**

```bash
cd server && npm test
```

Expected: 11/11 sport tests + everything else green (~42 total).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/sport.ts server/test/sport.test.ts
git commit -m "feat(server): expand sport library to 9 sports"
```

---

## Task 2: Client types — expand Sport union

**Files:**
- Modify: `client/src/types.ts`

- [ ] **Step 1: Replace types.ts**

Full replacement of `client/src/types.ts`:

```ts
export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

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

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

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
  weather?: WeatherSummary | null;
}

export interface WeatherSummary {
  tempF: number;
  windMph: number;
  rainPctNext2h: number;
}

export interface SavedCourtDetail extends Court {
  savedAt: string;
  sport: Sport;
  nickname: string | null;
  weather: WeatherSummary | null;
  score: PlayabilityScore | null;
  stale: boolean;
}

export interface CourtDetail {
  court: Court;
  weather: WeatherSummary;
  score: PlayabilityScore;
  stale: boolean;
}

export interface ListSummary {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListDetail {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: SavedCourtDetail[];
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean. Existing consumers (`SPORT_EMOJI[c.sport]` etc.) automatically pick up the new entries.

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat(client): expand Sport union to 9 sports (+ labels + emoji)"
```

---

## Task 3: Client store — useEnabledSports

**Files:**
- Create: `client/src/stores/enabledSports.ts`

- [ ] **Step 1: Create the store**

```ts
import { useEffect, useState } from 'react';
import { SPORTS, type Sport } from '../types';

const KEY = 'courtclimate.enabledSports';
const CHANGED_EVENT = 'courtclimate.enabledSports.changed';

const DEFAULT_ENABLED: readonly Sport[] = ['tennis', 'basketball', 'pickleball', 'custom'];

export function readEnabledSports(): Sport[] {
  if (typeof window === 'undefined') return [...DEFAULT_ENABLED];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [...DEFAULT_ENABLED];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT_ENABLED];
    const set = new Set(arr.filter((s): s is Sport => SPORTS.includes(s)));
    if (set.size === 0) return [...DEFAULT_ENABLED];
    return SPORTS.filter((s) => set.has(s));
  } catch {
    return [...DEFAULT_ENABLED];
  }
}

export function useEnabledSports(): [Sport[], (next: Sport[]) => void] {
  const [v, setV] = useState<Sport[]>([...DEFAULT_ENABLED]);

  useEffect(() => {
    setV(readEnabledSports());
  }, []);

  useEffect(() => {
    const onChange = () => setV(readEnabledSports());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  const update = (next: Sport[]) => {
    const ordered = SPORTS.filter((s) => next.includes(s));
    const safe = ordered.length > 0 ? ordered : [...DEFAULT_ENABLED];
    setV(safe);
    window.localStorage.setItem(KEY, JSON.stringify(safe));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  };

  return [v, update];
}

export function toggleSport(sport: Sport, enabled: Sport[]): Sport[] {
  if (enabled.includes(sport)) {
    if (enabled.length === 1) return enabled; // min-1 invariant
    return enabled.filter((s) => s !== sport);
  }
  return [...enabled, sport];
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/stores/enabledSports.ts
git commit -m "feat(client): useEnabledSports + toggleSport (localStorage-backed)"
```

---

## Task 4: Client store — clamp useSport to enabled set

**Files:**
- Modify: `client/src/stores/sport.ts`

- [ ] **Step 1: Update sport.ts to clamp on read + listen for enabledSports change**

Replace `client/src/stores/sport.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Sport } from '../types';
import { SPORTS } from '../types';
import { readEnabledSports } from './enabledSports';

const KEY = 'courtclimate.sport';
const ENABLED_CHANGED = 'courtclimate.enabledSports.changed';

function readRaw(): Sport {
  if (typeof window === 'undefined') return 'tennis';
  const v = window.localStorage.getItem(KEY);
  return (SPORTS as readonly string[]).includes(v as Sport) ? (v as Sport) : 'tennis';
}

function readClamped(): Sport {
  const stored = readRaw();
  const enabled = readEnabledSports();
  if (enabled.includes(stored)) return stored;
  return enabled[0] ?? 'tennis';
}

export function useSport(): [Sport, (s: Sport) => void] {
  const [sport, setSportState] = useState<Sport>('tennis');

  useEffect(() => {
    setSportState(readClamped());
  }, []);

  useEffect(() => {
    const onChange = () => setSportState(readClamped());
    window.addEventListener(ENABLED_CHANGED, onChange);
    return () => window.removeEventListener(ENABLED_CHANGED, onChange);
  }, []);

  const setSport = (s: Sport) => {
    setSportState(s);
    window.localStorage.setItem(KEY, s);
  };

  return [sport, setSport];
}
```

Notable: imports `readEnabledSports` from `./enabledSports`. No circular dep — `enabledSports.ts` only imports from `../types`.

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/stores/sport.ts
git commit -m "feat(client): useSport clamps to first enabled sport when stored is disabled"
```

---

## Task 5: SportChips — accept sports prop

**Files:**
- Modify: `client/src/components/SportChips.tsx`

- [ ] **Step 1: Replace SportChips.tsx**

```tsx
import type { Sport } from '../types';
import { SPORTS, SPORT_LABEL, SPORT_EMOJI } from '../types';

interface Props {
  value: Sport;
  onChange: (s: Sport) => void;
  sports?: readonly Sport[];
}

export function SportChips({ value, onChange, sports = SPORTS }: Props) {
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {sports.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={
              active
                ? 'bg-good text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-md'
                : 'bg-white text-neutral-900 px-4 py-1.5 rounded-full text-xs font-semibold shadow-md hover:bg-neutral-50'
            }
            aria-pressed={active}
          >
            {SPORT_EMOJI[s]} {SPORT_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}
```

Notable: adds `flex-wrap` so the chip row gracefully wraps when many sports are enabled on a narrow phone.

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean. Existing consumers passing only `value` + `onChange` get `SPORTS` as default — back-compatible.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/SportChips.tsx
git commit -m "feat(client): SportChips accepts optional sports prop (defaults to SPORTS)"
```

---

## Task 6: MapPage — pass enabled sports to SportChips

**Files:**
- Modify: `client/src/routes/MapPage.tsx`

- [ ] **Step 1: Add enabledSports + pass to SportChips**

In `client/src/routes/MapPage.tsx`, add the import:

```tsx
import { useEnabledSports } from '../stores/enabledSports';
```

Inside `MapPage`, near the other hook calls, add:

```tsx
  const [enabledSports] = useEnabledSports();
```

Then find the existing SportChips render:

```tsx
        <div className="pointer-events-auto">
          <SportChips value={sport} onChange={setSport} />
        </div>
```

Replace with:

```tsx
        <div className="pointer-events-auto">
          <SportChips value={sport} onChange={setSport} sports={enabledSports} />
        </div>
```

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MapPage.tsx
git commit -m "feat(client): MapPage SportChips renders enabled sports only"
```

---

## Task 7: MyCourtsPage — tabs from enabled sports

**Files:**
- Modify: `client/src/routes/MyCourtsPage.tsx`

- [ ] **Step 1: Add enabledSports import + use in tab list**

In `client/src/routes/MyCourtsPage.tsx`, add the import:

```tsx
import { useEnabledSports } from '../stores/enabledSports';
```

Inside `MyCourtsPage`, near the existing `saved` query:

```tsx
  const [enabledSports] = useEnabledSports();
```

Find the tabs builder:

```tsx
  const tabs: { value: TabValue; label: string }[] = [
    { value: 'all', label: 'All' },
    ...SPORTS.map((s) => ({ value: s as TabValue, label: `${SPORT_EMOJI[s]} ${SPORT_LABEL[s]}` })),
  ];
```

Replace with:

```tsx
  const tabs: { value: TabValue; label: string }[] = [
    { value: 'all', label: 'All' },
    ...enabledSports.map((s) => ({ value: s as TabValue, label: `${SPORT_EMOJI[s]} ${SPORT_LABEL[s]}` })),
  ];
```

(Note: the unused `SPORTS` import on this file can stay — it's tree-shaken if unused, and a couple of other strings still reference SPORT_LABEL/SPORT_EMOJI.)

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MyCourtsPage.tsx
git commit -m "feat(client): MyCourts tabs render enabled sports only"
```

---

## Task 8: SettingsPage — Sports section + default-sport picker uses enabled

**Files:**
- Modify: `client/src/routes/SettingsPage.tsx`

- [ ] **Step 1: Add Sports section + filter Default sport picker**

In `client/src/routes/SettingsPage.tsx`, add imports:

```tsx
import { useEnabledSports, toggleSport } from '../stores/enabledSports';
import { SPORTS, SPORT_EMOJI, SPORT_LABEL } from '../types';
```

(If `SPORTS`, `SPORT_EMOJI`, `SPORT_LABEL` are already imported, keep that import — just add what's missing.)

Inside `SettingsPage`, near the other hook calls, add:

```tsx
  const [enabledSports, setEnabledSports] = useEnabledSports();
```

Find the existing "Default sport" section:

```tsx
      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Default sport
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          The sport chip selected when you open the map.
        </p>
        <SportChips value={sport} onChange={setSport} />
      </section>
```

Replace with:

```tsx
      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Sports
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          Pick which sports show as tabs and chips.
        </p>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((s) => {
            const isEnabled = enabledSports.includes(s);
            const isLast = isEnabled && enabledSports.length === 1;
            return (
              <button
                key={s}
                onClick={() => {
                  if (isLast) return;
                  setEnabledSports(toggleSport(s, enabledSports));
                }}
                disabled={isLast}
                aria-pressed={isEnabled}
                className={
                  isEnabled
                    ? 'bg-good text-white px-3 py-1.5 rounded-full text-sm font-semibold disabled:opacity-80'
                    : 'bg-white text-neutral-700 border border-neutral-300 px-3 py-1.5 rounded-full text-sm font-semibold hover:bg-neutral-50'
                }
              >
                {SPORT_EMOJI[s]} {SPORT_LABEL[s]}
              </button>
            );
          })}
        </div>
        {enabledSports.length === 1 && (
          <p className="text-xs text-neutral-500 mt-3">At least one sport must stay enabled.</p>
        )}
      </section>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Default sport
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          The sport chip selected when you open the map.
        </p>
        <SportChips value={sport} onChange={setSport} sports={enabledSports} />
      </section>
```

This **inserts a new "Sports" section** before the existing (now-modified) "Default sport" section, and updates the Default sport `SportChips` to take `sports={enabledSports}`.

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/SettingsPage.tsx
git commit -m "feat(client): Settings — Sports toggle section + default-sport picker uses enabled"
```

---

## Task 9: Final verify + push

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
- ✅ Sport union expands to 9 → Task 1, 2
- ✅ SPORT_KEYWORD covers new sports → Task 1
- ✅ SPORT_LABEL + SPORT_EMOJI cover new sports → Task 2
- ✅ `useEnabledSports()` localStorage hook → Task 3
- ✅ `toggleSport` helper with min-1 invariant → Task 3
- ✅ `useSport()` clamps active sport to first enabled → Task 4
- ✅ `useSport()` listens for enabledSports change event → Task 4
- ✅ `SportChips` accepts optional sports prop → Task 5
- ✅ `flex-wrap` on chip row → Task 5
- ✅ MapPage passes enabled sports → Task 6
- ✅ MyCourts tabs render only enabled sports → Task 7
- ✅ Settings "Sports" section with toggle chips → Task 8
- ✅ Last-enabled chip un-toggleable + hint text → Task 8
- ✅ Default sport picker uses enabledSports → Task 8
- ✅ Defaults preserve back-compat (4 sports enabled by default) → Task 3
- ✅ Server zod enum auto-validates new sports → Task 1 (zod uses SPORTS array)

**Type consistency:**
- `Sport` union is identical on server (Task 1) and client (Task 2): same 9 values, same order.
- `SPORTS` array order: `['tennis','basketball','pickleball','soccer','volleyball','football','baseball','hockey','custom']` on both stacks.
- `useEnabledSports()` return tuple `[Sport[], (next: Sport[]) => void]` consumed by Tasks 6, 7, 8.
- `toggleSport(sport, enabled)` returns `Sport[]` — Task 8 wraps with `setEnabledSports(toggleSport(...))`.
- `readEnabledSports()` is a non-hook function (used both inside and outside React) — exported from Task 3, imported by Task 4.

**Placeholder scan:** none.

**Migration safety:**
- Schema unchanged (sport is already a String column).
- Existing localStorage values for `courtclimate.sport` ('tennis'/'basketball'/'pickleball'/'custom') remain valid — they're all in the default-enabled set.
- Users who haven't set `courtclimate.enabledSports` get the default (4 sports), so existing UX is unchanged until they tweak.
- Saved courts under non-default sports (none exist today) would be persisted but require enabling the sport to surface in its tab.
