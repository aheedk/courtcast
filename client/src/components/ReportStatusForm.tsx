import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import type { OpenCourts, CourtCondition, CourtReport } from '../types';
import { OPEN_COURTS_VALUES, CONDITION_VALUES, OPEN_COURTS_LABEL, CONDITION_LABEL } from '../types';

interface Props { placeId: string; courtName?: string; }

const CONDITION_ICON: Record<CourtCondition, string> = {
  dry: '☀️',
  little_wet: '💧',
  unplayable: '⚠️',
};

export function ReportStatusForm({ placeId, courtName }: Props) {
  const qc = useQueryClient();
  const autoOpenForId = useUi((state) => state.autoOpenReportForId);
  const consumeAutoOpen = useUi((state) => state.consumeAutoOpenReport);
  const [open, setOpen] = useState(false);
  const [openCourts, setOpenCourts] = useState<OpenCourts | null>(null);
  const [condition, setCondition] = useState<CourtCondition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (autoOpenForId === placeId) {
      setOpen(true);
      consumeAutoOpen();
    }
  }, [autoOpenForId, placeId, consumeAutoOpen]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
  }

  const submit = useMutation({
    mutationFn: () => {
      if (!openCourts && !condition) throw new Error('Missing selections');
      return api.submitCourtReport(placeId, {
        ...(openCourts ? { openCourts } : {}),
        ...(condition ? { condition } : {}),
      });
    },
    onSuccess: (saved: CourtReport) => {
      qc.setQueryData(queryKeys.courtReport(placeId), saved);
      qc.invalidateQueries({ queryKey: ['courtReportsBatch'] });
      setOpen(false);
      setOpenCourts(null);
      setCondition(null);
      setError(null);
    },
    onError: (requestError: unknown) => {
      const status = (requestError as { status?: number })?.status;
      if (status === 429) setError('Too many reports — try again later.');
      else if (status === 401) setError('Sign in to report status.');
      else setError("Couldn't submit. Please try again.");
    },
  });

  const canSubmit = (openCourts !== null || condition !== null) && !submit.isPending;

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="w-full rounded-xl border border-emerald-200 bg-white py-3 text-sm font-bold text-emerald-900 shadow-sm hover:bg-emerald-50"
    >
      Report status
    </button>

    {open && createPortal(
      <div role="dialog" aria-modal="true" aria-labelledby="report-status-title" className="fixed bottom-28 left-0 right-0 z-[60] max-h-[calc(100dvh-11rem)] overflow-y-auto rounded-t-2xl border border-emerald-100 bg-gradient-to-b from-amber-50 via-white to-white p-5 shadow-2xl shadow-emerald-950/25 sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-[380px] sm:max-h-[calc(100vh-6rem)] sm:rounded-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[11px] font-bold uppercase tracking-widest text-orange-600">Community update</p><h2 id="report-status-title" className="mt-1 text-xl font-extrabold text-emerald-950">Report status</h2>{courtName && <p className="mt-0.5 truncate text-sm font-semibold text-neutral-700">{courtName}</p>}<p className="mt-1 text-sm text-neutral-500">Help other players know what the courts are like right now.</p></div>
            <button type="button" onClick={close} aria-label="Close report form" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xl text-neutral-500 shadow-sm ring-1 ring-neutral-200 hover:text-neutral-900">×</button>
          </div>

          <fieldset className="mt-5"><legend className="text-xs font-bold uppercase tracking-wide text-neutral-600">How many courts are open?</legend><div className="mt-2 grid grid-cols-4 gap-2">{OPEN_COURTS_VALUES.map((value) => <ChoiceButton key={value} selected={openCourts === value} onClick={() => setOpenCourts(openCourts === value ? null : value)}><span className="block text-base font-extrabold">{OPEN_COURTS_LABEL[value]}</span><span className="block text-[10px] font-medium opacity-75">open</span></ChoiceButton>)}</div></fieldset>

          <fieldset className="mt-5"><legend className="text-xs font-bold uppercase tracking-wide text-neutral-600">Court condition</legend><div className="mt-2 grid grid-cols-3 gap-2">{CONDITION_VALUES.map((value) => <ChoiceButton key={value} selected={condition === value} onClick={() => setCondition(condition === value ? null : value)}><span className="block text-xl">{CONDITION_ICON[value]}</span><span className="mt-1 block text-xs font-bold">{CONDITION_LABEL[value]}</span></ChoiceButton>)}</div></fieldset>

          <div className="mt-5 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800">You can report either availability, condition, or both.</div>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}

          <button type="button" onClick={() => submit.mutate()} disabled={!canSubmit} className={canSubmit ? 'mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-700 to-sky-700 py-3.5 text-base font-extrabold text-white shadow-lg shadow-emerald-950/20 hover:from-emerald-800 hover:to-sky-800' : 'mt-4 w-full cursor-not-allowed rounded-xl bg-neutral-200 py-3.5 text-base font-bold text-neutral-400'}>{submit.isPending ? 'Sharing update…' : 'Share court update'}</button>
          <button type="button" onClick={close} className="mt-2 w-full py-2 text-sm font-semibold text-neutral-500 hover:text-neutral-800">Cancel</button>
      </div>,
      document.body,
    )}
  </>;
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={selected ? 'min-h-16 rounded-xl border-2 border-emerald-600 bg-emerald-600 px-2 py-2 text-white shadow-md' : 'min-h-16 rounded-xl border-2 border-neutral-200 bg-white px-2 py-2 text-neutral-800 hover:border-emerald-300 hover:bg-emerald-50'}>{children}</button>;
}
