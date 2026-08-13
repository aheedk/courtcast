export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

export interface WeatherSummary {
  tempF: number;
  windMph: number;
  rainPctNext2h: number;
  apparentTempF?: number;
  humidityPct?: number;
  windGustMph?: number;
  uvIndex?: number;
}

/**
 * GOOD  rain <= 15 AND wind < 15
 * BAD   rain > 30 OR wind >= 25
 * OK    everything else
 *
 * Boundaries: rain==15 -> GOOD; rain==30 -> not BAD; wind==15 -> not GOOD;
 * wind==25 -> BAD.
 */
export function score(weather: WeatherSummary): PlayabilityScore {
  const { rainPctNext2h, windMph, apparentTempF, windGustMph } = weather;
  if (
    rainPctNext2h > 30 ||
    windMph >= 25 ||
    (windGustMph !== undefined && windGustMph >= 35) ||
    (apparentTempF !== undefined && apparentTempF >= 105)
  ) return 'BAD';
  if (rainPctNext2h <= 15 && windMph < 15) return 'GOOD';
  return 'OK';
}
