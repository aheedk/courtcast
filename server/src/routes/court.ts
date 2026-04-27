import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { fetchWeather } from '../lib/openweather';
import { score } from '../lib/playability';

const router = Router();

router.get('/:placeId', async (req, res, next) => {
  try {
    const court = await prisma.court.findUnique({ where: { placeId: req.params.placeId } });
    if (!court) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Court not found' } });
    }
    const w = await fetchWeather(court.lat, court.lng);
    res.json({
      court,
      weather: w.weather,
      score: score(w.weather),
      stale: w.stale,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
