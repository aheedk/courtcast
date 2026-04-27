import { OAuth2Client } from 'google-auth-library';
import { env } from './env';
import { getCached, putCached, geohashFor, TTL, PRECISION } from './cache';
import { prisma } from './prisma';

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
 * On upstream failure, returns a stale cached row if available.
 */
export async function fetchNearbyCourts(
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<{ courts: CourtSummary[]; stale: boolean }> {
  const geohash = geohashFor(lat, lng, PRECISION.places);
  const cached = await getCached<CourtSummary[]>('placesCache', geohash, TTL.placesMs);
  if (cached && !cached.stale) {
    return { courts: cached.payload, stale: false };
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', String(radiusMeters));
    url.searchParams.set('keyword', 'tennis court');
    url.searchParams.set('type', 'park');
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

    await putCached('placesCache', geohash, courts);

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

    return { courts, stale: false };
  } catch (err) {
    if (cached) return { courts: cached.payload, stale: true };
    throw err;
  }
}
