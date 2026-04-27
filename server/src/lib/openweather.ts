import { env } from './env';
import { getCached, putCached, geohashFor, TTL, PRECISION } from './cache';
import type { WeatherSummary } from './playability';

interface OWMForecastResponse {
  list: Array<{
    dt: number;
    main: { temp: number };
    wind: { speed: number };
    pop: number;
  }>;
}

/**
 * Fetches a weather summary suitable for playability scoring:
 *   - tempF: current (first forecast slot) temperature in Fahrenheit
 *   - windMph: current wind in mph
 *   - rainPctNext2h: max precipitation probability across the next ~2h
 *
 * Uses the OpenWeatherMap 5-day/3-hour forecast (free tier). The first
 * one or two slots cover the next ~2 hours.
 *
 * Cached server-side by geohash (precision 5, ~5km cell) for 10 minutes.
 */
export async function fetchWeather(
  lat: number,
  lng: number,
): Promise<{ weather: WeatherSummary; stale: boolean }> {
  const geohash = geohashFor(lat, lng, PRECISION.weather);
  const cached = await getCached<WeatherSummary>('weatherCache', geohash, TTL.weatherMs);
  if (cached && !cached.stale) {
    return { weather: cached.payload, stale: false };
  }

  try {
    const url = new URL('https://api.openweathermap.org/data/2.5/forecast');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('units', 'imperial');
    url.searchParams.set('appid', env.openweatherKey);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`OpenWeatherMap HTTP ${res.status}`);
    const data = (await res.json()) as OWMForecastResponse;

    if (!data.list?.length) throw new Error('OpenWeatherMap returned no forecast slots');

    const next = data.list.slice(0, 1)[0];
    const next2h = data.list.slice(0, 2);

    const weather: WeatherSummary = {
      tempF: Math.round(next.main.temp),
      windMph: Math.round(next.wind.speed),
      rainPctNext2h: Math.round(Math.max(...next2h.map((s) => s.pop)) * 100),
    };

    await putCached('weatherCache', geohash, weather);
    return { weather, stale: false };
  } catch (err) {
    if (cached) return { weather: cached.payload, stale: true };
    throw err;
  }
}
