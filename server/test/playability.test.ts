import { describe, it, expect } from 'vitest';
import { score } from '../src/lib/playability';

describe('playability scoring', () => {
  const cases: Array<[string, number, number, 'GOOD' | 'OK' | 'BAD']> = [
    ['low rain low wind → GOOD', 10, 5, 'GOOD'],
    ['just under both thresholds → GOOD', 29, 11, 'GOOD'],
    ['rain at 30 → OK (boundary)', 30, 5, 'OK'],
    ['rain at 60 → OK (boundary, not BAD)', 60, 5, 'OK'],
    ['rain just over 60 → BAD', 61, 5, 'BAD'],
    ['rain way over → BAD', 95, 0, 'BAD'],
    ['wind at 12 → OK (boundary, not GOOD)', 10, 12, 'OK'],
    ['wind 18 with low rain → OK', 10, 18, 'OK'],
    ['mid-range rain → OK', 45, 8, 'OK'],
    ['high wind, low rain → OK', 0, 25, 'OK'],
    ['high rain wins over good wind → BAD', 80, 2, 'BAD'],
  ];

  for (const [label, rain, wind, expected] of cases) {
    it(label, () => {
      expect(score({ tempF: 70, windMph: wind, rainPctNext2h: rain })).toBe(expected);
    });
  }
});
