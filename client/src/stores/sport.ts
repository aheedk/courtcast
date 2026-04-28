import { useEffect, useState } from 'react';
import type { Sport } from '../types';
import { SPORTS } from '../types';

const KEY = 'courtclimate.sport';

function read(): Sport {
  if (typeof window === 'undefined') return 'tennis';
  const v = window.localStorage.getItem(KEY);
  return (SPORTS as readonly string[]).includes(v as Sport) ? (v as Sport) : 'tennis';
}

export function useSport(): [Sport, (s: Sport) => void] {
  const [sport, setSportState] = useState<Sport>('tennis');

  useEffect(() => {
    setSportState(read());
  }, []);

  const setSport = (s: Sport) => {
    setSportState(s);
    window.localStorage.setItem(KEY, s);
  };

  return [sport, setSport];
}
