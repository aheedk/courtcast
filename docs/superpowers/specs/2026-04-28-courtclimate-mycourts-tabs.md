# CourtClimate — My Courts tabs + pickleball

**Date:** 2026-04-28
**Status:** Approved (autonomous, this session)
**Owner:** aheedk
**Builds on:**
- [2026-04-27-courtcast-design.md](./2026-04-27-courtcast-design.md) (initial design)
- [2026-04-27-courtcast-explore-design.md](./2026-04-27-courtcast-explore-design.md) (search + sport + custom pins)

Round 3. Adds **pickleball** as a third sport across the whole app, and
splits the `My Courts` dashboard into per-sport tabs so the user can see
their tennis, basketball, and pickleball lists separately.

## Goals

- Let users see saved courts split by sport in the dashboard.
- Let the same physical court live in multiple sport lists (a park with
  both tennis and pickleball courts can be saved twice — once per sport).
- Add pickleball as a first-class sport everywhere tennis and basketball
  appear today.

## Non-goals (this round)

User-defined named lists (Spotify-style "Sunday courts"); per-sport custom
pin defaults; sport-specific weather thresholds; bulk re-tagging of saves;
shared lists between users.

## UI

### `MyCourtsPage` gets a 4-tab bar

```
┌──────────────────────────────────────────────┐
│ My Courts                                    │
│                                              │
│  [All]  [🎾 Tennis]  [🏀 Basketball]  [🥒 Pickleball]
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │ Riverside Park           🎾  GOOD   │    │
│  │ Tampa, FL                            │    │
│  │ 72°F · 6 mph · 12% rain              │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ Backyard                 🥒  OK     │    │
│  │ ...                                  │    │
│  └─────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

- 4 tabs, exclusive selection. Default = `All`.
- Tab state lives in component `useState` — not URL, not Zustand.
- `All` shows everything (with sport emoji badge per card). `🎾`, `🏀`,
  `🥒` filter to that sport.
- Empty state per tab: `No <sport> courts saved yet — search the map
  and tap "Save".`

### `SavedCourtCard` shows a sport badge

A small pill or emoji in the top-right corner of each card. Tells users
which sport tag the entry is filed under (especially relevant on the
`All` tab where mixed sports appear together).

### `SportChips` auto-renders 3 chips

Driven by the `SPORTS` array. Adding pickleball is a one-line type
change — the chip row picks it up.

### `CourtPanel` save state is sport-aware

`isSaved` becomes `isSavedForCurrentSport`. Saving and unsaving operate
on `(placeId, currentSport)`. The same panel can show "Save" for tennis
and "Remove" for basketball depending on which sport chip is active.

### `AddSpotSheet` save includes current sport

Custom-pin save POSTs `{ lat, lng, name, sport: currentSport }`.

## Backend

### Schema (Prisma)

`SavedCourt` PK gains `sport`. The default `"tennis"` lets
`prisma db push --accept-data-loss` migrate any existing rows
without dropping the table.

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

### API changes

```
POST /api/me/courts                body { placeId, sport }    auth
POST /api/me/courts/custom         body { lat, lng, name, sport }    auth
DELETE /api/me/courts/:placeId?sport=tennis                    auth
  - With ?sport=<sport>: deletes only that sport tag
  - Without ?sport: deletes all sport tags for that placeId
  - Custom-court cleanup (deleting the Court row) only fires when
    the LAST sport tag is removed
GET /api/me/courts                                             auth
  - Response shape gains `sport` field per entry; client filters
```

### Sport library

```ts
export type Sport = 'tennis' | 'basketball' | 'pickleball';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball', 'pickleball'] as const;

const SPORT_KEYWORD: Record<Sport, string> = {
  tennis: 'tennis court',
  basketball: 'basketball court',
  pickleball: 'pickleball court',
};
```

Client mirrors with `SPORT_LABEL` (`"Tennis" / "Basketball" / "Pickleball"`)
and `SPORT_EMOJI` (`🎾 / 🏀 / 🥒`).

## Migration safety

The schema change is two parts:
1. Add `sport` column with default `"tennis"` — non-destructive, fills
   existing rows with the default.
2. Change PK from `(userId, placeId)` to `(userId, placeId, sport)` —
   Prisma's db push handles this; existing rows already have unique
   `(userId, placeId, "tennis")` so no PK violations.

Local dev DBs typically have no saves (the user is seeing the new feature
fresh) so even data loss would be tolerable. In prod, no saves yet exist
under any user we know about. Either way: the default makes it safe.

## Errors and edge cases

- Saving a court that's already saved for that sport → 200 (idempotent
  upsert) with the existing row.
- Trying to save without a sport in the body → 400 BAD_REQUEST from zod.
- DELETE with no `?sport` and no rows match → 204 (idempotent).
- Custom court with one save tag deleted → Court row deleted (existing
  behavior). Custom court with multiple sport tags → Court row stays
  until the last tag is gone.
- Empty tabs render the per-tab empty state, not a global empty state.

## Testing

- Unit: extend `sport.test.ts` with pickleball cases (3 sports total).
- Smoke: extend `api.smoke.test.ts`:
  - `POST /api/me/courts` requires sport in body (400 without).
  - `DELETE /api/me/courts/:placeId?sport=tennis` is auth-gated.

## Risks

- **Pickleball Places coverage.** Google Places returns mixed quality
  for "pickleball court" — some cities have great coverage, some none.
  The `+ Add a spot` custom-pin flow already covers this gap for
  signed-in users.
- **Tab count creep.** If a fourth sport is added later, the tab bar
  starts to crowd on small phones. Acceptable at 4; would need a
  scrollable chip row at 6+.
