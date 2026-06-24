import { Router } from 'express';
import type { CookieOptions, Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { verifyGoogleIdToken } from '../lib/google';
import { SESSION_COOKIE, requireAuth } from '../middleware/auth';
import { isProd } from '../lib/env';

const router = Router();

const loginSchema = z.object({ idToken: z.string().min(10) });

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function isNativeOrigin(req: Request): boolean {
  const origin = req.get('origin');
  return origin === 'capacitor://localhost' || origin === 'ionic://localhost';
}

function sessionCookieOptions(req: Request): CookieOptions {
  const nativeOrigin = isNativeOrigin(req);

  return {
    httpOnly: true,
    sameSite: nativeOrigin ? 'none' : 'lax',
    secure: nativeOrigin ? true : isProd,
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  };
}

function clearSessionCookieOptions(req: Request): CookieOptions {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions(req);
  return options;
}

router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = loginSchema.parse(req.body);
    const profile = await verifyGoogleIdToken(idToken);

    const user = await prisma.user.upsert({
      where: { googleId: profile.googleId },
      create: profile,
      update: { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl },
    });

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
      },
    });

    res.cookie(SESSION_COOKIE, session.id, sessionCookieOptions(req));

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    if (sessionId) {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    }
    // Match the attributes used when setting the cookie — clearCookie
    // defaults can mismatch (secure/sameSite) and leave the cookie in
    // the browser. Even if cookie removal fails, the session row is
    // already deleted above so /api/auth/me will 401 next request.
    res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
