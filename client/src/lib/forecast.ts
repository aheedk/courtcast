import type { Forecast, ForecastSlot } from '../types';

/**
 * The TimeScrubber slider moves in 2-hour buckets across the 48-hour
 * forecast. When the user lands on a bucket — say "Sat 4pm" — that
 * choice really represents the 2-hour window starting there (4pm-6pm).
 * Code that asks "what's the rain looking like at the selected time?"
 * should use this constant as the window size for max-over-window
 * lookups so the answer matches the slider's mental model.
 */
export const SLIDER_STEP_HOURS = 2;

/**
 * Returns the slot whose `ts` is closest to `timeMs`, snapping within
 * ±30 minutes (since slots are 1h apart, any time inside the forecast
 * window will be within 30 min of the nearest slot).
 *
 * - If `forecast` is null/empty → returns null.
 * - If `timeMs` is null → returns slots[0] (the "now" slot).
 * - If `timeMs` is outside the forecast window → returns null.
 */
export function slotAt(
  forecast: Forecast | null | undefined,
  timeMs: number | null,
): ForecastSlot | null {
  if (!forecast || forecast.slots.length === 0) return null;
  if (timeMs === null) return forecast.slots[0];

  let closest: ForecastSlot | null = null;
  let minDiff = Infinity;
  for (const slot of forecast.slots) {
    const diff = Math.abs(slot.ts - timeMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = slot;
    }
  }
  if (minDiff > 30 * 60_000) return null; // outside window
  return closest;
}

/**
 * Returns the maximum `rainPct` across a window that starts at the slot
 * closest to `fromMs` and spans the next `hours` hours (inclusive of the
 * starting slot). Used for slider-selected times so the displayed/scored
 * rain reflects the full 2-hour bucket the user picked, not just the
 * single hour at the start. A clear 4pm hour with rain incoming at 5pm
 * shouldn't read as a clean GOOD.
 *
 * Returns null if no slot is within range of `fromMs` (out of forecast
 * horizon).
 */
export function rainPctOverWindow(
  forecast: Forecast | null | undefined,
  fromMs: number | null,
  hours: number,
): number | null {
  if (!forecast) return null;
  const base = slotAt(forecast, fromMs);
  if (!base) return null;
  const endTs = base.ts + hours * 3600_000;
  let max = base.rainPct;
  for (const slot of forecast.slots) {
    if (slot.ts >= base.ts && slot.ts < endTs && slot.rainPct > max) {
      max = slot.rainPct;
    }
  }
  return max;
}
