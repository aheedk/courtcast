# Time-changer (forecast scrubbing) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users scrub through the next 48 hours at 2-hour increments and have the entire app — map pin colors, court panel, saved-court cards — score and display weather for the selected slot.

**Architecture:** Default weather provider switches to Open-Meteo (hourly, free) behind a `WEATHER_PROVIDER` env var; `OpenWeatherMap` retained as a fallback. Server returns a 48-slot hourly `Forecast` per court alongside the existing `weather`/`score`/`stale` fields. A new global `useSelectedTime` store on the client holds the user's chosen time; a new `slotAt(forecast, time)` helper picks the right slot; `useScoreFor` becomes time-aware. New `<TimeScrubber />` component renders the slider on MapPage and inside a bottom sheet on MyCourtsPage.

**Tech Stack:** Same as existing — Express + Prisma server, Vite + React + TypeScript client. New external API: `https://api.open-meteo.com/v1/forecast` (free, no key).

**Spec:** `docs/superpowers/specs/2026-04-29-courtclimate-time-changer.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/src/lib/forecast.ts` | Create | `Forecast`/`ForecastSlot` types; `weatherFromForecast` derivation helper |
| `server/src/lib/openmeteo.ts` | Create | Open-Meteo fetcher → `Forecast` |
| `server/src/lib/openweather.ts` | Modify | Reshape return type to `Forecast`; interpolate 3h → 1h slots |
| `server/src/lib/weather.ts` | Create | Provider dispatcher: `fetchForecast(lat, lng)` |
| `server/src/lib/env.ts` | Modify | Add `WEATHER_PROVIDER` env var |
| `server/src/lib/google.ts` | Modify | `HydratedCourt` carries `forecast`; `hydrateCourts` uses `fetchForecast` |
| `server/src/routes/court.ts` | Modify | Return `forecast` |
| `server/src/routes/weather.ts` | Modify | Return `forecast` |
| `server/src/routes/meCourts.ts` | Modify | Saved courts carry `forecast` |
| `server/test/forecast.test.ts` | Create | Tests for `weatherFromForecast` |
| `server/test/openmeteo.test.ts` | Create | Tests for Open-Meteo response parsing |
| `server/test/openweather.test.ts` | Create | Tests for OWM 3h → 1h interpolation |
| `server/test/weather.test.ts` | Create | Tests for provider dispatcher |
| `server/test/api.smoke.test.ts` | Modify | Stub-friendly imports + assert `forecast` field |
| `client/src/types.ts` | Modify | Add `Forecast`/`ForecastSlot`; add `forecast` to `Court`/`CourtDetail`/`SavedCourtDetail` |
| `client/src/lib/forecast.ts` | Create | `slotAt(forecast, timeMs)` helper |
| `client/src/stores/selectedTime.ts` | Create | `useSelectedTime` store with localStorage + drift clamp |
| `client/src/stores/thresholds.ts` | Modify | `useScoreFor(forecast, sport, fallback)` reads selected time, picks slot |
| `client/src/components/WeatherStats.tsx` | Modify | Accept `forecast`, render slot at selected time, dashes when out of window |
| `client/src/components/TimeScrubber.tsx` | Create | The slider (with readout, day labels, "Now" button) |
| `client/src/components/TimePill.tsx` | Create | Compact time-display pill button (used on MyCourtsPage) |
| `client/src/components/CourtPanel.tsx` | Modify | Pass `forecast`; show "Forecast for X" line when not Now |
| `client/src/components/SavedCourtCard.tsx` | Modify | Pass `forecast` to score + `WeatherStats` |
| `client/src/routes/MapPage.tsx` | Modify | Render `<TimeScrubber />`; pin scoring goes through `slotAt` |
| `client/src/routes/MyCourtsPage.tsx` | Modify | Mount `<TimePill />` + bottom sheet wrapping `<TimeScrubber />` |
| `README.md` | Modify | Update "In-flight / scheduled" — Open-Meteo now live, time-changer shipped |

---

## Task 1: Server — `Forecast` types and `weatherFromForecast` helper

**Files:**
- Create: `server/src/lib/forecast.ts`
- Test: `server/test/forecast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/forecast.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { weatherFromForecast, type Forecast } from '../src/lib/forecast';

describe('weatherFromForecast', () => {
  it('returns null when forecast is null', () => {
    expect(weatherFromForecast(null)).toBeNull();
  });

  it('returns null when slots are empty', () => {
    const f: Forecast = { slots: [], fetchedAt: 0 };
    expect(weatherFromForecast(f)).toBeNull();
  });

  it('derives WeatherSummary from slots[0]', () => {
    const f: Forecast = {
      slots: [
        { ts: 1_000_000, tempF: 70, windMph: 8, rainPct: 25 },
        { ts: 1_003_600_000, tempF: 71, windMph: 9, rainPct: 30 },
      ],
      fetchedAt: 999,
    };
    expect(weatherFromForecast(f)).toEqual({
      tempF: 70,
      windMph: 8,
      rainPctNext2h: 25,
    });
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail (no module yet)**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server -- forecast.test
```

Expected: failure — "Cannot find module '../src/lib/forecast'".

- [ ] **Step 3: Create `server/src/lib/forecast.ts`**

```ts
import type { WeatherSummary } from './playability';

export interface ForecastSlot {
  ts: number;       // epoch ms, top-of-hour UTC
  tempF: number;
  windMph: number;
  rainPct: number;  // 0..100
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
  const slot = forecast?.slots[0] ?? null;
  if (!slot) return null;
  return {
    tempF: slot.tempF,
    windMph: slot.windMph,
    rainPctNext2h: slot.rainPct,
  };
}
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server -- forecast.test
```

Expected: 3/3 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add server/src/lib/forecast.ts server/test/forecast.test.ts
git commit -m "feat(server): Forecast types + weatherFromForecast helper"
```

---

## Task 2: Server — Open-Meteo provider

**Files:**
- Create: `server/src/lib/openmeteo.ts`
- Test: `server/test/openmeteo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/openmeteo.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOpenMeteoForecast } from '../src/lib/openmeteo';

afterEach(() => vi.restoreAllMocks());

function cannedHourly(n: number) {
  // Build a parallel-arrays response with `n` hourly entries starting at
  // 2026-04-29T10:00 UTC. Temps go 70, 71, 72…; wind 8, 9, 10…; rain 10, 11…
  const start = new Date('2026-04-29T10:00:00Z').getTime();
  const time: string[] = [];
  const temperature_2m: number[] = [];
  const wind_speed_10m: number[] = [];
  const precipitation_probability: number[] = [];
  for (let i = 0; i < n; i++) {
    time.push(new Date(start + i * 3600_000).toISOString().replace(/\.\d+Z$/, 'Z'));
    temperature_2m.push(70 + i);
    wind_speed_10m.push(8 + i);
    precipitation_probability.push(10 + i);
  }
  return { hourly: { time, temperature_2m, wind_speed_10m, precipitation_probability } };
}

