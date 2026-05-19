import type { Forecast, CourtReport } from '../types';
import { slotAt, rainPctOverWindow, SLIDER_STEP_HOURS } from '../lib/forecast';
import { OPEN_COURTS_LABEL, CONDITION_LABEL } from '../types';
import { useSelectedTime } from '../stores/selectedTime';

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
  const slot = slotAt(forecast, selectedMs);
  const rainPct = selectedMs !== null
    ? (rainPctOverWindow(forecast, selectedMs, SLIDER_STEP_HOURS) ?? slot?.rainPct ?? null)
    : (slot?.rainPct ?? null);

  const cols = report ? 'grid-cols-4' : 'grid-cols-3';
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

  if (!slot) {
    return (
      <div className={`grid ${cols} ${gap} ${compact ? '' : 'mt-2'}`}>
        {stat('Temp', '—')}
        {stat('Wind', '—')}
        {stat('Rain', '—')}
        {report &&
          stat(
            'Status',
            `${OPEN_COURTS_LABEL[report.openCourts]} · ${CONDITION_LABEL[report.condition]}`,
            relativeTime(report.createdAt),
          )}
      </div>
    );
  }

  return (
    <div className={`grid ${cols} ${gap} ${compact ? '' : 'mt-2'}`}>
      {stat('Temp', `${slot.tempF}°F`)}
      {stat('Wind', `${slot.windMph} mph`)}
      {stat('Rain', `${rainPct ?? slot.rainPct}%`)}
      {report &&
        stat(
          'Status',
          `${OPEN_COURTS_LABEL[report.openCourts]} · ${CONDITION_LABEL[report.condition]}`,
          relativeTime(report.createdAt),
        )}
    </div>
  );
}
