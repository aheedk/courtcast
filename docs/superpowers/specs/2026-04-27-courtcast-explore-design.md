# CourtCast — Map exploration UX (search, sport, custom pins)

**Date:** 2026-04-27
**Status:** Approved (autonomous, this session)
**Owner:** aheedk
**Builds on:** [2026-04-27-courtcast-design.md](./2026-04-27-courtcast-design.md)

Round 2 of CourtCast. Makes the map screen actually usable as an exploration
tool: a single search bar (place autocomplete + keyword filter), a sport
toggle (tennis / basketball), and the ability for signed-in users to drop
their own custom pins anywhere on the map.

## Goals

- Let any visitor search for a city / neighborhood / address and see tennis
  or basketball courts there, independent of browser geolocation.
- Let signed-in users tap a `+ Add a spot` button, drop a pin anywhere on
  the map, name it, and save it as a custom court in their `My Courts` list.
- Preserve the existing zero-friction map: anonymous visitors still see
  pins + weather + playability without signing in.

## Non-goals (this round)

Tap-anywhere weather (just tap → see weather at that point without saving),
filter chips beyond sport (indoor / lighted / public / free), more sports
(pickleball, soccer), multi-sport selection, URL state encoding, search
history / recents, voice search, editing or renaming custom court entries,
sharing custom courts publicly, reviews / ratings / photos.

## UI

### Layout

Map page gets two stacked overlays at the top, plus a FAB at the bottom.

```
┌────────────────────────────────────────────┐
│  🔍 Search a city or keyword…   Place|Kw   │  ← SearchBar (overlay)
├────────────────────────────────────────────┤
│       🎾 Tennis     🏀 Basketball          │  ← SportChips (overlay)
├────────────────────────────────────────────┤
│                                            │
│               MAP + PINS                   │
│                                            │
│                          ┌───────────────┐ │
│                          │ + Add a spot  │ │  ← FAB
│                          └───────────────┘ │
└────────────────────────────────────────────┘
```

- **SearchBar:** white pill, shadow-md, ~88% width, top-center.
  Right-side segmented control toggles `Place ⇄ Keyword`.
  - **Place mode:** Google Maps `places.AutocompleteService` (already
    loaded for the map — no extra API key, autocomplete is free at
    personal scale). Suggestions dropdown. Selecting a suggestion
    centers the map and refetches courts at the new lat/lng.
  - **Keyword mode:** plain debounced input. On Enter or 500ms idle,
    refetches courts at the current center with the keyword param.
- **SportChips:** pill row, exclusive selection, defaults to Tennis.
  Persisted to `localStorage['courtcast.sport']`.
- **AddSpotFab:** bottom-right floating button. Anonymous users get a
  tooltip "Sign in to save your own spots" on tap (no mode entry).
  Signed-in users tapping it puts the map in **drop-pin mode**: cursor
  changes, top banner reads "Tap the map to drop a pin." Tapping the
  map drops a marker at that lat/lng and opens the AddSpotSheet.
- **AddSpotSheet:** bottom sheet (mobile) / centered card (desktop)
  with `Name this spot` input + `Save` button. Save → POST → invalidate
  saved-courts query → exits add-mode.

### Components

| Component | Status | Purpose |
|---|---|---|
| `SearchBar.tsx` | new | Pill input + mode toggle + autocomplete dropdown |
| `SportChips.tsx` | new | Tennis / Basketball exclusive chips |
| `AddSpotFab.tsx` | new | Floating button → toggles drop-pin mode |
| `AddSpotSheet.tsx` | new | Bottom-sheet form with Name input + Save |
| `MapPage.tsx` | edited | Owns search/sport/custom state, layout |
| `MapView.tsx` | edited | Accepts controlled `center`, optional `onMapClick` |
| `CourtPanel.tsx` | edited | Shows weather for custom courts too |
| `SavedCourtCard.tsx` | edited | Optional badge on custom courts |

### Custom pin visual

