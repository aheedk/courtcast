import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

process.env.DATABASE_URL ||= 'postgresql://courtcast:courtcast@localhost:5432/courtcast?schema=public';
process.env.GOOGLE_OAUTH_CLIENT_ID ||= 'test-client-id';
process.env.GOOGLE_PLACES_KEY ||= 'test-places-key';
process.env.OPENWEATHER_KEY ||= 'test-weather-key';

// Prisma client surface used by reports.ts plus the session lookup that
// loadSession needs to populate req.user. Each method is a vi.fn so each
// test can shape its own return value.
const prismaMock = {
  session: { findUnique: vi.fn() },
  court: { findUnique: vi.fn(), findMany: vi.fn() },
  courtReport: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

let app: import('express').Express;
let resetRateLimit: () => void;

const SESSION_COOKIE = 'cc_session=test-session';
const USER_ID = 'user-1';
const PLACE_ID = 'place-1';

function authedSession() {
  prismaMock.session.findUnique.mockResolvedValue({
    id: 'test-session',
    userId: USER_ID,
    expiresAt: new Date(Date.now() + 3600_000),
    user: { id: USER_ID, email: 'u@example.com', name: 'U', avatarUrl: null },
  });
}

function courtExists(extra: Partial<{ visibility: string; isCustom: boolean; addedByUserId: string | null }> = {}) {
  prismaMock.court.findUnique.mockResolvedValue({
    placeId: PLACE_ID,
    name: 'Park',
    lat: 40,
    lng: -74,
    visibility: 'public',
    isCustom: false,
    addedByUserId: null,
    ...extra,
  });
}

beforeAll(async () => {
  const { createApp } = await import('../src/app');
  app = createApp();
  const reports = await import('../src/routes/reports');
  resetRateLimit = reports.__resetRateLimitForTests;
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimit();
});

describe('POST /api/places/:placeId/reports', () => {
  it('401 without session', async () => {
    prismaMock.session.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .send({ openCourts: 'one', condition: 'dry' });
    expect(res.status).toBe(401);
  });

  it('400 on unknown openCourts value', async () => {
    authedSession();
    courtExists();
    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({ openCourts: 'five', condition: 'dry' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('400 on unknown condition value', async () => {
    authedSession();
    courtExists();
    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({ openCourts: 'one', condition: 'flooded' });
    expect(res.status).toBe(400);
  });

  it('400 when both fields missing', async () => {
    authedSession();
    courtExists();
    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({});
    expect(res.status).toBe(400);
  });

  it('404 when court is unknown', async () => {
    authedSession();
    prismaMock.court.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({ openCourts: 'one', condition: 'dry' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('COURT_UNKNOWN');
  });

  it('201 creates a new report when no recent one exists', async () => {
    authedSession();
    courtExists();
    prismaMock.courtReport.findFirst.mockResolvedValue(null);
    prismaMock.courtReport.create.mockResolvedValue({
      id: 'r1',
      openCourts: 'one',
      condition: 'dry',
      createdAt: new Date('2026-05-18T12:00:00Z'),
    });

    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({ openCourts: 'one', condition: 'dry' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      openCourts: 'one',
      condition: 'dry',
      createdAt: '2026-05-18T12:00:00.000Z',
    });
    expect(prismaMock.courtReport.create).toHaveBeenCalledOnce();
    expect(prismaMock.courtReport.update).not.toHaveBeenCalled();
  });

  it('201 creates a report with only open courts selected', async () => {
    authedSession();
    courtExists();
    prismaMock.courtReport.findFirst.mockResolvedValue(null);
    prismaMock.courtReport.create.mockResolvedValue({
      id: 'r1',
      openCourts: 'two',
      condition: null,
      createdAt: new Date('2026-05-18T12:00:00Z'),
    });

    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({ openCourts: 'two' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      openCourts: 'two',
      condition: null,
      createdAt: '2026-05-18T12:00:00.000Z',
    });
    expect(prismaMock.courtReport.create).toHaveBeenCalledWith({
      data: {
        placeId: PLACE_ID,
        userId: USER_ID,
        openCourts: 'two',
        condition: null,
      },
    });
  });

  it('201 creates a report with only conditions selected', async () => {
    authedSession();
    courtExists();
    prismaMock.courtReport.findFirst.mockResolvedValue(null);
    prismaMock.courtReport.create.mockResolvedValue({
      id: 'r1',
      openCourts: null,
      condition: 'little_wet',
      createdAt: new Date('2026-05-18T12:00:00Z'),
    });

    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({ condition: 'little_wet' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      openCourts: null,
      condition: 'little_wet',
      createdAt: '2026-05-18T12:00:00.000Z',
    });
    expect(prismaMock.courtReport.create).toHaveBeenCalledWith({
      data: {
        placeId: PLACE_ID,
        userId: USER_ID,
        openCourts: null,
        condition: 'little_wet',
      },
    });
  });

  it('201 updates the existing row when the same user reported within the 10-min window', async () => {
    authedSession();
    courtExists();
    prismaMock.courtReport.findFirst.mockResolvedValue({
      id: 'r1',
      placeId: PLACE_ID,
      userId: USER_ID,
      openCourts: 'one',
      condition: 'dry',
      createdAt: new Date(Date.now() - 60_000), // 1 minute ago
    });
    prismaMock.courtReport.update.mockResolvedValue({
      id: 'r1',
      openCourts: 'three_plus',
      condition: 'little_wet',
      createdAt: new Date('2026-05-18T12:05:00Z'),
    });

    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({ openCourts: 'three_plus', condition: 'little_wet' });

    expect(res.status).toBe(201);
    expect(res.body.openCourts).toBe('three_plus');
    expect(prismaMock.courtReport.update).toHaveBeenCalledOnce();
    expect(prismaMock.courtReport.create).not.toHaveBeenCalled();
  });

  it('201 updates only the selected field on recent self-reports', async () => {
    authedSession();
    courtExists();
    prismaMock.courtReport.findFirst.mockResolvedValue({
      id: 'r1',
      placeId: PLACE_ID,
      userId: USER_ID,
      openCourts: 'one',
      condition: 'dry',
      createdAt: new Date(Date.now() - 60_000),
    });
    prismaMock.courtReport.update.mockResolvedValue({
      id: 'r1',
      openCourts: 'three_plus',
      condition: 'dry',
      createdAt: new Date('2026-05-18T12:05:00Z'),
    });

    const res = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({ openCourts: 'three_plus' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      openCourts: 'three_plus',
      condition: 'dry',
      createdAt: '2026-05-18T12:05:00.000Z',
    });
    expect(prismaMock.courtReport.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        openCourts: 'three_plus',
        createdAt: expect.any(Date),
      },
    });
  });

  it('429 when the per-user hourly rate limit is exceeded', async () => {
    authedSession();
    courtExists();
    prismaMock.courtReport.findFirst.mockResolvedValue(null);
    prismaMock.courtReport.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'r', ...args.data, createdAt: new Date() }),
    );

    // 30 reports should succeed; the 31st returns 429.
    for (let i = 0; i < 30; i++) {
      const res = await request(app)
        .post(`/api/places/${PLACE_ID}/reports`)
        .set('Cookie', SESSION_COOKIE)
        .send({ openCourts: 'one', condition: 'dry' });
      expect(res.status).toBe(201);
    }
    const blocked = await request(app)
      .post(`/api/places/${PLACE_ID}/reports`)
      .set('Cookie', SESSION_COOKIE)
      .send({ openCourts: 'one', condition: 'dry' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('GET /api/places/:placeId/report', () => {
  it('returns the latest report when one exists within the 24h window', async () => {
    courtExists();
    prismaMock.courtReport.findFirst.mockResolvedValue({
      openCourts: 'two',
      condition: 'dry',
      createdAt: new Date('2026-05-18T11:00:00Z'),
    });
    const res = await request(app).get(`/api/places/${PLACE_ID}/report`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      openCourts: 'two',
      condition: 'dry',
      createdAt: '2026-05-18T11:00:00.000Z',
    });
    // The query filters by createdAt > cutoff, so the test verifies the
    // route is asking prisma for *fresh* rows specifically.
    const args = prismaMock.courtReport.findFirst.mock.calls[0][0];
    expect(args.where.placeId).toBe(PLACE_ID);
    expect(args.where.createdAt).toBeDefined();
  });

  it('204 when no fresh report exists', async () => {
    courtExists();
    prismaMock.courtReport.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/api/places/${PLACE_ID}/report`);
    expect(res.status).toBe(204);
  });

  it('204 when the court is private and the caller is not the owner', async () => {
    // No session → anonymous caller.
    prismaMock.session.findUnique.mockResolvedValue(null);
    prismaMock.court.findUnique.mockResolvedValue({
      placeId: PLACE_ID,
      visibility: 'private',
      isCustom: true,
      addedByUserId: 'someone-else',
      name: 'Hidden',
      lat: 0,
      lng: 0,
    });
    const res = await request(app).get(`/api/places/${PLACE_ID}/report`);
    expect(res.status).toBe(204);
    // The report findFirst should not have been called — visibility check
    // short-circuits before the DB hit.
    expect(prismaMock.courtReport.findFirst).not.toHaveBeenCalled();
  });
});

describe('POST /api/places/reports/batch', () => {
  it('returns a record of placeId → latest report or null for each requested id', async () => {
    // All three places are public/visible.
    prismaMock.court.findMany.mockResolvedValue([
      { placeId: 'p1' }, { placeId: 'p2' }, { placeId: 'p3' },
    ]);
    prismaMock.courtReport.findMany.mockResolvedValue([
      {
        placeId: 'p1',
        openCourts: 'one',
        condition: 'dry',
        createdAt: new Date('2026-05-18T11:00:00Z'),
      },
      // p1 has an older row too — should be ignored because findMany is
      // ordered DESC and the route keeps the first match per placeId.
      {
        placeId: 'p1',
        openCourts: 'none',
        condition: 'unplayable',
        createdAt: new Date('2026-05-18T10:00:00Z'),
      },
      {
        placeId: 'p2',
        openCourts: 'three_plus',
        condition: 'little_wet',
        createdAt: new Date('2026-05-18T11:30:00Z'),
      },
      // p3 has no rows in the response → null in output.
    ]);

    const res = await request(app)
      .post('/api/places/reports/batch')
      .send({ placeIds: ['p1', 'p2', 'p3'] });

    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual({
      p1: { openCourts: 'one', condition: 'dry', createdAt: '2026-05-18T11:00:00.000Z' },
      p2: { openCourts: 'three_plus', condition: 'little_wet', createdAt: '2026-05-18T11:30:00.000Z' },
      p3: null,
    });
  });

  it('returns empty reports object for empty input', async () => {
    const res = await request(app).post('/api/places/reports/batch').send({ placeIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual({});
  });

  it('400 when more than 50 placeIds are requested', async () => {
    const placeIds = Array.from({ length: 51 }, (_, i) => `p${i}`);
    const res = await request(app).post('/api/places/reports/batch').send({ placeIds });
    expect(res.status).toBe(400);
  });

  it('hides private courts from non-owners (key present, value null)', async () => {
    // Only p1 is visible to the anonymous caller; p2 is private to someone else.
    prismaMock.session.findUnique.mockResolvedValue(null);
    prismaMock.court.findMany.mockResolvedValue([{ placeId: 'p1' }]);
    prismaMock.courtReport.findMany.mockResolvedValue([
      {
        placeId: 'p1',
        openCourts: 'one',
        condition: 'dry',
        createdAt: new Date('2026-05-18T11:00:00Z'),
      },
    ]);

    const res = await request(app)
      .post('/api/places/reports/batch')
      .send({ placeIds: ['p1', 'p2'] });

    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual({
      p1: { openCourts: 'one', condition: 'dry', createdAt: '2026-05-18T11:00:00.000Z' },
      p2: null,
    });
  });
});
