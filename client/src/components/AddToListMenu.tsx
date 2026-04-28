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
