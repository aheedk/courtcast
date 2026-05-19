import { useState } from 'react';

interface Props {
  onLocate: (pos: { lat: number; lng: number }) => void;
}

/**
 * Small floating button anchored above the AddSpotFab. Tapping it asks
 * the browser for a fresh geolocation reading (single shot, not a
 * watcher) and forwards the result to `onLocate`. The caller is
 * responsible for centering the map and rendering a marker — this
 * component is just the trigger.
 */
export function LocateMeButton({ onLocate }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = () => {
    if (!('geolocation' in navigator)) {
      setError('Location not available in this browser.');
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setBusy(false);
        setError('Location not available — enable it in your browser.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <>
      <button
        onClick={handle}
        disabled={busy}
        aria-label="Show my location"
        className="fixed bottom-44 right-4 z-30 w-11 h-11 rounded-full bg-white shadow-md border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        {/* Crosshair / locate icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </button>
      {error && (
        <div
          role="status"
          className="fixed bottom-56 right-4 z-30 max-w-[260px] bg-white border border-neutral-200 shadow-md rounded-xl px-3 py-2 text-xs text-neutral-700"
        >
          {error}
        </div>
      )}
    </>
  );
}
