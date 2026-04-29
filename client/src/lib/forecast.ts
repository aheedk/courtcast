import type { Forecast, ForecastSlot } from '../types';

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
