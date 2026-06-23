import { env } from './env';
import { getCached, putCached, geohashFor, TTL, PRECISION } from './cache';
import { fetchOpenMeteoForecast } from './openmeteo';
import { fetchOpenWeatherForecast } from './openweather';
import type { Forecast } from './forecast';
import type { WeatherProvider } from './env';

const MAX_UPSTREAM_CONCURRENCY = 4;
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const CACHE_FIRST_SLOT_FUTURE_SLACK_MS = 3 * 3600_000;
const CACHE_LAST_SLOT_PAST_SLACK_MS = 60 * 60_000;

let activeUpstreamRequests = 0;
const upstreamQueue: Array<() => void> = [];
const inFlightByGeohash = new Map<string, Promise<{ forecast: Forecast; stale: boolean }>>();
const providerCooldownUntil: Record<WeatherProvider, number> = {
  'open-meteo': 0,
  openweather: 0,
};

/**
 * Provider-agnostic forecast fetcher. Cached by geohash-5 (~5km cell)
 * for one hour. On upstream failure, returns the cached payload as
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
  const usableCached = cached && isUsableCachedForecast(cached.payload) ? cached : null;
  if (usableCached && !usableCached.stale) {
    return { forecast: usableCached.payload, stale: false };
  }

  const existing = inFlightByGeohash.get(geohash);
  if (existing) {
    try {
      return await existing;
    } catch (err) {
      if (usableCached) return { forecast: usableCached.payload, stale: true };
      throw err;
    }
  }

  const request = (async () => {
    try {
      const forecast = await fetchFromProviders(lat, lng);
      await putCached('weatherCache', geohash, forecast);
      return { forecast, stale: false };
    } catch (err) {
      if (usableCached) return { forecast: usableCached.payload, stale: true };
      throw err;
    }
  })();

  inFlightByGeohash.set(geohash, request);
  try {
    return await request;
  } finally {
    if (inFlightByGeohash.get(geohash) === request) {
      inFlightByGeohash.delete(geohash);
    }
  }
}

function providerOrder(): WeatherProvider[] {
  const primary = env.weatherProvider;
  const fallback: WeatherProvider = primary === 'open-meteo' ? 'openweather' : 'open-meteo';
  if (fallback === 'openweather' && !env.openweatherKey) return [primary];
  return [primary, fallback];
}

async function fetchFromProviders(lat: number, lng: number): Promise<Forecast> {
  const errors: string[] = [];

  for (const provider of providerOrder()) {
    const cooldownMs = providerCooldownUntil[provider] - Date.now();
    if (cooldownMs > 0) {
      errors.push(`${provider}: cooling down for ${Math.ceil(cooldownMs / 1000)}s`);
      continue;
    }

    try {
      return await runWithUpstreamLimit(() => fetchProvider(provider, lat, lng));
    } catch (err) {
      if (isRateLimited(err)) {
        providerCooldownUntil[provider] = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      }
      errors.push(`${provider}: ${errorMessage(err)}`);
    }
  }

  throw new Error(`Weather providers failed (${errors.join('; ')})`);
}

function fetchProvider(provider: WeatherProvider, lat: number, lng: number): Promise<Forecast> {
  return provider === 'open-meteo'
    ? fetchOpenMeteoForecast(lat, lng)
    : fetchOpenWeatherForecast(lat, lng);
}

async function runWithUpstreamLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeUpstreamRequests >= MAX_UPSTREAM_CONCURRENCY) {
    await new Promise<void>((resolve) => upstreamQueue.push(resolve));
  }

  activeUpstreamRequests += 1;
  try {
    return await fn();
  } finally {
    activeUpstreamRequests -= 1;
    upstreamQueue.shift()?.();
  }
}

function isRateLimited(err: unknown): boolean {
  return /\b(429|rate limit|too many requests)\b/i.test(errorMessage(err));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isUsableCachedForecast(forecast: Forecast): boolean {
  if (!forecast || !Array.isArray(forecast.slots) || forecast.slots.length === 0) {
    return false;
  }
  const first = forecast.slots[0]?.ts;
  const last = forecast.slots[forecast.slots.length - 1]?.ts;
  if (!Number.isFinite(first) || !Number.isFinite(last)) return false;

  const now = Date.now();
  return (
    first <= now + CACHE_FIRST_SLOT_FUTURE_SLACK_MS &&
    last >= now - CACHE_LAST_SLOT_PAST_SLACK_MS
  );
}
