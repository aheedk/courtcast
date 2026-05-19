import type { Prisma } from '@prisma/client';

/**
 * Whether `user` is allowed to see `court`. Public courts are visible to
 * everyone; private courts only to their owner (the user who originally
 * added them as a custom spot).
 */
export function canSeeCourt(
  court: { visibility: string; isCustom: boolean; addedByUserId: string | null },
  userId: string | null,
): boolean {
  if (court.visibility === 'public') return true;
  if (!userId) return false;
  return court.isCustom && court.addedByUserId === userId;
}

/**
 * SQL-form of `canSeeCourt` for use as a Prisma `where` clause. Returns
 * the same set of rows that `canSeeCourt(row, userId) === true` for
 * each candidate row.
 *
 * Anonymous users see only public courts. Authed users additionally see
 * their own private custom courts.
 */
export function visibilityWhereClause(userId: string | null): Prisma.CourtWhereInput {
  if (!userId) return { visibility: 'public' };
  return {
    OR: [
      { visibility: 'public' },
      { visibility: 'private', isCustom: true, addedByUserId: userId },
    ],
  };
}
