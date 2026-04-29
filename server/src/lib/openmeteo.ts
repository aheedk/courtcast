import type { Forecast, ForecastSlot } from './forecast';

interface OpenMeteoResponse {
  hourly?: {
    time: string[];
    temperature_2m: number[];
    wind_speed_10m: number[];
    precipitation_probability: number[];
  };
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Fetches a 48-hour hourly forecast from Open-Meteo (free, no API key).
 * Returns slots sorted ascending by ts; slots[0] is the current hour.
 */
export async function fetchOpenMeteoForecast(lat: number, lng: number): Promise<Forecast> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('hourly', 'temperature_2m,wind_speed_10m,precipitation_probability');
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');
  url.searchParams.set('forecast_hours', '48');
  url.searchParams.set('timezone', 'UTC');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;

  const h = data.hourly;
  if (!h || !Array.isArray(h.time) || h.time.length === 0) {
    throw new Error('Open-Meteo returned no forecast slots');
  }

  const n = Math.min(h.time.length, 48);
  const slots: ForecastSlot[] = [];
  for (let i = 0; i < n; i++) {
    const iso = h.time[i].endsWith('Z') ? h.time[i] : `${h.time[i]}Z`;
    slots.push({
      ts: new Date(iso).getTime(),
      tempF: clampInt(h.temperature_2m[i], -100, 200),
      windMph: clampInt(h.wind_speed_10m[i], 0, 200),
      rainPct: clampInt(h.precipitation_probability[i], 0, 100),
    });
  }

  return { slots, fetchedAt: Date.now() };
}
