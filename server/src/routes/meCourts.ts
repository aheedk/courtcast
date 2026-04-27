import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { fetchWeather } from '../lib/openweather';
import { score } from '../lib/playability';

const router = Router();

router.use(requireAuth);

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
          const w = await fetchWeather(s.court.lat, s.court.lng);
          return {
            ...s.court,
            savedAt: s.createdAt,
            weather: w.weather,
            score: score(w.weather),
            stale: w.stale,
          };
        } catch {
          return {
            ...s.court,
            savedAt: s.createdAt,
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

const addSchema = z.object({ placeId: z.string().min(1) });

router.post('/', async (req, res, next) => {
  try {
    const { placeId } = addSchema.parse(req.body);

    const court = await prisma.court.findUnique({ where: { placeId } });
    if (!court) {
      return res.status(404).json({
        error: { code: 'COURT_UNKNOWN', message: 'Court not seen yet — open it on the map first' },
      });
    }

    const saved = await prisma.savedCourt.upsert({
      where: { userId_placeId: { userId: req.user!.id, placeId } },
      create: { userId: req.user!.id, placeId },
      update: {},
    });

    res.status(201).json({ savedCourt: { placeId: saved.placeId, savedAt: saved.createdAt } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:placeId', async (req, res, next) => {
  try {
    await prisma.savedCourt.deleteMany({
      where: { userId: req.user!.id, placeId: req.params.placeId },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
