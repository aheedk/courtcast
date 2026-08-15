import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPORTS as CLIENT_SPORTS,
  SPORT_EMOJI,
  SPORT_LABEL,
} from '../../client/src/types';
import { readEnabledSports } from '../../client/src/stores/enabledSports';

const PRE_GOLF_DEFAULT = [
  'tennis', 'pickleball', 'basketball',
  'soccer', 'volleyball', 'baseball', 'football', 'hockey',
  'custom',
];

function useStoredSports(sports: string[]) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: () => JSON.stringify(sports),
    },
  });
}

describe('client sports', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists Golf directly after Soccer with a label and icon', () => {
    const sports = CLIENT_SPORTS as readonly string[];
    expect(sports.indexOf('golf')).toBe(sports.indexOf('soccer') + 1);
    expect((SPORT_LABEL as Record<string, string>).golf).toBe('Golf');
    expect((SPORT_EMOJI as Record<string, string>).golf).toBe('⛳');
  });

  it('adds Golf to the previous untouched full sport list', () => {
    useStoredSports(PRE_GOLF_DEFAULT);

    expect(readEnabledSports()).toEqual([
      'tennis', 'pickleball', 'basketball',
      'soccer', 'golf', 'volleyball', 'baseball', 'football', 'hockey',
      'custom',
    ]);
  });

  it('preserves an intentionally customized sport subset', () => {
    useStoredSports(['tennis', 'soccer']);

    expect(readEnabledSports()).toEqual(['tennis', 'soccer']);
  });
});
