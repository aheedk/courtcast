import type { Forecast, ForecastSlot } from './forecast';

interface OpenMeteoResponse {
  hourly?: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature?: number[];
    relative_humidity_2m?: number[];
    wind_speed_10m: number[];
    wind_gusts_10m?: number[];
    precipitation_probability: number[];
    precipitation?: number[];
    uv_index?: number[];
    shortwave_radiation?: number[];
  };
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Fetches a seven-day hourly forecast from Open-Meteo (free, no API key).
 * Returns slots sorted ascending by ts; slots[0] is the current hour.
 */
export async function fetchOpenMeteoForecast(lat: number, lng: number): Promise<Forecast> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set(
    'hourly',
    'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,precipitation,uv_index,shortwave_radiation',
  );
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');
  url.searchParams.set('precipitation_unit', 'inch');
  url.searchParams.set('forecast_hours', '168');
  url.searchParams.set('timezone', 'UTC');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;

  const h = data.hourly;
  if (!h || !Array.isArray(h.time) || h.time.length === 0) {
    throw new Error('Open-Meteo returned no forecast slots');
  }

  const n = Math.min(h.time.length, 168);
  const slots: ForecastSlot[] = [];
  for (let i = 0; i < n; i++) {
    const iso = h.time[i].endsWith('Z') ? h.time[i] : `${h.time[i]}Z`;
    const slot: ForecastSlot = {
      ts: new Date(iso).getTime(),
      tempF: clampInt(h.temperature_2m[i], -100, 200),
      windMph: clampInt(h.wind_speed_10m[i], 0, 200),
      rainPct: clampInt(h.precipitation_probability[i], 0, 100),
    };
    if (Number.isFinite(h.apparent_temperature?.[i])) {
      slot.apparentTempF = clampInt(h.apparent_temperature![i], -100, 200);
    }
    if (Number.isFinite(h.relative_humidity_2m?.[i])) {
      slot.humidityPct = clampInt(h.relative_humidity_2m![i], 0, 100);
    }
    if (Number.isFinite(h.wind_gusts_10m?.[i])) {
      slot.windGustMph = clampInt(h.wind_gusts_10m![i], 0, 250);
    }
    if (Number.isFinite(h.precipitation?.[i])) {
      slot.precipitationIn = Math.max(0, Number(h.precipitation![i].toFixed(3)));
    }
    if (Number.isFinite(h.uv_index?.[i])) {
      slot.uvIndex = Math.max(0, Number(h.uv_index![i].toFixed(1)));
    }
    if (Number.isFinite(h.shortwave_radiation?.[i])) {
      slot.solarRadiationWm2 = Math.max(0, Math.round(h.shortwave_radiation![i]));
    }
    slots.push(slot);
  }

  return { slots, fetchedAt: Date.now() };
}
