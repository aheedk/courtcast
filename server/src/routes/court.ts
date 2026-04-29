import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { fetchForecast } from '../lib/weather';
import { weatherFromForecast } from '../lib/forecast';
import { score } from '../lib/playability';

const router = Router();

router.get('/:placeId', async (req, res, next) => {
  try {
    const court = await prisma.court.findUnique({ where: { placeId: req.params.placeId } });
    if (!court) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Court not found' } });
    }
    const r = await fetchForecast(court.lat, court.lng);
    const weather = weatherFromForecast(r.forecast);
    res.json({
      court,
      forecast: r.forecast,
      weather,
      score: weather ? score(weather) : null,
      stale: r.stale,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