- **Places-discovered:** solid black circle marker (existing).
- **Custom (saved by current user):** green outline-only circle.
- **Selected:** solid green (existing).
- Small legend in the bottom-left corner explains on first paint
  for signed-in users only.

## State

- Search and sport state live in `MapPage` local `useState`. Not Zustand —
  scoped to one page, no cross-route consumers.
- Sport hydrates from `localStorage['courtcast.sport']` on mount; defaults
  to `'tennis'` if absent.
- Drop-pin mode is local boolean state (`addMode`).
- All server data flows through TanStack Query.

URL state is intentionally not added (see non-goals).

## Backend

### API changes

```
GET /api/courts?lat=&lng=&sport=tennis|basketball&keyword=optional
  - sport defaults to "tennis"
  - keyword is appended to the Places keyword param
  - Cache key: `${geohash4}:${sport}` for sport-only queries;
    queries with non-empty keyword bypass cache.

POST /api/me/courts/custom   body { lat, lng, name }   (auth required)
  - Creates Court row with synthetic placeId `custom:${cuid}`
  - Sets isCustom=true, addedByUserId=req.user.id
  - Creates SavedCourt row in the same transaction
  - Returns hydrated savedCourt (court + weather + playability)

GET /api/me/courts            (existing, unchanged)
  - Already includes custom courts since they live in SavedCourt

DELETE /api/me/courts/:placeId (existing, behavior extended)
  - If court is custom AND owned by req.user, also delete the Court row
  - Otherwise, only delete the SavedCourt row (existing behavior)
```

### Schema (Prisma)

Two additive fields on `Court`. `prisma db push --accept-data-loss` handles
this without data loss because both are nullable / defaulted.

```prisma
model Court {
  placeId        String       @id
  name           String
  lat            Float
  lng            Float
  address        String?
  isCustom       Boolean      @default(false)
  addedByUserId  String?
  addedBy        User?        @relation(fields: [addedByUserId], references: [id])
  fetchedAt      DateTime     @default(now())
  savedBy        SavedCourt[]
  @@index([addedByUserId])
}

model User {
  // ...existing fields...
  customCourts   Court[]
}
```

### Sport keyword mapping

```ts
const SPORT_KEYWORD: Record<Sport, string> = {
  tennis: 'tennis court',
  basketball: 'basketball court',
};
```

Combined Places `keyword` parameter:
```ts
[SPORT_KEYWORD[sport], userKeyword].filter(Boolean).join(' ').trim()
```

## Errors and edge cases

- Autocomplete service error → swallow silently, no suggestions (input still
  accepts free text).
- Keyword search with zero results → empty pin set + non-error banner
  "No courts found for [query]".
- Custom-pin save fails with 401 (session expired) → bottom sheet shows
  inline error; the dropped marker stays drawn until the user retries or
  cancels.
- User taps `+ Add a spot` while not signed in → tooltip / inline prompt
  "Sign in to save your own spots" — no mode entry.
- User taps the map outside add-mode → existing behavior (selecting a pin
  if one is hit).
- Custom court delete is destructive but scoped to one user; covered by
  existing "Remove from My Courts" confirmation phrasing.

## Testing

- **Unit:** sport-keyword mapping table; keyword combiner trims/concatenates
  correctly.
- **Smoke (supertest):**
  - `GET /api/courts?sport=basketball` calls Places with
    `keyword="basketball court"` (mock fetch).
  - `POST /api/me/courts/custom` returns 401 without session, 201 with
    session, creates expected rows.
  - `DELETE /api/me/courts/:placeId` for a custom court owned by the user
    removes the underlying Court row.

No new playability scoring tests — scoring logic unchanged.

## Risks

- **Google Places Autocomplete quotas.** The JS Autocomplete service is
  billed by session, not request. Personal-scale usage should stay free.
  Watch the Google Cloud bill if usage grows.
- **Custom pins polluting the Court table.** Each user's custom courts add
  a row. At MVP scale negligible. Could partition into `CustomCourt` later
  if it grows.
- **`prisma db push` on every boot** — already accepted as MVP-mode trade-off
  in `2026-04-27-courtcast-design.md`. Continues to apply.
