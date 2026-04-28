# Add to list from CourtPanel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the existing AddToListMenu modal from the map's CourtPanel, with auto-save-to-current-sport-if-needed.

**Architecture:** Refactor AddToListMenu to be pure UI (caller-supplied `onAdd` callback). CourtPanel renders it with an `onAdd` that does save-then-add when the court isn't yet saved. SavedCourtCard passes the simple `api.addToList(...)` since it only ever runs on already-saved courts.

**Tech Stack:** No new dependencies. Frontend only.

**Spec:** `docs/superpowers/specs/2026-04-28-courtclimate-add-to-list-on-map.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/AddToListMenu.tsx` | Modify | Replace internal addToList mutation with `onAdd` callback prop |
| `client/src/components/SavedCourtCard.tsx` | Modify | Pass `onAdd={(id) => api.addToList(id, …)}` to AddToListMenu |
| `client/src/components/CourtPanel.tsx` | Modify | Add "Add to list" button + AddToListMenu render with save-first onAdd |

---

## Task 1: Refactor AddToListMenu to take onAdd callback

**Files:**
- Modify: `client/src/components/AddToListMenu.tsx`

- [ ] **Step 1: Replace AddToListMenu.tsx**

Full replacement of `client/src/components/AddToListMenu.tsx`:

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

interface Props {
  // Caller decides what "add to list" means — this lets a pure picker
  // also support save-first flows (CourtPanel) without baking save
  // semantics into the modal itself.
  onAdd: (listId: string) => Promise<void>;
  onClose: () => void;
}

export function AddToListMenu({ onAdd, onClose }: Props) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const lists = useQuery({ queryKey: queryKeys.lists, queryFn: api.lists });

  const add = useMutation({
    mutationFn: async (listId: string) => {
      await onAdd(listId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.lists });
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
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

        {add.isError && (
          <p className="text-xs text-bad mt-2 px-1">Couldn't add. Try again.</p>
        )}

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

- [ ] **Step 2: Type-check (expect callers to break)**

```bash
cd client && npx tsc --noEmit
```

Expected: errors in `SavedCourtCard.tsx` because it still passes `placeId`/`sport` instead of `onAdd`. Tasks 2 + 3 fix.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AddToListMenu.tsx
git commit -m "refactor(client): AddToListMenu takes onAdd callback (no implicit save)"
```

---

## Task 2: SavedCourtCard — pass onAdd

**Files:**
- Modify: `client/src/components/SavedCourtCard.tsx`

- [ ] **Step 1: Update AddToListMenu usage**

In `client/src/components/SavedCourtCard.tsx`, find the `AddToListMenu` render block:

```tsx
      {addingToList && (
        <AddToListMenu
          placeId={court.placeId}
          sport={court.sport}
          onClose={() => setAddingToList(false)}
        />
      )}
```

Replace with:

```tsx
      {addingToList && (
        <AddToListMenu
          onAdd={(listId) => api.addToList(listId, court.placeId, court.sport)}
          onClose={() => setAddingToList(false)}
        />
      )}
```

- [ ] **Step 2: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: clean for SavedCourtCard. CourtPanel still has no AddToListMenu yet (Task 3 adds it).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/SavedCourtCard.tsx
git commit -m "feat(client): SavedCourtCard uses onAdd callback for AddToListMenu"
```

---

## Task 3: CourtPanel — Add to list button + save-first onAdd

**Files:**
- Modify: `client/src/components/CourtPanel.tsx`

- [ ] **Step 1: Add the button + modal render**

Full replacement of `client/src/components/CourtPanel.tsx`:

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
import { AddToListMenu } from './AddToListMenu';

interface Props {
  placeId: string;
  user: User | null;
  onClose: () => void;
}

export function CourtPanel({ placeId, user, onClose }: Props) {
  const qc = useQueryClient();
  const [sport] = useSport();
  const [renaming, setRenaming] = useState(false);
  const [addingToList, setAddingToList] = useState(false);

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

            <div className="mt-6 flex flex-col gap-2">
              {!user ? (
                <p className="text-sm text-neutral-500">
                  <a href="/login" className="text-good underline">Sign in</a> to save this court to your list.
                </p>
              ) : (
                <>
                  {isSavedForSport ? (
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
                  <button
                    onClick={() => setAddingToList(true)}
                    className="w-full py-3 rounded-xl border border-neutral-300 text-neutral-700 font-semibold hover:bg-neutral-50"
                  >
                    Add to list…
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {addingToList && (
        <AddToListMenu
          onAdd={async (listId) => {
            if (!isSavedForSport) {
              await api.saveCourt(placeId, sport);
            }
            await api.addToList(listId, placeId, sport);
          }}
          onClose={() => setAddingToList(false)}
        />
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit + push**

```bash
git add client/src/components/CourtPanel.tsx
git commit -m "feat(client): Add to list button on CourtPanel (auto-saves if needed)"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ "Add to list" button on CourtPanel → Task 3
- ✅ Opens existing AddToListMenu → Task 3
- ✅ Auto-save to current sport when not already saved → Task 3 onAdd callback
- ✅ AddToListMenu refactored to be pure UI with onAdd → Task 1
- ✅ SavedCourtCard updated for new prop shape → Task 2
- ✅ Hidden when not signed in → Task 3 (existing `!user` branch unchanged; new buttons inside `<>` block are only rendered when signed in)
- ✅ Idempotent on already-in-list → AddToListMenu's `add.mutate` calls server's existing `upsert` semantics

**Type consistency:**
- `AddToListMenu` props change: was `{ placeId, sport, onClose }`, now `{ onAdd, onClose }`. Both call sites (Task 2 + Task 3) updated to the new shape.

**Placeholder scan:** none.
