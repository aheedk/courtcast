import { describe, it, expect } from 'vitest';
import { buildPlacesKeyword, SPORTS } from '../src/lib/sport';

describe('buildPlacesKeyword', () => {
  it('tennis no keyword → "tennis court"', () => {
    expect(buildPlacesKeyword('tennis')).toBe('tennis court');
  });
  it('basketball no keyword → "basketball court"', () => {
    expect(buildPlacesKeyword('basketball')).toBe('basketball court');
  });
  it('tennis + "public" → "tennis court public"', () => {
    expect(buildPlacesKeyword('tennis', 'public')).toBe('tennis court public');
  });
  it('basketball + "  indoor  " trims → "basketball court indoor"', () => {
    expect(buildPlacesKeyword('basketball', '  indoor  ')).toBe('basketball court indoor');
  });
  it('empty string keyword treated as no keyword', () => {
    expect(buildPlacesKeyword('tennis', '')).toBe('tennis court');
  });
  it('SPORTS array exposes both', () => {
    expect(SPORTS).toEqual(['tennis', 'basketball']);
  });
});
