# `custom` as a 4th sport — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `'custom'` as the 4th value of `Sport` so users can save courts without tagging them as tennis/basketball/pickleball, and surface custom-tagged saves above the existing lists section in the My Courts Custom tab.

**Architecture:** No schema change (sport is a String column). Single source of truth — extend the `SPORTS` array on both stacks and existing consumers (zod, SportChips, MapPage filter, etc.) pick it up automatically. Server skips the Places call when the resolved keyword is empty; map shows a banner in custom-empty mode.

**Tech Stack:** Same — Prisma + Postgres, Express, React + TanStack Query, Tailwind. No new libraries.

**Spec:** `docs/superpowers/specs/2026-04-28-courtclimate-custom-as-sport.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/src/lib/sport.ts` | Modify | Add `'custom'` to Sport union, SPORTS, SPORT_KEYWORD |
| `server/test/sport.test.ts` | Modify | Custom-keyword cases; SPORTS length 4 |
| `server/src/lib/google.ts` | Modify | Skip Places call when resolved keyword is empty |
| `client/src/types.ts` | Modify | Sport union, SPORTS, SPORT_LABEL.custom, SPORT_EMOJI.custom |
| `client/src/components/CustomSavesSection.tsx` | Create | Filter saved courts to sport='custom'; render `SavedCourtCard`s |
| `client/src/routes/MapPage.tsx` | Modify | Disable courts query when sport=custom & keyword empty; banner |
| `client/src/routes/MyCourtsPage.tsx` | Modify | Render `CustomSavesSection` above lists in Custom tab |

---

## Task 1: Server sport library — add 'custom'

**Files:**
- Modify: `server/src/lib/sport.ts`
- Modify: `server/test/sport.test.ts`

