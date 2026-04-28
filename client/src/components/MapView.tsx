import { useEffect, useMemo, useRef } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import type { PlayabilityScore } from '../types';
import { env } from '../lib/env';

export interface PinForMap {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  score: PlayabilityScore | null;
  isSavedForSport: boolean;
}

interface Props {
  center: { lat: number; lng: number };
  pins: PinForMap[];
  selectedPlaceId: string | null;
  onSelect: (placeId: string) => void;
  addMode?: boolean;
  onMapClick?: (loc: { lat: number; lng: number }) => void;
  pendingPin?: { lat: number; lng: number } | null;
}

const containerStyle = { width: '100%', height: '100%' };

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
};

const PLACES_LIBS: ('places')[] = ['places'];

const COLOR: Record<PlayabilityScore, string> = {
  GOOD: '#16a34a',
  OK: '#eab308',
  BAD: '#dc2626',
};
const GRAY = '#737373';

// 5-point star path in unit space (outer radius = 1). With Google
// Maps Symbol `scale`, this matches CIRCLE's "scale = radius in px"
// convention so circles and stars sit at comparable visual weights.
const STAR_PATH =
  'M 0,-1 L 0.294,-0.309 1.039,-0.309 0.445,0.118 0.618,0.809 0,0.45 -0.618,0.809 -0.445,0.118 -1.039,-0.309 -0.294,-0.309 Z';

function colorFor(score: PlayabilityScore | null): string {
  return score ? COLOR[score] : GRAY;
}

export function MapView({
  center,
  pins,
  selectedPlaceId,
  onSelect,
  addMode = false,
  onMapClick,
  pendingPin,
}: Props) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: env.googleMapsKey,
    libraries: PLACES_LIBS,
  });

  const memoCenter = useMemo(() => center, [center.lat, center.lng]);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo(memoCenter);
    }
  }, [memoCenter]);

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-center text-bad">
        Failed to load Google Maps. Check VITE_GOOGLE_MAPS_KEY in client/.env.
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="w-full h-full flex items-center justify-center text-neutral-500">Loading map…</div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={memoCenter}
      zoom={13}
      options={{
        ...mapOptions,
        draggableCursor: addMode ? 'crosshair' : undefined,
      }}
      onLoad={(m) => {
        mapRef.current = m;
      }}
      onClick={(e) => {
        if (!addMode || !onMapClick || !e.latLng) return;
        onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }}
    >
      {pins.map((p) => {
        const isSelected = p.placeId === selectedPlaceId;
        // Stars need more bounding-box than circles to read at the same
        // weight — the points are mostly negative space. Bumped to 13
        // (vs circle's 7) so saved courts are unmistakably distinct.
        const baseScale = p.isSavedForSport ? 13 : 7;
        const scale = isSelected ? baseScale * 1.3 : baseScale;
        // Stars get a dark outline (white blends with pale map backgrounds);
        // circles keep their white outline (their solid fill carries them).
        const strokeColor = p.isSavedForSport ? '#171717' : '#fff';
        const strokeWeight = isSelected ? (p.isSavedForSport ? 2.5 : 3) : (p.isSavedForSport ? 1.75 : 2);
        return (
          <Marker
            key={p.placeId}
            position={{ lat: p.lat, lng: p.lng }}
            title={p.name}
            onClick={() => onSelect(p.placeId)}
            zIndex={p.isSavedForSport ? 2 : 1}
            icon={{
              path: p.isSavedForSport ? STAR_PATH : google.maps.SymbolPath.CIRCLE,
              scale,
              fillColor: colorFor(p.score),
              fillOpacity: 1,
              strokeColor,
              strokeWeight,
            }}
          />
        );
      })}

      {pendingPin && (
        <Marker
          position={pendingPin}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#16a34a',
            fillOpacity: 0.6,
            strokeColor: '#16a34a',
            strokeWeight: 3,
          }}
          animation={google.maps.Animation.DROP}
        />
      )}
    </GoogleMap>
  );
}
