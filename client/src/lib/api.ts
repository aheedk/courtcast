import type { Court, CourtDetail, SavedCourtDetail, User, WeatherSummary, PlayabilityScore, Sport } from '../types';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignore */ }
    const err = new Error(`API ${res.status} ${res.statusText}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  loginWithGoogle: (idToken: string) =>
    request<{ user: User }>('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  nearbyCourts: (lat: number, lng: number, sport: Sport, keyword?: string, radius?: number) => {
    const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), sport });
    if (keyword) qs.set('keyword', keyword);
    if (radius) qs.set('radius', String(radius));
    return request<{ courts: Court[]; stale: boolean }>(`/api/courts?${qs}`);
  },

  weather: (lat: number, lng: number) =>
    request<{ weather: WeatherSummary; stale: boolean }>(
      `/api/weather?lat=${lat}&lng=${lng}`,
    ),

  playability: (lat: number, lng: number) =>
    request<{ score: PlayabilityScore; weather: WeatherSummary; stale: boolean }>(
      `/api/playability?lat=${lat}&lng=${lng}`,
    ),

  court: (placeId: string) => request<CourtDetail>(`/api/court/${placeId}`),

  savedCourts: () => request<{ courts: SavedCourtDetail[] }>('/api/me/courts'),

  saveCourt: (placeId: string, sport: Sport) =>
    request<{ savedCourt: { placeId: string; sport: Sport; savedAt: string } }>('/api/me/courts', {
      method: 'POST',
      body: JSON.stringify({ placeId, sport }),
    }),

  unsaveCourt: (placeId: string, sport?: Sport) => {
    const qs = sport ? `?sport=${sport}` : '';
    return request<void>(`/api/me/courts/${placeId}${qs}`, { method: 'DELETE' });
  },

  saveCustomCourt: (input: { lat: number; lng: number; name: string; sport: Sport }) =>
    request<{ court: SavedCourtDetail }>('/api/me/courts/custom', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
