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
