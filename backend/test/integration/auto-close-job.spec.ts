import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type RequestStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AutoCloseJob } from '../../src/scheduler/auto-close.job';
import { CATEGORIES, categoryId, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T049 — clôture automatique des demandes « Terminée » à l'expiration du délai de grâce (R4, R13). */
describe('AutoCloseJob', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let job: AutoCloseJob;
  let counter = 0;

  async function insertRequest(status: RequestStatus, autoCloseAt: Date | null) {
    counter += 1;
    const category = await categoryId(prisma, CATEGORIES.photocopies);
    return prisma.request.create({
      data: {
        number: 10_000 + counter,
        reference: `D-2026-${String(10_000 + counter).padStart(6, '0')}`,
        clientId: randomUUID(),
        title: `Demande ${counter}`,
        description: 'x',
        categoryId: category,
        priority: 'NORMAL',
        requesterId: await userId(prisma, 'enseignante'),
        assigneeId: await userId(prisma, 'reprographie'),
        status,
        doneAt: new Date(),
        autoCloseAt,
        rulesSnapshot: {
          circuit: 'A_DIRECT',
          closureMode: 'AUTO',
          autoCloseAfterMinutes: 1440,
          finalValidation: false,
          assignmentMode: 'MANUAL',
          photoRequired: false,
          validationMinutes: null,
          takeoverMinutes: null,
          completionMinutes: null,
        },
      },
    });
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    job = app.get(AutoCloseJob);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('clôt les demandes dont le délai de grâce est expiré, avec l’acteur SYSTEM', async () => {
    const due = await insertRequest('DONE', new Date(Date.now() - 1000));
    const notDue = await insertRequest('DONE', new Date(Date.now() + 3_600_000));
    const corrected = await insertRequest('TO_CORRECT', null);

    await job.runOnce();

    const closed = await prisma.request.findUniqueOrThrow({ where: { id: due.id } });
    expect(closed).toMatchObject({ status: 'CLOSED', autoCloseAt: null, version: 1 });
    expect(closed.closedAt).toBeTruthy();
    const event = await prisma.requestEvent.findFirstOrThrow({ where: { requestId: due.id, type: 'STATUS_CHANGED' } });
    expect(event.actorId).toBeNull();
    await expect(
      prisma.notification.count({ where: { requestId: due.id, type: 'CLOSED' } }),
    ).resolves.toBe(2); // demandeuse et employé affecté

    await expect(prisma.request.findUniqueOrThrow({ where: { id: notDue.id } })).resolves.toMatchObject({ status: 'DONE' });
    await expect(prisma.request.findUniqueOrThrow({ where: { id: corrected.id } })).resolves.toMatchObject({ status: 'TO_CORRECT' });
  });

  it('est idempotent : une seconde exécution ne crée aucun nouvel événement', async () => {
    const due = await insertRequest('DONE', new Date(Date.now() - 1000));
    await job.runOnce();
    await job.runOnce();
    await expect(prisma.requestEvent.count({ where: { requestId: due.id } })).resolves.toBe(1);
  });
});
