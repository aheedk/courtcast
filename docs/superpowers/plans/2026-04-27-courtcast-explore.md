# CourtCast Map Exploration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search bar (place autocomplete + keyword filter), a sport toggle (tennis / basketball), and signed-in custom-pin drop-and-save to CourtCast's map view.

**Architecture:** Frontend gets two new overlays on top of the map (search bar + sport chips) and a floating `+ Add a spot` button that puts the map in drop-pin mode for signed-in users. Backend gets `sport` + `keyword` query params on `/api/courts`, a new `POST /api/me/courts/custom` endpoint, and two additive Court schema fields (`isCustom`, `addedByUserId`).

**Tech Stack:** React 18 + TanStack Query + Google Maps JS API (already loaded — Places autocomplete is part of it). Express + Prisma + Postgres on the backend.

**Spec:** `docs/superpowers/specs/2026-04-27-courtcast-explore-design.md`

---

## File Map

### Backend (`server/`)

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `isCustom`, `addedByUserId` to `Court`; `customCourts` relation on `User` |
| `src/lib/sport.ts` | Create | `Sport` type + `SPORT_KEYWORD` mapping + `buildPlacesKeyword()` |
| `src/lib/google.ts` | Modify | `fetchNearbyCourts` accepts `sport` + `keyword`, cache key extends |
| `src/routes/courts.ts` | Modify | Accept `sport`, `keyword` query params (zod) |
| `src/routes/meCourts.ts` | Modify | Add `POST /custom` handler; extend `DELETE` to drop `Court` row when custom |
| `test/sport.test.ts` | Create | Table-driven tests for `buildPlacesKeyword` |
| `test/api.smoke.test.ts` | Modify | Smoke for new sport/keyword params + custom endpoints |

### Frontend (`client/src/`)

| File | Action | Responsibility |
|---|---|---|
| `types.ts` | Modify | Add `Sport`; add `isCustom`, `addedByUserId` to `Court` |
| `lib/api.ts` | Modify | `nearbyCourts(lat, lng, sport, keyword?)`; `saveCustomCourt({lat,lng,name})` |
| `lib/queryClient.ts` | Modify | Extend `nearbyCourts` query key with sport+keyword |
| `stores/sport.ts` | Create | Tiny Zustand-or-hook store backed by `localStorage['courtcast.sport']` |
| `components/SearchBar.tsx` | Create | Pill input + Place/Keyword toggle + autocomplete dropdown |
| `components/SportChips.tsx` | Create | Tennis/Basketball exclusive chips |
| `components/AddSpotFab.tsx` | Create | Floating button → toggles drop-pin mode |
| `components/AddSpotSheet.tsx` | Create | Bottom-sheet form with Name input + Save |
| `components/MapLegend.tsx` | Create | Tiny legend explaining custom vs places pins |
| `components/MapView.tsx` | Modify | Controlled `center`, `onMapClick`, custom-pin styling, drop-pin marker |
| `components/CourtPanel.tsx` | Modify | "Custom spot" label when court is custom |
| `routes/MapPage.tsx` | Modify | Orchestrate all new state + components |

---

## Task 1: Schema additions for custom courts

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Edit schema.prisma — add fields and relation**

In `server/prisma/schema.prisma`, replace the `Court` model and add the relation back-pointer in `User`:

```prisma
model User {
  id           String       @id @default(cuid())
  googleId     String       @unique
  email        String       @unique
  name         String?
  avatarUrl    String?
  createdAt    DateTime     @default(now())
  savedCourts  SavedCourt[]
  sessions     Session[]
  customCourts Court[]      @relation("UserCustomCourts")
}

model Court {
  placeId        String       @id
  name           String
  lat            Float
  lng            Float
  address        String?
  isCustom       Boolean      @default(false)
  addedByUserId  String?
  addedBy        User?        @relation("UserCustomCourts", fields: [addedByUserId], references: [id])
  fetchedAt      DateTime     @default(now())
  savedBy        SavedCourt[]

  @@index([addedByUserId])
}
```

