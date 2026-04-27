import { useEffect, useState } from 'react';
import { env } from '../lib/env';

interface State {
  position: { lat: number; lng: number };
  source: 'geolocation' | 'default';
  error: string | null;
}

export function useGeolocation(): State {
  const [state, setState] = useState<State>({
    position: { lat: env.defaultLat, lng: env.defaultLng },
    source: 'default',
    error: null,
  });

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          source: 'geolocation',
          error: null,
        });
      },
      (err) => {
        setState((s) => ({ ...s, error: err.message }));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  return state;
}
