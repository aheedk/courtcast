import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { reportSummary } from '../lib/reportSummary';
import type { CourtReport } from '../types';

interface Props {
  placeId: string;
  report?: CourtReport | null;
  compact?: boolean;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 24 * 60 * 60_000) return `${Math.floor(ms / (60 * 60_000))} hr ago`;
  return new Date(iso).toLocaleString();
}

export function LatestReport({ placeId, report, compact = false }: Props) {
  const fetched = useQuery({
    queryKey: queryKeys.courtReport(placeId),
    queryFn: () => api.courtReport(placeId),
    enabled: report === undefined,
    staleTime: 60_000,
  });
  const r: CourtReport | null = report !== undefined ? report : (fetched.data ?? null);
  if (!r) return null;
  const summary = reportSummary(r);
  const when = relativeTime(r.createdAt);

  if (compact) return (
    <p className="text-xs text-neutral-500">
      {summary} · <span className="text-neutral-400">{when}</span>
      {r.reportCount && r.reportCount > 1 ? <span className="ml-1 font-semibold text-emerald-700">· {r.reportCount} reports</span> : null}
    </p>
  );

  return (
    <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Community status</p>
        <p className="truncate text-lg font-semibold text-neutral-900">{summary}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-neutral-400">{when}</p>
        {r.confidence && <p className={`text-[11px] font-semibold ${r.confidence === 'high' ? 'text-emerald-700' : r.confidence === 'medium' ? 'text-amber-700' : 'text-neutral-500'}`}>{r.confidence} confidence{r.reportCount ? ` · ${r.reportCount}` : ''}</p>}
      </div>
    </div>
  );
}
