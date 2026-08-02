import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { canSeeCourt } from '../lib/visibility';
import { notifyCourtWatchers } from '../lib/notifications';

const router = Router();

function serializeMessage(message: any) {
  return {
    id: message.id,
    placeId: message.placeId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    user: message.user,
  };
}

router.get('/:placeId/messages', async (req, res, next) => {
  try {
    const court = await prisma.court.findUnique({ where: { placeId: req.params.placeId } });
    if (!court || !canSeeCourt(court, req.user?.id ?? null)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Court not found' } });
    }
    const before = typeof req.query.before === 'string' ? new Date(req.query.before) : null;
    const messages = await prisma.courtChatMessage.findMany({
      where: {
        placeId: court.placeId,
        ...(before && Number.isFinite(before.getTime()) ? { createdAt: { lt: before } } : {}),
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ messages: messages.reverse().map(serializeMessage) });
  } catch (err) {
    next(err);
  }
});

const messageSchema = z.object({ body: z.string().trim().min(1).max(500) });

router.post('/:placeId/messages', requireAuth, async (req, res, next) => {
  try {
    const { body } = messageSchema.parse(req.body);
    const court = await prisma.court.findUnique({ where: { placeId: req.params.placeId } });
    if (!court || !canSeeCourt(court, req.user!.id)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Court not found' } });
    }
    const message = await prisma.courtChatMessage.create({
      data: { placeId: court.placeId, userId: req.user!.id, body },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    void notifyCourtWatchers({
      placeId: court.placeId,
      excludeUserId: req.user!.id,
      type: 'chat',
      title: `New message at ${court.name}`,
      body: `${req.user!.name ?? 'Someone'}: ${body.slice(0, 120)}`,
    }).catch(() => undefined);
    res.status(201).json({ message: serializeMessage(message) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:placeId/messages/:messageId', requireAuth, async (req, res, next) => {
  try {
    const deleted = await prisma.courtChatMessage.deleteMany({
      where: { id: req.params.messageId, placeId: req.params.placeId, userId: req.user!.id },
    });
    if (!deleted.count) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
