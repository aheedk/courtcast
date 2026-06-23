import { z } from 'zod';

export const OPEN_COURTS_VALUES = ['none', 'one', 'two', 'three_plus'] as const;
export const CONDITION_VALUES = ['dry', 'little_wet', 'unplayable'] as const;

export type OpenCourts = (typeof OPEN_COURTS_VALUES)[number];
export type CourtCondition = (typeof CONDITION_VALUES)[number];

export const reportInputSchema = z.object({
  openCourts: z.enum(OPEN_COURTS_VALUES).optional(),
  condition: z.enum(CONDITION_VALUES).optional(),
}).refine(
  (input) => input.openCourts !== undefined || input.condition !== undefined,
  { message: 'Select open courts or conditions' },
);

export type ReportInput = z.infer<typeof reportInputSchema>;

// Reports older than this are filtered out on read. Rows stay in the DB —
// just hidden from API responses. 24h matches the brainstorming decision.
export const REPORT_TTL_MS = 24 * 60 * 60 * 1000;

// When the same user re-submits within this window, the existing row is
// updated in place rather than a new one being inserted. Cheap "fat-finger
// fix" path; avoids stacking duplicate self-reports.
export const REPORT_OVERWRITE_WINDOW_MS = 10 * 60 * 1000;

// Global per-user submit cap: at most this many POSTs per hour across all
// places. Cheap defense against an authed user spamming. Single-dyno deploy
// today so an in-memory counter is correct (see Out-of-scope in spec).
export const RATE_LIMIT_PER_HOUR = 30;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
