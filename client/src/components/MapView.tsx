import { useEffect, useMemo, useRef } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import type { Court } from '../types';
import { env } from '../lib/env';

interface Props {
  center: { lat: number; lng: number };
  courts: Court[];
  customCourts?: Court[];
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

export function MapView({
  center,
  courts,
  customCourts = [],
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

  // When `center` changes externally (e.g., from a Place selection), pan to it.
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
      {courts.map((c) => (
        <Marker
          key={c.placeId}
          position={{ lat: c.lat, lng: c.lng }}
          title={c.name}
          onClick={() => onSelect(c.placeId)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: c.placeId === selectedPlaceId ? 10 : 7,
            fillColor: c.placeId === selectedPlaceId ? '#16a34a' : '#171717',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          }}
        />
      ))}

      {customCourts.map((c) => (
        <Marker
          key={c.placeId}
          position={{ lat: c.lat, lng: c.lng }}
          title={c.name}
          onClick={() => onSelect(c.placeId)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: c.placeId === selectedPlaceId ? 10 : 8,
            fillColor: c.placeId === selectedPlaceId ? '#16a34a' : '#ffffff',
            fillOpacity: 1,
            strokeColor: '#16a34a',
            strokeWeight: 3,
          }}
        />
      ))}

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
