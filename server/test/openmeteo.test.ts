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
