export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

export type Sport =
  | 'tennis' | 'basketball' | 'pickleball'
  | 'soccer' | 'volleyball' | 'football' | 'baseball' | 'hockey'
  | 'custom';

export const SPORTS: readonly Sport[] = [
  'tennis', 'basketball', 'pickleball',
  'soccer', 'volleyball', 'football', 'baseball', 'hockey',
  'custom',
] as const;

export const SPORT_LABEL: Record<Sport, string> = {
  tennis: 'Tennis',
  basketball: 'Basketball',
  pickleball: 'Pickleball',
  soccer: 'Soccer',
  volleyball: 'Volleyball',
  football: 'Football',
  baseball: 'Baseball',
  hockey: 'Hockey',
  custom: 'Custom',
};

export const SPORT_EMOJI: Record<Sport, string> = {
  tennis: '🎾',
  basketball: '🏀',
  pickleball: '🥒',
  soccer: '⚽',
  volleyball: '🏐',
  football: '🏈',
  baseball: '⚾',
  hockey: '🏑',
  custom: '📝',
};

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export type CourtVisibility = 'public' | 'private';

export interface Court {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  isCustom?: boolean;
  addedByUserId?: string | null;
  visibility?: CourtVisibility;
  score?: PlayabilityScore | null;
  stale?: boolean;
  weather?: WeatherSummary | null;
  forecast?: Forecast | null;
}

export interface WeatherSummary {
  tempF: number;
  windMph: number;
  rainPctNext2h: number;
}

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

export type OpenCourts = 'none' | 'one' | 'two' | 'three_plus';
export type CourtCondition = 'dry' | 'little_wet' | 'unplayable';

export const OPEN_COURTS_VALUES: readonly OpenCourts[] = ['none', 'one', 'two', 'three_plus'] as const;
export const CONDITION_VALUES: readonly CourtCondition[] = ['dry', 'little_wet', 'unplayable'] as const;

export const OPEN_COURTS_LABEL: Record<OpenCourts, string> = {
  none: 'None',
  one: '1',
  two: '2',
  three_plus: '3+',
};

export const CONDITION_LABEL: Record<CourtCondition, string> = {
  dry: 'Dry',
  little_wet: 'Little wet',
  unplayable: 'Unplayable',
};

export interface CourtReport {
  openCourts: OpenCourts | null;
  condition: CourtCondition | null;
  createdAt: string; // ISO8601 from server
}

export interface SavedCourtDetail extends Court {
  savedAt: string;
  sport: Sport;
  nickname: string | null;
  weather: WeatherSummary | null;
  forecast: Forecast | null;
  score: PlayabilityScore | null;
  stale: boolean;
}

export interface CourtDetail {
  court: Court;
  weather: WeatherSummary | null;
  forecast: Forecast | null;
  score: PlayabilityScore | null;
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