- [ ] **Step 2: Regenerate Prisma client**

Run from `server/`:

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`. No DB needed — `db push` runs on the next Railway deploy.

- [ ] **Step 3: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(db): add isCustom + addedByUserId to Court"
```

---

## Task 2: Sport keyword library + tests

**Files:**
- Create: `server/src/lib/sport.ts`
- Create: `server/test/sport.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/test/sport.test.ts`:

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
  it('tennis + "public" → "tennis court public"', () => {
    expect(buildPlacesKeyword('tennis', 'public')).toBe('tennis court public');
  });
  it('basketball + "  indoor  " trims → "basketball court indoor"', () => {
    expect(buildPlacesKeyword('basketball', '  indoor  ')).toBe('basketball court indoor');
  });
  it('empty string keyword treated as no keyword', () => {
    expect(buildPlacesKeyword('tennis', '')).toBe('tennis court');
  });
  it('SPORTS array exposes both', () => {
    expect(SPORTS).toEqual(['tennis', 'basketball']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npm test -- sport
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `server/src/lib/sport.ts`:

```ts
export type Sport = 'tennis' | 'basketball';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball'] as const;

const SPORT_KEYWORD: Record<Sport, string> = {
  tennis: 'tennis court',
  basketball: 'basketball court',
};

export function buildPlacesKeyword(sport: Sport, userKeyword?: string): string {
  const trimmed = (userKeyword ?? '').trim();
  return [SPORT_KEYWORD[sport], trimmed].filter(Boolean).join(' ');
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd server && npm test -- sport
```

Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/sport.ts server/test/sport.test.ts
git commit -m "feat(server): sport keyword builder with table-driven tests"
```

---

## Task 3: fetchNearbyCourts accepts sport + keyword

**Files:**
- Modify: `server/src/lib/google.ts`

- [ ] **Step 1: Update fetchNearbyCourts signature and body**

In `server/src/lib/google.ts`, replace the existing `fetchNearbyCourts` function with:

```ts
import { buildPlacesKeyword, type Sport } from './sport';

export async function fetchNearbyCourts(
  lat: number,
  lng: number,
  radiusMeters: number,
  sport: Sport = 'tennis',
  userKeyword?: string,
): Promise<{ courts: CourtSummary[]; stale: boolean }> {
  const keyword = buildPlacesKeyword(sport, userKeyword);
  const hasUserKeyword = !!(userKeyword && userKeyword.trim());

  // Cache key includes sport so tennis and basketball pins don't collide.
  // Queries with a user keyword bypass cache (high cardinality).
  const cacheKey = `${geohashFor(lat, lng, PRECISION.places)}:${sport}`;
  const cached = hasUserKeyword
    ? null
    : await getCached<CourtSummary[]>('placesCache', cacheKey, TTL.placesMs);
  if (cached && !cached.stale) {
    return { courts: cached.payload, stale: false };
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', String(radiusMeters));
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('key', env.googlePlacesKey);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Places HTTP ${res.status}`);
    const data = (await res.json()) as PlacesNearbyResponse;

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(
        `Places API ${data.status}${data.error_message ? `: ${data.error_message}` : ''}`,
      );
    }

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

    await Promise.all(
      courts.map((c) =>
        prisma.court.upsert({
          where: { placeId: c.placeId },
          create: c,
          update: { name: c.name, lat: c.lat, lng: c.lng, address: c.address, fetchedAt: new Date() },
        }),
      ),
    );

    return { courts, stale: false };
  } catch (err) {
    if (cached) return { courts: cached.payload, stale: true };
    throw err;
  }
}
```

Notes:
- Removed the hardcoded `type=park` Places param — basketball courts aren't always tagged as parks. The keyword alone is enough.
- Sport defaults to tennis to keep existing callers working without changes.

- [ ] **Step 2: Build + type-check**

```bash
cd server && npm run build
```

Expected: clean build.

- [ ] **Step 3: Run tests**

```bash
cd server && npm test
```

Expected: 22/22 pass (16 existing + 6 from sport.ts).

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/google.ts
git commit -m "feat(server): fetchNearbyCourts takes sport + keyword"
```

---

## Task 4: /api/courts route accepts sport + keyword

**Files:**
- Modify: `server/src/routes/courts.ts`

- [ ] **Step 1: Update the route**

Replace contents of `server/src/routes/courts.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { fetchNearbyCourts } from '../lib/google';
import { env } from '../lib/env';
import { SPORTS } from '../lib/sport';

const router = Router();

const querySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  radius: z.coerce.number().int().positive().max(50000).optional(),
  sport: z.enum(SPORTS as unknown as [string, ...string[]]).optional(),
  keyword: z.string().trim().max(60).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { lat, lng, radius, sport, keyword } = querySchema.parse(req.query);
    const result = await fetchNearbyCourts(
      lat,
      lng,
      radius ?? env.defaultRadiusMeters,
      sport ?? 'tennis',
      keyword,
    );
    res.json({ courts: result.courts, stale: result.stale });
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: Add a smoke test**

In `server/test/api.smoke.test.ts`, add inside the existing `describe('api smoke', ...)` block:

```ts
it('GET /api/courts with bad sport → 400', async () => {
  const res = await request(app).get('/api/courts?lat=40&lng=-74&sport=hockey');
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('BAD_REQUEST');
});
```

- [ ] **Step 3: Run tests**

```bash
cd server && npm test
```

Expected: all pass (now 23 tests).

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/courts.ts server/test/api.smoke.test.ts
git commit -m "feat(server): /api/courts accepts sport + keyword params"
```

---

## Task 5: POST /api/me/courts/custom + extended DELETE

**Files:**
- Modify: `server/src/routes/meCourts.ts`

- [ ] **Step 1: Replace meCourts.ts**

Full replacement (additions to existing file):

```ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { fetchWeather } from '../lib/openweather';
import { score } from '../lib/playability';

const router = Router();

router.use(requireAuth);

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
            weather: w.weather,
            score: score(w.weather),
            stale: w.stale,
          };
        } catch {
          return {
            ...s.court,
            savedAt: s.createdAt,
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

const addSchema = z.object({ placeId: z.string().min(1) });

router.post('/', async (req, res, next) => {
  try {
    const { placeId } = addSchema.parse(req.body);

    const court = await prisma.court.findUnique({ where: { placeId } });
    if (!court) {
      return res.status(404).json({
        error: { code: 'COURT_UNKNOWN', message: 'Court not seen yet — open it on the map first' },
      });
    }

    const saved = await prisma.savedCourt.upsert({
      where: { userId_placeId: { userId: req.user!.id, placeId } },
      create: { userId: req.user!.id, placeId },
      update: {},
    });

    res.status(201).json({ savedCourt: { placeId: saved.placeId, savedAt: saved.createdAt } });
  } catch (err) {
    next(err);
  }
});

const customSchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  name: z.string().trim().min(1).max(80),
});

router.post('/custom', async (req, res, next) => {
  try {
    const { lat, lng, name } = customSchema.parse(req.body);
    const userId = req.user!.id;

    // Synthetic placeId for custom courts.
    const placeId = `custom:${userId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const created = await prisma.$transaction(async (tx) => {
      const court = await tx.court.create({
        data: { placeId, name, lat, lng, isCustom: true, addedByUserId: userId },
      });
      const saved = await tx.savedCourt.create({
        data: { userId, placeId: court.placeId },
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
      court: { ...created.court, savedAt: created.saved.createdAt, weather, score: scoreVal, stale },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:placeId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { placeId } = req.params;

    await prisma.savedCourt.deleteMany({ where: { userId, placeId } });

    // If the court is a user-owned custom one, it has no other consumers —
    // delete the Court row too.
    const court = await prisma.court.findUnique({ where: { placeId } });
    if (court?.isCustom && court.addedByUserId === userId) {
      await prisma.court.delete({ where: { placeId } });
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: Smoke test additions**

In `server/test/api.smoke.test.ts`, extend the prisma mock and add tests. Replace the prisma mock with:

```ts
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    session: { findUnique: vi.fn().mockResolvedValue(null) },
    court: { findUnique: vi.fn().mockResolvedValue(null) },
    savedCourt: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
```

Add inside the smoke block:

```ts
it('POST /api/me/courts/custom → 401 without session', async () => {
  const res = await request(app)
    .post('/api/me/courts/custom')
    .send({ lat: 40, lng: -74, name: 'Backyard' });
  expect(res.status).toBe(401);
});

it('POST /api/me/courts/custom with bad body → 401 (auth checked first)', async () => {
  const res = await request(app)
    .post('/api/me/courts/custom')
    .send({ lat: 999, lng: -74, name: '' });
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
git commit -m "feat(server): POST /api/me/courts/custom + DELETE drops custom courts"
```

---

## Task 6: Frontend — types + API client

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/lib/queryClient.ts`

- [ ] **Step 1: Extend types.ts**

Add to `client/src/types.ts`:

```ts
export type Sport = 'tennis' | 'basketball';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball'] as const;

export const SPORT_LABEL: Record<Sport, string> = {
  tennis: 'Tennis',
  basketball: 'Basketball',
};

export const SPORT_EMOJI: Record<Sport, string> = {
  tennis: '🎾',
  basketball: '🏀',
};
```

Update existing `Court` interface:

```ts
export interface Court {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  isCustom?: boolean;
  addedByUserId?: string | null;
}
```

- [ ] **Step 2: Update api.ts**

In `client/src/lib/api.ts`, replace the `nearbyCourts` method and add `saveCustomCourt`:

```ts
import type { Court, CourtDetail, SavedCourtDetail, User, WeatherSummary, PlayabilityScore, Sport } from '../types';

// ... existing request helper unchanged ...

export const api = {
  // ... existing me, loginWithGoogle, logout unchanged ...

  nearbyCourts: (lat: number, lng: number, sport: Sport, keyword?: string, radius?: number) => {
    const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), sport });
    if (keyword) qs.set('keyword', keyword);
    if (radius) qs.set('radius', String(radius));
    return request<{ courts: Court[]; stale: boolean }>(`/api/courts?${qs}`);
  },

  // ... weather, playability, court, savedCourts, saveCourt, unsaveCourt unchanged ...

  saveCustomCourt: (input: { lat: number; lng: number; name: string }) =>
    request<{ court: SavedCourtDetail }>('/api/me/courts/custom', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
```

- [ ] **Step 3: Update queryClient.ts**

In `client/src/lib/queryClient.ts`, replace the `nearbyCourts` key:

```ts
import type { Sport } from '../types';

// ... QueryClient unchanged ...

export const queryKeys = {
  me: ['me'] as const,
  nearbyCourts: (lat: number, lng: number, sport: Sport, keyword?: string) =>
    ['courts', round(lat), round(lng), sport, keyword ?? ''] as const,
  court: (placeId: string) => ['court', placeId] as const,
  savedCourts: ['savedCourts'] as const,
};

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
```

- [ ] **Step 4: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: type errors in MapPage.tsx (`nearbyCourts` arity changed). That's OK — Task 11 fixes them.

- [ ] **Step 5: Commit**

```bash
git add client/src/types.ts client/src/lib/api.ts client/src/lib/queryClient.ts
git commit -m "feat(client): types + api client for sport, keyword, custom courts"
```

---

## Task 7: Sport store + SportChips component

**Files:**
- Create: `client/src/stores/sport.ts`
- Create: `client/src/components/SportChips.tsx`

- [ ] **Step 1: Create the sport store**

`client/src/stores/sport.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Sport } from '../types';
import { SPORTS } from '../types';

const KEY = 'courtcast.sport';

function read(): Sport {
  if (typeof window === 'undefined') return 'tennis';
  const v = window.localStorage.getItem(KEY);
  return (SPORTS as readonly string[]).includes(v as Sport) ? (v as Sport) : 'tennis';
}

export function useSport(): [Sport, (s: Sport) => void] {
  const [sport, setSportState] = useState<Sport>('tennis');

  useEffect(() => {
    setSportState(read());
  }, []);

  const setSport = (s: Sport) => {
    setSportState(s);
    window.localStorage.setItem(KEY, s);
  };

  return [sport, setSport];
}
```

- [ ] **Step 2: Create SportChips component**

`client/src/components/SportChips.tsx`:

```tsx
import type { Sport } from '../types';
import { SPORTS, SPORT_LABEL, SPORT_EMOJI } from '../types';

interface Props {
  value: Sport;
  onChange: (s: Sport) => void;
}

export function SportChips({ value, onChange }: Props) {
  return (
    <div className="flex gap-2 justify-center">
      {SPORTS.map((s) => {
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

- [ ] **Step 3: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: still the unrelated MapPage errors from Task 6, no new errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/stores/sport.ts client/src/components/SportChips.tsx
git commit -m "feat(client): SportChips + localStorage-backed sport store"
```

---

## Task 8: SearchBar component

**Files:**
- Create: `client/src/components/SearchBar.tsx`

- [ ] **Step 1: Implement SearchBar**

`client/src/components/SearchBar.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

type Mode = 'place' | 'keyword';

interface Props {
  onPlaceSelected: (location: { lat: number; lng: number; name: string }) => void;
  onKeywordChange: (keyword: string) => void;
  initialKeyword?: string;
}

interface Suggestion {
  description: string;
  placeId: string;
}

export function SearchBar({ onPlaceSelected, onKeywordChange, initialKeyword = '' }: Props) {
  const [mode, setMode] = useState<Mode>('place');
  const [text, setText] = useState(initialKeyword);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Lazy-init Google Places services once google.maps.places is available.
  useEffect(() => {
    if (!window.google?.maps?.places) return;
    if (!autocompleteRef.current) {
      autocompleteRef.current = new google.maps.places.AutocompleteService();
    }
    if (!placesServiceRef.current) {
      // PlacesService needs a DOM node, but we never use it for display —
      // a detached div is fine.
      placesServiceRef.current = new google.maps.places.PlacesService(document.createElement('div'));
    }
  }, []);

  // Re-fetch suggestions when in place mode and text changes (debounced).
  useEffect(() => {
    if (mode !== 'place') {
      setSuggestions([]);
      return;
    }
    if (!text.trim() || !autocompleteRef.current) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      autocompleteRef.current!.getPlacePredictions(
        { input: text, types: ['geocode'] },
        (predictions, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setSuggestions([]);
            return;
          }
          setSuggestions(
            predictions.slice(0, 5).map((p) => ({
              description: p.description,
              placeId: p.place_id,
            })),
          );
        },
      );
    }, 250);
  }, [text, mode]);

  const submitKeyword = () => {
    onKeywordChange(text.trim());
    setSuggestions([]);
  };

  const pickSuggestion = (s: Suggestion) => {
    if (!placesServiceRef.current) return;
    placesServiceRef.current.getDetails(
      { placeId: s.placeId, fields: ['geometry.location', 'name'] },
      (place, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          return;
        }
        const loc = place.geometry.location;
        onPlaceSelected({
          lat: loc.lat(),
          lng: loc.lng(),
          name: place.name ?? s.description,
        });
        setSuggestions([]);
        setText(s.description);
      },
    );
  };

  return (
    <div className="relative w-[88%] max-w-[480px] mx-auto">
      <div className="flex items-center gap-2 bg-white rounded-full shadow-md px-4 py-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && mode === 'keyword') submitKeyword();
          }}
          placeholder={mode === 'place' ? 'Search a city or address…' : 'Filter by keyword (public, indoor…)'}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
        />
        <div className="flex bg-neutral-100 rounded-full p-0.5 text-xs font-semibold">
          <button
            onClick={() => setMode('place')}
            className={mode === 'place' ? 'bg-white text-neutral-900 px-2.5 py-1 rounded-full' : 'text-neutral-500 px-2.5 py-1'}
          >
            Place
          </button>
          <button
            onClick={() => setMode('keyword')}
            className={mode === 'keyword' ? 'bg-white text-neutral-900 px-2.5 py-1 rounded-full' : 'text-neutral-500 px-2.5 py-1'}
          >
            Keyword
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                onClick={() => pickSuggestion(s)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0"
              >
                {s.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `places` to the loader**

In `client/src/components/MapView.tsx`, find the `useJsApiLoader` call. Update it to include the places library:

```tsx
const { isLoaded, loadError } = useJsApiLoader({
  id: 'google-maps-script',
  googleMapsApiKey: env.googleMapsKey,
  libraries: ['places'],
});
```

- [ ] **Step 3: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: still the unrelated MapPage errors, no new errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/SearchBar.tsx client/src/components/MapView.tsx
git commit -m "feat(client): SearchBar with Place autocomplete + Keyword modes"
```

---

## Task 9: MapView — controlled center, click handler, custom pin styling, drop-pin marker

**Files:**
- Modify: `client/src/components/MapView.tsx`

- [ ] **Step 1: Replace MapView with extended version**

`client/src/components/MapView.tsx` full replacement:

```tsx
import { useEffect, useMemo, useRef } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import type { Court } from '../types';
import { env } from '../lib/env';

interface Props {
  center: { lat: number; lng: number };
  courts: Court[];
  customCourts?: Court[];
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

export function MapView({
  center,
  courts,
  customCourts = [],
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

  // When `center` changes externally (e.g., from a Place selection), pan to it.
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
      {courts.map((c) => (
        <Marker
          key={c.placeId}
          position={{ lat: c.lat, lng: c.lng }}
          title={c.name}
          onClick={() => onSelect(c.placeId)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: c.placeId === selectedPlaceId ? 10 : 7,
            fillColor: c.placeId === selectedPlaceId ? '#16a34a' : '#171717',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          }}
        />
      ))}

      {customCourts.map((c) => (
        <Marker
          key={c.placeId}
          position={{ lat: c.lat, lng: c.lng }}
          title={c.name}
          onClick={() => onSelect(c.placeId)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: c.placeId === selectedPlaceId ? 10 : 8,
            fillColor: c.placeId === selectedPlaceId ? '#16a34a' : '#ffffff',
            fillOpacity: 1,
            strokeColor: '#16a34a',
            strokeWeight: 3,
          }}
        />
      ))}

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

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: still only unrelated MapPage errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/MapView.tsx
git commit -m "feat(client): MapView controlled center, custom pins, drop-pin handler"
```

---

## Task 10: AddSpotFab + AddSpotSheet + MapLegend + CourtPanel update

**Files:**
- Create: `client/src/components/AddSpotFab.tsx`
- Create: `client/src/components/AddSpotSheet.tsx`
- Create: `client/src/components/MapLegend.tsx`
- Modify: `client/src/components/CourtPanel.tsx`

- [ ] **Step 1: AddSpotFab**

`client/src/components/AddSpotFab.tsx`:

```tsx
interface Props {
  active: boolean;
  authed: boolean;
  onActivate: () => void;
  onCancel: () => void;
}

export function AddSpotFab({ active, authed, onActivate, onCancel }: Props) {
  if (!authed) {
    return (
      <button
        onClick={() => alert('Sign in to save your own spots')}
        className="fixed bottom-6 right-6 z-30 bg-white text-neutral-500 px-4 py-3 rounded-full shadow-lg text-sm font-semibold border border-neutral-200"
      >
        + Add a spot
      </button>
    );
  }

  return (
    <button
      onClick={active ? onCancel : onActivate}
      className={
        active
          ? 'fixed bottom-6 right-6 z-30 bg-bad text-white px-4 py-3 rounded-full shadow-lg text-sm font-semibold'
          : 'fixed bottom-6 right-6 z-30 bg-neutral-900 text-white px-4 py-3 rounded-full shadow-lg text-sm font-semibold hover:bg-neutral-800'
      }
    >
      {active ? '✕ Cancel' : '+ Add a spot'}
    </button>
  );
}
```

- [ ] **Step 2: AddSpotSheet**

`client/src/components/AddSpotSheet.tsx`:

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

interface Props {
  pin: { lat: number; lng: number };
  onClose: () => void;
  onSaved: () => void;
}

export function AddSpotSheet({ pin, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => api.saveCustomCourt({ lat: pin.lat, lng: pin.lng, name: name.trim() }),
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
            {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
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

- [ ] **Step 3: MapLegend**

`client/src/components/MapLegend.tsx`:

```tsx
export function MapLegend() {
  return (
    <div className="absolute bottom-6 left-4 z-20 bg-white/90 backdrop-blur rounded-xl shadow-md px-3 py-2 text-[11px] text-neutral-600 flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-900" />
        Places
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-white border-2 border-good" />
        Yours
      </div>
    </div>
  );
}
```

- [ ] **Step 4: CourtPanel — show "Custom spot" label**

In `client/src/components/CourtPanel.tsx`, find the title block:

```tsx
<h2 className="text-lg font-bold leading-tight">
  {detail.data?.court.name ?? (detail.isLoading ? 'Loading…' : 'Court')}
</h2>
{detail.data?.court.address && (
  <p className="text-sm text-neutral-500 mt-1">{detail.data.court.address}</p>
)}
```

Replace with:

```tsx
<h2 className="text-lg font-bold leading-tight">
  {detail.data?.court.name ?? (detail.isLoading ? 'Loading…' : 'Court')}
</h2>
{detail.data?.court.isCustom && (
  <p className="text-xs text-good font-semibold mt-1">Your custom spot</p>
)}
{detail.data?.court.address && !detail.data?.court.isCustom && (
  <p className="text-sm text-neutral-500 mt-1">{detail.data.court.address}</p>
)}
```

- [ ] **Step 5: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: still the unrelated MapPage errors only.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/
git commit -m "feat(client): AddSpotFab, AddSpotSheet, MapLegend, custom badge"
```

---

## Task 11: MapPage — orchestrate everything

**Files:**
- Modify: `client/src/routes/MapPage.tsx`

- [ ] **Step 1: Replace MapPage**

`client/src/routes/MapPage.tsx` full replacement:

```tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import { useSport } from '../stores/sport';
import { useGeolocation } from '../hooks/useGeolocation';
import { MapView } from '../components/MapView';
import { CourtPanel } from '../components/CourtPanel';
import { SearchBar } from '../components/SearchBar';
import { SportChips } from '../components/SportChips';
import { AddSpotFab } from '../components/AddSpotFab';
import { AddSpotSheet } from '../components/AddSpotSheet';
import { MapLegend } from '../components/MapLegend';
import type { User, Court } from '../types';

export function MapPage({ user }: { user: User | null }) {
  const { position: geoPosition, source } = useGeolocation();
  const { selectedPlaceId, selectCourt } = useUi();
  const [sport, setSport] = useSport();

  // Map center can be overridden by Place selections; defaults to geo.
  const [center, setCenter] = useState(geoPosition);
  useEffect(() => {
    setCenter(geoPosition);
  }, [geoPosition.lat, geoPosition.lng]);

  const [keyword, setKeyword] = useState<string>('');
  const [addMode, setAddMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null);

  const courts = useQuery({
    queryKey: queryKeys.nearbyCourts(center.lat, center.lng, sport, keyword),
    queryFn: () => api.nearbyCourts(center.lat, center.lng, sport, keyword || undefined),
    staleTime: 60 * 60 * 1000,
  });

  const saved = useQuery({
    queryKey: queryKeys.savedCourts,
    queryFn: api.savedCourts,
    enabled: !!user,
  });

  // Custom courts owned by the current user — pulled from the saved list.
  const customCourts: Court[] =
    saved.data?.courts
      .filter((c) => c.isCustom)
      .map((c) => ({
        placeId: c.placeId,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        address: c.address,
        isCustom: true,
        addedByUserId: c.addedByUserId,
      })) ?? [];

  return (
    <div className="relative h-[calc(100vh-3.5rem)]">
      {/* Overlays */}
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
        courts={courts.data?.courts ?? []}
        customCourts={customCourts}
        selectedPlaceId={selectedPlaceId}
        onSelect={selectCourt}
        addMode={addMode}
        pendingPin={pendingPin}
        onMapClick={(loc) => setPendingPin(loc)}
      />

      {!!user && customCourts.length > 0 && <MapLegend />}

      {source === 'default' && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-10 bg-white shadow-md border border-neutral-200 rounded-full px-4 py-1 text-[11px] text-neutral-600">
          Default location — enable location for nearby courts
        </div>
      )}

      {courts.isError && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-white shadow-md rounded-full px-4 py-1.5 text-sm text-bad">
          Couldn't fetch courts. Try again.
        </div>
      )}

      {courts.data && courts.data.courts.length === 0 && !courts.isLoading && (
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

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean — no errors.

- [ ] **Step 3: Vite build**

```bash
cd client && npm run build
```

Expected: clean build, PWA precache regenerates.

- [ ] **Step 4: Commit**

```bash
git add client/src/routes/MapPage.tsx
git commit -m "feat(client): MapPage orchestrates search, sport, custom pins"
```

---

## Task 12: Final pre-push verification + push

**Files:** none

- [ ] **Step 1: Re-verify backend builds + tests pass**

```bash
cd server && npm run build && npm test
```

Expected: clean build, all tests pass.

- [ ] **Step 2: Re-verify client builds**

```bash
cd client && npx tsc --noEmit && BACKEND_URL=https://courtcast-production.up.railway.app npm run build
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

Railway auto-redeploys server (with new schema applied via `db push`); Netlify auto-redeploys client.

---

## Self-Review

**Spec coverage:**
- ✅ Search bar (Place + Keyword) → Task 8
- ✅ Sport chips (Tennis / Basketball) → Task 7
- ✅ Place autocomplete via Google Maps Places → Task 8
- ✅ Cache key extension (geohash:sport) → Task 3
- ✅ Custom courts schema (isCustom, addedByUserId) → Task 1
- ✅ POST /api/me/courts/custom endpoint → Task 5
- ✅ DELETE removes Court row when custom + owned → Task 5
- ✅ AddSpotFab + AddSpotSheet → Task 10
- ✅ MapView controlled center + click handler + custom pin styling → Task 9
- ✅ MapLegend → Task 10
- ✅ Sport persistence in localStorage → Task 7
- ✅ MapPage orchestration → Task 11
- ✅ Auth gate for custom pins ("Sign in to save your own spots") → Task 10
- ✅ "Custom spot" badge in CourtPanel → Task 10
- ✅ Empty-results banner ("No {sport} courts found here") → Task 11

**Type consistency check:**
- `Sport` type defined in both `server/src/lib/sport.ts` and `client/src/types.ts` — same union, intentionally duplicated.
- `nearbyCourts` signature changed from `(lat, lng, radius?)` to `(lat, lng, sport, keyword?, radius?)` — Task 6 changes the API client; Task 11 updates the call site.
- `queryKeys.nearbyCourts` arity changed — Task 6 changes the helper; Task 11 uses the new signature.
- `Court` interface gains `isCustom?` and `addedByUserId?` — Task 6 in `types.ts`; consumers (CourtPanel, MapView, MapPage) use the new fields in Tasks 9-11.

**Placeholder scan:** None — every step has full code or a concrete command.
