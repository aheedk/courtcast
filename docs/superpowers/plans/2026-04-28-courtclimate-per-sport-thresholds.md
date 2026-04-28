# Per-sport playability thresholds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single global playability thresholds into a per-sport map and surface per-sport tabs in the Settings page Playability section.

**Architecture:** Storage shape changes from one `Thresholds` object to `Record<Sport, Thresholds>` in localStorage. `useThresholds(sport)` and `useScoreFor(weather, sport, fallback)` gain a sport arg. SettingsPage gets a sport-tab row. MapPage passes the current chip sport; CourtPanel passes the current chip sport; SavedCourtCard passes the saved entry's `court.sport`.

**Tech Stack:** Same — no new libraries, no server changes.

**Spec:** `docs/superpowers/specs/2026-04-28-courtclimate-per-sport-thresholds.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `client/src/stores/thresholds.ts` | Modify | Per-sport map storage; `useThresholds(sport)`, `useScoreFor(weather, sport, fallback)` |
| `client/src/routes/SettingsPage.tsx` | Modify | Sport-tab row at top of Playability section |
| `client/src/routes/MapPage.tsx` | Modify | `useThresholds(sport)` instead of `useThresholds()` |
| `client/src/components/CourtPanel.tsx` | Modify | `useScoreFor(weather, sport, fallback)` |
| `client/src/components/SavedCourtCard.tsx` | Modify | `useScoreFor(court.weather, court.sport, court.score)` |

---

## Task 1: thresholds.ts — per-sport storage + new hook signatures

**Files:**
- Modify: `client/src/stores/thresholds.ts`

- [ ] **Step 1: Replace thresholds.ts**

Full replacement of `client/src/stores/thresholds.ts`:

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

- [ ] **Step 2: Type-check (expect call-site errors)**

```bash
cd client && npx tsc --noEmit
```

Expected: errors in `SettingsPage.tsx`, `MapPage.tsx`, `CourtPanel.tsx`, `SavedCourtCard.tsx` because their `useThresholds()` / `useScoreFor()` calls now require a sport arg. Tasks 2-5 fix.

- [ ] **Step 3: Commit**

```bash
git add client/src/stores/thresholds.ts
git commit -m "feat(client): per-sport thresholds — useThresholds(sport), useScoreFor(weather, sport, fallback)"
```

---

## Task 2: SettingsPage — sport-tab row in Playability section

**Files:**
- Modify: `client/src/routes/SettingsPage.tsx`

- [ ] **Step 1: Update SettingsPage.tsx**

Find the existing imports block. Add `useState`, `useEffect` (already from react), and `Sport` type. Specifically, change:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
```

to (add `useState` and `useEffect` from react):

```tsx
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
```

And update the type import to include Sport:

```tsx
import type { Sport, User } from '../types';
```

Replace the entire Playability section. Find:

```tsx
      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Playability thresholds
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          Customize when GOOD / OK / BAD applies to courts on the map.
        </p>

        <ThresholdSlider
          label="Rain — GOOD when below"
          value={thresholds.rainMaxGood}
          min={0}
          max={rainGoodMax}
          unit="%"
          onChange={(v) => setThresholds({ ...thresholds, rainMaxGood: v })}
        />
        <ThresholdSlider
          label="Rain — BAD when above"
          value={thresholds.rainMaxOk}
          min={rainOkMin}
          max={100}
          unit="%"
          onChange={(v) => setThresholds({ ...thresholds, rainMaxOk: v })}
        />
        <ThresholdSlider
          label="Wind — GOOD when below"
          value={thresholds.windMaxGood}
          min={0}
          max={25}
          unit=" mph"
          onChange={(v) => setThresholds({ ...thresholds, windMaxGood: v })}
        />

        <div className="mt-5 flex items-center gap-3 text-sm text-neutral-600">
          <span>Sample: 20% rain, 8 mph wind →</span>
          <PlayabilityBadge score={preview} size="sm" />
        </div>

        <button
          onClick={resetThresholds}
          className="mt-4 text-sm text-good font-semibold hover:underline"
        >
          Reset to defaults
        </button>
      </section>
```

Replace with:

```tsx
      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Playability thresholds
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          Customize when GOOD / OK / BAD applies — different per sport.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {enabledSports.map((s) => {
            const active = s === activeSport;
            return (
              <button
                key={s}
                onClick={() => setActiveSport(s)}
                aria-pressed={active}
                className={
                  active
                    ? 'shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold bg-neutral-900 text-white'
                    : 'shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50'
                }
              >
                {SPORT_EMOJI[s]} {SPORT_LABEL[s]}
              </button>
            );
          })}
        </div>

        <ThresholdSlider
          label="Rain — GOOD when below"
          value={thresholds.rainMaxGood}
          min={0}
          max={rainGoodMax}
          unit="%"
          onChange={(v) => setThresholds({ ...thresholds, rainMaxGood: v })}
        />
        <ThresholdSlider
          label="Rain — BAD when above"
          value={thresholds.rainMaxOk}
          min={rainOkMin}
          max={100}
          unit="%"
          onChange={(v) => setThresholds({ ...thresholds, rainMaxOk: v })}
        />
        <ThresholdSlider
          label="Wind — GOOD when below"
          value={thresholds.windMaxGood}
          min={0}
          max={25}
          unit=" mph"
          onChange={(v) => setThresholds({ ...thresholds, windMaxGood: v })}
        />

        <div className="mt-5 flex items-center gap-3 text-sm text-neutral-600">
          <span>Sample ({SPORT_LABEL[activeSport]}): 20% rain, 8 mph wind →</span>
          <PlayabilityBadge score={preview} size="sm" />
        </div>

        <button
          onClick={resetThresholds}
          className="mt-4 text-sm text-good font-semibold hover:underline"
        >
          Reset {SPORT_LABEL[activeSport]} to defaults
        </button>
      </section>
```

