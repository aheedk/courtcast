import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { CourtVisibility } from '../types';

interface Props {
  placeId: string;
  visibility: CourtVisibility;
}

/**
 * Owner-only control for flipping a custom court's visibility. Public →
 * Private opens a confirm step because it cascades-deletes other users'
 * saves of this court; Private → Public is direct (nothing to lose).
 */
export function VisibilityPill({ placeId, visibility }: Props) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flip = useMutation({
    mutationFn: (next: CourtVisibility) => api.setCourtVisibility(placeId, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.court(placeId) });
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
      // Nearby-courts list also reflects visibility; let it refetch on
      // its own staleTime (60s) — re-keying it from here adds churn for
      // little gain.
      setConfirming(false);
      setError(null);
    },
    onError: () => setError("Couldn't update visibility."),
  });

  if (confirming) {
    return (
      <div className="mt-4 border border-neutral-200 rounded-2xl p-3 text-sm">
        <p className="font-semibold text-neutral-900">Make this court private?</p>
        <p className="text-xs text-neutral-500 mt-1">
          Other users' saves of this court will be removed.
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 py-2 rounded-xl border border-neutral-300 text-neutral-700 font-semibold text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => flip.mutate('private')}
            disabled={flip.isPending}
            className="flex-1 py-2 rounded-xl bg-bad text-white font-semibold text-sm disabled:opacity-50"
          >
            {flip.isPending ? 'Working…' : 'Make private'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Visibility</p>
        <p className="text-sm text-neutral-700">
          {visibility === 'public'
            ? 'Public — others can see this spot and post reports.'
            : 'Private — only you can see this spot.'}
        </p>
      </div>
      <button
        onClick={() => {
          if (visibility === 'public') {
            setConfirming(true);
          } else {
            flip.mutate('public');
          }
        }}
        disabled={flip.isPending}
        className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        {flip.isPending ? '…' : visibility === 'public' ? 'Make private' : 'Make public'}
      </button>
    </div>
  );
}
