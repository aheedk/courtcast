import { Router } from 'express';
import { z } from 'zod';
import { fetchForecast } from '../lib/weather';
import { weatherFromForecast } from '../lib/forecast';
import { score } from '../lib/playability';

const router = Router();

const querySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
});

router.get('/', async (req, res, next) => {
  try {
    const { lat, lng } = querySchema.parse(req.query);
    const r = await fetchForecast(lat, lng);
    const weather = weatherFromForecast(r.forecast);
    res.json({
      score: weather ? score(weather) : null,
      weather,
      forecast: r.forecast,
      stale: r.stale,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
