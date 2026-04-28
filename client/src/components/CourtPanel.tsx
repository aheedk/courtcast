import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useSport } from '../stores/sport';
import { useScoreFor } from '../stores/thresholds';
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
  const userScore = useScoreFor(detail.data?.weather, detail.data?.score ?? null);

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
              {userScore && <PlayabilityBadge score={userScore} size="lg" />}
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
