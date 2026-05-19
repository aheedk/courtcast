import { OAuth2Client } from 'google-auth-library';
import { env } from './env';
import { getCached, putCached, geohashFor, TTL, PRECISION } from './cache';
import { prisma } from './prisma';
import { buildPlacesKeyword, type Sport } from './sport';
import { fetchForecast } from './weather';
import { weatherFromForecast, type Forecast } from './forecast';
import { score, type PlayabilityScore, type WeatherSummary } from './playability';
import { visibilityWhereClause } from './visibility';

const oauthClient = new OAuth2Client(env.googleOauthClientId);

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Verifies a Google ID token (issued to the browser by Google Identity
 * Services) against Google's public JWKS, asserting the audience matches
 * our OAuth client ID. Throws on any failure.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: env.googleOauthClientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google ID token payload');
  }
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  };
}

export interface CourtSummary {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
}

export interface HydratedCourt extends CourtSummary {
  score: PlayabilityScore | null;
  stale: boolean;
  weather: WeatherSummary | null;
  forecast: Forecast | null;
}

interface PlacesNearbyResponse {
  status: string;
  error_message?: string;
  results: Array<{
    place_id: string;
    name: string;
    geometry: { location: { lat: number; lng: number } };
    vicinity?: string;
  }>;
}

/**
 * Fetches nearby tennis courts from Google Places Nearby Search.
 * Cached server-side by geohash (precision 4, ~20km cell) for 7 days.
 * Each returned court is hydrated with score + stale via fetchForecast
 * (geohash-5-cached, so most calls in a small radius hit the cache).
 * On upstream Places failure, returns the stale cached metadata if
 * available (still hydrated with current weather).
 */
export async function fetchNearbyCourts(
  lat: number,
  lng: number,
  radiusMeters: number,
  sport: Sport = 'tennis',
  userKeyword?: string,
  userId: string | null = null,
): Promise<{ courts: HydratedCourt[]; stale: boolean }> {
  const keyword = buildPlacesKeyword(sport, userKeyword);
  const hasUserKeyword = !!(userKeyword && userKeyword.trim());

  // Pull custom courts that the caller is allowed to see within a rough
  // bounding box of the query center. Used to surface other users'
  // public custom courts (and the caller's own private ones) alongside
  // Google Places results. Bounding-box not great-circle distance, but
  // that's fine for an MVP — the slight slop near the radius edge is
  // invisible to the user.
  const customCourts = await fetchVisibleCustomCourtsNear(lat, lng, radiusMeters, userId);

  // No keyword → no Places query. Returns just the visible custom
  // courts so custom-mode users still see those.
  if (!keyword.trim()) {
    const hydrated = await hydrateCourts(customCourts);
    return { courts: hydrated, stale: false };
  }

  // Cache key includes sport so tennis and basketball pin sets don't collide.
  // Queries with a user keyword bypass cache (high cardinality).
  const cacheKey = `${geohashFor(lat, lng, PRECISION.places)}:${sport}`;
  const cached = hasUserKeyword
    ? null
    : await getCached<CourtSummary[]>('placesCache', cacheKey, TTL.placesMs);
  if (cached && !cached.stale) {
    const hydrated = await hydrateCourts(mergeUnique(cached.payload, customCourts));
    return { courts: hydrated, stale: false };
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', String(radiusMeters));
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('key', env.googlePlacesKey);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Places HTTP ${res.status}`);
    const data = (await res.json()) as PlacesNearbyResponse;

    // Google returns 200 even when the call is rejected (REQUEST_DENIED for
    // a key with HTTP-referrer restrictions, OVER_QUERY_LIMIT, etc.).
    // ZERO_RESULTS is a legitimate "no courts here" response — let that
    // through.
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(
        `Places API ${data.status}${data.error_message ? `: ${data.error_message}` : ''}`,
      );
    }

    const courts: CourtSummary[] = (data.results ?? []).map((r) => ({
      placeId: r.place_id,
      name: r.name,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      address: r.vicinity ?? null,
    }));

    if (!hasUserKeyword) {
      await putCached('placesCache', cacheKey, courts);
    }

    // Upsert into Court table so SavedCourt FK is always satisfiable.
    await Promise.all(
      courts.map((c) =>
        prisma.court.upsert({
          where: { placeId: c.placeId },
          create: c,
          update: { name: c.name, lat: c.lat, lng: c.lng, address: c.address, fetchedAt: new Date() },
        }),
      ),
    );

    const hydrated = await hydrateCourts(mergeUnique(courts, customCourts));
    return { courts: hydrated, stale: false };
  } catch (err) {
    if (cached) {
      const hydrated = await hydrateCourts(mergeUnique(cached.payload, customCourts));
      return { courts: hydrated, stale: true };
    }
    throw err;
  }
}

/**
 * Returns the custom courts (`isCustom = true`) the caller is allowed
 * to see within a rough lat/lng bounding box of the query center. Uses
 * the same visibility filter as the rest of the API.
 */
async function fetchVisibleCustomCourtsNear(
  lat: number,
  lng: number,
  radiusMeters: number,
  userId: string | null,
): Promise<CourtSummary[]> {
  const latDelta = radiusMeters / 111_000; // ~degrees of latitude per meter
  const cosLat = Math.cos((lat * Math.PI) / 180);
  // Guard against poles where cosLat → 0; fall back to a wide window.
  const lngDelta = cosLat > 0.01 ? latDelta / cosLat : 180;

  const rows = await prisma.court.findMany({
    where: {
      isCustom: true,
      ...visibilityWhereClause(userId),
      lat: { gte: lat - latDelta, lte: lat + latDelta },
      lng: { gte: lng - lngDelta, lte: lng + lngDelta },
    },
  });

  return rows.map((c) => ({
    placeId: c.placeId,
    name: c.name,
    lat: c.lat,
    lng: c.lng,
    address: c.address,
  }));
}

/**
 * Merge two `CourtSummary` lists, de-duping by placeId. Order: `primary`
 * first (preserving Places ordering), then any `extra` entries not
 * already present.
 */
function mergeUnique(primary: CourtSummary[], extra: CourtSummary[]): CourtSummary[] {
  const seen = new Set(primary.map((c) => c.placeId));
  const out = [...primary];
  for (const c of extra) {
    if (!seen.has(c.placeId)) {
      out.push(c);
      seen.add(c.placeId);
    }
  }
  return out;
}

async function hydrateCourts(courts: CourtSummary[]): Promise<HydratedCourt[]> {
  return Promise.all(
    courts.map(async (c) => {
      try {
        const r = await fetchForecast(c.lat, c.lng);
        const weather = weatherFromForecast(r.forecast);
        return {
          ...c,
          forecast: r.forecast,
          weather,
          score: weather ? score(weather) : null,
          stale: r.stale,
        };
      } catch {
        return { ...c, forecast: null, weather: null, score: null, stale: true };
      }
    }),
  );
}