Then update the hook call. Find:

```tsx
  const [thresholds, setThresholds, resetThresholds] = useThresholds();
```

Replace with:

```tsx
  const [activeSport, setActiveSport] = useState<Sport>(enabledSports[0] ?? 'tennis');

  // If user disables the sport currently being edited, snap to first enabled.
  useEffect(() => {
    if (!enabledSports.includes(activeSport)) {
      setActiveSport(enabledSports[0] ?? 'tennis');
    }
  }, [enabledSports, activeSport]);

  const [thresholds, setThresholds, resetThresholds] = useThresholds(activeSport);
```

The order in the function body matters: `enabledSports` must already be destructured (it is — happens above the playability section). Verify by reading the file before editing.

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: Settings type-checks clean. Other call sites still error (Tasks 3-5).

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/SettingsPage.tsx
git commit -m "feat(client): Settings Playability — sport-tab row, per-sport editing"
```

---

## Task 3: MapPage — useThresholds(sport)

**Files:**
- Modify: `client/src/routes/MapPage.tsx`

- [ ] **Step 1: Add sport arg to useThresholds**

In `client/src/routes/MapPage.tsx`, find:

```tsx
  const [thresholds] = useThresholds();
```

Replace with:

```tsx
  const [thresholds] = useThresholds(sport);
```

(`sport` is already destructured from `useSport()` higher up in the function.)

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: MapPage clean. CourtPanel and SavedCourtCard still error.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MapPage.tsx
git commit -m "feat(client): MapPage uses per-sport thresholds (current chip)"
```

---

## Task 4: CourtPanel — useScoreFor(weather, sport, fallback)

**Files:**
- Modify: `client/src/components/CourtPanel.tsx`

- [ ] **Step 1: Add sport arg to useScoreFor**

In `client/src/components/CourtPanel.tsx`, find:

```tsx
  const userScore = useScoreFor(detail.data?.weather, detail.data?.score ?? null);
```

Replace with:

```tsx
  const userScore = useScoreFor(detail.data?.weather, sport, detail.data?.score ?? null);
```

(`sport` is already destructured from `useSport()` higher up in the function.)

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: CourtPanel clean. SavedCourtCard still errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/CourtPanel.tsx
git commit -m "feat(client): CourtPanel badge uses current chip sport's thresholds"
```

---

## Task 5: SavedCourtCard — useScoreFor with court.sport

**Files:**
- Modify: `client/src/components/SavedCourtCard.tsx`

- [ ] **Step 1: Add court.sport arg**

In `client/src/components/SavedCourtCard.tsx`, find:

```tsx
  const userScore = useScoreFor(court.weather, court.score);
```

Replace with:

```tsx
  const userScore = useScoreFor(court.weather, court.sport, court.score);
```

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean tsc, vite build passes.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/SavedCourtCard.tsx
git commit -m "feat(client): SavedCourtCard badge uses court.sport's thresholds"
```

---

## Task 6: Final verify + push

**Files:** none

- [ ] **Step 1: Server build + tests**

```bash
cd server && npm run build && npm test
```

Expected: clean, all tests pass (server unaffected).

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
- ✅ Storage key change `courtclimate.thresholds` → `courtclimate.thresholds.bySport` → Task 1
- ✅ Per-sport defaults (every sport starts at 30/60/12) → Task 1 (`defaultMap`)
- ✅ Read-time clamp + missing-sport fallback → Task 1 (`readAll`, `clampThresholds`)
- ✅ `useThresholds(sport)` returns `[Thresholds, update, reset]` → Task 1
- ✅ `useScoreFor(weather, sport, fallback?)` → Task 1
- ✅ Settings sport-tab row → Task 2
- ✅ Active tab snaps when its sport is disabled → Task 2 (the useEffect)
- ✅ Sample chip shows active sport label → Task 2
- ✅ Reset button labels with active sport → Task 2
- ✅ MapPage pin-building uses current chip sport's thresholds → Task 3
- ✅ CourtPanel badge uses current chip sport → Task 4
- ✅ SavedCourtCard badge uses `court.sport` → Task 5
- ✅ No server changes needed → confirmed; Task 6 just verifies server still builds

**Type consistency:**
- `useThresholds(sport: Sport)` signature — defined Task 1, called Task 2 (`activeSport`), Task 3 (`sport`).
- `useScoreFor(weather, sport, fallback?)` signature — defined Task 1, called Task 4 (`sport`), Task 5 (`court.sport`).
- `ThresholdsBySport = Record<Sport, Thresholds>` — internal to Task 1, no external consumers.
- `Sport` type imported in Task 2 (added to existing import).

**Placeholder scan:** none.

**Migration safety:** Old localStorage key is abandoned — users with prior single-thresholds tweaks lose them and start fresh with defaults. Acceptable for current scale.