describe('fetchOpenMeteoForecast', () => {
  it('parses 48 hourly slots into Forecast', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => cannedHourly(48),
    });
    vi.stubGlobal('fetch', fetchMock);

    const f = await fetchOpenMeteoForecast(40, -74);

    expect(f.slots).toHaveLength(48);
    expect(f.slots[0]).toEqual({
      ts: new Date('2026-04-29T10:00:00Z').getTime(),
      tempF: 70,
      windMph: 8,
      rainPct: 10,
    });
    expect(f.slots[47].tempF).toBe(70 + 47);
    expect(f.fetchedAt).toBeGreaterThan(0);

    // Confirm we asked for the right params
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/api\.open-meteo\.com\/v1\/forecast/);
    expect(url).toContain('latitude=40');
    expect(url).toContain('longitude=-74');
    expect(url).toContain('forecast_hours=48');
    expect(url).toContain('temperature_unit=fahrenheit');
    expect(url).toContain('wind_speed_unit=mph');
  });

  it('rounds tempF/windMph and clamps rainPct to int 0..100', async () => {
    const start = new Date('2026-04-29T10:00:00Z').getTime();
    const data = {
      hourly: {
        time: [new Date(start).toISOString().replace(/\.\d+Z$/, 'Z')],
        temperature_2m: [70.6],
        wind_speed_10m: [8.4],
        precipitation_probability: [105], // out of range
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));

    const f = await fetchOpenMeteoForecast(0, 0);
    expect(f.slots[0]).toEqual({
      ts: start,
      tempF: 71,
      windMph: 8,
      rainPct: 100,
    });
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchOpenMeteoForecast(0, 0)).rejects.toThrow(/503/);
  });

  it('throws when hourly arrays are missing or empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hourly: { time: [], temperature_2m: [], wind_speed_10m: [], precipitation_probability: [] } }),
    }));
    await expect(fetchOpenMeteoForecast(0, 0)).rejects.toThrow(/no forecast/i);
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail (no module yet)**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server -- openmeteo.test
```

Expected: failure — module not found.

- [ ] **Step 3: Create `server/src/lib/openmeteo.ts`**

```ts
import type { Forecast, ForecastSlot } from './forecast';

interface OpenMeteoResponse {
  hourly?: {
    time: string[];                        // ISO8601 strings, e.g. "2026-04-29T10:00Z" or "2026-04-29T10:00"
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
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server -- openmeteo.test
```

Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add server/src/lib/openmeteo.ts server/test/openmeteo.test.ts
git commit -m "feat(server): Open-Meteo provider — fetchOpenMeteoForecast"
```

---

## Task 3: Server — reshape OpenWeather to return `Forecast`

**Files:**
- Modify: `server/src/lib/openweather.ts`
- Test: `server/test/openweather.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/openweather.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOpenWeatherForecast } from '../src/lib/openweather';

afterEach(() => vi.restoreAllMocks());

// OWM returns 5-day/3-hour data. We feed it 16 entries (48 hours) and
// expect the module to interpolate up to 48 hourly slots.
function cannedOwm() {
  const start = new Date('2026-04-29T12:00:00Z').getTime();
  const list: any[] = [];
  for (let i = 0; i < 16; i++) {
    list.push({
      dt: Math.floor((start + i * 3 * 3600_000) / 1000),
      main: { temp: 70 + i },                 // imperial → already F
      wind: { speed: 8 + i },                  // imperial → already mph
      pop: (i % 11) / 10,                      // 0.0..1.0; we check forward-fill
    });
  }
  return { list };
}

describe('fetchOpenWeatherForecast', () => {
  it('returns 48 hourly slots interpolating linearly between 3-hour OWM samples', async () => {
    process.env.OPENWEATHER_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => cannedOwm(),
    }));

    const f = await fetchOpenWeatherForecast(40, -74);
    expect(f.slots).toHaveLength(48);

    // First slot matches the first OWM sample exactly.
    expect(f.slots[0].tempF).toBe(70);
    expect(f.slots[0].windMph).toBe(8);

    // Slot 3 (3 hours in) matches the 2nd OWM sample.
    expect(f.slots[3].tempF).toBe(71);
    expect(f.slots[3].windMph).toBe(9);

    // Slot 1 and 2 are between the first two samples — interpolated.
    expect(f.slots[1].tempF).toBeGreaterThanOrEqual(70);
    expect(f.slots[1].tempF).toBeLessThanOrEqual(71);
    expect(f.slots[2].tempF).toBeGreaterThanOrEqual(70);
    expect(f.slots[2].tempF).toBeLessThanOrEqual(71);
  });

  it('forward-fills rain probability rather than interpolating (pop is per-3h-window)', async () => {
    process.env.OPENWEATHER_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => cannedOwm(),
    }));

    const f = await fetchOpenWeatherForecast(40, -74);
    // OWM sample 0 has pop = 0.0 → rainPct 0. Slots 0,1,2 should all be 0.
    expect(f.slots[0].rainPct).toBe(0);
    expect(f.slots[1].rainPct).toBe(0);
    expect(f.slots[2].rainPct).toBe(0);
    // OWM sample 1 has pop = 0.1 → rainPct 10. Slots 3,4,5 should all be 10.
    expect(f.slots[3].rainPct).toBe(10);
    expect(f.slots[4].rainPct).toBe(10);
    expect(f.slots[5].rainPct).toBe(10);
  });

  it('throws on HTTP error and falls through to caller', async () => {
    process.env.OPENWEATHER_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(fetchOpenWeatherForecast(0, 0)).rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail (current module exports `fetchWeather`, not `fetchOpenWeatherForecast`)**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server -- openweather.test
```

Expected: failure — `fetchOpenWeatherForecast` is not exported.

- [ ] **Step 3: Replace `server/src/lib/openweather.ts`**

Full file replacement:

```ts
import { env } from './env';
import type { Forecast, ForecastSlot } from './forecast';

interface OWMForecastResponse {
  list: Array<{
    dt: number;                      // unix seconds
    main: { temp: number };          // imperial → fahrenheit
    wind: { speed: number };         // imperial → mph
    pop: number;                     // 0..1, probability for the 3h window
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
  const url = new URL('https://api.openweathermap.org/data/2.5/forecast');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('units', 'imperial');
  url.searchParams.set('appid', env.openweatherKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`OpenWeatherMap HTTP ${res.status}`);
  const data = (await res.json()) as OWMForecastResponse;

  if (!data.list?.length) throw new Error('OpenWeatherMap returned no forecast slots');

  // Build hourly slots between adjacent OWM samples. We produce 3 hourly slots
  // per OWM sample (the sample's hour, +1h, +2h); the next OWM sample provides
  // the +3h slot. Cap at 48.
  const slots: ForecastSlot[] = [];
  for (let i = 0; i < data.list.length - 1 && slots.length < 48; i++) {
    const a = data.list[i];
    const b = data.list[i + 1];
    const tA = a.dt * 1000;
    const tB = b.dt * 1000;
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
        rainPct, // forward-fill within the 3h window
      });
    }
  }

  // If the loop above stopped because we ran out of pairs, append the last
  // sample's slot so we don't drop the final 3h window entirely.
  if (slots.length < 48 && data.list.length > 0) {
    const last = data.list[data.list.length - 1];
    slots.push({
      ts: last.dt * 1000,
      tempF: clampInt(last.main.temp, -100, 200),
      windMph: clampInt(last.wind.speed, 0, 200),
      rainPct: clampInt(last.pop * 100, 0, 100),
    });
  }

  return { slots: slots.slice(0, 48), fetchedAt: Date.now() };
}
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server -- openweather.test
```

Expected: 3/3 passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add server/src/lib/openweather.ts server/test/openweather.test.ts
git commit -m "feat(server): OpenWeather reshape — fetchOpenWeatherForecast (3h→1h interpolation)"
```

> Note: the old `fetchWeather` export is removed. Routes that import it will break — Task 5 fixes them. Don't worry about `tsc` errors in routes between this task and Task 5.

---

## Task 4: Server — provider dispatcher + env var

**Files:**
- Create: `server/src/lib/weather.ts`
- Modify: `server/src/lib/env.ts`
- Test: `server/test/weather.test.ts`

- [ ] **Step 1: Add `WEATHER_PROVIDER` to env**

Replace `server/src/lib/env.ts`:

```ts
import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export type WeatherProvider = 'open-meteo' | 'openweather';

function weatherProvider(): WeatherProvider {
  const v = optional('WEATHER_PROVIDER', 'open-meteo');
  if (v !== 'open-meteo' && v !== 'openweather') {
    throw new Error(`Invalid WEATHER_PROVIDER: ${v} (expected open-meteo | openweather)`);
  }
  return v;
}

export const env = {
  port: parseInt(optional('PORT', '4000'), 10),
  clientOrigin: optional('CLIENT_ORIGIN', 'http://localhost:5173'),
  nodeEnv: optional('NODE_ENV', 'development'),
  databaseUrl: required('DATABASE_URL'),
  googleOauthClientId: required('GOOGLE_OAUTH_CLIENT_ID'),
  googlePlacesKey: required('GOOGLE_PLACES_KEY'),
  openweatherKey: required('OPENWEATHER_KEY'),
  weatherProvider: weatherProvider(),
  defaultLat: parseFloat(optional('DEFAULT_LAT', '40.7831')),
  defaultLng: parseFloat(optional('DEFAULT_LNG', '-73.9712')),
  defaultRadiusMeters: parseInt(optional('DEFAULT_RADIUS_METERS', '16000'), 10),
};

export const isProd = env.nodeEnv === 'production';
```

> Open-Meteo doesn't need a key, so `OPENWEATHER_KEY` stays `required`. (You could relax to `optional` if `WEATHER_PROVIDER=open-meteo` is the only deploy target, but keep it required so a fallback to OWM still works without re-deploying with new env.)

- [ ] **Step 2: Update `.env.example` files**

Append to both `server/.env.example` and `client/.env.example` if/where weather config lives. Specifically:

```
# Server only — choose weather provider. Defaults to open-meteo (hourly,
# free, no API key). Set to "openweather" to use OWM instead.
WEATHER_PROVIDER=open-meteo
```

(Verify with `cat server/.env.example` first; only add if absent.)

- [ ] **Step 3: Write the failing test for the dispatcher**

Create `server/test/weather.test.ts`:

```ts
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
    // Stub the cache so we don't need a DB.
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
```

- [ ] **Step 4: Run the test — expect it to fail (no module yet)**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server -- weather.test
```

Expected: failure — `fetchForecast` not found.

- [ ] **Step 5: Create `server/src/lib/weather.ts`**

```ts
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
  const geohash = geohashFor(lat, lng, PRECISION.weather);
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
```

- [ ] **Step 6: Run the test — expect it to pass**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server -- weather.test
```

Expected: 2/2 passing.

- [ ] **Step 7: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add server/src/lib/weather.ts server/src/lib/env.ts server/test/weather.test.ts server/.env.example
git commit -m "feat(server): WEATHER_PROVIDER env + fetchForecast dispatcher"
```

---

## Task 5: Server — wire `forecast` through API routes and `hydrateCourts`

**Files:**
- Modify: `server/src/lib/google.ts`
- Modify: `server/src/routes/court.ts`
- Modify: `server/src/routes/weather.ts`
- Modify: `server/src/routes/meCourts.ts`
- Modify: `server/test/api.smoke.test.ts`

- [ ] **Step 1: Update `lib/google.ts` `HydratedCourt` and `hydrateCourts`**

Apply these targeted edits to `server/src/lib/google.ts`:

a) Imports — replace:
```ts
import { fetchWeather } from './openweather';
import { score, type PlayabilityScore, type WeatherSummary } from './playability';
```
with:
```ts
import { fetchForecast } from './weather';
import { weatherFromForecast, type Forecast } from './forecast';
import { score, type PlayabilityScore, type WeatherSummary } from './playability';
```

b) `HydratedCourt` interface — add a `forecast` field. Replace:
```ts
export interface HydratedCourt extends CourtSummary {
  score: PlayabilityScore | null;
  stale: boolean;
  weather: WeatherSummary | null;
}
```
with:
```ts
export interface HydratedCourt extends CourtSummary {
  score: PlayabilityScore | null;
  stale: boolean;
  weather: WeatherSummary | null;
  forecast: Forecast | null;
}
```

