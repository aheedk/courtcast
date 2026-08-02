import { prisma } from './prisma';
import { fetchForecast } from './weather';
import { weatherFromForecast } from './forecast';
import { score } from './playability';

export type NotificationType = 'playable' | 'report' | 'plan' | 'chat';

interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  placeId?: string | null;
  planId?: string | null;
  dedupeKey?: string | null;
}

export async function notifyUser(input: NotificationInput) {
  const data = {
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    placeId: input.placeId ?? null,
    planId: input.planId ?? null,
    dedupeKey: input.dedupeKey ?? null,
  };

  if (data.dedupeKey) {
    return prisma.notification.upsert({
      where: { dedupeKey: data.dedupeKey },
      create: data,
      update: {},
    });
  }
  return prisma.notification.create({ data });
}

interface CourtWatcherInput {
  placeId: string;
  excludeUserId?: string;
  type: Extract<NotificationType, 'report' | 'chat'>;
  title: string;
  body: string;
}

export async function notifyCourtWatchers(input: CourtWatcherInput): Promise<void> {
  const saves = await prisma.savedCourt.findMany({
    where: {
      placeId: input.placeId,
      ...(input.excludeUserId ? { NOT: { userId: input.excludeUserId } } : {}),
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  const userIds = saves.map((save) => save.userId);
  if (userIds.length === 0) return;

  const preferences = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds } },
  });
  const byUser = new Map(preferences.map((pref) => [pref.userId, pref]));
  const recipients = userIds.filter((userId) => {
    const pref = byUser.get(userId);
    if (input.type === 'report') return pref?.reportAlerts ?? true;
    return pref?.chatAlerts ?? false;
  });
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      placeId: input.placeId,
    })),
  });
}

/**
 * Opportunistically evaluates a user's saved courts when their inbox/widget
 * refreshes. The hourly dedupe key makes this safe to call from both routes;
 * a hosted scheduler can call the same function later for true background push.
 */
export async function refreshPlayableAlerts(userId: string): Promise<void> {
  const preferences = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (preferences && !preferences.playableAlerts) return;
  const saves = await prisma.savedCourt.findMany({
    where: { userId },
    include: { court: true },
    distinct: ['placeId'],
    take: 8,
  });
  const hourKey = new Date().toISOString().slice(0, 13);
  await Promise.all(saves.map(async ({ court }) => {
    try {
      const { forecast } = await fetchForecast(court.lat, court.lng);
      const weather = weatherFromForecast(forecast);
      if (!weather || score(weather) !== 'GOOD') return;
      await notifyUser({
        userId,
        type: 'playable',
        title: `${court.name} is playable now`,
        body: `${weather.tempF}°F · ${weather.windMph} mph wind · ${weather.rainPctNext2h}% rain`,
        placeId: court.placeId,
        dedupeKey: `playable:${userId}:${court.placeId}:${hourKey}`,
      });
    } catch {
      // One upstream weather failure should not make the inbox unavailable.
    }
  }));
}
