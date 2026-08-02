import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { fetchForecast } from '../lib/weather';
import { weatherFromForecast } from '../lib/forecast';
import { score } from '../lib/playability';
import { refreshPlayableAlerts } from '../lib/notifications';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    await refreshPlayableAlerts(req.user!.id);
    const [saved, unreadCount] = await Promise.all([
      prisma.savedCourt.findMany({ where: { userId: req.user!.id }, include: { court: true }, distinct: ['placeId'], take: 5 }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);
    const courts = await Promise.all(saved.map(async ({ court }) => {
      try {
        const { forecast, stale } = await fetchForecast(court.lat, court.lng);
        const weather = weatherFromForecast(forecast);
        const nextGood = forecast.slots.find((slot) => score({ tempF: slot.tempF, windMph: slot.windMph, rainPctNext2h: slot.rainPct, apparentTempF: slot.apparentTempF, windGustMph: slot.windGustMph }) === 'GOOD');
        return { placeId: court.placeId, name: court.name, score: weather ? score(weather) : null, weather, nextGoodAt: nextGood?.ts ?? null, stale };
      } catch {
        return { placeId: court.placeId, name: court.name, score: null, weather: null, nextGoodAt: null, stale: true };
      }
    }));
    res.set('Cache-Control', 'private, max-age=300');
    res.json({
      generatedAt: new Date().toISOString(),
      courts,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
