# Nicknames + Custom Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user nicknames on saved courts (any saved court can be renamed without affecting other users) and user-defined Custom lists (Spotify-playlist-style; 5th tab on My Courts).

**Architecture:** `SavedCourt.nickname` is an optional column on the existing per-save row. Lists live in two new tables (`List`, `ListMember`); membership references `(placeId, sport)` matching a `SavedCourt` the user owns. Frontend gets a 5th tab and several small reusable components (`RenameInput`, `CardMenu`, `AddToListMenu`).

**Tech Stack:** Same — Prisma + Postgres, Express, React + TanStack Query, Tailwind. No new libraries.

**Spec:** `docs/superpowers/specs/2026-04-28-courtclimate-nicknames-and-lists.md`

---

## File Map

### Backend (`server/`)

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `nickname` to SavedCourt; add `List`, `ListMember` |
| `src/routes/meCourts.ts` | Modify | PATCH `/:placeId` for nickname; ListMember cleanup on DELETE |
| `src/routes/meLists.ts` | Create | List CRUD + member management |
| `src/app.ts` | Modify | Mount `meListsRouter` at `/api/me/lists` |
| `test/api.smoke.test.ts` | Modify | Auth + validation smoke for new endpoints |

### Frontend (`client/src/`)

| File | Action | Responsibility |
|---|---|---|
| `types.ts` | Modify | `SavedCourtDetail.nickname`; `ListSummary`, `ListDetail` |
| `lib/api.ts` | Modify | `renameSavedCourt`, `lists`, `createList`, `list`, `renameList`, `deleteList`, `addToList`, `removeFromList` |
| `lib/queryClient.ts` | Modify | `lists`, `list(id)` keys |
| `components/RenameInput.tsx` | Create | Inline-edit input — Enter saves, Esc cancels |
| `components/CardMenu.tsx` | Create | Three-dot ⋮ menu trigger + popover |
| `components/AddToListMenu.tsx` | Create | Modal: list-with-checkboxes + inline "+ New list" |
| `components/ListsTab.tsx` | Create | List-of-lists landing inside Custom tab |
| `components/ListView.tsx` | Create | Drill-in view for a single list |
| `components/SavedCourtCard.tsx` | Modify | Show nickname; ⋮ menu with Rename / Add to list / Remove |
| `components/CourtPanel.tsx` | Modify | Edit-pencil next to title; renames via API |
| `routes/MyCourtsPage.tsx` | Modify | 5th `📝 Custom` tab; ListsTab/ListView routing |

---

## Task 1: Schema — nickname + List + ListMember

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Update schema**

In `server/prisma/schema.prisma`, replace the `SavedCourt` model and add the two new models + back-relation on User:

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
  lists        List[]
}

model SavedCourt {
  userId    String
  placeId   String
  sport     String   @default("tennis")
  nickname  String?
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  court     Court    @relation(fields: [placeId], references: [placeId])
  createdAt DateTime @default(now())

  @@id([userId, placeId, sport])
  @@index([userId])
  @@index([userId, sport])
}

model List {
  id        String       @id @default(cuid())
  userId    String
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  members   ListMember[]

  @@index([userId])
}

