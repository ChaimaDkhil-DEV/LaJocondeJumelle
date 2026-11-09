import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PushSubscriptionsCleanupJob } from '../../src/scheduler/push-subscriptions-cleanup.job';
import { seedDemo, userId } from '../utils/auth-helpers';
import { fixedNow } from '../utils/clock';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

const DAY = 24 * 3_600_000;

/** 014, T061 (D8, FR-011) : un abonnement inutilisé depuis plus de 90 jours est supprimé ; les autres restent. */
describe('PushSubscriptionsCleanupJob', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let job: PushSubscriptionsCleanupJob;
  let owner: string;

  const device = (endpoint: string, lastUsedAt: Date) =>
    prisma.pushSubscription.create({
      data: { userId: owner, endpoint, p256dh: 'BKey', auth: 'auth', deviceLabel: 'Android · Chrome', lastUsedAt },
    });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    job = app.get(PushSubscriptionsCleanupJob);
    owner = await userId(prisma, 'surveillant');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('supprime au-delà de 90 jours sans utilisation, garde le reste', async () => {
    const clock = fixedNow('2026-11-09T08:00:00Z');
    const now = clock.now().getTime();
    const old = await device('https://fcm.googleapis.com/fcm/send/ancien', new Date(now - 91 * DAY));
    const limit = await device('https://fcm.googleapis.com/fcm/send/limite', new Date(now - 90 * DAY + 60_000));
    const recent = await device('https://fcm.googleapis.com/fcm/send/recent', new Date(now - 89 * DAY));

    expect(await job.runOnce(clock.now())).toBe(1);

    const remaining = (await prisma.pushSubscription.findMany({ select: { id: true } })).map((r) => r.id).sort();
    expect(remaining).toEqual([limit.id, recent.id].sort());
    expect(remaining).not.toContain(old.id);
  });
});
