# CourtClimate — Add to list from the map

**Date:** 2026-04-28
**Status:** Approved (autonomous, this session)
**Owner:** aheedk
**Builds on:** [2026-04-28-courtclimate-nicknames-and-lists.md](./2026-04-28-courtclimate-nicknames-and-lists.md)

Small refinement. Surfaces the existing `AddToListMenu` modal from the
map's `CourtPanel`, so users can drop a court into a custom list
without first navigating to `My Courts`.

## Goal

Let signed-in users add the currently-open map court to any of their
custom lists in one click — auto-saving to the current sport if it
isn't already saved.

## UI

`CourtPanel` gets a secondary action button below the existing
Save/Remove button:

```
[Save to 🎾 Tennis]      ← existing
[Add to list...]         ← NEW
```

Click → opens the existing `AddToListMenu` modal. Modal shows the
user's lists with member counts plus a `+ New list` inline create.
Picking a list closes the modal and adds the court.

The new button is hidden when the user isn't signed in (matching the
existing "Sign in to save…" empty state for unauth users).

## Behavior

When the user taps a list in the modal:

- If a `SavedCourt(userId, placeId, currentSport)` already exists →
  just `POST /api/me/lists/:id/members`.
- Otherwise → `POST /api/me/courts {placeId, sport}` first, then
  `POST /api/me/lists/:id/members`. Both happen as one mutation from
  the user's perspective.

This means tapping "Add to list" on a not-yet-saved court has a side
effect: the court also appears in the corresponding sport tab. That's
the right semantics — list membership is a *grouping* of saves, not
an alternative to saving.

## Components touched

| Component | Change |
|---|---|
| `AddToListMenu.tsx` | Replace internal `addToList` mutation with a caller-supplied `onAdd: (listId: string) => Promise<void>` prop. Component becomes pure UI with no implicit save semantics. |
| `CourtPanel.tsx` | Add "Add to list" button + `AddToListMenu` render. `onAdd` callback handles the save-first-if-needed flow. |
| `SavedCourtCard.tsx` | Pass the simpler `onAdd: (listId) => api.addToList(...)` — saved courts don't need save-first. |

No backend changes. No schema changes. No new endpoints.

## Errors and edge cases

- Network failure on save-then-add → mutation surfaces error; no
  partial state visible to user beyond TanStack Query's normal
  retry behavior.
- User has zero lists → modal shows "No lists yet — create one below"
  empty state (already implemented).
- Court already in the picked list → `POST /:id/members` is idempotent
  (existing behavior; `upsert` semantics on server).
- Auto-save inserts a SavedCourt with `sport = useSport()` — the user's
  current sport chip selection. If they're viewing the map under
  Pickleball and add a court to a list, the court is saved as
  pickleball. If they wanted a different sport tag, they switch chips
  first.

## Testing

Manual: open a court in CourtPanel without saving, click "Add to
list", create a list, pick it. Verify court appears in:
1. The current sport tab on My Courts
2. The picked list under Custom

No new automated tests; this is wiring of existing tested endpoints.

## Out of scope

- Multi-select listing (tap multiple lists before closing).
- Showing membership state ("Already in: Sunday spots, Indoor only")
  in the modal.
- Per-sport overrides ("save as basketball even though I'm viewing
  tennis pins").
