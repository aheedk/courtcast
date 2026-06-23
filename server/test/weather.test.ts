import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WEATHER_PROVIDER;
  delete process.env.OPENWEATHER_KEY;
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

  it('falls back to OpenWeather when Open-Meteo is rate-limited and a key is configured', async () => {
    process.env.WEATHER_PROVIDER = 'open-meteo';
    process.env.OPENWEATHER_KEY = 'test-key';
    process.env.DATABASE_URL = 'postgresql://x';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'x';
    process.env.GOOGLE_PLACES_KEY = 'x';

    const om = vi.fn().mockRejectedValue(new Error('Open-Meteo HTTP 429'));
    const owm = vi.fn().mockResolvedValue({
      slots: [{ ts: 3, tempF: 69, windMph: 7, rainPct: 5 }],
      fetchedAt: 0,
    });
    vi.doMock('../src/lib/openmeteo', () => ({ fetchOpenMeteoForecast: om }));
    vi.doMock('../src/lib/openweather', () => ({ fetchOpenWeatherForecast: owm }));
    vi.doMock('../src/lib/cache', () => ({
      getCached: vi.fn().mockResolvedValue(null),
      putCached: vi.fn().mockResolvedValue(undefined),
      geohashFor: vi.fn().mockReturnValue('hash'),
      TTL: { weatherMs: 3_600_000, placesMs: 0 },
      PRECISION: { weather: 5, places: 4 },
    }));

    const { fetchForecast } = await import('../src/lib/weather');
    const result = await fetchForecast(40, -74);

    expect(om).toHaveBeenCalledTimes(1);
    expect(owm).toHaveBeenCalledTimes(1);
    expect(result.forecast.slots[0].tempF).toBe(69);
    expect(result.stale).toBe(false);
  });

  it('coalesces concurrent stale-cache refreshes for the same weather cell', async () => {
    process.env.WEATHER_PROVIDER = 'open-meteo';
    process.env.OPENWEATHER_KEY = 'test-key';
    process.env.DATABASE_URL = 'postgresql://x';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'x';
    process.env.GOOGLE_PLACES_KEY = 'x';

    const forecast = {
      slots: [{ ts: 4, tempF: 71, windMph: 6, rainPct: 0 }],
      fetchedAt: 0,
    };
    let resolveForecast!: (value: typeof forecast) => void;
    const upstreamPromise = new Promise<typeof forecast>((resolve) => {
      resolveForecast = resolve;
    });
    const om = vi.fn().mockReturnValue(upstreamPromise);
    const putCached = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../src/lib/openmeteo', () => ({ fetchOpenMeteoForecast: om }));
    vi.doMock('../src/lib/openweather', () => ({ fetchOpenWeatherForecast: vi.fn() }));
    vi.doMock('../src/lib/cache', () => ({
      getCached: vi.fn().mockResolvedValue(null),
      putCached,
      geohashFor: vi.fn().mockReturnValue('same-hash'),
      TTL: { weatherMs: 3_600_000, placesMs: 0 },
      PRECISION: { weather: 5, places: 4 },
    }));

    const { fetchForecast } = await import('../src/lib/weather');
    const first = fetchForecast(40, -74);
    const second = fetchForecast(40.001, -74.001);
    await Promise.resolve();

    expect(om).toHaveBeenCalledTimes(1);
    resolveForecast(forecast);

    await expect(first).resolves.toEqual({ forecast, stale: false });
    await expect(second).resolves.toEqual({ forecast, stale: false });
    expect(putCached).toHaveBeenCalledTimes(1);
  });

  it('does not return an expired cached forecast whose slot window no longer covers now', async () => {
    process.env.WEATHER_PROVIDER = 'open-meteo';
    process.env.DATABASE_URL = 'postgresql://x';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'x';
    process.env.GOOGLE_PLACES_KEY = 'x';

    const expiredForecast = {
      slots: [
        { ts: Date.now() - 72 * 3600_000, tempF: 70, windMph: 5, rainPct: 0 },
        { ts: Date.now() - 71 * 3600_000, tempF: 71, windMph: 6, rainPct: 0 },
      ],
      fetchedAt: Date.now() - 72 * 3600_000,
    };
    const om = vi.fn().mockRejectedValue(new Error('Open-Meteo HTTP 429'));

    vi.doMock('../src/lib/openmeteo', () => ({ fetchOpenMeteoForecast: om }));
    vi.doMock('../src/lib/openweather', () => ({ fetchOpenWeatherForecast: vi.fn() }));
    vi.doMock('../src/lib/cache', () => ({
      getCached: vi.fn().mockResolvedValue({
        payload: expiredForecast,
        fetchedAt: new Date(Date.now() - 72 * 3600_000),
        stale: true,
      }),
      putCached: vi.fn().mockResolvedValue(undefined),
      geohashFor: vi.fn().mockReturnValue('expired-hash'),
      TTL: { weatherMs: 3_600_000, placesMs: 0 },
      PRECISION: { weather: 5, places: 4 },
    }));

    const { fetchForecast } = await import('../src/lib/weather');

    await expect(fetchForecast(40, -74)).rejects.toThrow(/Open-Meteo HTTP 429/);
    expect(om).toHaveBeenCalledTimes(1);
  });
});
