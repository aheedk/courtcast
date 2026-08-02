import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { refreshPlayableAlerts } from '../lib/notifications';

const router = Router();
router.use(requireAuth);

function serialize(notification: any) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    placeId: notification.placeId,
    planId: notification.planId,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

router.get('/', async (req, res, next) => {
  try {
    await refreshPlayableAlerts(req.user!.id);
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.id, readAt: null },
    });
    res.json({ notifications: notifications.map(serialize), unreadCount });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const updated = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { readAt: new Date() },
    });
    if (!updated.count) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const preferenceSchema = z.object({
  playableAlerts: z.boolean().optional(),
  reportAlerts: z.boolean().optional(),
  planAlerts: z.boolean().optional(),
  chatAlerts: z.boolean().optional(),
  browserAlerts: z.boolean().optional(),
});

router.get('/preferences/current', async (req, res, next) => {
  try {
    const preferences = await prisma.notificationPreference.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id },
      update: {},
    });
    res.json({ preferences });
  } catch (err) {
    next(err);
  }
});

router.patch('/preferences/current', async (req, res, next) => {
  try {
    const input = preferenceSchema.parse(req.body);
    const preferences = await prisma.notificationPreference.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...input },
      update: input,
    });
    res.json({ preferences });
  } catch (err) {
    next(err);
  }
});

const pushSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

router.post('/push-subscriptions', async (req, res, next) => {
  try {
    const input = pushSchema.parse(req.body);
    await prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: req.user!.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
      update: {
        userId: req.user!.id,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
