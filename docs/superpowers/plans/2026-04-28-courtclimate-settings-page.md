# Settings page + customizable thresholds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the avatar's sign-out-only behavior with a `/settings` page that hosts account info, customizable playability thresholds (sliders), default sport, and sign out — and re-color all pins/badges using the user's thresholds.

**Architecture:** Settings live in `localStorage` (no DB). New `client/src/lib/playability.ts` mirrors the server's scoring function but parameterized by thresholds. New `useThresholds` + `useScoreFor` hooks read settings and recompute scores. Server's `/api/courts` gains `weather` per court so the client has raw inputs to recompute. Server's `score` field becomes a fallback when weather is null.

**Tech Stack:** Same — React Router, TanStack Query, Tailwind. No new libraries.

**Spec:** `docs/superpowers/specs/2026-04-28-courtclimate-settings-page.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/src/lib/google.ts` | Modify | `HydratedCourt` gains `weather`; `hydrateCourts` includes it |
| `client/src/lib/playability.ts` | Create | `Thresholds`, `DEFAULT_THRESHOLDS`, `scoreFromThresholds()` |
| `client/src/stores/thresholds.ts` | Create | `useThresholds()` + `useScoreFor()` hooks |
| `client/src/types.ts` | Modify | `Court` gains optional `weather` |
| `client/src/routes/SettingsPage.tsx` | Create | The settings page itself |
| `client/src/App.tsx` | Modify | Register `/settings` route (auth-gated) |
| `client/src/components/TopBar.tsx` | Modify | Avatar links to `/settings`; drop logout mutation |
| `client/src/routes/MapPage.tsx` | Modify | Pin-building uses `scoreFromThresholds` per pin |
| `client/src/components/CourtPanel.tsx` | Modify | Badge uses `useScoreFor` |
| `client/src/components/SavedCourtCard.tsx` | Modify | Badge uses `useScoreFor` |
| `client/test/playability.test.ts` (optional) | Create | Skipped — no client test runner configured |

---

## Task 1: Server — include `weather` in /api/courts response

**Files:**
- Modify: `server/src/lib/google.ts`

- [ ] **Step 1: Extend HydratedCourt + hydrateCourts**

In `server/src/lib/google.ts`, find the `HydratedCourt` interface and the `hydrateCourts` helper. Replace both:

```ts
export interface HydratedCourt extends CourtSummary {
  score: PlayabilityScore | null;
  stale: boolean;
  weather: WeatherSummary | null;
}
```

(Add the import for `WeatherSummary` at the top:)

```ts
import type { WeatherSummary } from './playability';
```

Wait — `WeatherSummary` lives in `./playability`. Confirm by reading. It does. The import line:

```ts
import { score, type PlayabilityScore, type WeatherSummary } from './playability';
```

Replace `hydrateCourts` at the bottom of the file:

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

- [ ] **Step 2: Build + tests pass**

```bash
cd server && npm run build && npm test
```

Expected: clean build, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/google.ts
git commit -m "feat(server): include weather per court in /api/courts response"
```

---

## Task 2: Client lib — playability scoring with thresholds

**Files:**
- Create: `client/src/lib/playability.ts`

- [ ] **Step 1: Create the file**

```ts
import type { PlayabilityScore, WeatherSummary } from '../types';

