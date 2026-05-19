import type { Forecast } from '../types';
import { slotAt, rainPctOverWindow, SLIDER_STEP_HOURS } from '../lib/forecast';
import { useSelectedTime } from '../stores/selectedTime';

interface Props {
  forecast: Forecast | null;
  compact?: boolean;
}

export function WeatherStats({ forecast, compact = false }: Props) {
  const [selectedMs] = useSelectedTime();
  const slot = slotAt(forecast, selectedMs);
  // For slider-selected times, report the max rain over the 2-hour bucket
  // the user picked. Now stays single-hour — "current rain chance" stays
  // a point sample.
  const rainPct = selectedMs !== null
    ? (rainPctOverWindow(forecast, selectedMs, SLIDER_STEP_HOURS) ?? slot?.rainPct ?? null)
    : (slot?.rainPct ?? null);

  const stat = (label: string, value: string) => (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <span className={compact ? 'text-base font-semibold' : 'text-2xl font-semibold'}>{value}</span>
    </div>
  );

  if (!slot) {
    return (
      <div className={`grid grid-cols-3 gap-4 ${compact ? '' : 'mt-2'}`}>
        {stat('Temp', '—')}
        {stat('Wind', '—')}
        {stat('Rain', '—')}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-3 gap-4 ${compact ? '' : 'mt-2'}`}>
      {stat('Temp', `${slot.tempF}°F`)}
      {stat('Wind', `${slot.windMph} mph`)}
      {stat('Rain', `${rainPct ?? slot.rainPct}%`)}
    </div>
  );
}
