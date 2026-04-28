import { useEffect, useState } from 'react';
import { SPORTS, type Sport } from '../types';

const KEY = 'courtclimate.enabledSports';
const CHANGED_EVENT = 'courtclimate.enabledSports.changed';

const DEFAULT_ENABLED: readonly Sport[] = ['tennis', 'basketball', 'pickleball', 'custom'];

export function readEnabledSports(): Sport[] {
  if (typeof window === 'undefined') return [...DEFAULT_ENABLED];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [...DEFAULT_ENABLED];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT_ENABLED];
    const set = new Set(arr.filter((s): s is Sport => SPORTS.includes(s)));
    if (set.size === 0) return [...DEFAULT_ENABLED];
    return SPORTS.filter((s) => set.has(s));
  } catch {
    return [...DEFAULT_ENABLED];
  }
}

export function useEnabledSports(): [Sport[], (next: Sport[]) => void] {
  const [v, setV] = useState<Sport[]>([...DEFAULT_ENABLED]);

  useEffect(() => {
    setV(readEnabledSports());
  }, []);

  useEffect(() => {
    const onChange = () => setV(readEnabledSports());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  const update = (next: Sport[]) => {
    const ordered = SPORTS.filter((s) => next.includes(s));
    const safe = ordered.length > 0 ? ordered : [...DEFAULT_ENABLED];
    setV(safe);
    window.localStorage.setItem(KEY, JSON.stringify(safe));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  };

  return [v, update];
}

export function toggleSport(sport: Sport, enabled: Sport[]): Sport[] {
  if (enabled.includes(sport)) {
    if (enabled.length === 1) return enabled; // min-1 invariant
    return enabled.filter((s) => s !== sport);
  }
  return [...enabled, sport];
}
