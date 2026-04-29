export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

export interface WeatherSummary {
  tempF: number;
  windMph: number;
  rainPctNext2h: number;
}

/**
 * GOOD  rain < 30 AND wind < 15
 * BAD   rain > 60 OR wind >= 25
 * OK    everything else
 *
 * Boundaries: rain==30 → not GOOD; rain==60 → not BAD; wind==15 → not GOOD;
 * wind==25 → BAD (wind uses >= so 25 mph is unplayable).
 */
export function score(weather: WeatherSummary): PlayabilityScore {
  const { rainPctNext2h, windMph } = weather;
  if (rainPctNext2h > 60 || windMph >= 25) return 'BAD';
  if (rainPctNext2h < 30 && windMph < 15) return 'GOOD';
  return 'OK';
}
