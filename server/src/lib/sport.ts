export type Sport = 'tennis' | 'basketball' | 'pickleball' | 'custom';
export const SPORTS: readonly Sport[] = ['tennis', 'basketball', 'pickleball', 'custom'] as const;

const SPORT_KEYWORD: Record<Sport, string> = {
  tennis: 'tennis court',
  basketball: 'basketball court',
  pickleball: 'pickleball court',
  custom: '',
};

export function buildPlacesKeyword(sport: Sport, userKeyword?: string): string {
  const trimmed = (userKeyword ?? '').trim();
  return [SPORT_KEYWORD[sport], trimmed].filter(Boolean).join(' ');
}
