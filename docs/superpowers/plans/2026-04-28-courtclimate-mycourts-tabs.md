# My Courts Tabs + Pickleball Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pickleball as a third sport everywhere; tag saves with sport so the same court can be saved once per sport; surface 4 sport tabs (All / Tennis / Basketball / Pickleball) on the My Courts dashboard.

**Architecture:** SavedCourt PK extends from `(userId, placeId)` to `(userId, placeId, sport)` with a `@default("tennis")` to keep `prisma db push` lossless. Save/custom-save endpoints take `sport` in the body; DELETE accepts optional `?sport=` to scope per-sport removal. Frontend `MyCourtsPage` filters its existing data by a tab-local state.

**Tech Stack:** Same as the existing app — Prisma + Postgres, Express, React + TanStack Query, Tailwind. No new libraries.

**Spec:** `docs/superpowers/specs/2026-04-28-courtclimate-mycourts-tabs.md`

---

## File Map

### Backend (`server/`)

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | `SavedCourt` PK gains `sport` with default |
| `src/lib/sport.ts` | Modify | Add `pickleball` to `Sport`, `SPORTS`, `SPORT_KEYWORD` |
| `src/routes/meCourts.ts` | Modify | `sport` in save bodies; sport-aware DELETE; sport in GET response |
| `test/sport.test.ts` | Modify | Add pickleball cases |
| `test/api.smoke.test.ts` | Modify | Smoke tests for new shape |

### Frontend (`client/src/`)

| File | Action | Responsibility |
|---|---|---|
| `types.ts` | Modify | `Sport` union adds `pickleball`; `SavedCourtDetail.sport`; emoji + label entries |
| `lib/api.ts` | Modify | `saveCourt(placeId, sport)`, `saveCustomCourt({lat,lng,name,sport})`, `unsaveCourt(placeId, sport?)` |
| `components/CourtPanel.tsx` | Modify | Sport-aware save state via `useSport()` |
| `components/AddSpotSheet.tsx` | Modify | Accept `sport` prop, send in save body |
| `components/SavedCourtCard.tsx` | Modify | Small sport-emoji badge top-right |
| `routes/MapPage.tsx` | Modify | Pass `sport` to `AddSpotSheet` |
| `routes/MyCourtsPage.tsx` | Modify | 4-tab bar + filter |

---

## Task 1: Schema — SavedCourt PK adds sport

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Update SavedCourt model**

Replace the existing `SavedCourt` model in `server/prisma/schema.prisma`:

```prisma
model SavedCourt {
  userId    String
  placeId   String
  sport     String   @default("tennis")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  court     Court    @relation(fields: [placeId], references: [placeId])
  createdAt DateTime @default(now())

  @@id([userId, placeId, sport])
  @@index([userId])
  @@index([userId, sport])
}
```

- [ ] **Step 2: Regenerate the Prisma client**

```bash
cd server && npx prisma generate
```

Expected: `✔ Generated Prisma Client`.

- [ ] **Step 3: Apply locally**

```bash
cd server && npx prisma db push --accept-data-loss --skip-generate
```

Expected: `Your database is now in sync with your Prisma schema.` (May warn about unique-constraint changes; fine.)

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(db): SavedCourt PK gains sport"
```

---

## Task 2: Add pickleball to the sport library

**Files:**
- Modify: `server/src/lib/sport.ts`
- Modify: `server/test/sport.test.ts`

- [ ] **Step 1: Extend the test (failing case)**

Replace the contents of `server/test/sport.test.ts`:

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
  it('SPORTS array exposes all three', () => {
    expect(SPORTS).toEqual(['tennis', 'basketball', 'pickleball']);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npm test -- sport
```

Expected: 2 of the new tests fail (`pickleball no keyword`, `pickleball + "indoor"`); existing 6 still pass; `SPORTS array` test fails because old SPORTS lacked pickleball.

- [ ] **Step 3: Add pickleball to sport.ts**

Replace `server/src/lib/sport.ts`:

```ts
export type Sport = 'tennis' | 'basketball' | 'pickleball';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball', 'pickleball'] as const;

const SPORT_KEYWORD: Record<Sport, string> = {
  tennis: 'tennis court',
  basketball: 'basketball court',
  pickleball: 'pickleball court',
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

Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/sport.ts server/test/sport.test.ts
git commit -m "feat(server): add pickleball to sport library"
```

---

## Task 3: meCourts route — sport-aware save, custom, delete, list

