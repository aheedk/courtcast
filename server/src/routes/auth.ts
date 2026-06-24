import { Router } from 'express';
import type { CookieOptions, Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { verifyGoogleIdToken } from '../lib/google';
import { verifyAppleIdentityToken } from '../lib/apple';
import { SESSION_COOKIE, requireAuth } from '../middleware/auth';
import { isProd } from '../lib/env';

const router = Router();

const loginSchema = z.object({ idToken: z.string().min(10) });
const appleLoginSchema = z.object({
  identityToken: z.string().min(10),
  email: z.string().email().optional().nullable(),
  givenName: z.string().trim().min(1).optional().nullable(),
  familyName: z.string().trim().min(1).optional().nullable(),
});

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

function userResponse(user: {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

async function createSession(userId: string) {
  return prisma.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
    },
  });
}

function appleDisplayName(givenName?: string | null, familyName?: string | null): string | null {
  const name = [givenName, familyName].filter(Boolean).join(' ').trim();
  return name || null;
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

    const session = await createSession(user.id);

    res.cookie(SESSION_COOKIE, session.id, sessionCookieOptions(req));

    res.json({ user: userResponse(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/apple', async (req, res, next) => {
  try {
    const { identityToken, givenName, familyName } = appleLoginSchema.parse(req.body);

    let profile;
    try {
      profile = await verifyAppleIdentityToken(identityToken);
    } catch {
      return res.status(401).json({
        error: { code: 'INVALID_APPLE_TOKEN', message: 'Invalid Apple identity token' },
      });
    }

    const email = profile.emailVerified ? profile.email : null;
    const name = appleDisplayName(givenName, familyName);

    let user = await prisma.user.findUnique({
      where: { appleId: profile.appleId },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: email ?? user.email,
          name: user.name ?? name,
        },
      });
    } else if (email) {
      const existingEmailUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingEmailUser) {
        user = await prisma.user.update({
          where: { id: existingEmailUser.id },
          data: {
            appleId: profile.appleId,
            name: existingEmailUser.name ?? name,
          },
        });
      }
    }

    if (!user) {
      if (!email) {
        return res.status(400).json({
          error: { code: 'APPLE_EMAIL_REQUIRED', message: 'Apple did not provide an email for this account' },
        });
      }

      user = await prisma.user.create({
        data: {
          appleId: profile.appleId,
          email,
          name,
          avatarUrl: null,
        },
      });
    }

    const session = await createSession(user.id);
    res.cookie(SESSION_COOKIE, session.id, sessionCookieOptions(req));
    res.json({ user: userResponse(user) });
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
