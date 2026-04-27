import { useMemo } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import type { Court } from '../types';
import { env } from '../lib/env';

interface Props {
  center: { lat: number; lng: number };
  courts: Court[];
  selectedPlaceId: string | null;
  onSelect: (placeId: string) => void;
}

const containerStyle = { width: '100%', height: '100%' };

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  styles: [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  ],
};

export function MapView({ center, courts, selectedPlaceId, onSelect }: Props) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: env.googleMapsKey,
  });

  const memoCenter = useMemo(() => center, [center.lat, center.lng]);

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
    <GoogleMap mapContainerStyle={containerStyle} center={memoCenter} zoom={13} options={mapOptions}>
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
    </GoogleMap>
  );
}
