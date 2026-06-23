import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useScoreFor } from '../stores/thresholds';
import { useUi } from '../stores/ui';
import type { SavedCourtDetail } from '../types';
import { SPORT_EMOJI } from '../types';
import { PlayabilityBadge } from './PlayabilityBadge';
import { WeatherStats } from './WeatherStats';
import { CardMenu } from './CardMenu';
import { RenameInput } from './RenameInput';
import { AddToListMenu } from './AddToListMenu';
import type { CourtReport } from '../types';

interface Props {
  court: SavedCourtDetail;
  onSelect: (placeId: string) => void;
  // When provided, replaces the default sport-scoped Remove with a
  // list-scoped "Remove from this list" action.
  listScopedRemove?: () => void;
  // Pre-fetched latest report from a batch query; `undefined` means
  // "fetch your own", `null` means "no fresh report".
  report?: CourtReport | null;
}

export function SavedCourtCard({ court, onSelect, listScopedRemove, report }: Props) {
  const qc = useQueryClient();
  const selectCourtAndReport = useUi((s) => s.selectCourtAndReport);
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

  // Mirror the CourtPanel button set so users can act on a card without
  // opening the panel first. "Report status" opens the panel with the
  // form already expanded — the form lives in the panel, not the card,
  // because it needs the surrounding weather context to be useful.
  const menuItems = [
    { label: 'Report status', onSelect: () => selectCourtAndReport(court.placeId) },
    { label: 'Add to list', onSelect: () => setAddingToList(true) },
    { label: 'Rename', onSelect: () => setRenaming(true) },
    listScopedRemove
      ? { label: 'Remove from this list', onSelect: listScopedRemove, destructive: true }
      : { label: `Remove from ${SPORT_EMOJI[court.sport]}`, onSelect: () => unsave.mutate(), destructive: true },
  ];

  return (
    <>
      <div
        onClick={() => !renaming && onSelect(court.placeId)}
        className="cursor-pointer w-full max-w-full overflow-x-clip bg-gradient-to-br from-emerald-50/85 via-teal-50/80 to-sky-100/75 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 shadow-sm shadow-emerald-950/5 hover:shadow-lg hover:shadow-emerald-950/10 hover:border-emerald-300 transition-shadow"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0" aria-label={court.sport}>
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
                <h3 className="font-bold text-base truncate min-w-0">{display}</h3>
              )}
              {court.visibility === 'private' && (
                <span
                  className="text-xs shrink-0"
                  title="Private — only you can see this"
                  aria-label="Private"
                >
                  🔒
                </span>
              )}
            </div>
            {court.address && !renaming && (
              <p className="text-sm text-neutral-500 break-words ml-7">
                {court.nickname && (
                  <span className="text-xs italic mr-2">({court.name})</span>
                )}
                {court.address}
              </p>
            )}
            {userScore && (
              <div className="ml-7 mt-2">
                <PlayabilityBadge score={userScore} size="sm" />
              </div>
            )}
          </div>

          <div className="flex items-start shrink-0">
            <CardMenu items={menuItems} />
          </div>
        </div>

        {court.forecast ? (
          <div className="mt-3">
            <WeatherStats
              forecast={court.forecast ?? null}
              compact
              report={report ?? null}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Weather unavailable right now.</p>
        )}

        <button
          type="button"
          onClick={(e) => {
            // Card's own onClick opens the detail panel; the report
            // button should land directly on the form instead.
            e.stopPropagation();
            selectCourtAndReport(court.placeId);
          }}
          className="mt-3 w-full py-2 rounded-xl border border-emerald-200 bg-white/60 text-emerald-950 text-sm font-semibold hover:bg-white/80"
        >
          {report ? 'Update status' : 'Report status'}
        </button>
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
