import { useSelectedTime } from '../stores/selectedTime';

interface Props {
  onTap: () => void;
}

function fmt(timeMs: number): string {
  const d = new Date(timeMs);
  const now = Date.now();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const targetDay = new Date(d); targetDay.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((targetDay.getTime() - todayStart.getTime()) / (24 * 3600_000));
  const dayLabel = dayDelta === 0 ? 'Today' : dayDelta === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' });
  const hour = d.getHours();
  const ampm = hour < 12 ? 'am' : 'pm';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const offsetH = Math.round((timeMs - now) / 3600_000);
  return offsetH > 0
    ? `${dayLabel} ${hour12}${ampm} · in ${offsetH}h`
    : `${dayLabel} ${hour12}${ampm}`;
}

/**
 * Compact button showing the currently selected forecast time. On tap,
 * opens a bottom sheet with the slider so the user can change the time
 * without navigating to the map.
 */
export function TimePill({ onTap }: Props) {
  const [selectedMs] = useSelectedTime();
  const label = selectedMs === null ? 'Now' : fmt(selectedMs);
  return (
    <button
      onClick={onTap}
      className="inline-flex items-center gap-1.5 bg-white border border-neutral-200 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
      aria-label={`Forecast time: ${label}. Tap to change.`}
    >
      <span aria-hidden>🕒</span>
      {label}
    </button>
  );
}
