# CourtClimate — `custom` as a 4th sport

**Date:** 2026-04-28
**Status:** Approved (autonomous, this session)
**Owner:** aheedk
**Builds on:**
- [2026-04-28-courtclimate-mycourts-tabs.md](./2026-04-28-courtclimate-mycourts-tabs.md) (sport tabs + pickleball)
- [2026-04-28-courtclimate-nicknames-and-lists.md](./2026-04-28-courtclimate-nicknames-and-lists.md) (lists + Custom tab)

Adds `'custom'` as a fourth value to the `Sport` union so users can save
courts without tagging them as tennis / basketball / pickleball. Solves
the complaint: *"if I make a Soccer list, adding a court to it also
saves it to the Tennis tab."* Now you switch to the **Custom** chip
first, and saves go only to your custom-tagged area + any list you add
them to.

## Goals

- Let users save courts under a generic `Custom` tag so they don't
  pollute built-in sport tabs.
- Keep one source of truth: the chip on the map controls what tag a
  save (or auto-save via Add-to-list) gets.
- Unify the conceptual "user-organized" surface: custom-tagged saves
  AND user-defined lists live together under one **Custom** tab on
  My Courts.

## Non-goals

- More than four sports.
- Promoting a custom save to a built-in sport later (would need a
  retag UI; users can unsave + re-save under a different chip if
  needed).
- Sport-specific weather / playability thresholds — scoring stays
  weather-only.
- Showing custom saves in `CourtPanel.detail` (those panels open from
  Places-driven pins, which won't appear in Custom mode anyway).
- Showing which sport tag a Places-discovered court "should" be
  (Places types are inconsistent; we let the user decide via chip).

## Sport library change

Server (`server/src/lib/sport.ts`):

```ts
export type Sport = 'tennis' | 'basketball' | 'pickleball' | 'custom';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball', 'pickleball', 'custom'] as const;

const SPORT_KEYWORD: Record<Sport, string> = {
  tennis: 'tennis court',
  basketball: 'basketball court',
  pickleball: 'pickleball court',
  custom: '',
};
```

Client (`client/src/types.ts`) mirrors:
- `Sport` adds `'custom'`
- `SPORTS` array adds `'custom'`
- `SPORT_LABEL.custom = 'Custom'`
- `SPORT_EMOJI.custom = '📝'`

`buildPlacesKeyword('custom')` returns `''` (or just the user's
keyword, trimmed). `buildPlacesKeyword('custom', 'soccer field')`
returns `'soccer field'` — keyword-only Places search works in custom
mode.

## Server behavior

`server/src/lib/google.ts → fetchNearbyCourts(...)`:

- If the resolved Places keyword is empty (sport=custom AND no user
  keyword), **skip the Places call entirely** and return
  `{ courts: [], stale: false }` immediately. No quota burn for
  empty searches.
- The cache key continues to be `${geohash}:${sport}` — so cache
  semantics stay correct (custom-mode results, when keyword is
  present, are not cached because user keyword bypasses cache, same
  as today).

`server/src/routes/courts.ts → GET /api/courts`:

- The zod `sport` validator already uses `z.enum(SPORTS as ...)`, which
  will pick up `'custom'` automatically once the SPORTS array is
  extended.

`server/src/routes/meCourts.ts`, `meLists.ts`:

- No code changes needed — both already validate sport via
  `z.enum(SPORTS as ...)`. Adding `'custom'` to the SPORTS array
  flows through.

## Client behavior

### SportChips (no code change)

Already maps over `SPORTS`. Picks up the 4th chip automatically.

### MapPage

When the active sport is `'custom'` and the keyword is empty:

- Disable the `/api/courts` query (`enabled: keyword.trim() !== ''`)
- Show a banner: *"Custom mode — search a place or use + Add a spot
  to drop your own pin."*
- Saved-custom courts (from the My Courts query) still render on the
  map — those don't depend on the courts query.

### CourtPanel

No structural change. The "Save to 📝 Custom" button label appears
naturally because it uses `SPORT_LABEL[sport]` and `SPORT_EMOJI[sport]`.

### MyCourtsPage — Custom tab body becomes two sections

Currently the Custom tab renders `ListsTab` (or `ListView` when a list
is selected). Now it renders both:

```
┌─────────────────────────────────────────┐
│ Your custom saves                       │
│ ┌─────────────────────────────────────┐ │
│ │ 📝 Riverside Field           GOOD   │ │
│ │ ...                                  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Your lists                              │
│ + New list                              │
│ ┌─────────────────────────────────────┐ │
│ │ 📝 Soccer (3 courts)              > │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

Implementation: extract a small `CustomSavesSection` component that
filters `savedCourts` by `sport === 'custom'`. Place it above the
existing `ListsTab` render. When the user drills into a list, the
sections collapse and `ListView` takes over (same as today).

Empty states for the two halves:
- No custom saves yet: small inline note "*No custom saves yet —
  switch to 📝 Custom on the map to save one.*"
- No lists yet: existing dashed-border card "No lists yet — create one
  to group your favorite courts."

## Schema

**No schema change.** `SavedCourt.sport` is already a `String`
column, not a Postgres enum. `'custom'` is just another valid value.

## Errors and edge cases

- User saves a court in Custom mode → sport='custom' → court appears
  in: Custom tab "Your custom saves" + the All tab. Does NOT appear
  in tennis / basketball / pickleball tabs.
- User adds custom-saved court to a list → list-membership row
  references `(placeId, 'custom')`. Already supported by schema.
- User in Custom mode clicks "Add to list…" on a not-yet-saved
  court → the existing CourtPanel auto-save logic kicks in, but with
  current chip = `'custom'`. So the auto-saved row is custom-tagged.
  No sport-tab pollution.
- User searches a keyword in Custom mode (e.g., "soccer field") →
  Places returns matches, pins render. Saving any pin in Custom mode
  tags it as `'custom'`.
- Server-side: empty keyword + sport=custom → empty courts response.
  `placesCache` not written (caching empty results would be wasteful).

## Testing

- Unit (`server/test/sport.test.ts`):
  - `buildPlacesKeyword('custom')` → `''`
  - `buildPlacesKeyword('custom', 'soccer field')` → `'soccer field'`
  - `SPORTS` includes `'custom'` (length 4).
- Smoke (`server/test/api.smoke.test.ts`):
  - `GET /api/courts?sport=custom&lat=…&lng=…` returns 200 with
    `courts: []` (no Places call made — verified by mocked fetch
    not being invoked in stubbed prisma test, or accepted as
    behavior-only test in production).
- Manual: switch to 📝 Custom on map → confirm no auto-fetched pins;
  type "soccer" in keyword search → pins appear; save a pin → confirm
  it appears under My Courts → 📝 Custom → "Your custom saves" and
  NOT under Tennis tab.

## Risks

- **User confusion if they search in Custom mode and forget to switch
  back.** Minor — the chip's visual state is clear.
- **Custom tab gets crowded** if user has many custom saves AND many
  lists. Both sections scroll within the tab; not a blocker.
- **Existing Custom-tagged users.** None — no users have saved
  anything custom-tagged because `'custom'` isn't a valid sport
  today. Pure additive change for any existing data.
