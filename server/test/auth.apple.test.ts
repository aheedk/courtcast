import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

process.env.DATABASE_URL ||= 'postgresql://courtcast:courtcast@localhost:5432/courtcast?schema=public';
process.env.GOOGLE_OAUTH_CLIENT_ID ||= 'test-client-id';
process.env.APPLE_CLIENT_ID ||= 'com.courtclimate.app';
process.env.GOOGLE_PLACES_KEY ||= 'test-places-key';
process.env.OPENWEATHER_KEY ||= 'test-weather-key';

const prismaMock = {
  session: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  court: { findUnique: vi.fn().mockResolvedValue(null) },
  savedCourt: { findMany: vi.fn().mockResolvedValue([]) },
};

const verifyAppleIdentityToken = vi.fn();

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/lib/apple', () => ({ verifyAppleIdentityToken }));

let app: import('express').Express;

beforeAll(async () => {
  const { createApp } = await import('../src/app');
  app = createApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.session.findUnique.mockResolvedValue(null);
});

describe('POST /api/auth/apple', () => {
  it('creates a user and session from a verified Apple identity token', async () => {
    verifyAppleIdentityToken.mockResolvedValue({
      appleId: 'apple-user-1',
      email: 'apple@example.com',
      emailVerified: true,
    });
    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'user-1',
      appleId: 'apple-user-1',
      googleId: null,
      email: 'apple@example.com',
      name: 'Aheed Kamil',
      avatarUrl: null,
    });
    prismaMock.session.create.mockResolvedValue({ id: 'session-1' });

    const res = await request(app)
      .post('/api/auth/apple')
      .send({
        identityToken: 'valid-apple-token',
        givenName: 'Aheed',
        familyName: 'Kamil',
      });

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toContain('cc_session=session-1');
    expect(res.body.user).toEqual({
      id: 'user-1',
      email: 'apple@example.com',
      name: 'Aheed Kamil',
      avatarUrl: null,
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        appleId: 'apple-user-1',
        email: 'apple@example.com',
        name: 'Aheed Kamil',
        avatarUrl: null,
      },
    });
  });

  it('links Apple sign-in to an existing user with the same verified email', async () => {
    verifyAppleIdentityToken.mockResolvedValue({
      appleId: 'apple-user-2',
      email: 'existing@example.com',
      emailVerified: true,
    });
    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user-2',
        googleId: 'google-user-2',
        appleId: null,
        email: 'existing@example.com',
        name: 'Existing User',
        avatarUrl: 'https://example.com/avatar.png',
      });
    prismaMock.user.update.mockResolvedValue({
      id: 'user-2',
      googleId: 'google-user-2',
      appleId: 'apple-user-2',
      email: 'existing@example.com',
      name: 'Existing User',
      avatarUrl: 'https://example.com/avatar.png',
    });
    prismaMock.session.create.mockResolvedValue({ id: 'session-2' });

    const res = await request(app)
      .post('/api/auth/apple')
      .send({ identityToken: 'valid-apple-token' });

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: {
        appleId: 'apple-user-2',
        name: 'Existing User',
      },
    });
    expect(res.body.user.id).toBe('user-2');
  });

  it('rejects invalid Apple identity tokens', async () => {
    verifyAppleIdentityToken.mockRejectedValue(new Error('bad token'));

    const res = await request(app)
      .post('/api/auth/apple')
      .send({ identityToken: 'invalid-apple-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_APPLE_TOKEN');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('does not trust client-sent email when Apple token omits a verified email', async () => {
    verifyAppleIdentityToken.mockResolvedValue({
      appleId: 'apple-user-3',
      email: null,
      emailVerified: false,
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/auth/apple')
      .send({
        identityToken: 'valid-token-without-email',
        email: 'claimed@example.com',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('APPLE_EMAIL_REQUIRED');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });
});
