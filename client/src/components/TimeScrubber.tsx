import { useMemo } from 'react';
import { useSelectedTime } from '../stores/selectedTime';

const STEP_HOURS = 2;
const TOTAL_HOURS = 48;
const NUM_BUCKETS = TOTAL_HOURS / STEP_HOURS; // 24

function fmtReadout(timeMs: number, now: number): { primary: string; secondary: string } {
  const d = new Date(timeMs);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const targetDay = new Date(d); targetDay.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((targetDay.getTime() - todayStart.getTime()) / (24 * 3600_000));
  const dayLabel = dayDelta === 0 ? 'Today' : dayDelta === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' });
  const hour = d.getHours();
  const ampm = hour < 12 ? 'am' : 'pm';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const primary = `${dayLabel} ${hour12}${ampm}`;

  const offsetMs = timeMs - now;
  const offsetH = Math.round(offsetMs / 3600_000);
  const secondary = offsetH <= 0 ? '' : `in ${offsetH}h`;
  return { primary, secondary };
}

function dayLabelPositions(now: number): Array<{ label: string; bucket: number }> {
  // Compute the bucket index where each day starts (relative to "now").
  const result: Array<{ label: string; bucket: number }> = [{ label: 'Today', bucket: 0 }];
  for (let dayOffset = 1; dayOffset <= 2; dayOffset++) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    dayStart.setHours(0, 0, 0, 0);
    const offsetH = (dayStart.getTime() - now) / 3600_000;
    const bucket = Math.round(offsetH / STEP_HOURS);
    if (bucket > 0 && bucket < NUM_BUCKETS) {
      const label = dayOffset === 1 ? 'Tomorrow' : dayStart.toLocaleDateString(undefined, { weekday: 'short' });
      result.push({ label, bucket });
    }
  }
  return result;
}

export function TimeScrubber() {
  const [selectedMs, setSelectedMs] = useSelectedTime();
  const now = Date.now();

  const bucket = useMemo(() => {
    if (selectedMs === null) return 0;
    const offsetH = (selectedMs - now) / 3600_000;
    return Math.max(0, Math.min(NUM_BUCKETS - 1, Math.round(offsetH / STEP_HOURS)));
  }, [selectedMs, now]);

  const effectiveMs = selectedMs ?? now;
  const readout = selectedMs === null
    ? { primary: 'Now', secondary: '' }
    : fmtReadout(effectiveMs, now);

  const dayLabels = useMemo(() => dayLabelPositions(now), [now]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const b = parseInt(e.target.value, 10);
    if (b === 0) {
      setSelectedMs(null); // bucket 0 collapses to "Now"
      return;
    }
    setSelectedMs(Date.now() + b * STEP_HOURS * 3600_000);
  }

  function onNow() {
    setSelectedMs(null);
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg px-4 py-3 border border-neutral-200">
      <div className="flex items-center justify-between mb-2">
        <div className="leading-tight">
          <div className="text-sm font-bold text-neutral-900">{readout.primary}</div>
          {readout.secondary && (
            <div className="text-xs text-neutral-500">{readout.secondary}</div>
          )}
        </div>
        {selectedMs !== null && (
          <button
            onClick={onNow}
            className="text-xs font-semibold text-good hover:underline shrink-0"
          >
            Now
          </button>
        )}
      </div>

      <input
        type="range"
        min={0}
        max={NUM_BUCKETS - 1}
        step={1}
        value={bucket}
        onChange={onChange}
        aria-label="Forecast time"
        className="w-full accent-good"
      />

      <div className="relative h-3 mt-1">
        {dayLabels.map(({ label, bucket: b }) => (
          <span
            key={label}
            className="absolute text-[10px] font-semibold text-neutral-500 -translate-x-1/2"
            style={{ left: `${(b / (NUM_BUCKETS - 1)) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