export interface Thresholds {
  rainMaxGood: number; // GOOD requires rain < this
  rainMaxOk: number;   // BAD when rain >= this
  windMaxGood: number; // GOOD requires wind < this
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
  if (weather.rainPctNext2h < t.rainMaxGood && weather.windMph < t.windMaxGood) {
    return 'GOOD';
  }
  return 'OK';
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/playability.ts
git commit -m "feat(client): playability lib — Thresholds + scoreFromThresholds"
```

---

## Task 3: Client store — useThresholds + useScoreFor hooks

**Files:**
- Create: `client/src/stores/thresholds.ts`

- [ ] **Step 1: Create the hook module**

```ts
import { useEffect, useState } from 'react';
import type { PlayabilityScore, WeatherSummary } from '../types';
import { DEFAULT_THRESHOLDS, scoreFromThresholds, type Thresholds } from '../lib/playability';

const KEY = 'courtclimate.thresholds';
const CHANGED_EVENT = 'courtclimate.thresholds.changed';

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

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

export function useThresholds(): [Thresholds, (next: Thresholds) => void, () => void] {
  const [t, setT] = useState<Thresholds>(DEFAULT_THRESHOLDS);

  useEffect(() => {
    setT(read());
  }, []);

  useEffect(() => {
    const onChange = () => setT(read());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  const update = (next: Thresholds) => {
    setT(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  };

  const reset = () => update(DEFAULT_THRESHOLDS);

  return [t, update, reset];
}

export function useScoreFor(
  weather: WeatherSummary | null | undefined,
  fallback: PlayabilityScore | null = null,
): PlayabilityScore | null {
  const [t] = useThresholds();
  if (!weather) return fallback;
  return scoreFromThresholds(weather, t);
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/stores/thresholds.ts
git commit -m "feat(client): useThresholds + useScoreFor hooks (localStorage-backed)"
```

---

## Task 4: Client types — Court gains optional weather

**Files:**
- Modify: `client/src/types.ts`

- [ ] **Step 1: Extend Court**

In `client/src/types.ts`, find the `Court` interface. Replace with:

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
  weather?: WeatherSummary | null;
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean. `SavedCourtDetail extends Court` and overrides `weather` as required, which is compatible with the new optional declaration.

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat(client): Court gains optional weather"
```

---

## Task 5: SettingsPage component

**Files:**
- Create: `client/src/routes/SettingsPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useThresholds } from '../stores/thresholds';
import { useSport } from '../stores/sport';
import { SportChips } from '../components/SportChips';
import { PlayabilityBadge } from '../components/PlayabilityBadge';
import { scoreFromThresholds } from '../lib/playability';
import type { User } from '../types';

export function SettingsPage({ user }: { user: User }) {
  const [thresholds, setThresholds, resetThresholds] = useThresholds();
  const [sport, setSport] = useSport();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.clear();
      navigate('/login', { replace: true });
    },
  });

  // Constraints: rainMaxGood < rainMaxOk so GOOD remains reachable.
  const rainGoodMax = Math.max(0, thresholds.rainMaxOk - 1);
  const rainOkMin = Math.min(100, thresholds.rainMaxGood + 1);

  // Static sample for the live preview chip.
  const preview = scoreFromThresholds(
    { tempF: 70, windMph: 8, rainPctNext2h: 20 },
    thresholds,
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3">
          Account
        </h2>
        <div className="flex items-center gap-3">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full" />
          )}
          <div>
            <p className="font-bold">{user.name ?? 'You'}</p>
            <p className="text-sm text-neutral-500">{user.email}</p>
          </div>
        </div>
      </section>

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

      <section className="bg-white border border-neutral-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
          Default sport
        </h2>
        <p className="text-sm text-neutral-500 mb-4">
          The sport chip selected when you open the map.
        </p>
        <SportChips value={sport} onChange={setSport} />
      </section>

      <button
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="w-full py-3 rounded-xl border border-bad text-bad font-semibold hover:bg-bad hover:text-white"
      >
        {logout.isPending ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

interface ThresholdSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}

function ThresholdSlider({ label, value, min, max, unit, onChange }: ThresholdSliderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-neutral-700">{label}</label>
        <span className="text-sm font-semibold text-neutral-900">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-good"
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/SettingsPage.tsx
git commit -m "feat(client): SettingsPage — account, threshold sliders, sport, sign out"
```

---

## Task 6: App.tsx — register /settings route

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add import + route**

In `client/src/App.tsx`, add the import:

```tsx
import { SettingsPage } from './routes/SettingsPage';
```

Then in the `<Routes>` block, after the existing `/my-courts` route, add:

```tsx
        <Route
          path="/settings"
          element={
            <AuthGate user={user}>
              <SettingsPage user={user!} />
            </AuthGate>
          }
        />
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(client): register /settings route (auth-gated)"
```

---

## Task 7: TopBar — avatar links to /settings, drop logout

**Files:**
- Modify: `client/src/components/TopBar.tsx`

- [ ] **Step 1: Replace TopBar.tsx**

Full replacement of `client/src/components/TopBar.tsx`:

```tsx
import { Link, NavLink } from 'react-router-dom';
import type { User } from '../types';

const navLink =
  'px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 whitespace-nowrap';
const navLinkActive = 'text-neutral-900 bg-neutral-100';

export function TopBar({ user }: { user: User | null }) {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-neutral-200">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
          <span className="inline-block w-6 h-6 rounded-md bg-good shrink-0" aria-hidden />
          <span className="hidden sm:inline">CourtClimate</span>
        </Link>
        <nav className="flex items-center gap-1 shrink-0">
          <NavLink to="/" end className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}>
            Map
          </NavLink>
          <NavLink to="/my-courts" className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}>
            My Courts
          </NavLink>
          {user ? (
            <NavLink
              to="/settings"
              className="ml-1 flex items-center gap-2 px-1 py-1 rounded-full hover:bg-neutral-100"
              title="Settings"
            >
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
              )}
              <span className="text-sm text-neutral-600 hidden sm:inline">
                {user.name?.split(' ')[0] ?? 'You'}
              </span>
            </NavLink>
          ) : (
            <NavLink
              to="/login"
              className="ml-1 inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 hover:text-white whitespace-nowrap"
            >
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
```

Key changes:
- Drops `useMutation`, `useQueryClient`, `api` imports (no longer logging out from here).
- Avatar `<button>` becomes `<NavLink to="/settings">`.
- Label changes from "Sign out" to user's first name (or "You" fallback).

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/TopBar.tsx
git commit -m "feat(client): TopBar avatar links to /settings (drops inline logout)"
```

---

## Task 8: MapPage — pin scoring uses thresholds

**Files:**
- Modify: `client/src/routes/MapPage.tsx`

- [ ] **Step 1: Add imports and use thresholds during pin assembly**

In `client/src/routes/MapPage.tsx`, add imports:

```tsx
import { useThresholds } from '../stores/thresholds';
import { scoreFromThresholds } from '../lib/playability';
```

Find the start of the `MapPage` function and add:

```tsx
  const [thresholds] = useThresholds();
```

(near `useSport` and the other hook calls).

Then find the `pins` building block. Replace the existing `pins: PinForMap[] = [...]` assignment with:

```tsx
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
```

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MapPage.tsx
git commit -m "feat(client): pin scoring uses user thresholds"
```

---

## Task 9: CourtPanel — badge uses useScoreFor

**Files:**
- Modify: `client/src/components/CourtPanel.tsx`

- [ ] **Step 1: Add import and recompute score**

In `client/src/components/CourtPanel.tsx`, add the import:

```tsx
import { useScoreFor } from '../stores/thresholds';
```

Then inside the `CourtPanel` function, after the `detail` and `saved` queries, add:

```tsx
  const userScore = useScoreFor(detail.data?.weather, detail.data?.score ?? null);
```

Find the existing PlayabilityBadge render:

```tsx
              <PlayabilityBadge score={detail.data.score} size="lg" />
```

Replace with:

```tsx
              {userScore && <PlayabilityBadge score={userScore} size="lg" />}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/CourtPanel.tsx
git commit -m "feat(client): CourtPanel badge uses user thresholds"
```

---

## Task 10: SavedCourtCard — badge uses useScoreFor

**Files:**
- Modify: `client/src/components/SavedCourtCard.tsx`

- [ ] **Step 1: Add import and recompute score**

In `client/src/components/SavedCourtCard.tsx`, add the import:

```tsx
import { useScoreFor } from '../stores/thresholds';
```

Then inside the `SavedCourtCard` function, after the existing `useMutation` calls, add:

```tsx
  const userScore = useScoreFor(court.weather, court.score);
```

Find the existing PlayabilityBadge usage in the render:

```tsx
            {court.score && <PlayabilityBadge score={court.score} />}
```

Replace with:

```tsx
            {userScore && <PlayabilityBadge score={userScore} />}
```

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/SavedCourtCard.tsx
git commit -m "feat(client): SavedCourtCard badge uses user thresholds"
```

---

## Task 11: Final verify + push

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
- ✅ Avatar links to `/settings` → Task 7
- ✅ `/settings` route registered + auth-gated → Task 6
- ✅ Account section (avatar/name/email, read-only) → Task 5
- ✅ 3 threshold sliders → Task 5
- ✅ Live preview chip → Task 5
- ✅ Reset to defaults → Task 5
- ✅ Default sport section (reuses SportChips) → Task 5
- ✅ Sign out at bottom of page → Task 5
- ✅ Sign out moved away from TopBar → Task 7
- ✅ localStorage storage with clamp + change-event → Task 3
- ✅ `useThresholds` returns `[t, update, reset]` → Task 3
- ✅ `useScoreFor(weather, fallback)` returns recomputed score → Task 3
- ✅ Server returns weather per court in /api/courts → Task 1
- ✅ Slider min/max constraints (rainMaxGood < rainMaxOk) → Task 5 (`rainGoodMax`, `rainOkMin`)
- ✅ Pin coloring uses user thresholds → Task 8
- ✅ CourtPanel badge uses user thresholds → Task 9
- ✅ SavedCourtCard badge uses user thresholds → Task 10
- ✅ `Court` (client) gains optional `weather` → Task 4
- ✅ Anonymous user redirected from /settings → Task 6 (AuthGate)
- ✅ Default thresholds 30/60/12 (matching server) → Task 2

**Type consistency:**
- `Thresholds` defined Task 2; consumed Tasks 3, 5, 8.
- `scoreFromThresholds(weather, thresholds)` signature stable across tasks.
- `useThresholds()` return tuple `[Thresholds, (next) => void, () => void]` consumed by Task 5.
- `useScoreFor(weather, fallback)` returns `PlayabilityScore | null` — both Task 9 and Task 10 guard with `userScore && <PlayabilityBadge ...>`.
- `Court.weather` defined Task 4 (optional); consumed Task 8 (pin assembly).

**Placeholder scan:** none.

**Migration safety:** No schema change. localStorage values are clamped at read; backward-compatible if user later clears the key (read returns defaults).
