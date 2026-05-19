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
  hasFreshReport?: boolean;
}

interface Props {
  center: { lat: number; lng: number };
  pins: PinForMap[];
  selectedPlaceId: string | null;
  onSelect: (placeId: string) => void;
  addMode?: boolean;
  onMapClick?: (loc: { lat: number; lng: number }) => void;
  pendingPin?: { lat: number; lng: number } | null;
  userLocation?: { lat: number; lng: number } | null;
}

const containerStyle = { width: '100%', height: '100%' };

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
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

// 5-point star path in unit space (outer radius = 1). Used both as a
// Google Maps Symbol path and as the inner path of the composite SVG
// icon. Star path extent is ~1.039 (the points), so callers need to
// pad the SVG canvas accordingly.
const STAR_PATH =
  'M 0,-1 L 0.294,-0.309 1.039,-0.309 0.445,0.118 0.618,0.809 0,0.45 -0.618,0.809 -0.445,0.118 -1.039,-0.309 -0.294,-0.309 Z';
const STAR_HALF_EXTENT = 1.039;

// A pin with a fresh community status report fills BLUE instead of its
// playability color (green/yellow/red/gray). The status report is the
// stronger near-term signal — someone just looked at the courts — so
// it overrides the model-derived playability for the pin color. The
// underlying playability is still visible by tapping the pin.
const REPORTED_FILL_COLOR = '#3b82f6';

function colorFor(score: PlayabilityScore | null): string {
  return score ? COLOR[score] : GRAY;
}

/**
 * Builds the pin icon as a single inline SVG. Encoding the playability
 * shape and the "has report" badge in the same image guarantees they
 * always render at the exact same screen pixel — the previous two-marker
 * approach used a Symbol anchor for the badge, which drifted away from
 * the parent pin at different zoom levels because Google's Symbol anchor
 * is interpreted in path coordinates (not pixels) and then re-scaled.
 *
 * Canvas is sized to fit the main shape centered plus enough overhang in
 * the upper-right corner for the badge. Anchor is the canvas center, so
 * the main shape lands exactly on the lat/lng regardless of badge state.
 */
function buildPinIcon(opts: {
  isStar: boolean;
  scale: number;
  fillColor: string;
  strokeColor: string;
  strokeWeight: number;
  isReported: boolean;
}): google.maps.Icon {
  const { isStar, scale, fillColor, strokeColor, strokeWeight, isReported } = opts;

  const effectiveFill = isReported ? REPORTED_FILL_COLOR : fillColor;

  const mainHalfExtent = (isStar ? STAR_HALF_EXTENT : 1) * scale + strokeWeight / 2;
  const canvasSize = Math.ceil(mainHalfExtent * 2 + 1); // +1 for stroke safety
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  const mainShape = isStar
    ? `<path d="${STAR_PATH}" fill="${effectiveFill}" stroke="${strokeColor}" stroke-width="${strokeWeight}" stroke-linejoin="round" vector-effect="non-scaling-stroke" transform="translate(${cx} ${cy}) scale(${scale})" />`
    : `<circle cx="${cx}" cy="${cy}" r="${scale}" fill="${effectiveFill}" stroke="${strokeColor}" stroke-width="${strokeWeight}" />`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">${mainShape}</svg>`;

  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(cx, cy),
    scaledSize: new google.maps.Size(canvasSize, canvasSize),
  };
}

// Blue navigation arrow used as the "you are here" marker. Centered on
// the captured lat/lng so the arrow's geometric center sits at the
// user's position regardless of zoom.
function buildLocateArrowIcon(): google.maps.Icon {
  const size = 26;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <path d="M12 2 L20 22 L12 17 L4 22 Z" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />
  </svg>`;
  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(size / 2, size / 2),
    scaledSize: new google.maps.Size(size, size),
  };
}

export function MapView({
  center,
  pins,
  selectedPlaceId,
  onSelect,
  addMode = false,
  onMapClick,
  pendingPin,
  userLocation,
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
        // weight — the points are mostly negative space. Scale 11 vs
        // circle's 7 keeps stars distinct without overpowering the map.
        const baseScale = p.isSavedForSport ? 11 : 7;
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
            icon={buildPinIcon({
              isStar: p.isSavedForSport,
              scale,
              fillColor: colorFor(p.score),
              strokeColor,
              strokeWeight,
              isReported: !!p.hasFreshReport,
            })}
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

      {userLocation && (
        <Marker
          position={userLocation}
          title="You are here"
          icon={buildLocateArrowIcon()}
          zIndex={1000}
        />
      )}
    </GoogleMap>
  );
}
