import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { fetchForecast } from '../lib/weather';
import { weatherFromForecast } from '../lib/forecast';
import { score } from '../lib/playability';
import { SPORTS } from '../lib/sport';

const router = Router();

router.use(requireAuth);

const sportEnum = z.enum(SPORTS as unknown as [string, ...string[]]);

router.get('/', async (req, res, next) => {
  try {
    const saved = await prisma.savedCourt.findMany({
      where: { userId: req.user!.id },
      include: { court: true },
      orderBy: { createdAt: 'desc' },
    });

    const hydrated = await Promise.all(
      saved.map(async (s) => {
        try {
          const r = await fetchForecast(s.court.lat, s.court.lng);
          const weather = weatherFromForecast(r.forecast);
          return {
            ...s.court,
            savedAt: s.createdAt,
            sport: s.sport,
            nickname: s.nickname,
            forecast: r.forecast,
            weather,
            score: weather ? score(weather) : null,
            stale: r.stale,
          };
        } catch {
          return {
            ...s.court,
            savedAt: s.createdAt,
            sport: s.sport,
            nickname: s.nickname,
            forecast: null,
            weather: null,
            score: null,
            stale: true,
          };
        }
      }),
    );

    res.json({ courts: hydrated });
  } catch (err) {
    next(err);
  }
});

const addSchema = z.object({
  placeId: z.string().min(1),
  sport: sportEnum,
});

router.post('/', async (req, res, next) => {
  try {
    const { placeId, sport } = addSchema.parse(req.body);

    const court = await prisma.court.findUnique({ where: { placeId } });
    if (!court) {
      return res.status(404).json({
        error: { code: 'COURT_UNKNOWN', message: 'Court not seen yet — open it on the map first' },
      });
    }

    const saved = await prisma.savedCourt.upsert({
      where: { userId_placeId_sport: { userId: req.user!.id, placeId, sport } },
      create: { userId: req.user!.id, placeId, sport },
      update: {},
    });

    res.status(201).json({
      savedCourt: { placeId: saved.placeId, sport: saved.sport, savedAt: saved.createdAt },
    });
  } catch (err) {
    next(err);
  }
});

const customSchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  name: z.string().trim().min(1).max(80),
  sport: sportEnum,
});

router.post('/custom', async (req, res, next) => {
  try {
    const { lat, lng, name, sport } = customSchema.parse(req.body);
    const userId = req.user!.id;

    const placeId = `custom:${userId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const created = await prisma.$transaction(async (tx) => {
      const court = await tx.court.create({
        data: { placeId, name, lat, lng, isCustom: true, addedByUserId: userId },
      });
      const saved = await tx.savedCourt.create({
        data: { userId, placeId: court.placeId, sport },
      });
      return { court, saved };
    });

    let forecast = null;
    let weather = null;
    let scoreVal = null;
    let stale = true;
    try {
      const r = await fetchForecast(lat, lng);
      forecast = r.forecast;
      weather = weatherFromForecast(r.forecast);
      scoreVal = weather ? score(weather) : null;
      stale = r.stale;
    } catch {
      // weather may transiently fail — saving still succeeds
    }

    res.status(201).json({
      court: {
        ...created.court,
        savedAt: created.saved.createdAt,
        sport: created.saved.sport,
        nickname: null,
        forecast,
        weather,
        score: scoreVal,
        stale,
      },
    });
  } catch (err) {
    next(err);
  }
});

const sportRequiredQuery = z.object({ sport: sportEnum });
const sportOptionalQuery = z.object({ sport: sportEnum.optional() });

const patchSchema = z.object({ nickname: z.string().trim().max(80).nullable() });

router.patch('/:placeId', async (req, res, next) => {
  try {
    const { sport } = sportRequiredQuery.parse(req.query);
    const userId = req.user!.id;
    const { placeId } = req.params;
    const { nickname } = patchSchema.parse(req.body);
    const cleaned = nickname && nickname.trim() ? nickname.trim() : null;

    const updated = await prisma.savedCourt
      .update({
        where: { userId_placeId_sport: { userId, placeId, sport } },
        data: { nickname: cleaned },
      })
      .catch(() => null);

    if (!updated) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Saved court not found' },
      });
    }
    res.json({ savedCourt: { placeId, sport, nickname: updated.nickname } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:placeId', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { placeId } = req.params;
    const { sport } = sportOptionalQuery.parse(req.query);

    const where = sport ? { userId, placeId, sport } : { userId, placeId };

    await prisma.savedCourt.deleteMany({ where });

    // Also clean up any list memberships pointing at this saved entry,
    // for any list this user owns.
    await prisma.listMember.deleteMany({
      where: {
        list: { userId },
        placeId,
        ...(sport ? { sport } : {}),
      },
    });

    // If the court is a user-owned custom one with no remaining saves, drop it.
    const court = await prisma.court.findUnique({ where: { placeId } });
    if (court?.isCustom && court.addedByUserId === userId) {
      const remaining = await prisma.savedCourt.count({ where: { placeId } });
      if (remaining === 0) {
        await prisma.court.delete({ where: { placeId } });
      }
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
