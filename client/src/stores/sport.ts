import { useEffect, useState } from 'react';
import type { Sport } from '../types';
import { SPORTS } from '../types';
import { readEnabledSports } from './enabledSports';

const KEY = 'courtclimate.sport';
const ENABLED_CHANGED = 'courtclimate.enabledSports.changed';

function readRaw(): Sport {
  if (typeof window === 'undefined') return 'tennis';
  const v = window.localStorage.getItem(KEY);
  return (SPORTS as readonly string[]).includes(v as Sport) ? (v as Sport) : 'tennis';
}

function readClamped(): Sport {
  const stored = readRaw();
  const enabled = readEnabledSports();
  if (enabled.includes(stored)) return stored;
  return enabled[0] ?? 'tennis';
}

export function useSport(): [Sport, (s: Sport) => void] {
  const [sport, setSportState] = useState<Sport>('tennis');

  useEffect(() => {
    setSportState(readClamped());
  }, []);

  useEffect(() => {
    const onChange = () => setSportState(readClamped());
    window.addEventListener(ENABLED_CHANGED, onChange);
    return () => window.removeEventListener(ENABLED_CHANGED, onChange);
  }, []);

  const setSport = (s: Sport) => {
    setSportState(s);
    window.localStorage.setItem(KEY, s);
  };

  return [sport, setSport];
}
