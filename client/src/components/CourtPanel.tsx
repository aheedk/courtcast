import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { User } from '../types';
import { PlayabilityBadge } from './PlayabilityBadge';
import { WeatherStats } from './WeatherStats';

interface Props {
  placeId: string;
  user: User | null;
  onClose: () => void;
}

export function CourtPanel({ placeId, user, onClose }: Props) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: queryKeys.court(placeId),
    queryFn: () => api.court(placeId),
  });

  const saved = useQuery({
    queryKey: queryKeys.savedCourts,
    queryFn: api.savedCourts,
    enabled: !!user,
  });

  const isSaved = saved.data?.courts.some((c) => c.placeId === placeId) ?? false;

  const save = useMutation({
    mutationFn: () => api.saveCourt(placeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedCourts }),
  });
  const unsave = useMutation({
    mutationFn: () => api.unsaveCourt(placeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedCourts }),
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
          <div>
            <h2 className="text-lg font-bold leading-tight">
              {detail.data?.court.name ?? (detail.isLoading ? 'Loading…' : 'Court')}
            </h2>
            {detail.data?.court.isCustom && (
              <p className="text-xs text-good font-semibold mt-1">Your custom spot</p>
            )}
            {detail.data?.court.address && !detail.data?.court.isCustom && (
              <p className="text-sm text-neutral-500 mt-1">{detail.data.court.address}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none"
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

            <div className="mt-6">
              {!user ? (
                <p className="text-sm text-neutral-500">
                  <a href="/login" className="text-good underline">Sign in</a> to save this court to your list.
                </p>
              ) : isSaved ? (
                <button
                  onClick={() => unsave.mutate()}
                  disabled={unsave.isPending}
                  className="w-full py-3 rounded-xl border border-neutral-300 text-neutral-700 font-semibold hover:bg-neutral-50"
                >
                  {unsave.isPending ? 'Removing…' : 'Remove from My Courts'}
                </button>
              ) : (
                <button
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="w-full py-3 rounded-xl bg-neutral-900 text-white font-semibold hover:bg-neutral-800"
                >
                  {save.isPending ? 'Saving…' : 'Save to My Courts'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
