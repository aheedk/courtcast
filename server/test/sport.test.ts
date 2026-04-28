import { describe, it, expect } from 'vitest';
import { buildPlacesKeyword, SPORTS } from '../src/lib/sport';

describe('buildPlacesKeyword', () => {
  it('tennis no keyword → "tennis court"', () => {
    expect(buildPlacesKeyword('tennis')).toBe('tennis court');
  });
  it('basketball no keyword → "basketball court"', () => {
    expect(buildPlacesKeyword('basketball')).toBe('basketball court');
  });
  it('pickleball no keyword → "pickleball court"', () => {
    expect(buildPlacesKeyword('pickleball')).toBe('pickleball court');
  });
  it('soccer no keyword → "soccer field"', () => {
    expect(buildPlacesKeyword('soccer')).toBe('soccer field');
  });
  it('volleyball no keyword → "volleyball court"', () => {
    expect(buildPlacesKeyword('volleyball')).toBe('volleyball court');
  });
  it('football no keyword → "football field"', () => {
    expect(buildPlacesKeyword('football')).toBe('football field');
  });
  it('baseball no keyword → "baseball field"', () => {
    expect(buildPlacesKeyword('baseball')).toBe('baseball field');
  });
  it('hockey no keyword → "hockey rink"', () => {
    expect(buildPlacesKeyword('hockey')).toBe('hockey rink');
  });
  it('custom no keyword → ""', () => {
    expect(buildPlacesKeyword('custom')).toBe('');
  });
  it('soccer + "indoor" → "soccer field indoor"', () => {
    expect(buildPlacesKeyword('soccer', 'indoor')).toBe('soccer field indoor');
  });
  it('SPORTS array exposes all nine in fixed order', () => {
    expect(SPORTS).toEqual([
      'tennis', 'basketball', 'pickleball',
      'soccer', 'volleyball', 'football', 'baseball', 'hockey',
      'custom',
    ]);
  });
});
