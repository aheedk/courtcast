import type { PlayabilityScore, WeatherSummary } from '../types';

export interface Thresholds {
  rainMaxGood: number; // GOOD requires rain < this
  rainMaxOk: number;   // BAD when rain >= this
  windMaxGood: number; // GOOD requires wind < this
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  rainMaxGood: 30,
  rainMaxOk: 60,
  windMaxGood: 12,
};

export function scoreFromThresholds(
  weather: WeatherSummary,
  t: Thresholds,
): PlayabilityScore {
  if (weather.rainPctNext2h >= t.rainMaxOk) return 'BAD';
  if (weather.rainPctNext2h < t.rainMaxGood && weather.windMph < t.windMaxGood) {
    return 'GOOD';
  }
  return 'OK';
}
