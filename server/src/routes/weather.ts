import { Router } from 'express';
import { z } from 'zod';
import { fetchWeather } from '../lib/openweather';

const router = Router();

const querySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
});

router.get('/', async (req, res, next) => {
  try {
    const { lat, lng } = querySchema.parse(req.query);
    const result = await fetchWeather(lat, lng);
    res.json({ weather: result.weather, stale: result.stale });
  } catch (err) {
    next(err);
  }
});

export default router;
