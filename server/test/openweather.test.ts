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
      main: { temp: 70 + i },
      wind: { speed: 8 + i },
      pop: (i % 11) / 10,
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
