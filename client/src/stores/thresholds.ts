import { useEffect, useState } from 'react';
import type { PlayabilityScore, Sport, WeatherSummary } from '../types';
import { SPORTS } from '../types';
import { DEFAULT_THRESHOLDS, scoreFromThresholds, type Thresholds } from '../lib/playability';

const KEY = 'courtclimate.thresholds.bySport';
const CHANGED_EVENT = 'courtclimate.thresholds.changed';

type ThresholdsBySport = Record<Sport, Thresholds>;

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampThresholds(t: unknown): Thresholds {
  const raw = (t && typeof t === 'object') ? (t as Partial<Thresholds>) : {};
  return {
    rainMaxGood: clampInt(raw.rainMaxGood, 0, 60, DEFAULT_THRESHOLDS.rainMaxGood),
    rainMaxOk: clampInt(raw.rainMaxOk, 30, 100, DEFAULT_THRESHOLDS.rainMaxOk),
    windMaxGood: clampInt(raw.windMaxGood, 0, 25, DEFAULT_THRESHOLDS.windMaxGood),
  };
}

function defaultMap(): ThresholdsBySport {
  return Object.fromEntries(SPORTS.map((s) => [s, { ...DEFAULT_THRESHOLDS }])) as ThresholdsBySport;
}

function readAll(): ThresholdsBySport {
  const out = defaultMap();
  if (typeof window === 'undefined') return out;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return out;
    for (const sport of SPORTS) {
      if (sport in parsed) {
        out[sport] = clampThresholds((parsed as Record<string, unknown>)[sport]);
      }
    }
    return out;
  } catch {
    return out;
  }
}

function writeAll(map: ThresholdsBySport) {
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function useThresholds(sport: Sport): [Thresholds, (next: Thresholds) => void, () => void] {
  const [all, setAll] = useState<ThresholdsBySport>(defaultMap);

  useEffect(() => {
    setAll(readAll());
  }, []);

  useEffect(() => {
    const onChange = () => setAll(readAll());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  const t = all[sport] ?? { ...DEFAULT_THRESHOLDS };

  const update = (next: Thresholds) => {
    const merged: ThresholdsBySport = { ...all, [sport]: next };
    setAll(merged);
    writeAll(merged);
  };

  const reset = () => update({ ...DEFAULT_THRESHOLDS });

  return [t, update, reset];
}

export function useScoreFor(
  weather: WeatherSummary | null | undefined,
  sport: Sport,
  fallback: PlayabilityScore | null = null,
): PlayabilityScore | null {
  const [t] = useThresholds(sport);
  if (!weather) return fallback;
  return scoreFromThresholds(weather, t);
}
