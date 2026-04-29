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
