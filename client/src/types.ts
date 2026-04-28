export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

export type Sport = 'tennis' | 'basketball' | 'pickleball' | 'custom';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball', 'pickleball', 'custom'] as const;

export const SPORT_LABEL: Record<Sport, string> = {
  tennis: 'Tennis',
  basketball: 'Basketball',
  pickleball: 'Pickleball',
  custom: 'Custom',
};

export const SPORT_EMOJI: Record<Sport, string> = {
  tennis: '🎾',
  basketball: '🏀',
  pickleball: '🥒',
  custom: '📝',
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
  score?: PlayabilityScore | null;
  stale?: boolean;
  weather?: WeatherSummary | null;
}

export interface WeatherSummary {
  tempF: number;
  windMph: number;
  rainPctNext2h: number;
}

export interface SavedCourtDetail extends Court {
  savedAt: string;
  sport: Sport;
  nickname: string | null;
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

export interface ListSummary {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListDetail {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: SavedCourtDetail[];
}
