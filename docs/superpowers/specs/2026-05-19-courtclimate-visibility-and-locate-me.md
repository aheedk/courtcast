# CourtClimate — Custom Court Visibility + Locate-Me Button Design

## Goal

Two related additions to the map:

1. **Locate-me button.** A small button anchored at the bottom-right of the map that, on tap, recenters the map on the user's current GPS position and drops a blue arrow marker showing where they are.
2. **Public / private custom courts.** Every custom court (the kind a signed-in user adds by dropping a pin) now has a visibility setting. Public custom courts behave like Google Places courts — anyone signed in sees them and can post status reports. Private custom courts only exist for the owner. New custom courts default to **public**; the owner can flip to private at any time, which immediately cascades-deletes other users' saves of that court.

## User stories

- "Where am I on the map?" — User taps the locate-me button. Map pans to their current position; a blue navigation arrow marks the spot.
- "I'm adding my favorite local park — I want my friends to see it too." — User drops a pin, the bottom sheet appears with a "Make public" toggle defaulted on, they save. The court appears in nearby-courts queries for anyone in range.
- "I added my backyard court by mistake — I want it hidden." — User opens the court's panel, taps the "Public" pill, confirms. The court vanishes from everyone else's lists; their saves are deleted; the user keeps it as a private spot.
- "I'm at this park, three courts open, dry — let me share that." — User opens the court panel (it's a public custom court somebody else added), posts a status report. Everyone who has the court saved sees their next report fetch refresh with this update.

## Architecture

Three layers:

1. **Data model.** New `visibility` column on `Court`. Two values: `'public'`, `'private'`. Default `'public'`. Migration backfills all existing rows to `'public'` (Google Places courts were always implicitly public; existing custom courts you've added become discoverable — see "Migration" below).
2. **Server filtering.** A single helper (`canSeeCourt(court, user)`) gates every read of court data — nearby search, single-court lookup, report fetches and submits. Public courts are visible to anyone; private courts only to their owner.
3. **Client UI.** Add-spot sheet gets a visibility toggle; CourtPanel for an owner of a custom court gets a Public / Private pill that flips the value via a new endpoint. The map gains a locate-me button and renders a blue arrow when geolocation has fired.

## Data model — server

Prisma schema change:

```prisma
model Court {
  placeId       String        @id
  name          String
  lat           Float
  lng           Float
  address       String?
  isCustom      Boolean       @default(false)
  visibility    String        @default("public")  // 'public' | 'private'
  addedByUserId String?
  addedBy       User?         @relation("UserCustomCourts", fields: [addedByUserId], references: [id])
  fetchedAt     DateTime      @default(now())
  savedBy       SavedCourt[]
  reports       CourtReport[]

  @@index([addedByUserId])
  @@index([visibility])
}
```

`visibility` lives at the `Court` level (not on `SavedCourt`) because a court's visibility is global, not per-saver. The `@@index([visibility])` supports the cheap "public-only" filter used by the nearby-courts query.

## Server — visibility filter

New helper `server/src/lib/visibility.ts`:

```ts
export function canSeeCourt(
  court: { visibility: string; isCustom: boolean; addedByUserId: string | null },
  userId: string | null,
): boolean {
  if (court.visibility === 'public') return true;
  return !!userId && court.isCustom && court.addedByUserId === userId;
}

export function visibilityWhereClause(userId: string | null): Prisma.CourtWhereInput {
  // For aggregate queries (findMany), express the same rule as a SQL filter.
  if (!userId) return { visibility: 'public' };
  return {
    OR: [
      { visibility: 'public' },
      { visibility: 'private', isCustom: true, addedByUserId: userId },
    ],
  };
}
```

Routes updated:

- **`GET /api/courts`** (nearby search) — applies `visibilityWhereClause(req.user?.id ?? null)` to the Prisma query that hydrates custom courts into the response. Google Places hits stay unchanged (they were public anyway).
- **`GET /api/court/:placeId`** — fetches the court, runs `canSeeCourt`. Returns 404 if not visible to the caller (404, not 403, to avoid leaking existence of private courts).
- **`POST /api/me/courts`** (save a court) — same 404 if the placeId points to a court you can't see.
- **`POST /api/places/:placeId/reports`** and the GET / batch counterparts — same gate. You can only report on courts you can see; you can only see reports for courts you can see.

The batch endpoint (`POST /api/places/reports/batch`) filters its `placeIds` set down to the ones the caller can see before querying for reports. Hidden placeIds get `null` in the response (same shape as "no recent report") so the client can't infer existence.

## Server — visibility flip endpoint

New route, mounted under the existing `court.ts` router:

`PATCH /api/court/:placeId/visibility` — auth required.

- Body: `{ visibility: 'public' | 'private' }`.
- 404 if the court isn't visible to the caller.
- 403 if the court is visible but the caller isn't the original `addedByUserId` (only the owner can flip).
- 400 if the court is a Google Places result (not custom) — those have no concept of visibility.
- On private flip: in a Prisma transaction —
  1. Update `court.visibility = 'private'`.
  2. `prisma.savedCourt.deleteMany({ where: { placeId, NOT: { userId: ownerUserId } } })` — other users' saves go away.
  3. `prisma.listMember.deleteMany({ where: { placeId, NOT: { list: { userId: ownerUserId } } } })` — including in lists.
  4. `CourtReport` rows are **not** deleted. They stay in the DB; the read filter just hides them while the court is private. If the owner later flips back to public, reports within the 24h TTL window re-surface (older reports stay filtered by the existing TTL logic, no change needed there).
- On public flip: trivial — just update the column. No cascade.

Returns the updated `Court` JSON.

## Migration

Schema change is additive; new column with default `'public'`. Existing Google Places courts (`isCustom = false`) keep their effective-public-anyway behavior. Existing custom courts (`isCustom = true`) become public to other users at deploy time.

The user is aware this means previously-added custom courts will newly appear in other users' nearby searches. Acceptable for this stage of the project. If we ever decide otherwise the one-line migration to backfill `visibility = 'private' WHERE isCustom = true` is trivial.

## Client — types

`client/src/types.ts`:

```ts
export type CourtVisibility = 'public' | 'private';

export interface Court {
  // ...existing
  visibility: CourtVisibility;
}
```

`SavedCourtDetail` and `CourtDetail` already extend `Court`, so they inherit the field.

## Client — add-spot sheet

`AddSpotSheet.tsx` (the bottom-sheet shown after a user drops a pin in add mode) gains one row above the Save button:

```
┌────────────────────────────────────────┐
│ Make public                       [✓] │
│ Others can see this spot and reports  │
└────────────────────────────────────────┘
```

A controlled toggle defaulting to `true`. Sends `visibility` along with the existing `POST /api/me/courts/custom` body. The server reads the field (also defaults to `'public'` if absent for older clients).

The server route `POST /api/me/courts/custom` accepts a new optional `visibility` field in its Zod schema; bare requests still default public.

## Client — owner's visibility pill on the panel

`CourtPanel.tsx`, just above the Save / Remove buttons, when `court.isCustom && court.addedByUserId === currentUser.id`:

```
○ Public   ◉ Private
```

A small two-option pill (chip-style) showing the current state. Tapping the inactive option opens a confirm step inline:

- Public → Private: "Make this private? Other users' saves of this court will be removed." → [Make private] / [Cancel]
- Private → Public: no confirm; goes through immediately (it's safe — no one else has saves to lose).

On success, refetch the `queryKeys.court(placeId)` and `queryKeys.savedCourts` queries; for non-owners on a privatized court, the panel will 404 on next open (handled by the existing error UI).

## Client — saved-card private badge

`SavedCourtCard.tsx`: when `court.visibility === 'private'` (which is only ever true on cards the user owns, since the filter excludes others'), show a tiny lock-style indicator next to the existing playability badge:

```
🔒 Private
```

Subtle — `text-xs` with a `bg-neutral-100 text-neutral-600` chip — so it never competes with the playability signal but always says at a glance "this one's yours alone."

## Client — locate-me button

New component `LocateMeButton.tsx`, rendered inside `MapPage.tsx` alongside `AddSpotFab`. Anchored `fixed bottom-44 right-4` (just above the AddSpotFab at `bottom-32`), `w-12 h-12 rounded-full bg-white shadow-md border border-neutral-200` with a small target-icon SVG inside.

Behavior:

- On tap, calls `navigator.geolocation.getCurrentPosition` (one-shot, not `watchPosition` — we re-locate on each tap rather than tracking continuously).
- On success, stores the resulting `{ lat, lng }` in a local component state at `MapPage` level and pans the map: `setCenter({ lat, lng })`.
- A `useEffect` watches the new state and renders a `<Marker>` on the map at that lat/lng using a small inline-SVG icon (blue arrow pointing up, white outline). The arrow is just a static directional cursor — no heading sensor / no rotation — same shape and color regardless of device orientation.
- Tap fail (permission denied / unavailable): button shrugs a small toast "Location not available — enable location for the locate-me button" then resets to idle.

The arrow marker has no `onClick` (it's decorative; tapping it does nothing) and a stable lat/lng key so it doesn't churn the marker layer.

### Arrow icon

Inline SVG built by the same `buildPinIcon`-style helper or a new dedicated function:

```ts
function buildLocateMeIcon(): google.maps.Icon {
  const size = 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <path d="M12 2 L20 22 L12 17 L4 22 Z" fill="#2563eb" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" />
  </svg>`;
  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(12, 12),
    scaledSize: new google.maps.Size(size, size),
  };
}
```

`#2563eb` (blue-600) for parity with the new "has report" pin fill. Anchor at the icon's geometric center so the arrow's tail base sits at the lat/lng.

## API surface (full diff)

- `GET /api/courts` — filtered by `visibilityWhereClause`.
- `GET /api/court/:placeId` — 404 when `!canSeeCourt`.
- `POST /api/me/courts/custom` — body gains optional `visibility: 'public' | 'private'` (default `'public'`).
- `POST /api/me/courts` — 404 if placeId not visible.
- `PATCH /api/court/:placeId/visibility` — **new**. Owner-only; cascades saves on private flip.
- `POST /api/places/:placeId/reports` — 404 if not visible.
- `GET /api/places/:placeId/report` — 204 if not visible (same response shape as "no recent report").
- `POST /api/places/reports/batch` — filters hidden placeIds out of the response (key present, value `null`).

## Edge cases

| Case | Behavior |
|---|---|
| Two users add the same lat/lng as separate private courts | Coexist — each has its own `custom_<cuid>` placeId. No collision. |
| User saves another's public custom court, then owner flips private | Save row is deleted by the cascade; on next refresh the court vanishes from their list. No toast — saved-list refetch handles it. |
| User flips own court private, then back to public minutes later | Other users' saves do NOT auto-restore — the cascade is destructive. They'd have to save again. |
| Report exists on a court that's now private | Stays in DB. Hidden from API. Re-surfaces (within TTL) if court goes public again. |
| Anonymous user tries to open `/api/court/:placeId` for a private court | 404 (same as a non-existent placeId). Existence not leaked. |
| Locate-me tap when permission denied | Toast: "Location not available — enable location for the locate-me button." Button stays interactive for retry. |
| Locate-me tap with stale `useGeolocation` data | Always re-queries fresh on tap (`getCurrentPosition`), doesn't reuse the hook's cached value. |
| Locate-me marker after map is panned away | Marker stays at the captured lat/lng; only re-centers when the user taps the button again. |
| User adds a custom court with visibility toggle off | Saved as private. Default is on (public). |
| Owner deletes their own private court | Pre-existing behavior — out of scope for this spec. The current Court-delete path doesn't cascade reports today; if that becomes user-visible (e.g. delete fails due to FK constraint) it's a separate fix. |

## Tests

### Server

- `server/test/visibility.test.ts` (new): unit tests for `canSeeCourt` and `visibilityWhereClause` across all four combinations of (public/private × owner/other × anon).
- `server/test/reports.test.ts` (extend): add cases where a private court returns 404 for non-owners on POST/GET/batch.
- `server/test/api.smoke.test.ts` (extend): one happy-path + one denied-path for `PATCH /api/court/:placeId/visibility`.
- New file `server/test/courtVisibility.test.ts`: end-to-end for the visibility flip — create a public custom court, save it as another user, flip private, assert the other user's save row is gone and they get 404 on the court.

### Client

No automated client tests (consistent with existing time-changer + reports specs). Manual smoke-test checklist in the implementation plan: add a public court, flip it private, verify another browser session loses it; tap locate-me, verify the arrow appears and the map pans.

## Rollout

1. Prisma `db push` adds the `visibility` column with default `'public'`. Existing rows backfill to `'public'` automatically.
2. Ship server first. Endpoints become live; clients without visibility field still work (defaults preserve old behavior).
3. Ship client. New add-spot toggle, panel pill, locate-me button, blue-arrow marker, private badge on cards.
4. Sanity-check: confirm the visibility index is being used (`EXPLAIN` on a nearby-courts query in dev) so the `OR` clause doesn't fall back to a sequential scan.

## Out of scope (deferred)

- Per-report privacy independent of the court (reports always inherit court visibility).
- "Friends only" / list-based sharing — only public/private for now.
- A "discover public courts I haven't saved" feed.
- Notifications when someone reports on your public court.
- Bulk visibility change UI.
- Heading-aware locate-me arrow (compass rotation) — static arrow only.
- Continuous location tracking (`watchPosition`) — one-shot per tap.
- Locate-me support on the My Courts page or anywhere besides the map.
- A "who saved this court" surface for owners of public courts.

## Assumptions

- `addedByUserId` is reliably set for every custom court today (true per the current `POST /api/me/courts/custom` route, which sets it from the session).
- The `CourtReport.placeId → Court.placeId` foreign key has no special cascade for visibility (only `onDelete`-related cascades) — so reports persist through visibility flips automatically.
- The Railway server runs a single dyno; the visibility filter is enforced in-app rather than via Postgres row-level security (which the project doesn't use today).
- Geolocation permission UX is the browser's responsibility — we don't pre-prompt; the button tap is the trigger.
- `navigator.geolocation` is available on all target browsers (modern Safari, Chrome, Firefox — PWA + mobile web).
