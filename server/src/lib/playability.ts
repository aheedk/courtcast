export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

export interface WeatherSummary {
  tempF: number;
  windMph: number;
  rainPctNext2h: number;
}

/**
 * GOOD  rain < 30 AND wind < 12
 * BAD   rain > 60
 * OK    everything else
 *
 * Boundaries: rain==30 → not GOOD; rain==60 → not BAD; wind==12 → not GOOD.
 */
export function score(weather: WeatherSummary): PlayabilityScore {
  const { rainPctNext2h, windMph } = weather;
  if (rainPctNext2h > 60) return 'BAD';
  if (rainPctNext2h < 30 && windMph < 12) return 'GOOD';
  return 'OK';
}
