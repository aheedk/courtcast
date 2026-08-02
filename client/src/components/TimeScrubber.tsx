import { useMemo } from 'react';
import { useSelectedTime } from '../stores/selectedTime';
import { useForecastStep, type ForecastStepHours } from '../stores/forecastStep';

const TOTAL_HOURS = 48;

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

function dayLabelPositions(now: number, stepHours: number, numBuckets: number): Array<{ label: string; bucket: number }> {
  // Compute the bucket index where each day starts (relative to "now").
  const result: Array<{ label: string; bucket: number }> = [{ label: 'Today', bucket: 0 }];
  for (let dayOffset = 1; dayOffset <= 2; dayOffset++) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    dayStart.setHours(0, 0, 0, 0);
    const offsetH = (dayStart.getTime() - now) / 3600_000;
    const bucket = Math.round(offsetH / stepHours);
    if (bucket > 0 && bucket < numBuckets) {
      const label = dayOffset === 1 ? 'Tomorrow' : dayStart.toLocaleDateString(undefined, { weekday: 'short' });
      result.push({ label, bucket });
    }
  }
  // Late in the day, "Today" may represent only a tiny sliver before the
  // Tomorrow marker. Hiding that first label is clearer than letting the two
  // labels collide at the left edge.
  const tomorrowPosition = result[1] ? result[1].bucket / (numBuckets - 1) : 1;
  return tomorrowPosition < 0.12 ? result.slice(1) : result;
}

export function TimeScrubber() {
  const [selectedMs, setSelectedMs] = useSelectedTime();
  const [stepHours, setStepHours] = useForecastStep();
  const now = Date.now();
  const numBuckets = Math.round(TOTAL_HOURS / stepHours);

  const bucket = useMemo(() => {
    if (selectedMs === null) return 0;
    const offsetH = (selectedMs - now) / 3600_000;
    return Math.max(0, Math.min(numBuckets - 1, Math.round(offsetH / stepHours)));
  }, [selectedMs, now, numBuckets, stepHours]);

  const effectiveMs = selectedMs ?? now;
  const readout = selectedMs === null
    ? { primary: 'Now', secondary: '' }
    : fmtReadout(effectiveMs, now);

  const dayLabels = useMemo(() => dayLabelPositions(now, stepHours, numBuckets), [now, stepHours, numBuckets]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const b = parseInt(e.target.value, 10);
    if (b === 0) {
      setSelectedMs(null); // bucket 0 collapses to "Now"
      return;
    }
    setSelectedMs(Date.now() + b * stepHours * 3600_000);
  }

  function onNow() {
    setSelectedMs(null);
  }

  return (
    <div className="forecast-scrubber max-w-full overflow-x-clip rounded-2xl border border-emerald-100/80 bg-gradient-to-r from-white/95 via-emerald-50/95 to-sky-50/95 px-3 py-2 shadow-xl shadow-emerald-950/10 backdrop-blur-xl">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2 leading-tight">
          <div className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Forecast</div>
          <div className="truncate text-sm font-bold text-emerald-950">{readout.primary}</div>
          {readout.secondary && (
            <div className="forecast-scrubber__secondary shrink-0 text-[11px] text-neutral-500">{readout.secondary}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-emerald-200 bg-white/80 p-0.5" aria-label="Forecast interval">
            {([0.5, 1, 2] as ForecastStepHours[]).map((step) => (
              <button
                key={step}
                onClick={() => setStepHours(step)}
                className={stepHours === step ? 'rounded-full bg-emerald-700 px-2 py-1 text-[10px] font-bold text-white' : 'rounded-full px-2 py-1 text-[10px] font-semibold text-emerald-800'}
                aria-pressed={stepHours === step}
              >
                {step === 0.5 ? '30m' : `${step}h`}
              </button>
            ))}
          </div>
          {selectedMs !== null && (
          <button
            onClick={onNow}
            className="text-xs font-semibold text-good hover:text-green-700 shrink-0 rounded-full border border-green-200 px-2.5 py-1 bg-green-50"
          >
            Now
          </button>
          )}
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={numBuckets - 1}
        step={1}
        value={bucket}
        onChange={onChange}
        aria-label="Forecast time"
        className="block h-3 w-full accent-emerald-600"
      />

      <div className="forecast-scrubber__day-labels relative mt-0.5 h-3">
        {dayLabels.map(({ label, bucket: b }) => {
          const position = (b / (numBuckets - 1)) * 100;
          const alignment = position < 8 ? '' : position > 92 ? '-translate-x-full' : '-translate-x-1/2';
          return <span key={label} className={`absolute whitespace-nowrap text-[10px] font-semibold text-neutral-500 ${alignment}`} style={{ left: `${position}%` }}>{label}</span>;
        })}
      </div>
    </div>
  );
}
