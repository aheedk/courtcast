import type { Forecast, ForecastSlot } from '../types';

/**
 * Returns the weather at `timeMs`. Exact hourly slots are returned as-is;
 * half-hour selections are linearly interpolated between their neighboring
 * hourly samples.
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

  const slots = forecast.slots;
  const first = slots[0];
  const last = slots[slots.length - 1];
  const slack = 30 * 60_000;
  if (timeMs < first.ts - slack || timeMs > last.ts + slack) return null;
  if (timeMs <= first.ts) return first;
  if (timeMs >= last.ts) return last;

  for (let i = 0; i < slots.length - 1; i++) {
    const before = slots[i];
    const after = slots[i + 1];
    if (timeMs === before.ts) return before;
    if (timeMs > before.ts && timeMs < after.ts) {
      const fraction = (timeMs - before.ts) / (after.ts - before.ts);
      return interpolateSlot(before, after, timeMs, fraction);
    }
  }
  return null;
}

function interpolateSlot(before: ForecastSlot, after: ForecastSlot, ts: number, fraction: number): ForecastSlot {
  const required = (a: number, b: number) => Math.round(a + (b - a) * fraction);
  const optional = (a?: number, b?: number, decimals = 0) => {
    if (a === undefined && b === undefined) return undefined;
    if (a === undefined) return b;
    if (b === undefined) return a;
    const value = a + (b - a) * fraction;
    return decimals ? Number(value.toFixed(decimals)) : Math.round(value);
  };
  return {
    ts,
    tempF: required(before.tempF, after.tempF),
    windMph: required(before.windMph, after.windMph),
    rainPct: required(before.rainPct, after.rainPct),
    apparentTempF: optional(before.apparentTempF, after.apparentTempF),
    humidityPct: optional(before.humidityPct, after.humidityPct),
    windGustMph: optional(before.windGustMph, after.windGustMph),
    precipitationIn: optional(before.precipitationIn, after.precipitationIn, 3),
    uvIndex: optional(before.uvIndex, after.uvIndex, 1),
    solarRadiationWm2: optional(before.solarRadiationWm2, after.solarRadiationWm2),
  };
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
