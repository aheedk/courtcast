import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { fetchForecast } from '../lib/weather';
import { weatherFromForecast } from '../lib/forecast';
import { score } from '../lib/playability';
import { canSeeCourt } from '../lib/visibility';

const router = Router();

router.get('/:placeId', async (req, res, next) => {
  try {
    const court = await prisma.court.findUnique({ where: { placeId: req.params.placeId } });
    if (!court || !canSeeCourt(court, req.user?.id ?? null)) {
      // 404 (not 403) so private courts don't leak their existence
      // to non-owners through the response status.
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Court not found' } });
    }
    let forecast = null;
    let weather = null;
    let scoreVal = null;
    let stale = true;
    try {
      const r = await fetchForecast(court.lat, court.lng);
      forecast = r.forecast;
      weather = weatherFromForecast(r.forecast);
      scoreVal = weather ? score(weather) : null;
      stale = r.stale;
    } catch {
      // Court details should remain usable for saving/reporting even when
      // the weather provider is temporarily unavailable.
    }
    res.json({
      court,
      forecast,
      weather,
      score: scoreVal,
      stale,
    });
  } catch (err) {
    next(err);
  }
});

const visibilitySchema = z.object({ visibility: z.enum(['public', 'private']) });

router.patch('/:placeId/visibility', requireAuth, async (req, res, next) => {
  try {
    const { placeId } = req.params;
    const { visibility } = visibilitySchema.parse(req.body);
    const userId = req.user!.id;

    const court = await prisma.court.findUnique({ where: { placeId } });
    if (!court || !canSeeCourt(court, userId)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Court not found' } });
    }
    if (!court.isCustom) {
      return res.status(400).json({
        error: { code: 'NOT_CUSTOM', message: 'Visibility only applies to custom courts' },
      });
    }
    if (court.addedByUserId !== userId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only the owner can change visibility' },
      });
    }

    // Going private: cascade-delete OTHER users' saves and list memberships
    // for this placeId in one transaction. Reports stay (read filter hides
    // them while the court is private; they re-surface if it goes public
    // again within their TTL window).
    if (visibility === 'private' && court.visibility !== 'private') {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.savedCourt.deleteMany({ where: { placeId, NOT: { userId } } });
        await tx.listMember.deleteMany({
          where: { placeId, NOT: { list: { userId } } },
        });
        return tx.court.update({ where: { placeId }, data: { visibility: 'private' } });
      });
      return res.json({ court: updated });
    }

    const updated = await prisma.court.update({
      where: { placeId },
      data: { visibility },
    });
    res.json({ court: updated });
  } catch (err) {
    next(err);
  }
});

const courtFactsSchema = z.object({
  surface: z.enum(['hard', 'clay', 'grass', 'asphalt', 'concrete', 'wood', 'turf', 'other']).nullable().optional(),
  courtCount: z.number().int().min(1).max(50).nullable().optional(),
  hasLights: z.boolean().nullable().optional(),
  indoor: z.boolean().nullable().optional(),
  access: z.enum(['free', 'paid', 'members', 'reservation', 'unknown']).nullable().optional(),
  hours: z.string().trim().max(160).nullable().optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  bookingUrl: z.string().url().max(500).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one court fact' });

router.patch('/:placeId/facts', requireAuth, async (req, res, next) => {
  try {
    const input = courtFactsSchema.parse(req.body);
    const court = await prisma.court.findUnique({ where: { placeId: req.params.placeId } });
    if (!court || !canSeeCourt(court, req.user!.id)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Court not found' } });
    }
    const current = court.facts && typeof court.facts === 'object' && !Array.isArray(court.facts)
      ? court.facts as Record<string, unknown>
      : {};
    const updated = await prisma.court.update({
      where: { placeId: court.placeId },
      data: { facts: { ...current, ...input }, factsUpdatedAt: new Date() },
    });
    res.json({ court: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
