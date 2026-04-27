import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

// Stub env before importing the app so env.ts doesn't blow up in CI/local
// without a real .env file.
process.env.DATABASE_URL ||= 'postgresql://courtcast:courtcast@localhost:5432/courtcast?schema=public';
process.env.GOOGLE_OAUTH_CLIENT_ID ||= 'test-client-id';
process.env.GOOGLE_PLACES_KEY ||= 'test-places-key';
process.env.OPENWEATHER_KEY ||= 'test-weather-key';

// Stub the prisma client so the app can boot without a live DB.
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    session: { findUnique: vi.fn().mockResolvedValue(null) },
    court: { findUnique: vi.fn().mockResolvedValue(null) },
    savedCourt: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

let app: import('express').Express;

beforeAll(async () => {
  const { createApp } = await import('../src/app');
  app = createApp();
});

describe('api smoke', () => {
  it('GET /api/health → 200 ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /api/me → 401 without session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /api/me/courts → 401 without session', async () => {
    const res = await request(app).get('/api/me/courts');
    expect(res.status).toBe(401);
  });

  it('POST /api/me/courts/custom → 401 without session', async () => {
    const res = await request(app)
      .post('/api/me/courts/custom')
      .send({ lat: 40, lng: -74, name: 'Backyard' });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/me/courts/:placeId → 401 without session', async () => {
    const res = await request(app).delete('/api/me/courts/somePlaceId');
    expect(res.status).toBe(401);
  });

  it('GET /api/courts with bad lat → 400', async () => {
    const res = await request(app).get('/api/courts?lat=999&lng=0');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('GET /api/courts with bad sport → 400', async () => {
    const res = await request(app).get('/api/courts?lat=40&lng=-74&sport=hockey');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('GET /api/unknown → 404', async () => {
    const res = await request(app).get('/api/this-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