model ListMember {
  listId    String
  placeId   String
  sport     String
  list      List     @relation(fields: [listId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@id([listId, placeId, sport])
  @@index([listId])
}
```

- [ ] **Step 2: Regenerate Prisma client**

```bash
cd server && npx prisma generate
```

- [ ] **Step 3: Apply locally**

```bash
cd server && npx prisma db push --accept-data-loss --skip-generate
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(db): SavedCourt.nickname + List + ListMember"
```

---

## Task 2: meCourts — PATCH nickname + DELETE list cleanup

**Files:**
- Modify: `server/src/routes/meCourts.ts`

- [ ] **Step 1: Add PATCH and update DELETE**

Replace `server/src/routes/meCourts.ts` (full file):

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
            nickname: s.nickname,
            weather: w.weather,
            score: score(w.weather),
            stale: w.stale,
          };
        } catch {
          return {
            ...s.court,
            savedAt: s.createdAt,
            sport: s.sport,
            nickname: s.nickname,
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
        nickname: null,
        weather,
        score: scoreVal,
        stale,
      },
    });
  } catch (err) {
    next(err);
  }
});

const sportRequiredQuery = z.object({ sport: sportEnum });
const sportOptionalQuery = z.object({ sport: sportEnum.optional() });

const patchSchema = z.object({ nickname: z.string().trim().max(80).nullable() });

router.patch('/:placeId', async (req, res, next) => {
  try {
    const { sport } = sportRequiredQuery.parse(req.query);
    const userId = req.user!.id;
    const { placeId } = req.params;
    const { nickname } = patchSchema.parse(req.body);
    const cleaned = nickname && nickname.trim() ? nickname.trim() : null;

    const updated = await prisma.savedCourt
      .update({
        where: { userId_placeId_sport: { userId, placeId, sport } },
        data: { nickname: cleaned },
      })
      .catch(() => null);

    if (!updated) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Saved court not found' },
      });
    }
    res.json({ savedCourt: { placeId, sport, nickname: updated.nickname } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:placeId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { placeId } = req.params;
    const { sport } = sportOptionalQuery.parse(req.query);

    const where = sport ? { userId, placeId, sport } : { userId, placeId };

    await prisma.savedCourt.deleteMany({ where });

    // Also clean up any list memberships pointing at this saved entry,
    // for any list this user owns.
    await prisma.listMember.deleteMany({
      where: {
        list: { userId },
        placeId,
        ...(sport ? { sport } : {}),
      },
    });

    // If the court is a user-owned custom one with no remaining saves, drop it.
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

- [ ] **Step 2: Build + tests still pass**

```bash
cd server && npm run build && npm test
```

Expected: clean build, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/meCourts.ts
git commit -m "feat(server): PATCH nickname + DELETE cleans list memberships"
```

---

## Task 3: meLists router (CRUD + members)

**Files:**
- Create: `server/src/routes/meLists.ts`

- [ ] **Step 1: Create meLists.ts**

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
const nameSchema = z.string().trim().min(1).max(60);

router.get('/', async (req, res, next) => {
  try {
    const lists = await prisma.list.findMany({
      where: { userId: req.user!.id },
      include: { _count: { select: { members: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        memberCount: l._count.members,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = nameSchema.parse(req.body?.name);
    const list = await prisma.list.create({
      data: { userId: req.user!.id, name },
    });
    res.status(201).json({
      list: {
        id: list.id,
        name: list.name,
        memberCount: 0,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const list = await prisma.list.findFirst({
      where: { id: req.params.id, userId },
      include: { members: { orderBy: { createdAt: 'desc' } } },
    });
    if (!list) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found' } });
    }

    const hydrated = await Promise.all(
      list.members.map(async (m) => {
        const saved = await prisma.savedCourt.findUnique({
          where: { userId_placeId_sport: { userId, placeId: m.placeId, sport: m.sport } },
          include: { court: true },
        });
        if (!saved) return null;
        try {
          const w = await fetchWeather(saved.court.lat, saved.court.lng);
          return {
            ...saved.court,
            savedAt: saved.createdAt,
            sport: saved.sport,
            nickname: saved.nickname,
            weather: w.weather,
            score: score(w.weather),
            stale: w.stale,
          };
        } catch {
          return {
            ...saved.court,
            savedAt: saved.createdAt,
            sport: saved.sport,
            nickname: saved.nickname,
            weather: null,
            score: null,
            stale: true,
          };
        }
      }),
    );

    res.json({
      list: {
        id: list.id,
        name: list.name,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        members: hydrated.filter(Boolean),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const name = nameSchema.parse(req.body?.name);
    const updated = await prisma.list.updateMany({
      where: { id: req.params.id, userId },
      data: { name },
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found' } });
    }
    const list = await prisma.list.findUnique({ where: { id: req.params.id } });
    res.json({ list: { id: list!.id, name: list!.name } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.list.deleteMany({
      where: { id: req.params.id, userId: req.user!.id },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const memberSchema = z.object({
  placeId: z.string().min(1),
  sport: sportEnum,
});

router.post('/:id/members', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { placeId, sport } = memberSchema.parse(req.body);

    const list = await prisma.list.findFirst({ where: { id: req.params.id, userId } });
    if (!list) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found' } });
    }

    const saved = await prisma.savedCourt.findUnique({
      where: { userId_placeId_sport: { userId, placeId, sport } },
    });
    if (!saved) {
      return res.status(404).json({
        error: { code: 'COURT_NOT_SAVED', message: 'Save the court first' },
      });
    }

    const member = await prisma.listMember.upsert({
      where: { listId_placeId_sport: { listId: list.id, placeId, sport } },
      create: { listId: list.id, placeId, sport },
      update: {},
    });

    await prisma.list.update({ where: { id: list.id }, data: { updatedAt: new Date() } });

    res.status(201).json({ member: { listId: member.listId, placeId, sport } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:placeId/:sport', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const sport = sportEnum.parse(req.params.sport);

    const list = await prisma.list.findFirst({ where: { id: req.params.id, userId } });
    if (!list) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found' } });
    }

    await prisma.listMember.deleteMany({
      where: { listId: list.id, placeId: req.params.placeId, sport },
    });
    await prisma.list.update({ where: { id: list.id }, data: { updatedAt: new Date() } });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/meLists.ts
git commit -m "feat(server): meLists router — list CRUD + member management"
```

---

## Task 4: Mount meLists in app.ts

**Files:**
- Modify: `server/src/app.ts`

- [ ] **Step 1: Add the import + mount line**

In `server/src/app.ts`, find the existing import block and add:

```ts
import meListsRouter from './routes/meLists';
```

Then in `createApp()`, after the existing `app.use('/api/me/courts', meCourtsRouter);` line, add:

```ts
  app.use('/api/me/lists', meListsRouter);
```

(Order: meLists must mount before any `notFound` catch-all.)

- [ ] **Step 2: Build**

```bash
cd server && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/src/app.ts
git commit -m "feat(server): mount /api/me/lists router"
```

---

## Task 5: Smoke tests for nickname + lists

**Files:**
- Modify: `server/test/api.smoke.test.ts`

- [ ] **Step 1: Add tests inside the existing `describe('api smoke', ...)` block**

In `server/test/api.smoke.test.ts`, append before the closing `});` of the describe block:

```ts
  it('PATCH /api/me/courts/:placeId?sport=tennis → 401 without session', async () => {
    const res = await request(app)
      .patch('/api/me/courts/somePlaceId?sport=tennis')
      .send({ nickname: 'Spot' });
    expect(res.status).toBe(401);
  });

  it('PATCH /api/me/courts/:placeId without sport → 401 (auth checked first)', async () => {
    const res = await request(app)
      .patch('/api/me/courts/somePlaceId')
      .send({ nickname: 'Spot' });
    expect(res.status).toBe(401);
  });

  it('GET /api/me/lists → 401 without session', async () => {
    const res = await request(app).get('/api/me/lists');
    expect(res.status).toBe(401);
  });

  it('POST /api/me/lists → 401 without session', async () => {
    const res = await request(app).post('/api/me/lists').send({ name: 'Sunday' });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/me/lists/:id → 401 without session', async () => {
    const res = await request(app).delete('/api/me/lists/abc');
    expect(res.status).toBe(401);
  });

  it('POST /api/me/lists/:id/members → 401 without session', async () => {
    const res = await request(app)
      .post('/api/me/lists/abc/members')
      .send({ placeId: 'p', sport: 'tennis' });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/me/lists/:id/members/:placeId/:sport → 401 without session', async () => {
    const res = await request(app).delete('/api/me/lists/abc/members/p/tennis');
    expect(res.status).toBe(401);
  });
```

- [ ] **Step 2: Run tests**

```bash
cd server && npm test
```

Expected: all pass (35 total: 11 playability + ~17 smoke + 7 new + 6 sport, but the exact count just needs to be greater than the previous 28).

- [ ] **Step 3: Commit**

```bash
git add server/test/api.smoke.test.ts
git commit -m "test(server): smoke for nickname + lists endpoints"
```

---

## Task 6: Client types — nickname + List shapes

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

- [ ] **Step 2: tsc (expect cascading errors)**

```bash
cd client && npx tsc --noEmit
```

Expected: errors only in api.ts / queryClient.ts / SavedCourtCard / CourtPanel / MyCourtsPage that subsequent tasks fix.

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat(client): types — nickname + List/ListDetail"
```

---

## Task 7: Client API — nickname + lists methods

**Files:**
- Modify: `client/src/lib/api.ts`

- [ ] **Step 1: Update imports + add methods**

In `client/src/lib/api.ts`, change the import line to include the new types:

```ts
import type { Court, CourtDetail, SavedCourtDetail, User, WeatherSummary, PlayabilityScore, Sport, ListSummary, ListDetail } from '../types';
```

Then in the `api` object, append after `saveCustomCourt`:

```ts
  renameSavedCourt: (placeId: string, sport: Sport, nickname: string | null) =>
    request<{ savedCourt: { placeId: string; sport: Sport; nickname: string | null } }>(
      `/api/me/courts/${placeId}?sport=${sport}`,
      { method: 'PATCH', body: JSON.stringify({ nickname }) },
    ),

  lists: () => request<{ lists: ListSummary[] }>('/api/me/lists'),
  createList: (name: string) =>
    request<{ list: ListSummary }>('/api/me/lists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  list: (id: string) => request<{ list: ListDetail }>(`/api/me/lists/${id}`),
  renameList: (id: string, name: string) =>
    request<{ list: { id: string; name: string } }>(`/api/me/lists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteList: (id: string) => request<void>(`/api/me/lists/${id}`, { method: 'DELETE' }),
  addToList: (listId: string, placeId: string, sport: Sport) =>
    request<{ member: { listId: string; placeId: string; sport: Sport } }>(
      `/api/me/lists/${listId}/members`,
      { method: 'POST', body: JSON.stringify({ placeId, sport }) },
    ),
  removeFromList: (listId: string, placeId: string, sport: Sport) =>
    request<void>(`/api/me/lists/${listId}/members/${placeId}/${sport}`, { method: 'DELETE' }),
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/api.ts
git commit -m "feat(client): api — nickname rename + lists CRUD + members"
```

---

## Task 8: queryClient — list keys

**Files:**
- Modify: `client/src/lib/queryClient.ts`

- [ ] **Step 1: Add list keys**

In `client/src/lib/queryClient.ts`, replace the `queryKeys` export:

```ts
export const queryKeys = {
  me: ['me'] as const,
  nearbyCourts: (lat: number, lng: number, sport: Sport, keyword?: string) =>
    ['courts', round(lat), round(lng), sport, keyword ?? ''] as const,
  court: (placeId: string) => ['court', placeId] as const,
  savedCourts: ['savedCourts'] as const,
  lists: ['lists'] as const,
  list: (id: string) => ['lists', id] as const,
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/queryClient.ts
git commit -m "feat(client): queryKeys — lists, list(id)"
```

---

## Task 9: RenameInput component

**Files:**
- Create: `client/src/components/RenameInput.tsx`

- [ ] **Step 1: Create component**

```tsx
import { useState, useRef, useEffect } from 'react';

interface Props {
  initialValue: string;
  placeholder?: string;
  maxLength?: number;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function RenameInput({ initialValue, placeholder, maxLength = 80, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSave(value.trim());
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onSave(value.trim())}
      onClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      maxLength={maxLength}
      className="px-2 py-1 border border-good rounded-md text-base font-bold w-full outline-none"
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/RenameInput.tsx
git commit -m "feat(client): RenameInput inline-edit primitive"
```

---

## Task 10: CardMenu component

**Files:**
- Create: `client/src/components/CardMenu.tsx`

- [ ] **Step 1: Create component**

```tsx
import { useState, useRef, useEffect } from 'react';

export interface CardMenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export function CardMenu({ items }: { items: CardMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 text-lg leading-none"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border border-neutral-200 min-w-[180px] overflow-hidden">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={
                'w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ' +
                (item.destructive ? 'text-bad' : 'text-neutral-700')
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/CardMenu.tsx
git commit -m "feat(client): CardMenu three-dot popover"
```

---

## Task 11: AddToListMenu modal

**Files:**
- Create: `client/src/components/AddToListMenu.tsx`

- [ ] **Step 1: Create component**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { Sport } from '../types';

interface Props {
  placeId: string;
  sport: Sport;
  onClose: () => void;
}

export function AddToListMenu({ placeId, sport, onClose }: Props) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const lists = useQuery({ queryKey: queryKeys.lists, queryFn: api.lists });

  const add = useMutation({
    mutationFn: (listId: string) => api.addToList(listId, placeId, sport),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.lists });
      onClose();
    },
  });

  const create = useMutation({
    mutationFn: (name: string) => api.createList(name),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.lists });
      add.mutate(res.list.id);
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Add to list</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto -mx-1">
          {lists.isLoading && (
            <p className="text-sm text-neutral-500 px-1 py-2">Loading…</p>
          )}
          {lists.data && lists.data.lists.length === 0 && (
            <p className="text-sm text-neutral-500 px-1 py-2">
              No lists yet — create one below.
            </p>
          )}
          {lists.data?.lists.map((l) => (
            <button
              key={l.id}
              onClick={() => add.mutate(l.id)}
              disabled={add.isPending}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-neutral-50 rounded-lg flex justify-between items-center"
            >
              <span className="font-medium">📝 {l.name}</span>
              <span className="text-xs text-neutral-400">{l.memberCount}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-neutral-100">
          {creating ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) create.mutate(newName.trim());
                  if (e.key === 'Escape') {
                    setCreating(false);
                    setNewName('');
                  }
                }}
                placeholder="List name"
                maxLength={60}
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:border-good"
              />
              <button
                onClick={() => newName.trim() && create.mutate(newName.trim())}
                disabled={!newName.trim() || create.isPending}
                className="px-3 py-2 bg-neutral-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full px-3 py-2 text-sm font-semibold text-good hover:bg-neutral-50 rounded-lg text-left"
            >
              + New list
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/AddToListMenu.tsx
git commit -m "feat(client): AddToListMenu modal — pick / create list inline"
```

---

## Task 12: SavedCourtCard — nickname + ⋮ menu

**Files:**
- Modify: `client/src/components/SavedCourtCard.tsx`

- [ ] **Step 1: Replace SavedCourtCard.tsx**

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { SavedCourtDetail } from '../types';
import { SPORT_EMOJI } from '../types';
import { PlayabilityBadge } from './PlayabilityBadge';
import { WeatherStats } from './WeatherStats';
import { CardMenu } from './CardMenu';
import { RenameInput } from './RenameInput';
import { AddToListMenu } from './AddToListMenu';

interface Props {
  court: SavedCourtDetail;
  onSelect: (placeId: string) => void;
  // When provided, replaces the default sport-scoped Remove with a
  // list-scoped "Remove from this list" action.
  listScopedRemove?: () => void;
}

export function SavedCourtCard({ court, onSelect, listScopedRemove }: Props) {
  const qc = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [addingToList, setAddingToList] = useState(false);

  const rename = useMutation({
    mutationFn: (nickname: string | null) =>
      api.renameSavedCourt(court.placeId, court.sport, nickname),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
      qc.invalidateQueries({ queryKey: ['lists'] });
      setRenaming(false);
    },
  });

  const unsave = useMutation({
    mutationFn: () => api.unsaveCourt(court.placeId, court.sport),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
      qc.invalidateQueries({ queryKey: ['lists'] });
    },
  });

  const display = court.nickname || court.name;

  const menuItems = [
    { label: 'Rename', onSelect: () => setRenaming(true) },
    { label: 'Add to list', onSelect: () => setAddingToList(true) },
    listScopedRemove
      ? { label: 'Remove from this list', onSelect: listScopedRemove, destructive: true }
      : { label: `Remove from ${SPORT_EMOJI[court.sport]}`, onSelect: () => unsave.mutate(), destructive: true },
  ];

  return (
    <>
      <div
        onClick={() => !renaming && onSelect(court.placeId)}
        className="cursor-pointer w-full bg-white border border-neutral-200 rounded-2xl p-5 hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-label={court.sport}>
                {SPORT_EMOJI[court.sport]}
              </span>
              {renaming ? (
                <RenameInput
                  initialValue={court.nickname ?? court.name}
                  placeholder={court.name}
                  onSave={(v) => rename.mutate(v || null)}
                  onCancel={() => setRenaming(false)}
                />
              ) : (
                <h3 className="font-bold text-base truncate">{display}</h3>
              )}
            </div>
            {court.address && !renaming && (
              <p className="text-sm text-neutral-500 truncate ml-7">
                {court.nickname && (
                  <span className="text-xs italic mr-2">({court.name})</span>
                )}
                {court.address}
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 shrink-0">
            {court.score && <PlayabilityBadge score={court.score} />}
            <CardMenu items={menuItems} />
          </div>
        </div>

        {court.weather ? (
          <div className="mt-3">
            <WeatherStats weather={court.weather} compact />
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Weather unavailable right now.</p>
        )}
      </div>

      {addingToList && (
        <AddToListMenu
          placeId={court.placeId}
          sport={court.sport}
          onClose={() => setAddingToList(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/SavedCourtCard.tsx
git commit -m "feat(client): SavedCourtCard — nickname + CardMenu (rename/add/remove)"
```

---

## Task 13: CourtPanel — nickname display + edit pencil

**Files:**
- Modify: `client/src/components/CourtPanel.tsx`

- [ ] **Step 1: Replace CourtPanel.tsx**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useSport } from '../stores/sport';
import type { User } from '../types';
import { SPORT_LABEL, SPORT_EMOJI } from '../types';
import { PlayabilityBadge } from './PlayabilityBadge';
import { WeatherStats } from './WeatherStats';
import { RenameInput } from './RenameInput';

interface Props {
  placeId: string;
  user: User | null;
  onClose: () => void;
}

export function CourtPanel({ placeId, user, onClose }: Props) {
  const qc = useQueryClient();
  const [sport] = useSport();
  const [renaming, setRenaming] = useState(false);

  const detail = useQuery({
    queryKey: queryKeys.court(placeId),
    queryFn: () => api.court(placeId),
  });

  const saved = useQuery({
    queryKey: queryKeys.savedCourts,
    queryFn: api.savedCourts,
    enabled: !!user,
  });

  const savedEntry = saved.data?.courts.find(
    (c) => c.placeId === placeId && c.sport === sport,
  );
  const isSavedForSport = !!savedEntry;
  const displayName = savedEntry?.nickname || detail.data?.court.name;

  const save = useMutation({
    mutationFn: () => api.saveCourt(placeId, sport),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedCourts }),
  });
  const unsave = useMutation({
    mutationFn: () => api.unsaveCourt(placeId, sport),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
      qc.invalidateQueries({ queryKey: ['lists'] });
    },
  });
  const rename = useMutation({
    mutationFn: (nickname: string | null) => api.renameSavedCourt(placeId, sport, nickname),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
      qc.invalidateQueries({ queryKey: ['lists'] });
      setRenaming(false);
    },
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
          <div className="min-w-0 flex-1">
            {renaming && savedEntry ? (
              <RenameInput
                initialValue={savedEntry.nickname ?? detail.data!.court.name}
                placeholder={detail.data!.court.name}
                onSave={(v) => rename.mutate(v || null)}
                onCancel={() => setRenaming(false)}
              />
            ) : (
              <h2 className="text-lg font-bold leading-tight flex items-center gap-2">
                <span className="truncate">
                  {displayName ?? (detail.isLoading ? 'Loading…' : 'Court')}
                </span>
                {isSavedForSport && (
                  <button
                    onClick={() => setRenaming(true)}
                    aria-label="Rename"
                    className="text-neutral-400 hover:text-neutral-700 text-base shrink-0"
                  >
                    ✎
                  </button>
                )}
              </h2>
            )}
            {detail.data?.court.isCustom && (
              <p className="text-xs text-good font-semibold mt-1">Your custom spot</p>
            )}
            {detail.data?.court.address && !detail.data?.court.isCustom && !renaming && (
              <p className="text-sm text-neutral-500 mt-1">
                {savedEntry?.nickname && (
                  <span className="text-xs italic mr-2">({detail.data.court.name})</span>
                )}
                {detail.data.court.address}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none shrink-0"
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

- [ ] **Step 2: Commit**

```bash
git add client/src/components/CourtPanel.tsx
git commit -m "feat(client): CourtPanel — nickname display + edit pencil"
```

---

## Task 14: ListsTab + ListView

**Files:**
- Create: `client/src/components/ListsTab.tsx`
- Create: `client/src/components/ListView.tsx`

- [ ] **Step 1: Create ListsTab.tsx**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

interface Props {
  onSelectList: (id: string) => void;
}

export function ListsTab({ onSelectList }: Props) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const lists = useQuery({ queryKey: queryKeys.lists, queryFn: api.lists });

  const create = useMutation({
    mutationFn: (name: string) => api.createList(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.lists });
      setCreating(false);
      setNewName('');
    },
  });

  return (
    <div>
      {creating ? (
        <div className="flex gap-2 mb-4">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) create.mutate(newName.trim());
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
            placeholder="List name"
            maxLength={60}
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:border-good"
          />
          <button
            onClick={() => newName.trim() && create.mutate(newName.trim())}
            className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-semibold"
          >
            Create
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
            className="px-4 py-2 border border-neutral-300 rounded-lg text-sm"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full mb-4 px-4 py-3 border-2 border-dashed border-neutral-300 rounded-2xl text-neutral-500 font-semibold hover:bg-neutral-50"
        >
          + New list
        </button>
      )}

      {lists.isLoading && <p className="text-neutral-500">Loading lists…</p>}

      {lists.data && lists.data.lists.length === 0 && !creating && (
        <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center">
          <h2 className="font-semibold text-lg mb-1">No lists yet</h2>
          <p className="text-neutral-500">Create one to group your favorite courts.</p>
        </div>
      )}

      {lists.data && lists.data.lists.length > 0 && (
        <div className="grid gap-3">
          {lists.data.lists.map((l) => (
            <button
              key={l.id}
              onClick={() => onSelectList(l.id)}
              className="w-full text-left bg-white border border-neutral-200 rounded-2xl p-5 hover:shadow-md transition-shadow flex items-center justify-between"
            >
              <div>
                <h3 className="font-bold text-base">📝 {l.name}</h3>
                <p className="text-sm text-neutral-500 mt-1">
                  {l.memberCount} {l.memberCount === 1 ? 'court' : 'courts'}
                </p>
              </div>
              <span className="text-neutral-400 text-xl">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ListView.tsx**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { SavedCourtCard } from './SavedCourtCard';
import { RenameInput } from './RenameInput';
import { useUi } from '../stores/ui';
import type { Sport } from '../types';

interface Props {
  listId: string;
  onBack: () => void;
}

export function ListView({ listId, onBack }: Props) {
  const qc = useQueryClient();
  const { selectCourt } = useUi();
  const [editingName, setEditingName] = useState(false);

  const list = useQuery({ queryKey: queryKeys.list(listId), queryFn: () => api.list(listId) });

  const rename = useMutation({
    mutationFn: (name: string) => api.renameList(listId, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.list(listId) });
      qc.invalidateQueries({ queryKey: queryKeys.lists });
      setEditingName(false);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteList(listId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.lists });
      onBack();
    },
  });

  const removeMember = useMutation({
    mutationFn: ({ placeId, sport }: { placeId: string; sport: Sport }) =>
      api.removeFromList(listId, placeId, sport),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.list(listId) });
      qc.invalidateQueries({ queryKey: queryKeys.lists });
    },
  });

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Back to lists
      </button>

      <div className="mb-5 flex items-start justify-between gap-3">
        {editingName && list.data ? (
          <RenameInput
            initialValue={list.data.list.name}
            maxLength={60}
            onSave={(v) => v && rename.mutate(v)}
            onCancel={() => setEditingName(false)}
          />
        ) : (
          <h2 className="text-2xl font-bold flex items-center gap-2 min-w-0">
            <span className="truncate">📝 {list.data?.list.name ?? 'Loading…'}</span>
            {list.data && (
              <button
                onClick={() => setEditingName(true)}
                aria-label="Rename list"
                className="text-neutral-400 hover:text-neutral-700 text-base shrink-0"
              >
                ✎
              </button>
            )}
          </h2>
        )}
      </div>

      {list.isLoading && <p className="text-neutral-500">Loading list…</p>}

      {list.data && list.data.list.members.length === 0 && (
        <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center">
          <h3 className="font-semibold text-lg mb-1">No courts in this list</h3>
          <p className="text-neutral-500">Use the ⋮ menu on any saved court to add it here.</p>
        </div>
      )}

      {list.data && list.data.list.members.length > 0 && (
        <div className="grid gap-3 mb-6">
          {list.data.list.members.map((c) => (
            <SavedCourtCard
              key={`${c.placeId}:${c.sport}`}
              court={c}
              onSelect={selectCourt}
              listScopedRemove={() => removeMember.mutate({ placeId: c.placeId, sport: c.sport })}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => {
          if (window.confirm('Delete this list? Saved courts stay saved.')) {
            remove.mutate();
          }
        }}
        className="text-sm text-bad font-semibold hover:underline"
      >
        Delete list
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ListsTab.tsx client/src/components/ListView.tsx
git commit -m "feat(client): ListsTab + ListView (Custom tab content)"
```

---

## Task 15: MyCourtsPage — 5th Custom tab + routing

**Files:**
- Modify: `client/src/routes/MyCourtsPage.tsx`

- [ ] **Step 1: Replace MyCourtsPage.tsx**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { SavedCourtCard } from '../components/SavedCourtCard';
import { CourtPanel } from '../components/CourtPanel';
import { ListsTab } from '../components/ListsTab';
import { ListView } from '../components/ListView';
import { useUi } from '../stores/ui';
import type { Sport, User } from '../types';
import { SPORTS, SPORT_LABEL, SPORT_EMOJI } from '../types';

type TabValue = 'all' | Sport | 'custom';

export function MyCourtsPage({ user }: { user: User }) {
  const { selectedPlaceId, selectCourt } = useUi();
  const saved = useQuery({ queryKey: queryKeys.savedCourts, queryFn: api.savedCourts });
  const [tab, setTab] = useState<TabValue>('all');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const allCourts = saved.data?.courts ?? [];
  const filtered =
    tab === 'all' || tab === 'custom'
      ? allCourts
      : allCourts.filter((c) => c.sport === tab);

  const tabs: { value: TabValue; label: string }[] = [
    { value: 'all', label: 'All' },
    ...SPORTS.map((s) => ({ value: s as TabValue, label: `${SPORT_EMOJI[s]} ${SPORT_LABEL[s]}` })),
    { value: 'custom', label: '📝 Custom' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">My Courts</h1>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
        {tabs.map((t) => {
          const active = t.value === tab;
          return (
            <button
              key={t.value}
              onClick={() => {
                setTab(t.value);
                setSelectedListId(null);
              }}
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

      {tab === 'custom' ? (
        selectedListId ? (
          <ListView listId={selectedListId} onBack={() => setSelectedListId(null)} />
        ) : (
          <ListsTab onSelectList={setSelectedListId} />
        )
      ) : (
        <>
          {saved.isLoading && <p className="text-neutral-500">Loading your courts…</p>}
          {saved.isError && <p className="text-bad">Couldn’t load your saved courts.</p>}

          {saved.data && filtered.length === 0 && (
            <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center">
              <h2 className="font-semibold text-lg mb-1">
                {tab === 'all'
                  ? 'No courts saved yet'
                  : `No ${SPORT_LABEL[tab as Sport].toLowerCase()} courts saved yet`}
              </h2>
              <p className="text-neutral-500 mb-4">
                {tab === 'all'
                  ? 'Open the map, tap a court, then “Save to My Courts.”'
                  : `Switch to ${SPORT_EMOJI[tab as Sport]} ${SPORT_LABEL[tab as Sport]} on the map and save some.`}
              </p>
              <a
                href="/"
                className="inline-block px-4 py-2 rounded-xl bg-neutral-900 text-white font-semibold"
              >
                Browse the map
              </a>
            </div>
          )}

          {saved.data && filtered.length > 0 && (
            <div className="grid gap-3">
              {filtered.map((c) => (
                <SavedCourtCard
                  key={`${c.placeId}:${c.sport}`}
                  court={c}
                  onSelect={selectCourt}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selectedPlaceId && (
        <CourtPanel
          placeId={selectedPlaceId}
          user={user}
          onClose={() => selectCourt(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: tsc + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/MyCourtsPage.tsx
git commit -m "feat(client): MyCourtsPage 5th Custom tab + ListsTab/ListView routing"
```

---

## Task 16: Final verify + push

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
git diff --name-only --staged | grep -E '\.env$' && echo "ABORT: env file staged" || echo "ok"
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ `SavedCourt.nickname` schema → Task 1
- ✅ `List` + `ListMember` schema → Task 1
- ✅ `User.lists` back-relation → Task 1
- ✅ PATCH `/api/me/courts/:placeId?sport=` → Task 2
- ✅ DELETE cleanup of ListMember rows → Task 2
- ✅ List CRUD + member endpoints → Task 3
- ✅ Mount router → Task 4
- ✅ Smoke tests for all new endpoints → Task 5
- ✅ Client `SavedCourtDetail.nickname` + `ListSummary` + `ListDetail` → Task 6
- ✅ `renameSavedCourt`, `lists`, `createList`, `list`, `renameList`, `deleteList`, `addToList`, `removeFromList` → Task 7
- ✅ `queryKeys.lists` + `queryKeys.list(id)` → Task 8
- ✅ RenameInput primitive → Task 9
- ✅ CardMenu primitive → Task 10
- ✅ AddToListMenu modal → Task 11
- ✅ SavedCourtCard with nickname display + ⋮ menu → Task 12
- ✅ CourtPanel with edit pencil + nickname → Task 13
- ✅ ListsTab (list-of-lists) → Task 14
- ✅ ListView (drill-in) → Task 14
- ✅ MyCourtsPage 5th Custom tab + sub-view routing → Task 15
- ✅ Empty states (lists view, list view, sport-tab) → Tasks 14, 15
- ✅ Final integration verify → Task 16

**Type consistency:**
- `Sport` and `SavedCourtDetail.nickname` defined Task 6, consumed Tasks 7, 12, 13, 14.
- `ListSummary` defined Task 6 (`{ id, name, memberCount, createdAt, updatedAt }`), used by `lists()` API Task 7, ListsTab Task 14, AddToListMenu Task 11.
- `ListDetail` defined Task 6 (`{ id, name, createdAt, updatedAt, members: SavedCourtDetail[] }`), used by `list(id)` API Task 7, ListView Task 14.
- `renameSavedCourt(placeId, sport, nickname)` defined Task 7, called by SavedCourtCard Task 12 + CourtPanel Task 13.
- `addToList(listId, placeId, sport)`, `createList(name)`, `removeFromList(listId, placeId, sport)` defined Task 7, called Tasks 11 + 14.
- `renameList(id, name)`, `deleteList(id)` defined Task 7, called Task 14.
- `queryKeys.lists` and `queryKeys.list(id)` defined Task 8, used Tasks 11, 14.

**Placeholder scan:** none — every step has full code or concrete commands.

**Migration safety:** Task 1 nickname is nullable (no default needed). The two new tables are fresh — `prisma db push --accept-data-loss --skip-generate` creates them without affecting existing rows.
