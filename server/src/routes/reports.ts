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
import { canSeeCourt, visibilityWhereClause } from '../lib/visibility';
import { notifyCourtWatchers } from '../lib/notifications';

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

function serializeReport(r: { openCourts: string | null; condition: string | null; createdAt: Date }) {
  return {
    openCourts: r.openCourts || null,
    condition: r.condition || null,
    createdAt: r.createdAt.toISOString(),
  };
}

function summarizeReports(rows: Array<{ openCourts: string | null; condition: string | null; createdAt: Date }>) {
  if (rows.length === 0) return null;
  const latest = serializeReport(rows[0]);
  const conditionCounts: Record<string, number> = {};
  const openCourtsCounts: Record<string, number> = {};
  for (const row of rows) {
    if (row.condition) conditionCounts[row.condition] = (conditionCounts[row.condition] ?? 0) + 1;
    if (row.openCourts) openCourtsCounts[row.openCourts] = (openCourtsCounts[row.openCourts] ?? 0) + 1;
  }
  const maxAgreement = Math.max(0, ...Object.values(conditionCounts), ...Object.values(openCourtsCounts));
  const agreementPct = rows.length ? Math.round((maxAgreement / rows.length) * 100) : 0;
  const confidence = rows.length >= 3 && agreementPct >= 67
    ? 'high'
    : rows.length >= 2
      ? 'medium'
      : 'low';
  return {
    ...latest,
    reportCount: rows.length,
    confidence,
    agreementPct,
    conditionCounts,
    openCourtsCounts,
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
    if (!court || !canSeeCourt(court, userId)) {
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

    const updateData = {
      ...(input.openCourts !== undefined ? { openCourts: input.openCourts } : {}),
      ...(input.condition !== undefined ? { condition: input.condition } : {}),
      createdAt: new Date(),
    };

    const saved = recent
      ? await prisma.courtReport.update({
          where: { id: recent.id },
          data: updateData,
        })
      : await prisma.courtReport.create({
          data: {
            placeId,
            userId,
            // Empty strings are intentionally used as the "not reported"
            // sentinel so partial reports keep working even before a live
            // database has relaxed the old NOT NULL columns.
            openCourts: input.openCourts ?? '',
            condition: input.condition ?? '',
          },
        });

    void notifyCourtWatchers({
      placeId,
      excludeUserId: userId,
      type: 'report',
      title: `Fresh status at ${court.name}`,
      body: [input.openCourts ? `${input.openCourts.replace('_', ' ')} open` : null, input.condition?.replace('_', ' ')].filter(Boolean).join(' · '),
    }).catch(() => undefined);

    res.status(201).json(serializeReport(saved));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Select open courts, conditions, or both', issues: err.issues },
      });
    }
    next(err);
  }
});

router.get('/:placeId/report', async (req, res, next) => {
  try {
    const { placeId } = req.params;
    const court = await prisma.court.findUnique({ where: { placeId } });
    if (!court || !canSeeCourt(court, req.user?.id ?? null)) {
      // 204 (same shape as "no recent report") rather than 404 so a
      // hidden private court is indistinguishable from one without
      // a recent report.
      return res.status(204).end();
    }
    const rows = await prisma.courtReport.findMany({
      where: { placeId, createdAt: { gt: freshnessCutoff() } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const summary = summarizeReports(rows);
    if (!summary) return res.status(204).end();
    res.json(summary);
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

    // First, narrow the requested placeIds down to ones the caller can
    // see. Hidden ids still get a `null` value in the response (same
    // shape as "no recent report") so we don't leak existence.
    const visibleCourts = await prisma.court.findMany({
      where: { placeId: { in: placeIds }, ...visibilityWhereClause(req.user?.id ?? null) },
      select: { placeId: true },
    });
    const visibleIds = new Set(visibleCourts.map((c) => c.placeId));

    // Pull all reports across visible places within the 24h window and
    // aggregate each court into a freshness/confidence summary.
    const rows = visibleIds.size === 0
      ? []
      : await prisma.courtReport.findMany({
          where: { placeId: { in: [...visibleIds] }, createdAt: { gt: freshnessCutoff() } },
          orderBy: { createdAt: 'desc' },
        });

    const rowsByPlaceId = new Map<string, typeof rows>();
    for (const row of rows) {
      const grouped = rowsByPlaceId.get(row.placeId) ?? [];
      grouped.push(row);
      rowsByPlaceId.set(row.placeId, grouped);
    }

    const reports: Record<string, ReturnType<typeof summarizeReports>> = {};
    for (const id of placeIds) reports[id] = summarizeReports(rowsByPlaceId.get(id) ?? []);

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
