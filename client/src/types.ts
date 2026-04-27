export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

export type Sport = 'tennis' | 'basketball';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball'] as const;

export const SPORT_LABEL: Record<Sport, string> = {
  tennis: 'Tennis',
  basketball: 'Basketball',
};

export const SPORT_EMOJI: Record<Sport, string> = {
  tennis: '🎾',
  basketball: '🏀',
};

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface Court {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  isCustom?: boolean;
  addedByUserId?: string | null;
}

export interface WeatherSummary {
  tempF: number;
  windMph: number;
  rainPctNext2h: number;
}

export interface SavedCourtDetail extends Court {
  savedAt: string;
  weather: WeatherSummary | null;
  score: PlayabilityScore | null;
  stale: boolean;
}

export interface CourtDetail {
  court: Court;
  weather: WeatherSummary;
  score: PlayabilityScore;
  stale: boolean;
}
