import { Router } from 'express';
import { z } from 'zod';
import { fetchNearbyCourts } from '../lib/google';
import { env } from '../lib/env';
import { SPORTS } from '../lib/sport';

const router = Router();

const querySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  radius: z.coerce.number().int().positive().max(50000).optional(),
  sport: z.enum(SPORTS as unknown as [string, ...string[]]).optional(),
  keyword: z.string().trim().max(60).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { lat, lng, radius, sport, keyword } = querySchema.parse(req.query);
    const result = await fetchNearbyCourts(
      lat,
      lng,
      radius ?? env.defaultRadiusMeters,
      (sport as 'tennis' | 'basketball' | undefined) ?? 'tennis',
      keyword,
    );
    res.json({ courts: result.courts, stale: result.stale });
  } catch (err) {
    next(err);
  }
});

export default router;
