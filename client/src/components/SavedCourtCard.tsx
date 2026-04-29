import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useScoreFor } from '../stores/thresholds';
import type { SavedCourtDetail } from '../types';
import { SPORT_EMOJI } from '../types';
import { PlayabilityBadge } from './PlayabilityBadge';
import { WeatherStats } from './WeatherStats';
import { CardMenu } from './CardMenu';
import { RenameInput } from './RenameInput';
import { AddToListMenu } from './AddToListMenu';

interface Props {
  court: SavedCourtDetail;
  onSelect: (placeId: string) => void;
  // When provided, replaces the default sport-scoped Remove with a
  // list-scoped "Remove from this list" action.
  listScopedRemove?: () => void;
}

export function SavedCourtCard({ court, onSelect, listScopedRemove }: Props) {
  const qc = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [addingToList, setAddingToList] = useState(false);

  const rename = useMutation({
    mutationFn: (nickname: string | null) =>
      api.renameSavedCourt(court.placeId, court.sport, nickname),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
      qc.invalidateQueries({ queryKey: ['lists'] });
      setRenaming(false);
    },
  });

  const unsave = useMutation({
    mutationFn: () => api.unsaveCourt(court.placeId, court.sport),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedCourts });
      qc.invalidateQueries({ queryKey: ['lists'] });
    },
  });

  const display = court.nickname || court.name;
  const userScore = useScoreFor(court.forecast ?? null, court.sport, court.score);

  const menuItems = [
    { label: 'Rename', onSelect: () => setRenaming(true) },
    { label: 'Add to list', onSelect: () => setAddingToList(true) },
    listScopedRemove
      ? { label: 'Remove from this list', onSelect: listScopedRemove, destructive: true }
      : { label: `Remove from ${SPORT_EMOJI[court.sport]}`, onSelect: () => unsave.mutate(), destructive: true },
  ];

  return (
    <>
      <div
        onClick={() => !renaming && onSelect(court.placeId)}
        className="cursor-pointer w-full bg-white border border-neutral-200 rounded-2xl p-5 hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-label={court.sport}>
                {SPORT_EMOJI[court.sport]}
              </span>
              {renaming ? (
                <RenameInput
                  initialValue={court.nickname ?? court.name}
                  placeholder={court.name}
                  onSave={(v) => rename.mutate(v || null)}
                  onCancel={() => setRenaming(false)}
                />
              ) : (
                <h3 className="font-bold text-base truncate">{display}</h3>
              )}
            </div>
            {court.address && !renaming && (
              <p className="text-sm text-neutral-500 truncate ml-7">
                {court.nickname && (
                  <span className="text-xs italic mr-2">({court.name})</span>
                )}
                {court.address}
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 shrink-0">
            {userScore && <PlayabilityBadge score={userScore} />}
            <CardMenu items={menuItems} />
          </div>
        </div>

        {court.forecast ? (
          <div className="mt-3">
            <WeatherStats forecast={court.forecast ?? null} compact />
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Weather unavailable right now.</p>
        )}
      </div>

      {addingToList && (
        <AddToListMenu
          onAdd={async (listId) => {
            await api.addToList(listId, court.placeId, court.sport);
          }}
          onClose={() => setAddingToList(false)}
        />
      )}
    </>
  );
}
