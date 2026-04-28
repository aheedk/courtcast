export type Sport =
  | 'tennis' | 'basketball' | 'pickleball'
  | 'soccer' | 'volleyball' | 'football' | 'baseball' | 'hockey'
  | 'custom';

export const SPORTS: readonly Sport[] = [
  'tennis', 'basketball', 'pickleball',
  'soccer', 'volleyball', 'football', 'baseball', 'hockey',
  'custom',
] as const;

const SPORT_KEYWORD: Record<Sport, string> = {
  tennis: 'tennis court',
  basketball: 'basketball court',
  pickleball: 'pickleball court',
  soccer: 'soccer field',
  volleyball: 'volleyball court',
  football: 'football field',
  baseball: 'baseball field',
  hockey: 'hockey rink',
  custom: '',
};

export function buildPlacesKeyword(sport: Sport, userKeyword?: string): string {
  const trimmed = (userKeyword ?? '').trim();
  return [SPORT_KEYWORD[sport], trimmed].filter(Boolean).join(' ');
}
