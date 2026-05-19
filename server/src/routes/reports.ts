import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import {
  reportInputSchema,
  REPORT_TTL_MS,
  REPORT_OVERWRITE_WINDOW_MS,
  RATE_LIMIT_PER_HOUR,
  RATE_LIMIT_WINDOW_MS,
} from '../lib/reports';

const router = Router();

// In-memory per-user submit counter. Single dyno today; if we scale out,
// this moves to Postgres or Redis (noted in spec, Assumptions section).
const userSubmits = new Map<string, number[]>();

function recordSubmitAndCheckRateLimit(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const prev = userSubmits.get(userId) ?? [];
  const recent = prev.filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_PER_HOUR) {
    userSubmits.set(userId, recent);
    return false;
  }
  recent.push(now);
  userSubmits.set(userId, recent);
  return true;
}

function serializeReport(r: { openCourts: string; condition: string; createdAt: Date }) {
  return {
    openCourts: r.openCourts,
    condition: r.condition,
    createdAt: r.createdAt.toISOString(),
  };
}

function freshnessCutoff(): Date {
  return new Date(Date.now() - REPORT_TTL_MS);
}

router.post('/:placeId/reports', requireAuth, async (req, res, next) => {
  try {
    const { placeId } = req.params;
    const input = reportInputSchema.parse(req.body);
    const userId = req.user!.id;

    const court = await prisma.court.findUnique({ where: { placeId } });
    if (!court) {
      return res.status(404).json({
        error: { code: 'COURT_UNKNOWN', message: 'Court not seen yet — open it on the map first' },
      });
    }

    if (!recordSubmitAndCheckRateLimit(userId)) {
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many reports — try again later' },
      });
    }

    // 10-minute overwrite: if the same user reported this place recently,
    // update that row instead of inserting a fresh one. Avoids stacking
    // duplicate self-reports when fat-fingering.
    const overwriteCutoff = new Date(Date.now() - REPORT_OVERWRITE_WINDOW_MS);
    const recent = await prisma.courtReport.findFirst({
      where: { userId, placeId, createdAt: { gt: overwriteCutoff } },
      orderBy: { createdAt: 'desc' },
    });

    const saved = recent
      ? await prisma.courtReport.update({
          where: { id: recent.id },
          data: { openCourts: input.openCourts, condition: input.condition, createdAt: new Date() },
        })
      : await prisma.courtReport.create({
          data: { placeId, userId, openCourts: input.openCourts, condition: input.condition },
        });

    res.status(201).json(serializeReport(saved));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid openCourts or condition', issues: err.issues },
      });
    }
    next(err);
  }
});

router.get('/:placeId/report', async (req, res, next) => {
  try {
    const { placeId } = req.params;
    const latest = await prisma.courtReport.findFirst({
      where: { placeId, createdAt: { gt: freshnessCutoff() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return res.status(204).end();
    res.json(serializeReport(latest));
  } catch (err) {
    next(err);
  }
});

const batchSchema = z.object({
  placeIds: z.array(z.string().min(1)).max(50),
});

router.post('/reports/batch', async (req, res, next) => {
  try {
    const { placeIds } = batchSchema.parse(req.body);
    if (placeIds.length === 0) {
      return res.json({ reports: {} });
    }

    // Pull all reports across the requested places within the 24h window
    // in one query, then keep only the latest per placeId. This is one
    // round-trip vs. one-per-place.
    const rows = await prisma.courtReport.findMany({
      where: { placeId: { in: placeIds }, createdAt: { gt: freshnessCutoff() } },
      orderBy: { createdAt: 'desc' },
    });

    const latestByPlaceId: Record<string, ReturnType<typeof serializeReport>> = {};
    for (const row of rows) {
      if (!latestByPlaceId[row.placeId]) {
        latestByPlaceId[row.placeId] = serializeReport(row);
      }
    }

    const reports: Record<string, ReturnType<typeof serializeReport> | null> = {};
    for (const id of placeIds) reports[id] = latestByPlaceId[id] ?? null;

    res.json({ reports });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid placeIds (max 50)', issues: err.issues },
      });
    }
    next(err);
  }
});

// Exposed for tests so the in-memory rate-limit counter can be reset
// between cases. Production callers should never use this.
export function __resetRateLimitForTests() {
  userSubmits.clear();
}

export default router;