**Files:**
- Modify: `server/src/routes/meCourts.ts`
- Modify: `server/test/api.smoke.test.ts`

- [ ] **Step 1: Replace meCourts.ts**

Full replacement of `server/src/routes/meCourts.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { fetchWeather } from '../lib/openweather';
import { score } from '../lib/playability';
import { SPORTS } from '../lib/sport';

const router = Router();

router.use(requireAuth);

const sportEnum = z.enum(SPORTS as unknown as [string, ...string[]]);

router.get('/', async (req, res, next) => {
  try {
    const saved = await prisma.savedCourt.findMany({
      where: { userId: req.user!.id },
      include: { court: true },
      orderBy: { createdAt: 'desc' },
    });

    const hydrated = await Promise.all(
      saved.map(async (s) => {
        try {
          const w = await fetchWeather(s.court.lat, s.court.lng);
          return {
            ...s.court,
            savedAt: s.createdAt,
            sport: s.sport,
            weather: w.weather,
            score: score(w.weather),
            stale: w.stale,
          };
        } catch {
          return {
            ...s.court,
            savedAt: s.createdAt,
            sport: s.sport,
            weather: null,
            score: null,
            stale: true,
          };
        }
      }),
    );

    res.json({ courts: hydrated });
  } catch (err) {
    next(err);
  }
});

const addSchema = z.object({
  placeId: z.string().min(1),
  sport: sportEnum,
});

router.post('/', async (req, res, next) => {
  try {
    const { placeId, sport } = addSchema.parse(req.body);

    const court = await prisma.court.findUnique({ where: { placeId } });
    if (!court) {
      return res.status(404).json({
        error: { code: 'COURT_UNKNOWN', message: 'Court not seen yet — open it on the map first' },
      });
    }

    const saved = await prisma.savedCourt.upsert({
      where: { userId_placeId_sport: { userId: req.user!.id, placeId, sport } },
      create: { userId: req.user!.id, placeId, sport },
      update: {},
    });

    res.status(201).json({
      savedCourt: { placeId: saved.placeId, sport: saved.sport, savedAt: saved.createdAt },
    });
  } catch (err) {
    next(err);
  }
});

const customSchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  name: z.string().trim().min(1).max(80),
  sport: sportEnum,
});

router.post('/custom', async (req, res, next) => {
  try {
    const { lat, lng, name, sport } = customSchema.parse(req.body);
    const userId = req.user!.id;

    const placeId = `custom:${userId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const created = await prisma.$transaction(async (tx) => {
      const court = await tx.court.create({
        data: { placeId, name, lat, lng, isCustom: true, addedByUserId: userId },
      });
      const saved = await tx.savedCourt.create({
        data: { userId, placeId: court.placeId, sport },
      });
      return { court, saved };
    });

    let weather = null;
    let scoreVal = null;
    let stale = true;
    try {
      const w = await fetchWeather(lat, lng);
      weather = w.weather;
      scoreVal = score(w.weather);
      stale = w.stale;
    } catch {
      // weather may transiently fail — saving still succeeds
    }

    res.status(201).json({
      court: {
        ...created.court,
        savedAt: created.saved.createdAt,
        sport: created.saved.sport,
        weather,
        score: scoreVal,
        stale,
      },
    });
  } catch (err) {
    next(err);
  }
});

const deleteQuerySchema = z.object({ sport: sportEnum.optional() });

