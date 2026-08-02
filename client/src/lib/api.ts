import type {
  Court,
  CourtDetail,
  SavedCourtDetail,
  User,
  WeatherSummary,
  PlayabilityScore,
  Sport,
  ListSummary,
  ListDetail,
  CourtReport,
  OpenCourts,
  CourtCondition,
  CourtVisibility,
  CourtFacts,
  CourtChatMessage,
  AppNotification,
  NotificationPreferences,
} from '../types';
import { env } from './env';

function apiUrl(path: string): string {
  if (!env.apiBaseUrl) return path;
  return `${env.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
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
  loginWithApple: (input: {
    identityToken: string;
    email?: string | null;
    givenName?: string | null;
    familyName?: string | null;
  }) =>
    request<{ user: User }>('/api/auth/apple', { method: 'POST', body: JSON.stringify(input) }),
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

  saveCustomCourt: (input: {
    lat: number;
    lng: number;
    name: string;
    sport: Sport;
    visibility?: CourtVisibility;
  }) =>
    request<{ court: SavedCourtDetail }>('/api/me/courts/custom', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  setCourtVisibility: (placeId: string, visibility: CourtVisibility) =>
    request<{ court: Court }>(`/api/court/${placeId}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
    }),

  updateCourtFacts: (placeId: string, facts: Partial<CourtFacts>) =>
    request<{ court: Court }>(`/api/court/${placeId}/facts`, {
      method: 'PATCH',
      body: JSON.stringify(facts),
    }),

  renameSavedCourt: (placeId: string, sport: Sport, nickname: string | null) =>
    request<{ savedCourt: { placeId: string; sport: Sport; nickname: string | null } }>(
      `/api/me/courts/${placeId}?sport=${sport}`,
      { method: 'PATCH', body: JSON.stringify({ nickname }) },
    ),

  lists: () => request<{ lists: ListSummary[] }>('/api/me/lists'),
  createList: (name: string) =>
    request<{ list: ListSummary }>('/api/me/lists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  list: (id: string) => request<{ list: ListDetail }>(`/api/me/lists/${id}`),
  renameList: (id: string, name: string) =>
    request<{ list: { id: string; name: string } }>(`/api/me/lists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteList: (id: string) => request<void>(`/api/me/lists/${id}`, { method: 'DELETE' }),
  addToList: (listId: string, placeId: string, sport: Sport) =>
    request<{ member: { listId: string; placeId: string; sport: Sport } }>(
      `/api/me/lists/${listId}/members`,
      { method: 'POST', body: JSON.stringify({ placeId, sport }) },
    ),
  removeFromList: (listId: string, placeId: string, sport: Sport) =>
    request<void>(`/api/me/lists/${listId}/members/${placeId}/${sport}`, { method: 'DELETE' }),

  courtReport: (placeId: string) =>
    request<CourtReport | undefined>(`/api/places/${placeId}/report`),

  submitCourtReport: (placeId: string, input: { openCourts?: OpenCourts; condition?: CourtCondition }) =>
    request<CourtReport>(`/api/places/${placeId}/reports`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  courtReportsBatch: (placeIds: string[]) =>
    request<{ reports: Record<string, CourtReport | null> }>(`/api/places/reports/batch`, {
      method: 'POST',
      body: JSON.stringify({ placeIds }),
    }),

  courtMessages: (placeId: string) =>
    request<{ messages: CourtChatMessage[] }>(`/api/court/${placeId}/messages`),
  sendCourtMessage: (placeId: string, body: string) =>
    request<{ message: CourtChatMessage }>(`/api/court/${placeId}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  deleteCourtMessage: (placeId: string, messageId: string) =>
    request<void>(`/api/court/${placeId}/messages/${messageId}`, { method: 'DELETE' }),

  notifications: () => request<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications'),
  readNotification: (id: string) => request<void>(`/api/notifications/${id}/read`, { method: 'POST' }),
  readAllNotifications: () => request<void>('/api/notifications/read-all', { method: 'POST' }),
  notificationPreferences: () =>
    request<{ preferences: NotificationPreferences }>('/api/notifications/preferences/current'),
  updateNotificationPreferences: (preferences: Partial<NotificationPreferences>) =>
    request<{ preferences: NotificationPreferences }>('/api/notifications/preferences/current', {
      method: 'PATCH', body: JSON.stringify(preferences),
    }),
};