c) `hydrateCourts` — replace:
```ts
async function hydrateCourts(courts: CourtSummary[]): Promise<HydratedCourt[]> {
  return Promise.all(
    courts.map(async (c) => {
      try {
        const w = await fetchWeather(c.lat, c.lng);
        return { ...c, score: score(w.weather), stale: w.stale, weather: w.weather };
      } catch {
        return { ...c, score: null, stale: true, weather: null };
      }
    }),
  );
}
```
with:
```ts
async function hydrateCourts(courts: CourtSummary[]): Promise<HydratedCourt[]> {
  return Promise.all(
    courts.map(async (c) => {
      try {
        const r = await fetchForecast(c.lat, c.lng);
        const weather = weatherFromForecast(r.forecast);
        return {
          ...c,
          forecast: r.forecast,
          weather,
          score: weather ? score(weather) : null,
          stale: r.stale,
        };
      } catch {
        return { ...c, forecast: null, weather: null, score: null, stale: true };
      }
    }),
  );
}
```

- [ ] **Step 2: Update `routes/court.ts`**

Replace `server/src/routes/court.ts` entirely:

```ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { fetchForecast } from '../lib/weather';
import { weatherFromForecast } from '../lib/forecast';
import { score } from '../lib/playability';

const router = Router();

router.get('/:placeId', async (req, res, next) => {
  try {
    const court = await prisma.court.findUnique({ where: { placeId: req.params.placeId } });
    if (!court) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Court not found' } });
    }
    const r = await fetchForecast(court.lat, court.lng);
    const weather = weatherFromForecast(r.forecast);
    res.json({
      court,
      forecast: r.forecast,
      weather,
      score: weather ? score(weather) : null,
      stale: r.stale,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 3: Update `routes/weather.ts`**

Replace entirely:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { fetchForecast } from '../lib/weather';
import { weatherFromForecast } from '../lib/forecast';

const router = Router();

const querySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
});

router.get('/', async (req, res, next) => {
  try {
    const { lat, lng } = querySchema.parse(req.query);
    const r = await fetchForecast(lat, lng);
    res.json({
      forecast: r.forecast,
      weather: weatherFromForecast(r.forecast),
      stale: r.stale,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **Step 4: Update `routes/meCourts.ts` — saved courts hydration**

In `server/src/routes/meCourts.ts`:

a) Imports — replace:
```ts
import { fetchWeather } from '../lib/openweather';
import { score } from '../lib/playability';
```
with:
```ts
import { fetchForecast } from '../lib/weather';
import { weatherFromForecast } from '../lib/forecast';
import { score } from '../lib/playability';
```

b) Inside the GET handler's `hydrated` map — replace:
```ts
const w = await fetchWeather(s.court.lat, s.court.lng);
return {
  ...s.court,
  savedAt: s.createdAt,
  sport: s.sport,
  nickname: s.nickname,
  weather: w.weather,
  score: score(w.weather),
  stale: w.stale,
};
```
with:
```ts
const r = await fetchForecast(s.court.lat, s.court.lng);
const weather = weatherFromForecast(r.forecast);
return {
  ...s.court,
  savedAt: s.createdAt,
  sport: s.sport,
  nickname: s.nickname,
  forecast: r.forecast,
  weather,
  score: weather ? score(weather) : null,
  stale: r.stale,
};
```

c) The `catch` branch in the same map — replace:
```ts
return {
  ...s.court,
  savedAt: s.createdAt,
  sport: s.sport,
  nickname: s.nickname,
  weather: null,
  score: null,
  stale: true,
};
```
with:
```ts
return {
  ...s.court,
  savedAt: s.createdAt,
  sport: s.sport,
  nickname: s.nickname,
  forecast: null,
  weather: null,
  score: null,
  stale: true,
};
```

d) Inside the POST `/custom` handler's hydration block — replace:
```ts
let weather = null;
let scoreVal = null;
let stale = true;
try {
  const w = await fetchWeather(lat, lng);
  weather = w.weather;
  scoreVal = score(w.weather);
  stale = w.stale;
} catch {
  // weather may transiently fail — saving still succeeds
}

