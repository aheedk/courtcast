import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import type { OpenCourts, CourtCondition, CourtReport } from '../types';
import {
  OPEN_COURTS_VALUES,
  CONDITION_VALUES,
  OPEN_COURTS_LABEL,
  CONDITION_LABEL,
} from '../types';

interface Props {
  placeId: string;
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        selected
          ? 'bg-good text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm'
          : 'bg-white text-neutral-900 px-3 py-1.5 rounded-full text-xs font-semibold border border-neutral-200 hover:bg-neutral-50'
      }
    >
      {children}
    </button>
  );
}

export function ReportStatusForm({ placeId }: Props) {
  const qc = useQueryClient();
  const autoOpenForId = useUi((s) => s.autoOpenReportForId);
  const consumeAutoOpen = useUi((s) => s.consumeAutoOpenReport);
  const [open, setOpen] = useState(false);
  const [openCourts, setOpenCourts] = useState<OpenCourts | null>(null);
  const [condition, setCondition] = useState<CourtCondition | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If the panel was opened with "Report status" from a card menu, expand
  // the form on mount and clear the one-shot flag so it doesn't fire again.
  useEffect(() => {
    if (autoOpenForId === placeId) {
      setOpen(true);
      consumeAutoOpen();
    }
  }, [autoOpenForId, placeId, consumeAutoOpen]);

  const submit = useMutation({
    mutationFn: () => {
      if (!openCourts || !condition) throw new Error('Missing selections');
      return api.submitCourtReport(placeId, { openCourts, condition });
    },
    onSuccess: (saved: CourtReport) => {
      // Update the per-place cache and invalidate the batch so map/saved
      // cards refresh on next read.
      qc.setQueryData(queryKeys.courtReport(placeId), saved);
      qc.invalidateQueries({ queryKey: ['courtReportsBatch'] });
      setOpen(false);
      setOpenCourts(null);
      setCondition(null);
      setError(null);
    },
    onError: (e: unknown) => {
      const status = (e as { status?: number })?.status;
      if (status === 429) setError('Too many reports — try again later.');
      else if (status === 401) setError('Sign in to report status.');
      else setError("Couldn't submit, try again.");
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-xl border border-neutral-300 text-neutral-700 font-semibold hover:bg-neutral-50"
      >
        Report status
      </button>
    );
  }

  const canSubmit = openCourts !== null && condition !== null && !submit.isPending;

  return (
    <div className="border border-neutral-200 rounded-2xl p-4 bg-neutral-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-900">Report status</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          aria-label="Cancel"
          className="text-neutral-400 hover:text-neutral-700 text-xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="mb-3">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Open courts</p>
        <div className="flex gap-2 flex-wrap">
          {OPEN_COURTS_VALUES.map((v) => (
            <Chip key={v} selected={openCourts === v} onClick={() => setOpenCourts(v)}>
              {OPEN_COURTS_LABEL[v]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Conditions</p>
        <div className="flex gap-2 flex-wrap">
          {CONDITION_VALUES.map((v) => (
            <Chip key={v} selected={condition === v} onClick={() => setCondition(v)}>
              {CONDITION_LABEL[v]}
            </Chip>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => submit.mutate()}
        disabled={!canSubmit}
        className={
          canSubmit
            ? 'w-full py-3 rounded-xl bg-neutral-900 text-white font-semibold hover:bg-neutral-800'
            : 'w-full py-3 rounded-xl bg-neutral-200 text-neutral-400 font-semibold cursor-not-allowed'
        }
      >
        {submit.isPending ? 'Submitting…' : 'Submit'}
      </button>

      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </div>
  );
}
