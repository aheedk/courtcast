import { env } from './env';
import { getCached, putCached, geohashFor, TTL, PRECISION } from './cache';
import { fetchOpenMeteoForecast } from './openmeteo';
import { fetchOpenWeatherForecast } from './openweather';
import type { Forecast } from './forecast';

/**
 * Provider-agnostic forecast fetcher. Cached by geohash-5 (~5km cell)
 * for 10 minutes. On upstream failure, returns the cached payload as
 * stale if available; otherwise rethrows.
 */
export async function fetchForecast(
  lat: number,
  lng: number,
): Promise<{ forecast: Forecast; stale: boolean }> {
  // Cache key v2: forecast shape replaces the old WeatherSummary snapshot
  // (Tasks 1-5 of the time-changer feature). Old rows are skipped.
  const geohash = `${geohashFor(lat, lng, PRECISION.weather)}:v2`;
  const cached = await getCached<Forecast>('weatherCache', geohash, TTL.weatherMs);
  if (cached && !cached.stale) {
    return { forecast: cached.payload, stale: false };
  }

  try {
    const forecast =
      env.weatherProvider === 'open-meteo'
        ? await fetchOpenMeteoForecast(lat, lng)
        : await fetchOpenWeatherForecast(lat, lng);

    await putCached('weatherCache', geohash, forecast);
    return { forecast, stale: false };
  } catch (err) {
    if (cached) return { forecast: cached.payload, stale: true };
    throw err;
  }
}
