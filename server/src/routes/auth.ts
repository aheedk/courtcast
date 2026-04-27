import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { verifyGoogleIdToken } from '../lib/google';
import { SESSION_COOKIE, requireAuth } from '../middleware/auth';
import { isProd } from '../lib/env';

const router = Router();

const loginSchema = z.object({ idToken: z.string().min(10) });

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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

    res.cookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: SESSION_MAX_AGE_MS,
      path: '/',
    });

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
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