router.delete('/:placeId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { placeId } = req.params;
    const { sport } = deleteQuerySchema.parse(req.query);

    const where = sport
      ? { userId, placeId, sport }
      : { userId, placeId };

    await prisma.savedCourt.deleteMany({ where });

    // If the court is a user-owned custom one and now has no remaining
    // saves at all, drop the Court row too (no other consumers).
    const court = await prisma.court.findUnique({ where: { placeId } });
    if (court?.isCustom && court.addedByUserId === userId) {
      const remaining = await prisma.savedCourt.count({ where: { placeId } });
      if (remaining === 0) {
        await prisma.court.delete({ where: { placeId } });
      }
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: Update smoke tests**

In `server/test/api.smoke.test.ts`, find the existing `POST /api/me/courts/custom → 401` test and replace it (and its sibling) with the broader set:

```ts
it('POST /api/me/courts/custom → 401 without session', async () => {
  const res = await request(app)
    .post('/api/me/courts/custom')
    .send({ lat: 40, lng: -74, name: 'Backyard', sport: 'tennis' });
  expect(res.status).toBe(401);
});

it('POST /api/me/courts → 401 without session (with body)', async () => {
  const res = await request(app)
    .post('/api/me/courts')
    .send({ placeId: 'someId', sport: 'pickleball' });
  expect(res.status).toBe(401);
});

it('DELETE /api/me/courts/:placeId?sport=tennis → 401 without session', async () => {
  const res = await request(app).delete('/api/me/courts/someId?sport=tennis');
  expect(res.status).toBe(401);
});
```

- [ ] **Step 3: Build + test**

```bash
cd server && npm run build && npm test
```

Expected: clean build, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/meCourts.ts server/test/api.smoke.test.ts
git commit -m "feat(server): sport-aware save / custom / delete / list"
```

---

## Task 4: Client types — pickleball + SavedCourtDetail.sport

**Files:**
- Modify: `client/src/types.ts`

- [ ] **Step 1: Replace types.ts**

Full replacement of `client/src/types.ts`:

```ts
export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

export type Sport = 'tennis' | 'basketball' | 'pickleball';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball', 'pickleball'] as const;

export const SPORT_LABEL: Record<Sport, string> = {
  tennis: 'Tennis',
  basketball: 'Basketball',
  pickleball: 'Pickleball',
};

export const SPORT_EMOJI: Record<Sport, string> = {
  tennis: '🎾',
  basketball: '🏀',
  pickleball: '🥒',
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
```

- [ ] **Step 2: Type-check (expect cascading errors)**

```bash
cd client && npx tsc --noEmit
```

Expected: errors in `lib/api.ts`, `CourtPanel.tsx`, `AddSpotSheet.tsx`, `MapPage.tsx` because their signatures don't yet pass sport. These resolve in Tasks 5–8.

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat(client): types — pickleball + sport on SavedCourtDetail"
```

---

## Task 5: Client API — sport-aware save / unsave / custom

**Files:**
- Modify: `client/src/lib/api.ts`

- [ ] **Step 1: Update saveCourt, saveCustomCourt, unsaveCourt**

In `client/src/lib/api.ts`, replace these three methods. Find:

```ts
  saveCourt: (placeId: string) =>
    request<{ savedCourt: { placeId: string; savedAt: string } }>('/api/me/courts', {
      method: 'POST',
      body: JSON.stringify({ placeId }),
    }),

  unsaveCourt: (placeId: string) =>
    request<void>(`/api/me/courts/${placeId}`, { method: 'DELETE' }),

  saveCustomCourt: (input: { lat: number; lng: number; name: string }) =>
    request<{ court: SavedCourtDetail }>('/api/me/courts/custom', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
```

Replace with:

```ts
  saveCourt: (placeId: string, sport: Sport) =>
    request<{ savedCourt: { placeId: string; sport: Sport; savedAt: string } }>('/api/me/courts', {
      method: 'POST',
      body: JSON.stringify({ placeId, sport }),
    }),

  unsaveCourt: (placeId: string, sport?: Sport) => {
    const qs = sport ? `?sport=${sport}` : '';
    return request<void>(`/api/me/courts/${placeId}${qs}`, { method: 'DELETE' });
  },

  saveCustomCourt: (input: { lat: number; lng: number; name: string; sport: Sport }) =>
    request<{ court: SavedCourtDetail }>('/api/me/courts/custom', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
```

- [ ] **Step 2: Type-check (expect remaining errors only in components/routes)**

```bash
cd client && npx tsc --noEmit
```

Expected: errors only in `CourtPanel.tsx`, `AddSpotSheet.tsx`, `MapPage.tsx`.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/api.ts
git commit -m "feat(client): api client takes sport for save / unsave / custom"
```

---

## Task 6: CourtPanel — sport-aware save state

**Files:**
- Modify: `client/src/components/CourtPanel.tsx`

- [ ] **Step 1: Replace CourtPanel.tsx**

Full replacement of `client/src/components/CourtPanel.tsx`:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useSport } from '../stores/sport';
import type { User } from '../types';
import { SPORT_LABEL, SPORT_EMOJI } from '../types';
import { PlayabilityBadge } from './PlayabilityBadge';
import { WeatherStats } from './WeatherStats';

interface Props {
  placeId: string;
  user: User | null;
  onClose: () => void;
}

export function CourtPanel({ placeId, user, onClose }: Props) {
  const qc = useQueryClient();
  const [sport] = useSport();

  const detail = useQuery({
    queryKey: queryKeys.court(placeId),
    queryFn: () => api.court(placeId),
  });

  const saved = useQuery({
    queryKey: queryKeys.savedCourts,
    queryFn: api.savedCourts,
    enabled: !!user,
  });

  const isSavedForSport =
    saved.data?.courts.some((c) => c.placeId === placeId && c.sport === sport) ?? false;

  const save = useMutation({
    mutationFn: () => api.saveCourt(placeId, sport),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedCourts }),
  });
  const unsave = useMutation({
    mutationFn: () => api.unsaveCourt(placeId, sport),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedCourts }),
  });

  return (
    <aside
      className="
        fixed z-30 bg-white shadow-2xl border border-neutral-200
        bottom-0 left-0 right-0 rounded-t-2xl max-h-[80vh] overflow-y-auto
        sm:bottom-auto sm:top-20 sm:right-4 sm:left-auto sm:rounded-2xl
        sm:w-[380px] sm:max-h-[calc(100vh-6rem)]
      "
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold leading-tight">
              {detail.data?.court.name ?? (detail.isLoading ? 'Loading…' : 'Court')}
            </h2>
            {detail.data?.court.isCustom && (
              <p className="text-xs text-good font-semibold mt-1">Your custom spot</p>
            )}
            {detail.data?.court.address && !detail.data?.court.isCustom && (
              <p className="text-sm text-neutral-500 mt-1">{detail.data.court.address}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {detail.isLoading && <p className="mt-6 text-neutral-500">Fetching weather…</p>}

        {detail.isError && (
          <p className="mt-6 text-bad">Couldn’t load weather. Try again in a moment.</p>
        )}

        {detail.data && (
          <>
            <div className="mt-5">
              <PlayabilityBadge score={detail.data.score} size="lg" />
              {detail.data.stale && (
                <p className="mt-2 text-xs text-neutral-500">Showing last cached weather.</p>
              )}
            </div>

            <WeatherStats weather={detail.data.weather} />

            <div className="mt-6">
              {!user ? (
                <p className="text-sm text-neutral-500">
                  <a href="/login" className="text-good underline">Sign in</a> to save this court to your list.
                </p>
              ) : isSavedForSport ? (
                <button
                  onClick={() => unsave.mutate()}
                  disabled={unsave.isPending}
                  className="w-full py-3 rounded-xl border border-neutral-300 text-neutral-700 font-semibold hover:bg-neutral-50"
                >
                  {unsave.isPending ? 'Removing…' : `Remove from ${SPORT_EMOJI[sport]} ${SPORT_LABEL[sport]}`}
                </button>
              ) : (
                <button
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="w-full py-3 rounded-xl bg-neutral-900 text-white font-semibold hover:bg-neutral-800"
                >
                  {save.isPending ? 'Saving…' : `Save to ${SPORT_EMOJI[sport]} ${SPORT_LABEL[sport]}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
```

Key changes:
- Imports `useSport` and the label/emoji helpers.
- `isSaved` becomes `isSavedForSport`, scoped to the current sport tag.
- `save`/`unsave` pass `sport` through.
- Buttons name the sport explicitly: "Save to 🎾 Tennis", "Remove from 🥒 Pickleball".

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: errors remaining only in `AddSpotSheet.tsx` and `MapPage.tsx`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/CourtPanel.tsx
git commit -m "feat(client): CourtPanel save state is per-sport"
```

---

## Task 7: AddSpotSheet — accept and pass sport

**Files:**
- Modify: `client/src/components/AddSpotSheet.tsx`

- [ ] **Step 1: Replace AddSpotSheet.tsx**

Full replacement of `client/src/components/AddSpotSheet.tsx`:

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { Sport } from '../types';
import { SPORT_EMOJI, SPORT_LABEL } from '../types';

interface Props {
  pin: { lat: number; lng: number };
  sport: Sport;
  onClose: () => void;
  onSaved: () => void;
}

export function AddSpotSheet({ pin, sport, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => api.saveCustomCourt({ lat: pin.lat, lng: pin.lng, name: name.trim(), sport }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
      onSaved();
    },
  });

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-white shadow-2xl border-t border-neutral-200 rounded-t-2xl p-5 sm:bottom-auto sm:top-24 sm:right-4 sm:left-auto sm:rounded-2xl sm:w-[380px] sm:border">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold">Name this spot</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Saving as {SPORT_EMOJI[sport]} {SPORT_LABEL[sport]} · {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-neutral-400 text-2xl leading-none">
          ×
        </button>
      </div>

      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Riverside Court, Backyard, …"
        maxLength={80}
        className="w-full px-3 py-2.5 border border-neutral-300 rounded-xl text-sm outline-none focus:border-good"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) save.mutate();
        }}
      />

      {save.isError && (
        <p className="mt-2 text-xs text-bad">Couldn't save. Try again.</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 font-semibold text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={!name.trim() || save.isPending}
          className="flex-1 py-2.5 rounded-xl bg-neutral-900 text-white font-semibold text-sm disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: errors remaining only in `MapPage.tsx`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AddSpotSheet.tsx
git commit -m "feat(client): AddSpotSheet takes sport prop, sends in save body"
```

---

## Task 8: MapPage — pass sport to AddSpotSheet

**Files:**
- Modify: `client/src/routes/MapPage.tsx`

- [ ] **Step 1: Pass sport prop to AddSpotSheet**

In `client/src/routes/MapPage.tsx`, find the `AddSpotSheet` render block:

```tsx
      {pendingPin && addMode && (
        <AddSpotSheet
          pin={pendingPin}
          onClose={() => setPendingPin(null)}
          onSaved={() => {
            setPendingPin(null);
            setAddMode(false);
          }}
        />
      )}
```

Replace with:

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean — no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MapPage.tsx
git commit -m "feat(client): MapPage passes sport to AddSpotSheet"
```

---

## Task 9: SavedCourtCard — sport emoji badge

**Files:**
- Modify: `client/src/components/SavedCourtCard.tsx`

- [ ] **Step 1: Replace SavedCourtCard.tsx**

Full replacement of `client/src/components/SavedCourtCard.tsx`:

```tsx
import type { SavedCourtDetail } from '../types';
import { SPORT_EMOJI } from '../types';
import { PlayabilityBadge } from './PlayabilityBadge';
import { WeatherStats } from './WeatherStats';

interface Props {
  court: SavedCourtDetail;
  onSelect: (placeId: string) => void;
}

export function SavedCourtCard({ court, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(court.placeId)}
      className="w-full text-left bg-white border border-neutral-200 rounded-2xl p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base" title={court.sport} aria-label={court.sport}>
              {SPORT_EMOJI[court.sport]}
            </span>
            <h3 className="font-bold text-base truncate">{court.name}</h3>
          </div>
          {court.address && <p className="text-sm text-neutral-500 truncate ml-7">{court.address}</p>}
        </div>
        {court.score && <PlayabilityBadge score={court.score} />}
      </div>

      {court.weather ? (
        <div className="mt-3">
          <WeatherStats weather={court.weather} compact />
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">Weather unavailable right now.</p>
      )}
    </button>
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
git add client/src/components/SavedCourtCard.tsx
git commit -m "feat(client): SavedCourtCard shows sport emoji"
```

---

## Task 10: MyCourtsPage — 4-tab bar + filtering

**Files:**
- Modify: `client/src/routes/MyCourtsPage.tsx`

- [ ] **Step 1: Replace MyCourtsPage.tsx**

Full replacement of `client/src/routes/MyCourtsPage.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { SavedCourtCard } from '../components/SavedCourtCard';
import { CourtPanel } from '../components/CourtPanel';
import { useUi } from '../stores/ui';
import type { Sport, User } from '../types';
import { SPORTS, SPORT_LABEL, SPORT_EMOJI } from '../types';

type TabValue = 'all' | Sport;

export function MyCourtsPage({ user }: { user: User }) {
  const { selectedPlaceId, selectCourt } = useUi();
  const saved = useQuery({ queryKey: queryKeys.savedCourts, queryFn: api.savedCourts });
  const [tab, setTab] = useState<TabValue>('all');

  const allCourts = saved.data?.courts ?? [];
  const filtered = tab === 'all' ? allCourts : allCourts.filter((c) => c.sport === tab);

  const tabs: { value: TabValue; label: string }[] = [
    { value: 'all', label: 'All' },
    ...SPORTS.map((s) => ({ value: s as TabValue, label: `${SPORT_EMOJI[s]} ${SPORT_LABEL[s]}` })),
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">My Courts</h1>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
        {tabs.map((t) => {
          const active = t.value === tab;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={
                active
                  ? 'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold bg-neutral-900 text-white'
                  : 'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50'
              }
              aria-pressed={active}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {saved.isLoading && <p className="text-neutral-500">Loading your courts…</p>}

      {saved.isError && <p className="text-bad">Couldn’t load your saved courts.</p>}

      {saved.data && filtered.length === 0 && (
        <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center">
          <h2 className="font-semibold text-lg mb-1">
            {tab === 'all'
              ? 'No courts saved yet'
              : `No ${SPORT_LABEL[tab].toLowerCase()} courts saved yet`}
          </h2>
          <p className="text-neutral-500 mb-4">
            {tab === 'all'
              ? 'Open the map, tap a court, then “Save to My Courts.”'
              : `Switch to ${SPORT_EMOJI[tab]} ${SPORT_LABEL[tab]} on the map and save some.`}
          </p>
          <a href="/" className="inline-block px-4 py-2 rounded-xl bg-neutral-900 text-white font-semibold">
            Browse the map
          </a>
        </div>
      )}

      {saved.data && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((c) => (
            <SavedCourtCard key={`${c.placeId}:${c.sport}`} court={c} onSelect={selectCourt} />
          ))}
        </div>
      )}

      {selectedPlaceId && (
        <CourtPanel placeId={selectedPlaceId} user={user} onClose={() => selectCourt(null)} />
      )}
    </div>
  );
}
```

Note: cards keyed by `${placeId}:${sport}` because the same place can now appear under multiple sport tags.

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean tsc, vite build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MyCourtsPage.tsx
git commit -m "feat(client): MyCourtsPage 4-tab filter (All / Tennis / Basketball / Pickleball)"
```

---

## Task 11: Final verify + push

**Files:** none

- [ ] **Step 1: Server build + tests**

```bash
cd server && npm run build && npm test
```

Expected: clean, all tests pass (now ~26+).

- [ ] **Step 2: Client tsc + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Confirm no env files staged**

```bash
git diff --name-only --staged | grep -E '\.env$' && echo "ABORT: env file staged" || echo "ok"
```

Expected: `ok`.

- [ ] **Step 4: Push**

```bash
git push origin main
```

Railway will redeploy server (`prisma db push` syncs the new SavedCourt PK on boot); Netlify will redeploy client.

---

## Self-Review

**Spec coverage:**
- ✅ `Sport` adds pickleball → Tasks 2 + 4
- ✅ `SPORT_KEYWORD/LABEL/EMOJI` updates → Tasks 2 + 4
- ✅ `SavedCourt` PK gains sport with default → Task 1
- ✅ POST /api/me/courts requires sport → Task 3
- ✅ POST /api/me/courts/custom requires sport → Task 3
- ✅ DELETE /api/me/courts/:placeId?sport=… → Task 3
- ✅ GET /api/me/courts returns sport per entry → Task 3
- ✅ `SavedCourtDetail.sport` type → Task 4
- ✅ Sport-aware api.ts methods → Task 5
- ✅ CourtPanel sport-aware save state → Task 6
- ✅ AddSpotSheet sport prop → Task 7
- ✅ MapPage passes sport to AddSpotSheet → Task 8
- ✅ SportChips picks up pickleball automatically (no code change) — verified by Task 4 + existing `SPORTS`-driven render
- ✅ SavedCourtCard sport emoji badge → Task 9
- ✅ MyCourtsPage 4-tab bar + filter + per-tab empty state → Task 10
- ✅ Custom-court Court row drops only when last sport tag is gone → Task 3 (the `remaining === 0` guard)

**Type consistency:**
- `Sport` union, `SPORTS` array, `SPORT_KEYWORD`, `SPORT_LABEL`, `SPORT_EMOJI` all updated to include pickleball in the same task pair (Tasks 2 + 4).
- `saveCourt(placeId, sport)` consistent: defined Task 5, called Task 6.
- `unsaveCourt(placeId, sport?)` optional sport: defined Task 5, called Task 6 with sport.
- `saveCustomCourt({ lat, lng, name, sport })` shape: defined Task 5, called Task 7 (which received sport via prop in Task 7, passed by Task 8).
- `SavedCourtDetail.sport` defined Task 4, consumed Tasks 6, 9, 10.

**Placeholder scan:** none — every step has full code or a concrete command.

**Migration safety:** Task 1 calls `prisma db push --accept-data-loss --skip-generate`. Existing SavedCourt rows (if any) have `(userId, placeId)` PK; the new column has `@default("tennis")` so each row gets `sport = "tennis"`, then the new composite PK `(userId, placeId, "tennis")` is uniquely satisfied. No data loss expected.
