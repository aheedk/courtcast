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
