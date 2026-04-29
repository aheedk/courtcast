import { env } from './env';
import type { Forecast, ForecastSlot } from './forecast';

interface OWMForecastResponse {
  list: Array<{
    dt: number;
    main: { temp: number };
    wind: { speed: number };
    pop: number;
  }>;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Fetches the 5-day/3-hour forecast and interpolates up to 48 hourly slots.
 *
 * OWM's free tier only provides 3-hour granularity. To match Open-Meteo's
 * hourly shape, this module:
 *   - linearly interpolates tempF/windMph between adjacent 3h samples
 *   - forward-fills rainPct (because `pop` is a per-3h-window probability,
 *     not a point sample — interpolating it would understate intermediate
 *     hours)
 *
 * Returns `Forecast` with up to 48 ascending slots starting at the first
 * available OWM sample.
 */
export async function fetchOpenWeatherForecast(lat: number, lng: number): Promise<Forecast> {
  if (!env.openweatherKey) {
    throw new Error(
      'OPENWEATHER_KEY is required when WEATHER_PROVIDER=openweather. Set it or switch WEATHER_PROVIDER to open-meteo.',
    );
  }
  const url = new URL('https://api.openweathermap.org/data/2.5/forecast');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('units', 'imperial');
  url.searchParams.set('appid', env.openweatherKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`OpenWeatherMap HTTP ${res.status}`);
  const data = (await res.json()) as OWMForecastResponse;

  if (!data.list?.length) throw new Error('OpenWeatherMap returned no forecast slots');

  const slots: ForecastSlot[] = [];
  for (let i = 0; i < data.list.length - 1 && slots.length < 48; i++) {
    const a = data.list[i];
    const b = data.list[i + 1];
    const tA = a.dt * 1000;
    const tempA = a.main.temp;
    const tempB = b.main.temp;
    const windA = a.wind.speed;
    const windB = b.wind.speed;
    const rainPct = clampInt(a.pop * 100, 0, 100);

    for (let h = 0; h < 3 && slots.length < 48; h++) {
      const frac = h / 3;
      slots.push({
        ts: tA + h * 3600_000,
        tempF: clampInt(tempA + (tempB - tempA) * frac, -100, 200),
        windMph: clampInt(windA + (windB - windA) * frac, 0, 200),
        rainPct,
      });
    }
  }

  // Forward-fill the last OWM sample for any remaining slots up to 48.
  // This covers the final 3-hour window when there is no subsequent sample
  // to interpolate against (e.g. sample 16 covers hours 45-47 but sample 17
  // does not exist).
  if (slots.length < 48 && data.list.length > 0) {
    const last = data.list[data.list.length - 1];
    const tLast = last.dt * 1000;
    const tempLast = clampInt(last.main.temp, -100, 200);
    const windLast = clampInt(last.wind.speed, 0, 200);
    const rainPctLast = clampInt(last.pop * 100, 0, 100);
    for (let h = 0; slots.length < 48; h++) {
      slots.push({
        ts: tLast + h * 3600_000,
        tempF: tempLast,
        windMph: windLast,
        rainPct: rainPctLast,
      });
    }
  }

  return { slots: slots.slice(0, 48), fetchedAt: Date.now() };
}