- [ ] **Step 1: Extend the test (failing case)**

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
  it('custom no keyword → "" (empty)', () => {
    expect(buildPlacesKeyword('custom')).toBe('');
  });
  it('custom + "soccer field" → "soccer field"', () => {
    expect(buildPlacesKeyword('custom', 'soccer field')).toBe('soccer field');
  });
  it('pickleball + "indoor" → "pickleball court indoor"', () => {
    expect(buildPlacesKeyword('pickleball', 'indoor')).toBe('pickleball court indoor');
  });
  it('tennis + "public" → "tennis court public"', () => {
    expect(buildPlacesKeyword('tennis', 'public')).toBe('tennis court public');
  });
  it('basketball + "  indoor  " trims → "basketball court indoor"', () => {
    expect(buildPlacesKeyword('basketball', '  indoor  ')).toBe('basketball court indoor');
  });
  it('empty string keyword treated as no keyword', () => {
    expect(buildPlacesKeyword('tennis', '')).toBe('tennis court');
  });
  it('SPORTS array exposes all four', () => {
    expect(SPORTS).toEqual(['tennis', 'basketball', 'pickleball', 'custom']);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npm test -- sport
```

Expected: 3 of the new tests fail (`custom no keyword`, `custom + "soccer field"`, `SPORTS array exposes all four`).

- [ ] **Step 3: Add 'custom' to sport.ts**

Replace `server/src/lib/sport.ts`:

```ts
export type Sport = 'tennis' | 'basketball' | 'pickleball' | 'custom';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball', 'pickleball', 'custom'] as const;

const SPORT_KEYWORD: Record<Sport, string> = {
  tennis: 'tennis court',
  basketball: 'basketball court',
  pickleball: 'pickleball court',
  custom: '',
};

export function buildPlacesKeyword(sport: Sport, userKeyword?: string): string {
  const trimmed = (userKeyword ?? '').trim();
  return [SPORT_KEYWORD[sport], trimmed].filter(Boolean).join(' ');
}
```

- [ ] **Step 4: Run tests — expect all PASS**

```bash
cd server && npm test -- sport
```

Expected: 10/10 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/sport.ts server/test/sport.test.ts
git commit -m "feat(server): add 'custom' sport (no keyword)"
```

---

## Task 2: Server — skip Places call when keyword is empty

**Files:**
- Modify: `server/src/lib/google.ts`

- [ ] **Step 1: Add the early-return in fetchNearbyCourts**

In `server/src/lib/google.ts`, find the `fetchNearbyCourts` function. After the `keyword` is computed and BEFORE the cache lookup, insert an early return for empty keywords. The relevant section currently reads:

```ts
  const keyword = buildPlacesKeyword(sport, userKeyword);
  const hasUserKeyword = !!(userKeyword && userKeyword.trim());

  // Cache key includes sport so tennis and basketball pin sets don't collide.
  // Queries with a user keyword bypass cache (high cardinality).
  const cacheKey = `${geohashFor(lat, lng, PRECISION.places)}:${sport}`;
```

Replace with:

```ts
  const keyword = buildPlacesKeyword(sport, userKeyword);
  const hasUserKeyword = !!(userKeyword && userKeyword.trim());

  // No keyword → no Places query. Returns empty so custom-mode users
  // see only their saved + custom-dropped pins until they search.
  if (!keyword.trim()) {
    return { courts: [], stale: false };
  }

  // Cache key includes sport so tennis and basketball pin sets don't collide.
  // Queries with a user keyword bypass cache (high cardinality).
  const cacheKey = `${geohashFor(lat, lng, PRECISION.places)}:${sport}`;
```

- [ ] **Step 2: Build + tests still pass**

```bash
cd server && npm run build && npm test
```

Expected: clean build, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/google.ts
git commit -m "feat(server): skip Places call when keyword resolves to empty"
```

---

## Task 3: Client types — add 'custom'

**Files:**
- Modify: `client/src/types.ts`

- [ ] **Step 1: Replace types.ts**

Full replacement of `client/src/types.ts`:

```ts
export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

export type Sport = 'tennis' | 'basketball' | 'pickleball' | 'custom';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball', 'pickleball', 'custom'] as const;

export const SPORT_LABEL: Record<Sport, string> = {
  tennis: 'Tennis',
  basketball: 'Basketball',
  pickleball: 'Pickleball',
  custom: 'Custom',
};

export const SPORT_EMOJI: Record<Sport, string> = {
  tennis: '🎾',
  basketball: '🏀',
  pickleball: '🥒',
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

Expected: clean. Existing consumers of SPORTS / SPORT_EMOJI / SPORT_LABEL automatically pick up the 4th entry.

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat(client): add 'custom' sport (📝)"
```

---

## Task 4: MapPage — disable courts query in custom-empty mode + banner

**Files:**
- Modify: `client/src/routes/MapPage.tsx`

- [ ] **Step 1: Update the courts query and add the banner**

In `client/src/routes/MapPage.tsx`, find the `courts` `useQuery` block:

```tsx
  const courts = useQuery({
    queryKey: queryKeys.nearbyCourts(center.lat, center.lng, sport, keyword),
    queryFn: () => api.nearbyCourts(center.lat, center.lng, sport, keyword || undefined),
    staleTime: 60 * 60 * 1000,
  });
```

Replace with:

```tsx
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
```

Then find the existing default-location banner block:

```tsx
      {source === 'default' && !addMode && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-10 bg-white shadow-md border border-neutral-200 rounded-full px-4 py-1 text-[11px] text-neutral-600">
          Default location — enable location for nearby courts
        </div>
      )}
```

Add a new banner right after it:

```tsx
      {customEmpty && !addMode && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-10 bg-white shadow-md border border-neutral-200 rounded-full px-4 py-1 text-[11px] text-neutral-600">
          Custom mode — search a place or use + Add a spot
        </div>
      )}
```

Also update the empty-results banner to skip when custom-empty (otherwise both banners show):

```tsx
      {courts.data && courts.data.courts.length === 0 && !courts.isLoading && (
```

becomes:

```tsx
      {courts.data && courts.data.courts.length === 0 && !courts.isLoading && !customEmpty && (
```

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MapPage.tsx
git commit -m "feat(client): MapPage skips fetch in custom-empty mode + banner"
```

---

## Task 5: CustomSavesSection component

**Files:**
- Create: `client/src/components/CustomSavesSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import { SavedCourtCard } from './SavedCourtCard';
import { SPORT_EMOJI, SPORT_LABEL } from '../types';

export function CustomSavesSection() {
  const { selectCourt } = useUi();
  const saved = useQuery({ queryKey: queryKeys.savedCourts, queryFn: api.savedCourts });

  const customSaves = saved.data?.courts.filter((c) => c.sport === 'custom') ?? [];

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3">
        Your custom saves
      </h2>

      {customSaves.length === 0 ? (
        <p className="text-sm text-neutral-500 bg-white border border-dashed border-neutral-300 rounded-2xl p-5 text-center">
          No custom saves yet — switch to {SPORT_EMOJI.custom} {SPORT_LABEL.custom} on the map to save one.
        </p>
      ) : (
        <div className="grid gap-3">
          {customSaves.map((c) => (
            <SavedCourtCard key={`${c.placeId}:${c.sport}`} court={c} onSelect={selectCourt} />
          ))}
        </div>
      )}
    </section>
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
git add client/src/components/CustomSavesSection.tsx
git commit -m "feat(client): CustomSavesSection — sport='custom' saves panel"
```

---

## Task 6: MyCourtsPage — render CustomSavesSection in Custom tab

**Files:**
- Modify: `client/src/routes/MyCourtsPage.tsx`

- [ ] **Step 1: Add import + render block**

In `client/src/routes/MyCourtsPage.tsx`, add the import:

```tsx
import { CustomSavesSection } from '../components/CustomSavesSection';
```

Then find the Custom-tab branch:

```tsx
      {tab === 'custom' ? (
        selectedListId ? (
          <ListView listId={selectedListId} onBack={() => setSelectedListId(null)} />
        ) : (
          <ListsTab onSelectList={setSelectedListId} />
        )
      ) : (
```

Replace with:

```tsx
      {tab === 'custom' ? (
        selectedListId ? (
          <ListView listId={selectedListId} onBack={() => setSelectedListId(null)} />
        ) : (
          <>
            <CustomSavesSection />
            <section>
              <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                Your lists
              </h2>
              <ListsTab onSelectList={setSelectedListId} />
            </section>
          </>
        )
      ) : (
```

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MyCourtsPage.tsx
git commit -m "feat(client): MyCourtsPage Custom tab adds 'Your custom saves' section"
```

---

## Task 7: Final verify + push

**Files:** none

- [ ] **Step 1: Server build + tests**

```bash
cd server && npm run build && npm test
```

Expected: clean, all tests pass (37 total: 11 playability + 16 smoke + 10 sport).

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
- ✅ `Sport` adds `'custom'` → Tasks 1, 3
- ✅ `SPORT_LABEL.custom = 'Custom'`, `SPORT_EMOJI.custom = '📝'` → Task 3
- ✅ `SPORT_KEYWORD.custom = ''` → Task 1
- ✅ `buildPlacesKeyword('custom', userKeyword)` returns just the keyword (or empty) → Task 1
- ✅ Server skips Places call when resolved keyword is empty → Task 2
- ✅ SportChips automatically picks up 4th chip — driven by SPORTS, no code change needed
- ✅ MapPage disables courts query in custom-empty mode → Task 4
- ✅ MapPage banner in custom-empty mode → Task 4
- ✅ CustomSavesSection above ListsTab in My Courts Custom tab → Tasks 5, 6
- ✅ Empty state for custom saves section → Task 5
- ✅ Empty state for lists section — already exists in ListsTab from earlier round
- ✅ No schema change needed — Sport is a String column

**Type consistency:**
- `Sport` defined Task 3 as `'tennis' | 'basketball' | 'pickleball' | 'custom'`. Server defines the same union Task 1.
- `SPORTS` array same shape on both sides — length 4.
- `SPORT_EMOJI.custom = '📝'` and `SPORT_LABEL.custom = 'Custom'` — these names align with the existing pattern (no new emoji collisions; `📝` was previously used in MyCourtsPage tab label only as `'📝 Custom'` literal text and in ListsTab list cards as `'📝 ${l.name}'` — those are decorative literal strings, unaffected by the SPORT_EMOJI map).

**Placeholder scan:** none.

**Migration safety:** No schema change. Sport is a `String` column — `'custom'` is just another valid value. No data migration needed.
