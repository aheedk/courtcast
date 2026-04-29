import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WEATHER_PROVIDER;
});

describe('fetchForecast dispatcher', () => {
  it('dispatches to Open-Meteo when WEATHER_PROVIDER=open-meteo (default)', async () => {
    process.env.WEATHER_PROVIDER = 'open-meteo';
    process.env.OPENWEATHER_KEY = 'test-key';
    process.env.DATABASE_URL = 'postgresql://x';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'x';
    process.env.GOOGLE_PLACES_KEY = 'x';

    const om = vi.fn().mockResolvedValue({ slots: [{ ts: 1, tempF: 70, windMph: 8, rainPct: 10 }], fetchedAt: 0 });
    const owm = vi.fn();
    vi.doMock('../src/lib/openmeteo', () => ({ fetchOpenMeteoForecast: om }));
    vi.doMock('../src/lib/openweather', () => ({ fetchOpenWeatherForecast: owm }));
    vi.doMock('../src/lib/cache', () => ({
      getCached: vi.fn().mockResolvedValue(null),
      putCached: vi.fn().mockResolvedValue(undefined),
      geohashFor: vi.fn().mockReturnValue('hash'),
      TTL: { weatherMs: 600_000, placesMs: 0 },
      PRECISION: { weather: 5, places: 4 },
    }));

    const { fetchForecast } = await import('../src/lib/weather');
    const result = await fetchForecast(40, -74);

    expect(om).toHaveBeenCalledTimes(1);
    expect(owm).not.toHaveBeenCalled();
    expect(result.forecast.slots).toHaveLength(1);
  });

  it('dispatches to OpenWeather when WEATHER_PROVIDER=openweather', async () => {
    process.env.WEATHER_PROVIDER = 'openweather';
    process.env.OPENWEATHER_KEY = 'test-key';
    process.env.DATABASE_URL = 'postgresql://x';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'x';
    process.env.GOOGLE_PLACES_KEY = 'x';

    const om = vi.fn();
    const owm = vi.fn().mockResolvedValue({ slots: [{ ts: 2, tempF: 68, windMph: 9, rainPct: 20 }], fetchedAt: 0 });
    vi.doMock('../src/lib/openmeteo', () => ({ fetchOpenMeteoForecast: om }));
    vi.doMock('../src/lib/openweather', () => ({ fetchOpenWeatherForecast: owm }));
    vi.doMock('../src/lib/cache', () => ({
      getCached: vi.fn().mockResolvedValue(null),
      putCached: vi.fn().mockResolvedValue(undefined),
      geohashFor: vi.fn().mockReturnValue('hash'),
      TTL: { weatherMs: 600_000, placesMs: 0 },
      PRECISION: { weather: 5, places: 4 },
    }));

    const { fetchForecast } = await import('../src/lib/weather');
    const result = await fetchForecast(40, -74);

    expect(owm).toHaveBeenCalledTimes(1);
    expect(om).not.toHaveBeenCalled();
    expect(result.forecast.slots[0].tempF).toBe(68);
  });
});
