# CourtClimate — Nicknames + user-defined Custom lists

**Date:** 2026-04-28
**Status:** Approved (autonomous, this session)
**Owner:** aheedk
**Builds on:** [2026-04-28-courtclimate-mycourts-tabs.md](./2026-04-28-courtclimate-mycourts-tabs.md)

Round 4. Two features:

1. **Per-user nicknames** — rename any saved court to whatever you want;
   the global Court row stays untouched, so other users keep seeing
   Google's name.
2. **User-defined Custom lists** — Spotify-playlist-style. Create
   named lists ("Sunday spots", "Indoor only"), add saved courts to
   them, view per-list. The fifth tab on `My Courts` is `📝 Custom`,
   which surfaces these lists.

## Goals

- Let users rename any of their saved courts (Places-discovered or
  custom) without affecting other users.
- Let users create, rename, and delete arbitrary named lists, and
  toggle saved courts into and out of those lists.
- Keep the existing All / 🎾 / 🏀 / 🥒 sport-tab UX intact; lists are
  additive.

## Non-goals (this round)

Sharing lists between users; ordering members or lists (creation order
only); list color / emoji / cover image; importing / exporting lists;
notifications when a list member's playability changes; bulk add
("save all results to a list"); list templates.

## Schema (Prisma) — additive

```prisma
model SavedCourt {
  userId    String
  placeId   String
  sport     String   @default("tennis")
  nickname  String?           // NEW
  user      User     @relation(...)
  court     Court    @relation(...)
  createdAt DateTime @default(now())

  @@id([userId, placeId, sport])
  @@index([userId])
  @@index([userId, sport])
}

model User {
  // ...existing fields...
  lists     List[]            // NEW back-relation
}

model List {                  // NEW
  id        String       @id @default(cuid())
  userId    String
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  members   ListMember[]

  @@index([userId])
}

model ListMember {            // NEW
  listId    String
  placeId   String
  sport     String
  list      List     @relation(fields: [listId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@id([listId, placeId, sport])
  @@index([listId])
}
```

The `(placeId, sport)` member tuple matches `SavedCourt`'s composite PK
shape, so a list member always points at one specific saved entry. We
enforce at the application layer (not via FK) that the user owns a
matching `SavedCourt` before adding it to a list.

`prisma db push --accept-data-loss --skip-generate` handles this:
existing `SavedCourt` rows get `nickname = NULL`; the two new tables
are created fresh.

## Backend API

```
# Nicknames
PATCH  /api/me/courts/:placeId?sport=tennis        body { nickname: string|null }
  - Sets / clears nickname on the matching SavedCourt.
  - 404 if no matching saved entry.
  - nickname trimmed to <=80 chars; null/empty clears.

# Lists CRUD
GET    /api/me/lists                               → [{ id, name, memberCount, updatedAt }]
POST   /api/me/lists           body { name }       → { id, name, ... }   201
GET    /api/me/lists/:id                           → { id, name, members: [hydrated] }
PATCH  /api/me/lists/:id       body { name }       → updated
DELETE /api/me/lists/:id                           → 204

# List membership
POST   /api/me/lists/:id/members  body { placeId, sport }  → 201
  - 404 if user doesn't own the matching SavedCourt.
  - Idempotent: re-adding a member returns 200 with existing.
DELETE /api/me/lists/:id/members/:placeId/:sport          → 204
```

All endpoints auth-required. zod validation on every body / param.

`GET /api/me/lists/:id` hydrates members the same way `GET /api/me/courts`
does today: weather + playability per court, with the saved entry's
`nickname` and `sport`.

## Frontend

### Components

