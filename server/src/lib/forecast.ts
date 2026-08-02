import type { WeatherSummary } from './playability';

export interface ForecastSlot {
  ts: number;       // epoch ms, top-of-hour UTC
  tempF: number;
  windMph: number;
  rainPct: number;  // 0..100
  apparentTempF?: number;
  humidityPct?: number;
  windGustMph?: number;
  precipitationIn?: number;
  uvIndex?: number;
  solarRadiationWm2?: number;
}

export interface Forecast {
  slots: ForecastSlot[];   // ascending by ts; slots[0] = current hour
  fetchedAt: number;
}

/**
 * Derives the legacy "current weather" snapshot from a forecast for callers
 * that haven't been time-aware-ified (server-side fallback scoring, the
 * existing `weather` field on API responses).
 */
export function weatherFromForecast(forecast: Forecast | null): WeatherSummary | null {
  if (!forecast || !Array.isArray(forecast.slots) || forecast.slots.length === 0) return null;
  const slot = forecast.slots[0];
  return {
    tempF: slot.tempF,
    windMph: slot.windMph,
    rainPctNext2h: slot.rainPct,
    apparentTempF: slot.apparentTempF,
    humidityPct: slot.humidityPct,
    windGustMph: slot.windGustMph,
    uvIndex: slot.uvIndex,
  };
}