res.status(201).json({
  court: {
    ...created.court,
    savedAt: created.saved.createdAt,
    sport: created.saved.sport,
    nickname: null,
    weather,
    score: scoreVal,
    stale,
  },
});
```
with:
```ts
let forecast = null;
let weather = null;
let scoreVal = null;
let stale = true;
try {
  const r = await fetchForecast(lat, lng);
  forecast = r.forecast;
  weather = weatherFromForecast(r.forecast);
  scoreVal = weather ? score(weather) : null;
  stale = r.stale;
} catch {
  // weather may transiently fail — saving still succeeds
}

res.status(201).json({
  court: {
    ...created.court,
    savedAt: created.saved.createdAt,
    sport: created.saved.sport,
    nickname: null,
    forecast,
    weather,
    score: scoreVal,
    stale,
  },
});
```

- [ ] **Step 5: Type-check the server**

```bash
cd /Users/aheedkamil/projects/CourtCast/server && npx tsc --noEmit
```

Expected: clean — every removal of `fetchWeather` should be accounted for.

- [ ] **Step 6: Run all server tests**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server
```

Expected: all tests pass — current 41 + 3 new (forecast=3) + 4 new (openmeteo=4) + 3 new (openweather=3) + 2 new (weather=2) = 53. (Actual count may vary by 1-2 if existing OWM-shaped tests need updates; if any fail, the failure should reveal what to update.)

- [ ] **Step 7: Update `api.smoke.test.ts` to assert `forecast` keys**

The smoke tests don't actually hit a live provider (auth check is first), so existing tests stay correct. Add one new assertion-based test only if a route shape can be exercised without auth — currently no route returns weather/forecast unauth except `/api/weather` and `/api/courts` (both hit the network). Skip adding new smoke tests for now; provider tests cover correctness.

- [ ] **Step 8: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add server/src/lib/google.ts server/src/routes/court.ts server/src/routes/weather.ts server/src/routes/meCourts.ts
git commit -m "feat(server): API responses carry forecast (Forecast | null)"
```

---

## Task 6: Client — add `Forecast` types and `slotAt` helper

**Files:**
- Modify: `client/src/types.ts`
- Create: `client/src/lib/forecast.ts`

- [ ] **Step 1: Add types**

Open `client/src/types.ts`. Find:
```ts
export interface WeatherSummary {
  tempF: number;
  windMph: number;
  rainPctNext2h: number;
}
```

Insert immediately after that block:
```ts
export interface ForecastSlot {
  ts: number;       // epoch ms, top-of-hour UTC
  tempF: number;
  windMph: number;
  rainPct: number;  // 0..100
}

export interface Forecast {
  slots: ForecastSlot[];   // ascending by ts; slots[0] = current hour
  fetchedAt: number;
}
```

Find:
```ts
export interface Court {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  isCustom?: boolean;
  addedByUserId?: string | null;
  score?: PlayabilityScore | null;
  stale?: boolean;
  weather?: WeatherSummary | null;
}
```
Add `forecast?: Forecast | null;` right after the `weather` field — final shape:
```ts
export interface Court {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  isCustom?: boolean;
  addedByUserId?: string | null;
  score?: PlayabilityScore | null;
  stale?: boolean;
  weather?: WeatherSummary | null;
  forecast?: Forecast | null;
}
```

Find:
```ts
export interface SavedCourtDetail extends Court {
  savedAt: string;
  sport: Sport;
  nickname: string | null;
  weather: WeatherSummary | null;
  score: PlayabilityScore | null;
  stale: boolean;
}
```
Replace with:
```ts
export interface SavedCourtDetail extends Court {
  savedAt: string;
  sport: Sport;
  nickname: string | null;
  weather: WeatherSummary | null;
  forecast: Forecast | null;
  score: PlayabilityScore | null;
  stale: boolean;
}
```

Find:
```ts
export interface CourtDetail {
  court: Court;
  weather: WeatherSummary;
  score: PlayabilityScore;
  stale: boolean;
}
```
Replace with:
```ts
export interface CourtDetail {
  court: Court;
  weather: WeatherSummary | null;
  forecast: Forecast | null;
  score: PlayabilityScore | null;
  stale: boolean;
}
```

> Note: `weather` and `score` become nullable to match the server, which now returns `null` when slots are empty.

- [ ] **Step 2: Create `client/src/lib/forecast.ts`**

```ts
import type { Forecast, ForecastSlot } from '../types';

