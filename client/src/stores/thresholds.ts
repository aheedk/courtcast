import { useEffect, useState } from 'react';
import type { PlayabilityScore, WeatherSummary } from '../types';
import { DEFAULT_THRESHOLDS, scoreFromThresholds, type Thresholds } from '../lib/playability';

const KEY = 'courtclimate.thresholds';
const CHANGED_EVENT = 'courtclimate.thresholds.changed';

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function read(): Thresholds {
  if (typeof window === 'undefined') return DEFAULT_THRESHOLDS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const parsed = JSON.parse(raw);
    return {
      rainMaxGood: clampInt(parsed.rainMaxGood, 0, 60, DEFAULT_THRESHOLDS.rainMaxGood),
      rainMaxOk: clampInt(parsed.rainMaxOk, 30, 100, DEFAULT_THRESHOLDS.rainMaxOk),
      windMaxGood: clampInt(parsed.windMaxGood, 0, 25, DEFAULT_THRESHOLDS.windMaxGood),
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function useThresholds(): [Thresholds, (next: Thresholds) => void, () => void] {
  const [t, setT] = useState<Thresholds>(DEFAULT_THRESHOLDS);

  useEffect(() => {
    setT(read());
  }, []);

  useEffect(() => {
    const onChange = () => setT(read());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  const update = (next: Thresholds) => {
    setT(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  };

  const reset = () => update(DEFAULT_THRESHOLDS);

  return [t, update, reset];
}

export function useScoreFor(
  weather: WeatherSummary | null | undefined,
  fallback: PlayabilityScore | null = null,
): PlayabilityScore | null {
  const [t] = useThresholds();
  if (!weather) return fallback;
  return scoreFromThresholds(weather, t);
}
