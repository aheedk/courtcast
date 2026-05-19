import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { OPEN_COURTS_LABEL, CONDITION_LABEL } from '../types';
import type { CourtReport } from '../types';

interface Props {
  placeId: string;
  /** When provided, this is used directly instead of firing a per-place query.
   *  Used by callers that already pulled a batch (saved-card lists, map page). */
  report?: CourtReport | null;
  compact?: boolean;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 24 * 60 * 60_000) return `${Math.floor(ms / (60 * 60_000))} hr ago`;
  // Server filters >24h, but be safe.
  return new Date(iso).toLocaleString();
}

export function LatestReport({ placeId, report, compact = false }: Props) {
  const enabled = report === undefined;
  const fetched = useQuery({
    queryKey: queryKeys.courtReport(placeId),
    queryFn: () => api.courtReport(placeId),
    enabled,
    staleTime: 60_000,
  });

  // Server returns 204 → api returns undefined → treat as "no report".
  const r: CourtReport | null = report !== undefined ? report : (fetched.data ?? null);
  if (!r) return null;

  const summary = `${OPEN_COURTS_LABEL[r.openCourts]} open · ${CONDITION_LABEL[r.condition]}`;
  const when = relativeTime(r.createdAt);

  if (compact) {
    return (
      <p className="text-xs text-neutral-500">
        {summary} · <span className="text-neutral-400">{when}</span>
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-neutral-200 pt-3 flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Status</p>
        <p className="text-sm font-medium text-neutral-900 truncate">{summary}</p>
      </div>
      <p className="text-xs text-neutral-400 shrink-0">{when}</p>
    </div>
  );
}
