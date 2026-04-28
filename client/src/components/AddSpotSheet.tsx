import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { Sport } from '../types';
import { SPORT_EMOJI, SPORT_LABEL } from '../types';

interface Props {
  pin: { lat: number; lng: number };
  sport: Sport;
  onClose: () => void;
  onSaved: () => void;
}

export function AddSpotSheet({ pin, sport, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => api.saveCustomCourt({ lat: pin.lat, lng: pin.lng, name: name.trim(), sport }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
      onSaved();
    },
  });

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-white shadow-2xl border-t border-neutral-200 rounded-t-2xl p-5 sm:bottom-auto sm:top-24 sm:right-4 sm:left-auto sm:rounded-2xl sm:w-[380px] sm:border">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold">Name this spot</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Saving as {SPORT_EMOJI[sport]} {SPORT_LABEL[sport]} · {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-neutral-400 text-2xl leading-none">
          ×
        </button>
      </div>

      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Riverside Court, Backyard, …"
        maxLength={80}
        className="w-full px-3 py-2.5 border border-neutral-300 rounded-xl text-sm outline-none focus:border-good"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) save.mutate();
        }}
      />

      {save.isError && (
        <p className="mt-2 text-xs text-bad">Couldn't save. Try again.</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 font-semibold text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={!name.trim() || save.isPending}
          className="flex-1 py-2.5 rounded-xl bg-neutral-900 text-white font-semibold text-sm disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
