import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { fetchWeather } from '../lib/openweather';
import { score } from '../lib/playability';
import { SPORTS } from '../lib/sport';

const router = Router();
router.use(requireAuth);

const sportEnum = z.enum(SPORTS as unknown as [string, ...string[]]);
const nameSchema = z.string().trim().min(1).max(60);

router.get('/', async (req, res, next) => {
  try {
    const lists = await prisma.list.findMany({
      where: { userId: req.user!.id },
      include: { _count: { select: { members: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        memberCount: l._count.members,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = nameSchema.parse(req.body?.name);
    const list = await prisma.list.create({
      data: { userId: req.user!.id, name },
    });
    res.status(201).json({
      list: {
        id: list.id,
        name: list.name,
        memberCount: 0,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const list = await prisma.list.findFirst({
      where: { id: req.params.id, userId },
      include: { members: { orderBy: { createdAt: 'desc' } } },
    });
    if (!list) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found' } });
    }

    const hydrated = await Promise.all(
      list.members.map(async (m) => {
        const saved = await prisma.savedCourt.findUnique({
          where: { userId_placeId_sport: { userId, placeId: m.placeId, sport: m.sport } },
          include: { court: true },
        });
        if (!saved) return null;
        try {
          const w = await fetchWeather(saved.court.lat, saved.court.lng);
          return {
            ...saved.court,
            savedAt: saved.createdAt,
            sport: saved.sport,
            nickname: saved.nickname,
            weather: w.weather,
            score: score(w.weather),
            stale: w.stale,
          };
        } catch {
          return {
            ...saved.court,
            savedAt: saved.createdAt,
            sport: saved.sport,
            nickname: saved.nickname,
            weather: null,
            score: null,
            stale: true,
          };
        }
      }),
    );

    res.json({
      list: {
        id: list.id,
        name: list.name,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        members: hydrated.filter(Boolean),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const name = nameSchema.parse(req.body?.name);
    const updated = await prisma.list.updateMany({
      where: { id: req.params.id, userId },
      data: { name },
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found' } });
    }
    const list = await prisma.list.findUnique({ where: { id: req.params.id } });
    res.json({ list: { id: list!.id, name: list!.name } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.list.deleteMany({
      where: { id: req.params.id, userId: req.user!.id },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const memberSchema = z.object({
  placeId: z.string().min(1),
  sport: sportEnum,
});

router.post('/:id/members', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { placeId, sport } = memberSchema.parse(req.body);

    const list = await prisma.list.findFirst({ where: { id: req.params.id, userId } });
    if (!list) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found' } });
    }

    const saved = await prisma.savedCourt.findUnique({
      where: { userId_placeId_sport: { userId, placeId, sport } },
    });
    if (!saved) {
      return res.status(404).json({
        error: { code: 'COURT_NOT_SAVED', message: 'Save the court first' },
      });
    }

    const member = await prisma.listMember.upsert({
      where: { listId_placeId_sport: { listId: list.id, placeId, sport } },
      create: { listId: list.id, placeId, sport },
      update: {},
    });

    await prisma.list.update({ where: { id: list.id }, data: { updatedAt: new Date() } });

    res.status(201).json({ member: { listId: member.listId, placeId, sport } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:placeId/:sport', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const sport = sportEnum.parse(req.params.sport);

    const list = await prisma.list.findFirst({ where: { id: req.params.id, userId } });
    if (!list) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found' } });
    }

    await prisma.listMember.deleteMany({
      where: { listId: list.id, placeId: req.params.placeId, sport },
    });
    await prisma.list.update({ where: { id: list.id }, data: { updatedAt: new Date() } });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