| Component | Status | Responsibility |
|---|---|---|
| `RenameInput.tsx` | new | Inline edit input — `value`, `onSave(string|null)`, `onCancel`; Enter = save, Esc = cancel |
| `CardMenu.tsx` | new | Three-dot ⋮ menu trigger + popover; renders an array of action items |
| `AddToListMenu.tsx` | new | Lists-with-checkboxes popover + inline "+ New list" |
| `ListsTab.tsx` | new | Renders inside `MyCourtsPage` when `tab === 'custom'`; list-of-lists view |
| `ListView.tsx` | new | Drill-in view: list name (editable via `RenameInput`), member cards, "Delete list" |
| `MyCourtsPage.tsx` | edit | 5th tab `📝 Custom`; renders `ListsTab` (or `ListView` when one is selected) |
| `SavedCourtCard.tsx` | edit | Shows `nickname \|\| name`; adds `CardMenu` with Rename / Add to list / Remove |
| `CourtPanel.tsx` | edit | Edit-pencil next to title; renames via API; uses `nickname` in display |

### State

- `MyCourtsPage` adds `selectedListId` local state to switch between
  list-of-lists and single-list view.
- TanStack Query keys:
  - `['lists']` for the list-of-lists summary.
  - `['lists', listId]` for a single list with members.
  - Existing `['savedCourts']` key gains `nickname` field — already
    flowing through since `SavedCourtDetail` extends `Court` and gets
    server-side spread.

### UX details

- **Custom tab landing view:** vertical stack of list cards. Each card:
  ```
  📝 Sunday spots
  3 courts · last updated 2h ago         >
  ```
  At top: a `+ New list` button. Tap a card → drill in.
- **List view:** breadcrumb back link, editable title, "Delete list"
  destructive button at bottom. Members render as `SavedCourtCard`s
  with a list-scoped ⋮ menu (Remove from list — does NOT unsave).
- **`SavedCourtCard` ⋮ menu items:**
  - Rename (opens `RenameInput` over the title)
  - Add to list (opens `AddToListMenu` popover)
  - Remove from `<sport>` (existing unsave, sport-scoped)
  - When inside a `ListView`: Remove from list (replaces the sport-remove)
- **`CourtPanel`** gets a small ✎ icon next to the title when the user
  has saved this court for the current sport. Tap → inline rename.
  When no save exists for current sport, the ✎ is hidden (nothing to
  rename yet — the per-save nickname only attaches to a SavedCourt row).

### Empty states

- Custom tab with no lists: large illustration-free card with
  "No lists yet — create one to group your favorite courts."
- Inside an empty list: "No courts in this list. Use the ⋮ menu on any
  saved court to add it here."

## Errors and edge cases

- Renaming with empty / whitespace-only string → treated as clear
  (sets `nickname = NULL`, falls back to `court.name`).
- Adding a court to a list when not signed in → can't happen (My Courts
  is auth-gated).
- Deleting a list → cascade deletes its members (via Prisma `onDelete:
  Cascade` on ListMember.list relation). Saved courts themselves are
  not affected.
- Deleting a saved court that's a member of one or more lists → list
  members orphan-pointing at it. We do an explicit cleanup on
  `DELETE /api/me/courts/:placeId?sport=…`: also delete matching
  `ListMember(placeId, sport)` rows for any list the user owns.
- Concurrent rename of a list from two devices → last write wins
  (no conflict UI for MVP).
- List name length: trim, min 1, max 60.
- A list can be empty (member count 0). It still shows in the lists
  view and can be added to later.

## Testing

- Unit: nickname trim/clear logic; list-name validation (zod).
- Smoke (supertest):
  - `PATCH /api/me/courts/:placeId?sport=…` 401 without session.
  - `POST /api/me/lists` 401 without session; 400 on empty name.
  - `POST /api/me/lists/:id/members` 401 without session.
  - `DELETE /api/me/lists/:id` 401 without session.
- Manual: rename → tab through sports → confirm only the renamed save
  shows the nickname; create list → add courts of multiple sports →
  delete list → confirm members gone, saves intact.

## Risks

- **API surface growth.** This round adds 8 endpoints; the server route
  count goes from ~10 to ~18. Manageable, but worth keeping
  `meCourts.ts` from becoming a 500-line file: split list endpoints
  into their own router file (`server/src/routes/meLists.ts`) mounted
  at `/api/me/lists`.
- **Nickname per-save vs per-place.** We chose per-save (lives on
  `SavedCourt`), which means the same court saved as both tennis and
  pickleball can have two different nicknames. This is intentional but
  worth flagging in case it surprises users.