/**
 * Returns the slot whose `ts` is closest to `timeMs`, snapping within
 * ±30 minutes (since slots are 1h apart, any time inside the forecast
 * window will be within 30 min of the nearest slot).
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

  let closest: ForecastSlot | null = null;
  let minDiff = Infinity;
  for (const slot of forecast.slots) {
    const diff = Math.abs(slot.ts - timeMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = slot;
    }
  }
  if (minDiff > 30 * 60_000) return null; // outside window
  return closest;
}
```

- [ ] **Step 3: Type-check client**

```bash
npx --prefix /Users/aheedkamil/projects/CourtCast/client tsc --noEmit -p /Users/aheedkamil/projects/CourtCast/client/tsconfig.json
```

Expected: errors **only** in places that use `useScoreFor`, `WeatherStats`, `MapPage` pin scoring, etc. — Tasks 7-11 fix these. The new `Forecast` type itself should compile clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add client/src/types.ts client/src/lib/forecast.ts
git commit -m "feat(client): Forecast/ForecastSlot types + slotAt helper"
```

---

## Task 7: Client — `useSelectedTime` store

**Files:**
- Create: `client/src/stores/selectedTime.ts`

- [ ] **Step 1: Create the store**

```ts
import { useEffect, useState } from 'react';

const KEY = 'courtclimate.selectedTimeMs';
const CHANGED_EVENT = 'courtclimate.selectedTime.changed';

const FORECAST_WINDOW_MS = 48 * 3600_000;
const PAST_SLACK_MS = 0;
const FUTURE_SLACK_MS = 12 * 3600_000;

function readPersisted(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    const now = Date.now();
    // Drift clamp: drop anything in the past or beyond forecast window + slack.
    if (n < now - PAST_SLACK_MS) return null;
    if (n > now + FORECAST_WINDOW_MS + FUTURE_SLACK_MS) return null;
    return n;
  } catch {
    return null;
  }
}

function writePersisted(value: number | null) {
  if (typeof window === 'undefined') return;
  if (value === null) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, String(value));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * Global selected-time store. `null` means "now" (UI auto-tracks current
 * time). When set, holds an absolute epoch-ms timestamp so the choice
 * doesn't drift across midnight.
 *
 * On read, values that fall outside `[now, now + 48h + 12h]` are auto-cleared.
 * Persisted in localStorage; broadcasts on change so all consumers re-render.
 */
