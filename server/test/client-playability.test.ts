import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, scoreFromThresholds } from '../../client/src/lib/playability';

describe('client default rain playability thresholds', () => {
  const scoreAt = (rainPctNext2h: number) => scoreFromThresholds(
    { tempF: 70, windMph: 5, rainPctNext2h },
    DEFAULT_THRESHOLDS,
  );

  it.each([
    [15, 'GOOD'],
    [16, 'OK'],
    [30, 'OK'],
    [31, 'BAD'],
  ] as const)('scores %i%% rain as %s', (rain, expected) => {
    expect(scoreAt(rain)).toBe(expected);
  });
});
