import { useEffect, useState } from 'react';

const KEY = 'courtclimate.selectedTimeMs';
const CHANGED_EVENT = 'courtclimate.selectedTime.changed';

const FORECAST_WINDOW_MS = 48 * 3600_000;
const PAST_SLACK_MS = 0;
const FUTURE_SLACK_MS = 12 * 3600_000;

function readPersisted(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    const now = Date.now();
    // Drift clamp: drop anything in the past or beyond forecast window + slack.
    if (n < now - PAST_SLACK_MS) return null;
    if (n > now + FORECAST_WINDOW_MS + FUTURE_SLACK_MS) return null;
    return n;
  } catch {
    return null;
  }
}

function writePersisted(value: number | null) {
  if (typeof window === 'undefined') return;
  if (value === null) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, String(value));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * Global selected-time store. `null` means "now" (UI auto-tracks current
 * time). When set, holds an absolute epoch-ms timestamp so the choice
 * doesn't drift across midnight.
 *
 * On read, values that fall outside `[now, now + 48h + 12h]` are auto-cleared.
 * Persisted in localStorage; broadcasts on change so all consumers re-render.
 */
export function useSelectedTime(): [number | null, (next: number | null) => void] {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    setValue(readPersisted());
  }, []);

  useEffect(() => {
    const onChange = () => setValue(readPersisted());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);

  const update = (next: number | null) => {
    setValue(next);
    writePersisted(next);
  };

  return [value, update];
}
