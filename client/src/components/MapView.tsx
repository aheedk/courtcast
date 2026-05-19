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

const BADGE_RADIUS = 4;
const BADGE_STROKE = 1.5;
const BADGE_EDGE_PAD = 1;
const BADGE_COLOR = '#3b82f6';

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
  withBadge: boolean;
}): google.maps.Icon {
  const { isStar, scale, fillColor, strokeColor, strokeWeight, withBadge } = opts;

  // How far the main shape reaches from its center (including stroke).
  const mainHalfExtent = (isStar ? STAR_HALF_EXTENT : 1) * scale + strokeWeight / 2;
  // Extra room the badge needs past the main shape's bounding box.
  const badgeOverhang = withBadge ? BADGE_RADIUS + BADGE_STROKE / 2 + BADGE_EDGE_PAD : 0;
  const halfSize = mainHalfExtent + badgeOverhang;
  const canvasSize = Math.ceil(halfSize * 2);
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  const mainShape = isStar
    ? `<path d="${STAR_PATH}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWeight}" stroke-linejoin="round" vector-effect="non-scaling-stroke" transform="translate(${cx} ${cy}) scale(${scale})" />`
    : `<circle cx="${cx}" cy="${cy}" r="${scale}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWeight}" />`;

  const badge = withBadge
    ? `<circle cx="${canvasSize - BADGE_RADIUS - BADGE_EDGE_PAD}" cy="${BADGE_RADIUS + BADGE_EDGE_PAD}" r="${BADGE_RADIUS}" fill="${BADGE_COLOR}" stroke="#fff" stroke-width="${BADGE_STROKE}" />`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">${mainShape}${badge}</svg>`;

  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(cx, cy),
    scaledSize: new google.maps.Size(canvasSize, canvasSize),
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
              withBadge: !!p.hasFreshReport,
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
    </GoogleMap>
  );
}