export function useSelectedTime(): [number | null, (next: number | null) => void] {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    setValue(readPersisted());
  }, []);

  useEffect(() => {
    const onChange = () => setValue(readPersisted());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  const update = (next: number | null) => {
    setValue(next);
    writePersisted(next);
  };

  return [value, update];
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add client/src/stores/selectedTime.ts
git commit -m "feat(client): useSelectedTime store (localStorage-backed, drift-clamped)"
```

---

## Task 8: Client — make `useScoreFor` time-aware + update `WeatherStats`

**Files:**
- Modify: `client/src/stores/thresholds.ts`
- Modify: `client/src/components/WeatherStats.tsx`

- [ ] **Step 1: Replace `useScoreFor` in `client/src/stores/thresholds.ts`**

Find the existing `useScoreFor` at the bottom of the file:

```ts
export function useScoreFor(
  weather: WeatherSummary | null | undefined,
  sport: Sport,
  fallback: PlayabilityScore | null = null,
): PlayabilityScore | null {
  const [t] = useThresholds(sport);
  if (!weather) return fallback;
  return scoreFromThresholds(weather, t);
}
```

Replace with:

```ts
export function useScoreFor(
  forecast: Forecast | null | undefined,
  sport: Sport,
  fallback: PlayabilityScore | null = null,
): PlayabilityScore | null {
  const [t] = useThresholds(sport);
  const [selectedMs] = useSelectedTime();
  if (!forecast) return fallback;
  const slot = slotAt(forecast, selectedMs);
  if (!slot) return null; // out of window
  return scoreFromThresholds(
    { tempF: slot.tempF, windMph: slot.windMph, rainPctNext2h: slot.rainPct },
    t,
  );
}
```

Imports — at the top of `thresholds.ts`, replace:
```ts
import type { PlayabilityScore, Sport, WeatherSummary } from '../types';
```
with:
```ts
import type { Forecast, PlayabilityScore, Sport, WeatherSummary } from '../types';
import { slotAt } from '../lib/forecast';
import { useSelectedTime } from './selectedTime';
```

> `WeatherSummary` is still used by `useScoreFor`'s body (we construct it inline).

- [ ] **Step 2: Update `WeatherStats` to accept `forecast`**

Replace `client/src/components/WeatherStats.tsx`:

```tsx
import type { Forecast } from '../types';
import { slotAt } from '../lib/forecast';
import { useSelectedTime } from '../stores/selectedTime';

interface Props {
  forecast: Forecast | null;
  compact?: boolean;
}

export function WeatherStats({ forecast, compact = false }: Props) {
  const [selectedMs] = useSelectedTime();
  const slot = slotAt(forecast, selectedMs);

  const stat = (label: string, value: string) => (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <span className={compact ? 'text-base font-semibold' : 'text-2xl font-semibold'}>{value}</span>
    </div>
  );

  if (!slot) {
    return (
      <div className={`grid grid-cols-3 gap-4 ${compact ? '' : 'mt-2'}`}>
        {stat('Temp', '—')}
        {stat('Wind', '—')}
        {stat('Rain', '—')}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-3 gap-4 ${compact ? '' : 'mt-2'}`}>
      {stat('Temp', `${slot.tempF}°F`)}
      {stat('Wind', `${slot.windMph} mph`)}
      {stat('Rain', `${slot.rainPct}%`)}
    </div>
  );
}
```

> `Rain (2h)` becomes just `Rain` — at hourly resolution, the "next 2h" framing no longer fits. The label change is intentional and stays consistent with the forecast slot's per-hour rain probability.

- [ ] **Step 3: Type-check client**

```bash
npx --prefix /Users/aheedkamil/projects/CourtCast/client tsc --noEmit -p /Users/aheedkamil/projects/CourtCast/client/tsconfig.json
```

Expected: errors only in `CourtPanel.tsx`, `SavedCourtCard.tsx`, `MapPage.tsx` — Tasks 9-11 fix.

- [ ] **Step 4: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add client/src/stores/thresholds.ts client/src/components/WeatherStats.tsx
git commit -m "feat(client): time-aware useScoreFor + WeatherStats"
```

---

## Task 9: Client — `<TimeScrubber />` slider component

**Files:**
- Create: `client/src/components/TimeScrubber.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useMemo } from 'react';
import { useSelectedTime } from '../stores/selectedTime';

const STEP_HOURS = 2;
const TOTAL_HOURS = 48;
const NUM_BUCKETS = TOTAL_HOURS / STEP_HOURS; // 24

function fmtReadout(timeMs: number, now: number): { primary: string; secondary: string } {
  const d = new Date(timeMs);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const targetDay = new Date(d); targetDay.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((targetDay.getTime() - todayStart.getTime()) / (24 * 3600_000));
  const dayLabel = dayDelta === 0 ? 'Today' : dayDelta === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' });
  const hour = d.getHours();
  const ampm = hour < 12 ? 'am' : 'pm';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const primary = `${dayLabel} ${hour12}${ampm}`;

  const offsetMs = timeMs - now;
  const offsetH = Math.round(offsetMs / 3600_000);
  const secondary = offsetH <= 0 ? '' : `in ${offsetH}h`;
  return { primary, secondary };
}

function dayLabelPositions(now: number): Array<{ label: string; bucket: number }> {
  // Compute the bucket index where each day starts (relative to "now").
  const result: Array<{ label: string; bucket: number }> = [{ label: 'Today', bucket: 0 }];
  for (let dayOffset = 1; dayOffset <= 2; dayOffset++) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    dayStart.setHours(0, 0, 0, 0);
    const offsetH = (dayStart.getTime() - now) / 3600_000;
    const bucket = Math.round(offsetH / STEP_HOURS);
    if (bucket > 0 && bucket < NUM_BUCKETS) {
      const label = dayOffset === 1 ? 'Tomorrow' : dayStart.toLocaleDateString(undefined, { weekday: 'short' });
      result.push({ label, bucket });
    }
  }
  return result;
}

export function TimeScrubber() {
  const [selectedMs, setSelectedMs] = useSelectedTime();
  const now = Date.now();

  const bucket = useMemo(() => {
    if (selectedMs === null) return 0;
    const offsetH = (selectedMs - now) / 3600_000;
    return Math.max(0, Math.min(NUM_BUCKETS - 1, Math.round(offsetH / STEP_HOURS)));
  }, [selectedMs, now]);

  const effectiveMs = selectedMs ?? now;
  const readout = selectedMs === null
    ? { primary: 'Now', secondary: '' }
    : fmtReadout(effectiveMs, now);

  const dayLabels = useMemo(() => dayLabelPositions(now), [now]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const b = parseInt(e.target.value, 10);
    if (b === 0) {
      setSelectedMs(null); // bucket 0 collapses to "Now"
      return;
    }
    setSelectedMs(Date.now() + b * STEP_HOURS * 3600_000);
  }

  function onNow() {
    setSelectedMs(null);
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg px-4 py-3 border border-neutral-200">
      <div className="flex items-center justify-between mb-2">
        <div className="leading-tight">
          <div className="text-sm font-bold text-neutral-900">{readout.primary}</div>
          {readout.secondary && (
            <div className="text-xs text-neutral-500">{readout.secondary}</div>
          )}
        </div>
        {selectedMs !== null && (
          <button
            onClick={onNow}
            className="text-xs font-semibold text-good hover:underline shrink-0"
          >
            Now
          </button>
        )}
      </div>

      <input
        type="range"
        min={0}
        max={NUM_BUCKETS - 1}
        step={1}
        value={bucket}
        onChange={onChange}
        aria-label="Forecast time"
        className="w-full accent-good"
      />

      <div className="relative h-3 mt-1">
        {dayLabels.map(({ label, bucket: b }) => (
          <span
            key={label}
            className="absolute text-[10px] font-semibold text-neutral-500 -translate-x-1/2"
            style={{ left: `${(b / (NUM_BUCKETS - 1)) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check client**

```bash
npx --prefix /Users/aheedkamil/projects/CourtCast/client tsc --noEmit -p /Users/aheedkamil/projects/CourtCast/client/tsconfig.json
```

Expected: same set of remaining errors from Task 8 — TimeScrubber itself compiles clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add client/src/components/TimeScrubber.tsx
git commit -m "feat(client): TimeScrubber slider component"
```

---

## Task 10: Client — update `CourtPanel` and `SavedCourtCard` to pass forecast

**Files:**
- Modify: `client/src/components/CourtPanel.tsx`
- Modify: `client/src/components/SavedCourtCard.tsx`

- [ ] **Step 1: Update `CourtPanel.tsx`**

Open `client/src/components/CourtPanel.tsx`. Find:
```tsx
const userScore = useScoreFor(detail.data?.weather, sport, detail.data?.score ?? null);
```
Replace with:
```tsx
const userScore = useScoreFor(detail.data?.forecast ?? null, sport, detail.data?.score ?? null);
```

Find the existing `<WeatherStats weather={detail.data.weather} />` call and replace with:
```tsx
<WeatherStats forecast={detail.data.forecast ?? null} />
```

Add the "Forecast for X" line. Find:
```tsx
<div className="mt-5">
  {userScore && <PlayabilityBadge score={userScore} size="lg" />}
  {detail.data.stale && (
    <p className="mt-2 text-xs text-neutral-500">Showing last cached weather.</p>
  )}
</div>
```
Replace with:
```tsx
<div className="mt-5">
  {userScore && <PlayabilityBadge score={userScore} size="lg" />}
  <ForecastLabel />
  {detail.data.stale && (
    <p className="mt-2 text-xs text-neutral-500">Showing last cached weather.</p>
  )}
</div>
```

Add the `ForecastLabel` helper at the bottom of the file (outside the `CourtPanel` export):

```tsx
function ForecastLabel() {
  const [selectedMs] = useSelectedTime();
  if (selectedMs === null) return null;
  const d = new Date(selectedMs);
  const now = Date.now();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const targetDay = new Date(d); targetDay.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((targetDay.getTime() - todayStart.getTime()) / (24 * 3600_000));
  const day = dayDelta === 0 ? 'today' : dayDelta === 1 ? 'tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase();
  const hour = d.getHours();
  const ampm = hour < 12 ? 'am' : 'pm';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return (
    <p className="mt-1 text-xs text-neutral-500">
      Forecast for {day} {hour12}{ampm}.
    </p>
  );
}
```

Add the import at the top of the file:
```tsx
import { useSelectedTime } from '../stores/selectedTime';
```

- [ ] **Step 2: Update `SavedCourtCard.tsx`**

Open `client/src/components/SavedCourtCard.tsx`. Find:
```tsx
const userScore = useScoreFor(court.weather, court.sport, court.score);
```
Replace with:
```tsx
const userScore = useScoreFor(court.forecast ?? null, court.sport, court.score);
```

If the file uses `<WeatherStats weather={...} compact />`, change it to `<WeatherStats forecast={court.forecast ?? null} compact />`. (Verify by reading the file — there may not be a stats render in the card; if there isn't, skip.)

- [ ] **Step 3: Type-check client**

```bash
npx --prefix /Users/aheedkamil/projects/CourtCast/client tsc --noEmit -p /Users/aheedkamil/projects/CourtCast/client/tsconfig.json
```

Expected: only `MapPage.tsx` errors remain (it scores pins inline).

- [ ] **Step 4: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add client/src/components/CourtPanel.tsx client/src/components/SavedCourtCard.tsx
git commit -m "feat(client): CourtPanel + SavedCourtCard read forecast (with 'Forecast for X' label)"
```

---

## Task 11: Client — MapPage pin scoring + render `<TimeScrubber />`

**Files:**
- Modify: `client/src/routes/MapPage.tsx`

- [ ] **Step 1: Update imports**

In `client/src/routes/MapPage.tsx`, replace the imports block at the top:

```tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useUi } from '../stores/ui';
import { useSport } from '../stores/sport';
import { useGeolocation } from '../hooks/useGeolocation';
import { useThresholds } from '../stores/thresholds';
import { useEnabledSports } from '../stores/enabledSports';
import { useSelectedTime } from '../stores/selectedTime';
import { slotAt } from '../lib/forecast';
import { scoreFromThresholds } from '../lib/playability';
import { MapView, type PinForMap } from '../components/MapView';
import { CourtPanel } from '../components/CourtPanel';
import { SearchBar } from '../components/SearchBar';
import { SportChips } from '../components/SportChips';
import { AddSpotFab } from '../components/AddSpotFab';
import { AddSpotSheet } from '../components/AddSpotSheet';
import { MapLegend } from '../components/MapLegend';
import { TimeScrubber } from '../components/TimeScrubber';
import type { User } from '../types';
```

- [ ] **Step 2: Replace the pin builder**

Find the `pins` const block (lines ~60-87 of the current file). Replace the entire block:

```tsx
const pins: PinForMap[] = [
  ...placesPins.map((c) => {
    const s = savedById.get(c.placeId);
    const w = s?.weather ?? c.weather ?? null;
    return {
      placeId: c.placeId,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      score: w
        ? scoreFromThresholds(w, thresholds)
        : (s?.score ?? c.score ?? null),
      isSavedForSport: !!s,
    };
  }),
  ...savedForSport
    .filter((s) => !placesPins.some((p) => p.placeId === s.placeId))
    .map((s) => ({
      placeId: s.placeId,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      score: s.weather
        ? scoreFromThresholds(s.weather, thresholds)
        : (s.score ?? null),
      isSavedForSport: true,
    })),
];
```

with:

```tsx
const [selectedMs] = useSelectedTime();

function scorePin(forecast: typeof placesPins[number]['forecast'] | null, fallback: typeof placesPins[number]['score'] | null = null) {
  const slot = slotAt(forecast ?? null, selectedMs);
  if (slot) {
    return scoreFromThresholds(
      { tempF: slot.tempF, windMph: slot.windMph, rainPctNext2h: slot.rainPct },
      thresholds,
    );
  }
  // No slot: out of window when selectedMs is set, or no forecast at all.
  return selectedMs !== null ? null : (fallback ?? null);
}

const pins: PinForMap[] = [
  ...placesPins.map((c) => {
    const s = savedById.get(c.placeId);
    return {
      placeId: c.placeId,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      score: scorePin(s?.forecast ?? c.forecast ?? null, s?.score ?? c.score ?? null),
      isSavedForSport: !!s,
    };
  }),
  ...savedForSport
    .filter((s) => !placesPins.some((p) => p.placeId === s.placeId))
    .map((s) => ({
      placeId: s.placeId,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      score: scorePin(s.forecast ?? null, s.score ?? null),
      isSavedForSport: true,
    })),
];
```

- [ ] **Step 3: Mount the scrubber**

At the end of the JSX block (just before the final `</div>`), add the scrubber. Find:

```tsx
{selectedPlaceId && !addMode && (
  <CourtPanel placeId={selectedPlaceId} user={user} onClose={() => selectCourt(null)} />
)}
```

Insert immediately before that block:

```tsx
{!addMode && (
  <div className="absolute bottom-3 left-3 right-3 z-20 pointer-events-auto">
    <TimeScrubber />
  </div>
)}
```

- [ ] **Step 4: Type-check + build client**

```bash
npx --prefix /Users/aheedkamil/projects/CourtCast/client tsc --noEmit -p /Users/aheedkamil/projects/CourtCast/client/tsconfig.json
npm run build --prefix /Users/aheedkamil/projects/CourtCast/client
```

Expected: clean tsc, vite build passes.

- [ ] **Step 5: Manual smoke test**

Start the server and client:

```bash
npm run dev --prefix /Users/aheedkamil/projects/CourtCast/server &
npm run dev --prefix /Users/aheedkamil/projects/CourtCast/client &
```

Open `http://localhost:5173`. Verify:
- Slider appears at the bottom of the map.
- Readout shows "Now" by default; "Now" reset button is hidden.
- Drag the slider — readout updates ("Tomorrow 4pm — in 26h"); pin colors recolor live.
- Click "Now" — slider snaps back; pins return to current scoring.
- Drag to the rightmost detent (~46h ahead) — scores update accordingly. Pins beyond the window go gray.

Stop the dev servers when done.

- [ ] **Step 6: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add client/src/routes/MapPage.tsx
git commit -m "feat(client): MapPage — render TimeScrubber, pin colors via slotAt"
```

---

## Task 12: Client — MyCourtsPage time pill + bottom sheet

**Files:**
- Create: `client/src/components/TimePill.tsx`
- Modify: `client/src/routes/MyCourtsPage.tsx`

- [ ] **Step 1: Create `TimePill.tsx`**

```tsx
import { useSelectedTime } from '../stores/selectedTime';

interface Props {
  onTap: () => void;
}

function fmt(timeMs: number): string {
  const d = new Date(timeMs);
  const now = Date.now();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const targetDay = new Date(d); targetDay.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((targetDay.getTime() - todayStart.getTime()) / (24 * 3600_000));
  const dayLabel = dayDelta === 0 ? 'Today' : dayDelta === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' });
  const hour = d.getHours();
  const ampm = hour < 12 ? 'am' : 'pm';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const offsetH = Math.round((timeMs - now) / 3600_000);
  return offsetH > 0
    ? `${dayLabel} ${hour12}${ampm} · in ${offsetH}h`
    : `${dayLabel} ${hour12}${ampm}`;
}

/**
 * Compact button showing the currently selected forecast time. On tap,
 * opens a bottom sheet with the slider so the user can change the time
 * without navigating to the map.
 */
export function TimePill({ onTap }: Props) {
  const [selectedMs] = useSelectedTime();
  const label = selectedMs === null ? 'Now' : fmt(selectedMs);
  return (
    <button
      onClick={onTap}
      className="inline-flex items-center gap-1.5 bg-white border border-neutral-200 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
      aria-label={`Forecast time: ${label}. Tap to change.`}
    >
      <span aria-hidden>🕒</span>
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Read `MyCourtsPage.tsx` to find insertion points**

```bash
sed -n '1,40p' /Users/aheedkamil/projects/CourtCast/client/src/routes/MyCourtsPage.tsx
```

Identify:
- The imports block.
- The header area where sport tabs live (the time pill goes above this row).
- The component's top-level state declarations (where `useState` for the sheet visibility goes).

- [ ] **Step 3: Add the time pill + sheet to `MyCourtsPage.tsx`**

Add to the imports block:
```tsx
import { useState } from 'react';
import { TimePill } from '../components/TimePill';
import { TimeScrubber } from '../components/TimeScrubber';
```
(Skip duplicate `useState` if already imported.)

At the top of the component body, add:
```tsx
const [timeSheetOpen, setTimeSheetOpen] = useState(false);
```

Locate where the saved-court list is computed. If `MyCourtsPage` renders `null` or "no saved courts" when the list is empty, the time pill should sit above the sport tabs only when there are saved courts. Conditional render based on the saved-courts-array length.

Insert this block at the top of the page's JSX (above the sport tabs):

```tsx
{savedCourts.length > 0 && (
  <div className="px-4 pt-3">
    <TimePill onTap={() => setTimeSheetOpen(true)} />
  </div>
)}
```

> Replace `savedCourts` with the actual variable name in the file (likely `saved.data?.courts ?? []` or similar — read the file first).

At the bottom of the page's JSX (just before the final closing tag), add the bottom sheet:

```tsx
{timeSheetOpen && (
  <div
    className="fixed inset-0 z-30 bg-black/30"
    onClick={() => setTimeSheetOpen(false)}
  >
    <div
      className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 sm:max-w-md sm:left-1/2 sm:-translate-x-1/2 sm:bottom-4 sm:rounded-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-neutral-900">Pick a time</h3>
        <button
          onClick={() => setTimeSheetOpen(false)}
          aria-label="Close"
          className="text-neutral-400 text-2xl leading-none"
        >
          ×
        </button>
      </div>
      <TimeScrubber />
    </div>
  </div>
)}
```

- [ ] **Step 4: Type-check + build client**

```bash
npx --prefix /Users/aheedkamil/projects/CourtCast/client tsc --noEmit -p /Users/aheedkamil/projects/CourtCast/client/tsconfig.json
npm run build --prefix /Users/aheedkamil/projects/CourtCast/client
```

Expected: clean.

- [ ] **Step 5: Manual smoke test**

Start dev servers (as in Task 11 Step 5), navigate to `/my-courts` (or whatever route mounts `MyCourtsPage`).

Verify:
- With saved courts: time pill appears at the top, shows "Now". Tap → bottom sheet opens with the scrubber. Drag → cards' badges and stats update. "Now" inside the sheet snaps back. Close (× or click outside).
- With no saved courts: pill is hidden.
- Selecting a time on the map and then navigating to /my-courts → pill shows that time and cards reflect it.

- [ ] **Step 6: Commit**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add client/src/components/TimePill.tsx client/src/routes/MyCourtsPage.tsx
git commit -m "feat(client): MyCourts — time pill + bottom-sheet TimeScrubber"
```

---

## Task 13: Final — verify, README update, scheduled-agent cancellation, push

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Final server tests + client build**

```bash
npm test --prefix /Users/aheedkamil/projects/CourtCast/server
npm run build --prefix /Users/aheedkamil/projects/CourtCast/client
```

Expected: server tests all green; client build clean.

- [ ] **Step 2: Update README — In-flight / scheduled section**

Open `README.md`. Find the "In-flight / scheduled" section. Replace its body with:

```markdown
## In-flight / scheduled

- **Open-Meteo provider — live.** As of 2026-04-29, the default weather
  provider is Open-Meteo (hourly, free, no API key). Set
  `WEATHER_PROVIDER=openweather` to fall back to OWM. The previously
  scheduled remote agent for adding Open-Meteo (routine
  `trig_01KD12VvGPQnspTqWwfNDE13`, fire date 2026-05-11) has been
  canceled because this work absorbs it.
- **Time-changer — live.** Bottom-of-map slider on the MapPage and a
  time-pill / bottom-sheet on My Courts let users scrub the next 48h
  in 2-hour increments. Pin colors, court panel, and saved-card scores
  all reflect the selected time.

## Known issues

None tracked at the moment. If something breaks, check Railway deploy
logs and `/api/health` first.
```

(Adjust if the existing structure differs — preserve the surrounding sections.)

- [ ] **Step 3: Cancel the scheduled agent**

Cancellation requires the `schedule` skill UI in Claude Code (not a shell command). When executing this plan, the human or executing agent should run `/schedule` and find the routine `trig_01KD12VvGPQnspTqWwfNDE13` in the list, then delete it. As a fallback, this can be done after the deploy by anyone with access — note in the commit message if it isn't done yet.

- [ ] **Step 4: Confirm no env files staged**

```bash
git diff --staged --name-only | grep -E '\.env$' && echo "ABORT" || echo "ok"
```

Expected: "ok".

- [ ] **Step 5: Commit README**

```bash
cd /Users/aheedkamil/projects/CourtCast
git add README.md
git commit -m "docs(readme): time-changer + Open-Meteo are live"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```

- [ ] **Step 7: Set Railway env var**

Set `WEATHER_PROVIDER=open-meteo` on Railway's server service (Railway dashboard → Service → Variables → New Variable). The default in `env.ts` is also `open-meteo`, so this is belt-and-suspenders for explicitness. Trigger a redeploy if Railway doesn't auto-redeploy from the push.

- [ ] **Step 8: Verify production**

After redeploy, visit `https://courtclimate.com`. Confirm:
- Slider appears at bottom of map.
- Pins are colored.
- Tapping a pin shows the panel with the new "Rain" stat (instead of "Rain (2h)").
- Drag → live recolor.

---

## Self-Review

**Spec coverage:**

- ✅ Provider abstraction with `WEATHER_PROVIDER` env → Task 4
- ✅ `server/src/lib/openmeteo.ts` Open-Meteo provider → Task 2
- ✅ `server/src/lib/openweather.ts` reshape → Task 3
- ✅ Provider dispatcher (`server/src/lib/weather.ts`) → Task 4
- ✅ Cancel scheduled agent + README update → Task 13
- ✅ `Forecast`/`ForecastSlot` types — server → Task 1; client → Task 6
- ✅ `weatherFromForecast` helper → Task 1
- ✅ `slotAt` helper (client) → Task 6
- ✅ Cache shape change implicitly handled by 10-min TTL → Tasks 4 + 5 (no migration step)
- ✅ API responses gain `forecast` → Task 5 (court, courts via google.ts, meCourts, weather)
- ✅ `useSelectedTime` store with localStorage + drift clamp → Task 7
- ✅ `useScoreFor(forecast, sport, fallback)` signature → Task 8
- ✅ `WeatherStats(forecast)` → Task 8
- ✅ `<TimeScrubber />` slider → Task 9
- ✅ Bucket 0 → null collapse → Task 9 (in `onChange`)
- ✅ "Now" button → Task 9
- ✅ MapPage scrubber + pin colors → Task 11
- ✅ CourtPanel updates + "Forecast for X" line → Task 10
- ✅ SavedCourtCard updates → Task 10
- ✅ MyCourtsPage time pill + bottom sheet → Task 12
- ✅ Empty-state hide for time pill → Task 12
- ✅ Edge cases (out of window, drift, provider failure, fetch failed) → handled inside `slotAt`, `useScoreFor`, `useSelectedTime`, and `fetchForecast`
- ✅ Tests: openmeteo, openweather, forecast, weather → Tasks 1-4

**Type consistency:**
- `Forecast` / `ForecastSlot` defined identically on server (Task 1) and client (Task 6).
- `slotAt` defined client-only (Task 6); used in `useScoreFor` (Task 8), `WeatherStats` (Task 8), `MapPage` (Task 11). Client-only is fine — server returns the full forecast and lets the client pick.
- `useScoreFor` signature change (Task 8) propagates to: `CourtPanel.tsx` (Task 10), `SavedCourtCard.tsx` (Task 10), `MapPage.tsx` (Task 11). All three are explicitly handled.
- `WeatherStats` prop change (Task 8): callers in `CourtPanel.tsx` (Task 10) and possibly `SavedCourtCard.tsx` (Task 10, conditional on whether the file uses it).
- `Court.forecast?: Forecast | null` and `SavedCourtDetail.forecast: Forecast | null` (Task 6) are read by Tasks 10, 11, 12.
- `useSelectedTime()` return shape `[number | null, (next: number | null) => void]` consumed by Tasks 8, 9, 10, 11, 12.

**Placeholder scan:** None.

**Migration safety:** `weatherCache` rows persisted in the old `WeatherSummary` shape will be silently ignored on read because `getCached` returns the typed payload but the new code expects `Forecast`. Read failures will trigger the `try`/`catch` in `fetchForecast` to fall through to the provider, refilling the cache. The 10-minute TTL means worst-case ~10 min of cache misses on first deploy.

**Risk: scheduled agent.** The routine `trig_01KD12VvGPQnspTqWwfNDE13` will fire on 2026-05-11 even if the README is updated, unless explicitly canceled via `/schedule`. Task 13 Step 3 covers this; verify it's actually canceled, not just documented as canceled.
