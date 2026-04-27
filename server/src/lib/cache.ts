import ngeohash from 'ngeohash';
import { prisma } from './prisma';

type CacheTable = 'weatherCache' | 'placesCache';

interface CachedRow<T> {
  payload: T;
  fetchedAt: Date;
  stale: boolean;
}

/**
 * Look up a cached payload by geohash. Returns null if no row exists.
 * If the row exists but is past TTL, it is returned with `stale: true`
 * so the caller can decide whether to refresh in the background.
 */
export async function getCached<T>(
  table: CacheTable,
  geohash: string,
  ttlMs: number,
): Promise<CachedRow<T> | null> {
  const row = await (prisma[table] as any).findUnique({ where: { geohash } });
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.fetchedAt).getTime();
  return {
    payload: row.payload as T,
    fetchedAt: row.fetchedAt,
    stale: ageMs > ttlMs,
  };
}

export async function putCached<T>(
  table: CacheTable,
  geohash: string,
  payload: T,
): Promise<void> {
  await (prisma[table] as any).upsert({
    where: { geohash },
    create: { geohash, payload: payload as any, fetchedAt: new Date() },
    update: { payload: payload as any, fetchedAt: new Date() },
  });
}

export function geohashFor(lat: number, lng: number, precision: number): string {
  return ngeohash.encode(lat, lng, precision);
}

export const TTL = {
  weatherMs: 10 * 60 * 1000,
  placesMs: 7 * 24 * 60 * 60 * 1000,
};

export const PRECISION = {
  weather: 5,
  places: 4,
};
