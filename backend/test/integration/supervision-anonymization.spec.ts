import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CoverageAnonymizationJob } from '../../src/scheduler/coverage-anonymization.job';
import { SettingsService } from '../../src/settings/settings.service';
import { seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, createCoverage, type CoverageFixture } from '../utils/coverage-fixtures';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T077 — Anonymisation des affectations au bout de la durée de conservation (FR-023a, R5) :
 * enseignant et motif effacés ; dates, classe, type, statuts et durée conservés ; historique,
 * audit et notifications jamais modifiés ; idempotent.
 */
describe('Anonymisation des affectations (FR-023a)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let job: CoverageAnonymizationJob;
  let anonymous: string;
  const now = new Date('2027-10-20T10:00:00Z');
  /** Il y a `months` mois (conservation par défaut : 12). */
  const ago = (months: number) => {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - months);
    return d;
  };

  async function coverage(fixture: Partial<CoverageFixture>) {
    const requestId = await createCoverage(prisma, {
      status: 'CLOSED',
      startAt: ago(13),
      plannedEndAt: null,
      assignee: 'surveillant',
      ...fixture,
    });
    await prisma.coverageDetail.update({
      where: { requestId },
      data: { reason: 'Rendez-vous médical', absentTeacher: 'Mme Martin', durationMinutes: 42 },
    });
    await prisma.request.update({
      where: { id: requestId },
      data: { description: 'Consigne écrite par l’enseignante' },
    });
    await prisma.requestEvent.create({
      data: { requestId, type: 'CREATED', toValue: { source: 'TEACHER_REQUEST' } },
    });
    await prisma.notification.create({
      data: {
        userId: await userId(prisma, 'admin'),
        requestId,
        type: 'COVERAGE_REQUESTED',
        priority: 'URGENT',
      },
    });
    return requestId;
  }

  const snapshot = async () => ({
    events: await prisma.requestEvent.findMany({ orderBy: { seq: 'asc' } }),
    audit: await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } }),
    notifications: await prisma.notification.findMany({ orderBy: { createdAt: 'asc' } }),
  });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    job = app.get(CoverageAnonymizationJob);
  });

  beforeEach(() => clearCoverages(prisma));

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('affectation finale ancienne : enseignant, motif et auteur effacés ; le reste conservé', async () => {
    const old = await coverage({ source: 'TEACHER_REQUEST' });
    const before = await prisma.request.findUniqueOrThrow({
      where: { id: old },
      include: { coverage: true },
    });

    expect(await job.runOnce(now)).toBe(1);

    // Compte technique (migration 0009, recréé s'il manque) : inactif, mot de passe inutilisable.
    const account = await prisma.user.findUniqueOrThrow({
      where: { username: 'enseignant-anonymise' },
    });
    expect(account).toMatchObject({ active: false, passwordHash: '!' });
    anonymous = account.id;
    const after = await prisma.request.findUniqueOrThrow({
      where: { id: old },
      include: { coverage: true },
    });
    expect(after.coverage).toMatchObject({
      teacherId: null,
      absentTeacher: null,
      reason: null,
      classId: before.coverage!.classId,
      floorId: before.coverage!.floorId,
      type: before.coverage!.type,
      source: 'TEACHER_REQUEST',
      startAt: before.coverage!.startAt,
      durationMinutes: 42,
    });
    expect(after.coverage!.anonymizedAt).toEqual(now);
    expect(after).toMatchObject({
      requesterId: anonymous,
      description: null,
      status: 'CLOSED',
      assigneeId: before.assigneeId,
    });
    const event = await prisma.requestEvent.findFirstOrThrow({
      where: { requestId: old, type: 'ANONYMIZED' },
    });
    expect(event.actorId).toBeNull();
    expect(JSON.stringify([event.fromValue, event.toValue, event.comment])).not.toMatch(
      /Martin|Rendez-vous|enseignante/i,
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'COVERAGE_ANONYMIZED' },
    });
    expect(audit.details).toMatchObject({ count: 1, retentionMonths: 12 });
  });

  it('demande d’un admin ou déclaration d’un surveillant : auteur conservé', async () => {
    const direct = await coverage({ source: 'ADMIN_DIRECT' });
    expect(await job.runOnce(now)).toBe(1);
    expect(await prisma.request.findUniqueOrThrow({ where: { id: direct } })).toMatchObject({
      requesterId: await userId(prisma, 'admin'),
    });
  });

  it('affectations récentes ou non finales intactes', async () => {
    const recent = await coverage({ startAt: ago(11) });
    const active = await coverage({ status: 'ON_DUTY' });
    expect(await job.runOnce(now)).toBe(0);
    for (const requestId of [recent, active]) {
      expect(await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId } })).toMatchObject(
        {
          reason: 'Rendez-vous médical',
          anonymizedAt: null,
        },
      );
    }
  });

  it('historique, audit et notifications jamais modifiés ; idempotent ; durée de conservation réglable', async () => {
    await coverage({ source: 'TEACHER_REQUEST' });
    await coverage({ status: 'CANCELLED', startAt: ago(6) });
    const before = await snapshot();
    const logged = await prisma.auditLog.count({ where: { action: 'COVERAGE_ANONYMIZED' } });
    expect(await job.runOnce(now)).toBe(1);
    const after = await snapshot();
    // Lignes existantes identiques ; seuls s'ajoutent l'événement ANONYMIZED et l'entrée d'audit.
    expect(after.events.slice(0, before.events.length)).toEqual(before.events);
    expect(after.events.slice(before.events.length).map((e) => e.type)).toEqual(['ANONYMIZED']);
    expect(after.audit.slice(0, before.audit.length)).toEqual(before.audit);
    expect(after.notifications).toEqual(before.notifications);

    expect(await job.runOnce(now)).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'COVERAGE_ANONYMIZED' } })).toBe(
      logged + 1,
    );

    // Réglage modifié par l'administration (cache des réglages invalidé).
    const settings = app.get(SettingsService);
    await settings.set('coverageRetentionMonths', 3, null);
    try {
      expect(await job.runOnce(now)).toBe(1); // l'annulée d'il y a 6 mois
    } finally {
      await settings.set('coverageRetentionMonths', 12, null);
    }
  });
});
