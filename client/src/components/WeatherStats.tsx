import type { Forecast, CourtReport } from '../types';
import { slotAt, rainPctOverWindow } from '../lib/forecast';
import { reportSummary } from '../lib/reportSummary';
import { useSelectedTime } from '../stores/selectedTime';
import { useForecastStep } from '../stores/forecastStep';

interface Props {
  forecast: Forecast | null;
  compact?: boolean;
  /** When present, the row gains a fourth "Status" column to the right of
   *  Rain so the latest community report sits alongside the primary
   *  weather stats. The time-ago label appears under the value. */
  report?: CourtReport | null;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 24 * 60 * 60_000) return `${Math.floor(ms / (60 * 60_000))}h ago`;
  return new Date(iso).toLocaleString();
}

export function WeatherStats({ forecast, compact = false, report = null }: Props) {
  const [selectedMs] = useSelectedTime();
  const [stepHours] = useForecastStep();
  const slot = slotAt(forecast, selectedMs);
  const rainPct = selectedMs !== null
    ? (rainPctOverWindow(forecast, selectedMs, stepHours) ?? slot?.rainPct ?? null)
    : (slot?.rainPct ?? null);

  // 3 weather columns; Status (when present) joins as a 4th column on
  // tablet+, but on phones drops to its own full-width row below so the
  // value ("3+ · Little wet") doesn't have to truncate. Same applies to
  // the gap — tighter when 4 cells share a row.
  const cols = report ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-3';
  const gap = report ? 'gap-3' : 'gap-4';

  const stat = (label: string, value: string, secondary?: string) => (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <span
        className={
          (compact ? 'text-base' : 'text-2xl') + ' font-semibold truncate'
        }
      >
        {value}
      </span>
      {secondary && (
        <span className="text-[10px] text-neutral-400 truncate">{secondary}</span>
      )}
    </div>
  );

  // Status gets its own render path (not via `stat()`) so the value can
  // run one size larger than the weather stats — users wanted it to
  // stand out a bit — and so the time-ago label can sit at text-xs
  // instead of the tiny 10px secondary that the weather stats don't
  // need at all. "open" is in the value template ("1 open · Dry") so
  // the bare number isn't ambiguous on its own.
  const statusCell = report && (
    <div className="col-span-3 sm:col-span-1 flex flex-col min-w-0">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">Status</span>
      <span
        className={(compact ? 'text-lg' : 'text-2xl') + ' font-semibold truncate'}
      >
        {reportSummary(report)}
      </span>
      <span className="text-xs text-neutral-400 truncate">
        {relativeTime(report.createdAt)}
      </span>
    </div>
  );

  if (!slot) {
    return (
      <div className={`grid ${cols} ${gap} ${compact ? '' : 'mt-2'}`}>
        {stat('Temp', '—')}
        {stat('Wind', '—')}
        {stat('Rain', '—')}
        {statusCell}
      </div>
    );
  }

  return (
    <div className={`grid ${cols} ${gap} ${compact ? '' : 'mt-2'}`}>
      {stat('Temp', `${slot.tempF}°F`)}
      {stat('Wind', `${slot.windMph} mph`)}
      {stat('Rain', `${rainPct ?? slot.rainPct}%`)}
      {statusCell}
    </div>
  );
}
