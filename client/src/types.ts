export type PlayabilityScore = 'GOOD' | 'OK' | 'BAD';

export type Sport =
  | 'tennis' | 'basketball' | 'pickleball'
  | 'soccer' | 'golf' | 'volleyball' | 'football' | 'baseball' | 'hockey'
  | 'custom';

export const SPORTS: readonly Sport[] = [
  'tennis', 'pickleball', 'basketball',
  'soccer', 'golf', 'volleyball', 'baseball', 'football', 'hockey',
  'custom',
] as const;

export const SPORT_LABEL: Record<Sport, string> = {
  tennis: 'Tennis',
  basketball: 'Basketball',
  pickleball: 'Pickleball',
  soccer: 'Soccer',
  golf: 'Golf',
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
  golf: '⛳',
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
  facts?: CourtFacts | null;
  factsUpdatedAt?: string | null;
}

export interface CourtFacts {
  surface?: 'hard' | 'clay' | 'grass' | 'asphalt' | 'concrete' | 'wood' | 'turf' | 'other' | null;
  courtCount?: number | null;
  hasLights?: boolean | null;
  indoor?: boolean | null;
  access?: 'free' | 'paid' | 'members' | 'reservation' | 'unknown' | null;
  hours?: string | null;
  amenities?: string[];
  bookingUrl?: string | null;
}

export interface WeatherSummary {
  tempF: number;
  windMph: number;
  rainPctNext2h: number;
  apparentTempF?: number;
  humidityPct?: number;
  windGustMph?: number;
  uvIndex?: number;
}

export interface ForecastSlot {
  ts: number;       // epoch ms, top-of-hour UTC
  tempF: number;
  windMph: number;
  rainPct: number;  // 0..100
  apparentTempF?: number;
  humidityPct?: number;
  windGustMph?: number;
  precipitationIn?: number;
  uvIndex?: number;
  solarRadiationWm2?: number;
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
  reportCount?: number;
  confidence?: 'low' | 'medium' | 'high';
  agreementPct?: number;
  conditionCounts?: Partial<Record<CourtCondition, number>>;
  openCourtsCounts?: Partial<Record<OpenCourts, number>>;
}

export interface CourtChatMessage {
  id: string;
  placeId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  user: Pick<User, 'id' | 'name' | 'avatarUrl'>;
}

export interface AppNotification {
  id: string;
  type: 'playable' | 'report' | 'plan' | 'chat' | string;
  title: string;
  body: string;
  placeId: string | null;
  planId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  playableAlerts: boolean;
  reportAlerts: boolean;
  chatAlerts: boolean;
  browserAlerts: boolean;
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
