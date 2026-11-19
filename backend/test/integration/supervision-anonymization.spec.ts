import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CoverageAnonymizationJob } from '../../src/scheduler/coverage-anonymization.job';
import { SettingsService } from '../../src/settings/settings.service';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
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

  /** Pointage lié à l'affectation (journée propre à chaque test : un pointage par enseignant, classe et jour). */
  async function attendance(requestId: string, teacher: string, day: string, extra: { substituteFor?: string } = {}) {
    const classId = (await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId } })).classId;
    return prisma.teacherAttendance.create({
      data: {
        teacherId: await userId(prisma, teacher),
        classId,
        localDate: new Date(`${day}T00:00:00Z`),
        method: 'MANUAL',
        status: 'LATE',
        recordedById: await userId(prisma, 'admin'),
        comment: 'Rendez-vous médical',
        requestId,
        ...(extra.substituteFor ? { substituteForId: await userId(prisma, extra.substituteFor) } : {}),
      },
    });
  }

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

  /** Audit de sécurité R09 : des données personnelles restaient après l'anonymisation. */
  describe('anonymisation complète (R09)', () => {
    it('motif d’annulation effacé ; pointages liés détachés de l’affectation, sans commentaire ni titulaire', async () => {
      const id = await coverage({ source: 'TEACHER_REQUEST', status: 'CANCELLED' });
      await prisma.coverageDetail.update({ where: { requestId: id }, data: { cancelReason: 'Mme Martin est malade' } });
      const own = await attendance(id, 'enseignante', '2026-09-01');
      const relief = await attendance(id, 'remplacant', '2026-09-01', { substituteFor: 'enseignante' });

      expect(await job.runOnce(now)).toBe(1);
      expect(await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId: id } })).toMatchObject({ cancelReason: null });
      // Le pointage de l'enseignant concerné ne désigne plus l'affectation : plus rien ne relie l'absence à son nom
      // (un pointage par enseignant, classe et jour : le compte technique ne peut pas le remplacer). Le pointage
      // lui-même relève de la conservation du module présence.
      expect(await prisma.teacherAttendance.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({
        requestId: null,
        comment: null,
        substituteForId: null,
        status: 'LATE',
        localDate: own.localDate,
      });
      // Le remplaçant garde son propre pointage ; seul le lien vers l'enseignant remplacé disparaît.
      expect(await prisma.teacherAttendance.findUniqueOrThrow({ where: { id: relief.id } })).toMatchObject({
        teacherId: await userId(prisma, 'remplacant'),
        comment: null,
        substituteForId: null,
      });
    });

    it('historique d’une affectation anonymisée : plus aucun nom ni identifiant d’enseignant', async () => {
      const id = await coverage({ source: 'TEACHER_REQUEST' });
      const teacherId = await userId(prisma, 'enseignante');
      const teacherName = (await prisma.user.findUniqueOrThrow({ where: { id: teacherId } })).displayName;
      const supervisorName = (await prisma.user.findUniqueOrThrow({ where: { username: 'surveillant' } })).displayName;
      await prisma.requestEvent.create({ data: { requestId: id, type: 'CREATED', actorId: teacherId, toValue: { source: 'TEACHER_REQUEST' } } });
      await prisma.requestEvent.create({
        data: { requestId: id, type: 'TEACHER_SET', actorId: await userId(prisma, 'admin'), toValue: { teacherId } },
      });
      await prisma.requestEvent.create({
        data: { requestId: id, type: 'ASSIGNED', actorId: await userId(prisma, 'admin'), toValue: { assigneeId: await userId(prisma, 'surveillant') } },
      });
      const admin = await loginAs(app, 'admin');
      const detail = () => request(app.getHttpServer()).get(`/api/coverage/${id}`).set('Cookie', admin);

      const before = await detail();
      expect(before.status).toBe(200);
      expect(JSON.stringify(before.body.history)).toContain(teacherName);

      expect(await job.runOnce(now)).toBe(1);
      const after = await detail();
      expect(after.status).toBe(200);
      const history = JSON.stringify(after.body.history);
      expect(history).not.toContain(teacherId);
      expect(history).not.toContain(teacherName);
      expect(history).toContain('Enseignant anonymisé');
      // Les membres du personnel qui ont agi (administration, surveillant) restent nommés.
      expect(history).toContain(supervisorName);
      // L'historique en base n'est jamais modifié : le masque s'applique à la lecture (choix de l'établissement).
      expect(await prisma.requestEvent.count({ where: { requestId: id, actorId: teacherId } })).toBe(1);
    });

    /**
     * Audit de sécurité G.3 : non-régression de R09 sur tous les écrans, pas seulement l'historique. Le pointage de
     * l'enseignant reste dans le module présence (choix de l'établissement), mais plus rien ne le relie à l'affectation.
     */
    it('aucun écran ne relie plus l’affectation à l’enseignant : détail, liste, statistiques, export, surveillant, présences', async () => {
      const teacherId = await userId(prisma, 'enseignante');
      const original = (await prisma.user.findUniqueOrThrow({ where: { id: teacherId } })).displayName;
      const teacherName = 'Mme Zarrouk Témoin';
      await prisma.user.update({ where: { id: teacherId }, data: { displayName: teacherName } });
      try {
        const id = await coverage({ source: 'TEACHER_REQUEST' });
        const { reference } = await prisma.request.findUniqueOrThrow({ where: { id } });
        const day = ago(13).toISOString().slice(0, 10);
        await prisma.requestEvent.create({ data: { requestId: id, type: 'CREATED', actorId: teacherId, toValue: { source: 'TEACHER_REQUEST' } } });
        await prisma.requestEvent.create({
          data: { requestId: id, type: 'TEACHER_SET', actorId: await userId(prisma, 'admin'), toValue: { teacherId } },
        });
        await attendance(id, 'enseignante', day);

        const cookies = { admin: await loginAs(app, 'admin'), superadmin: await loginAs(app, 'superadmin') };
        const surveillant = await loginAs(app, 'surveillant');
        const get = (cookie: string, path: string, query: Record<string, string> = {}) =>
          request(app.getHttpServer()).get(path).query(query).set('Cookie', cookie);
        const period = { from: day, to: day };
        const screens = (cookie: string): Record<string, () => request.Test> => ({
          détail: () => get(cookie, `/api/coverage/${id}`),
          liste: () => get(cookie, '/api/coverage', { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.999Z`, includeFinished: 'true' }),
          statistiques: () => get(cookie, '/api/coverage/stats', { ...period, groupBy: 'teacher' }),
          export: () => get(cookie, '/api/coverage/stats/export.csv', { ...period, groupBy: 'teacher' }),
        });
        const text = (res: request.Response) => (res.type.includes('json') ? JSON.stringify(res.body) : res.text);

        // Avant : les écrans de l'administration nomment l'enseignant (la recherche a un sens).
        for (const [screen, load] of Object.entries(screens(cookies.admin))) {
          const res = await load();
          expect({ screen, status: res.status }).toEqual({ screen, status: 200 });
          expect({ screen, named: text(res).includes(teacherName) }).toEqual({ screen, named: true });
        }
        expect(text(await get(cookies.admin, '/api/attendance/day', { date: day }))).toContain(id);

        expect(await job.runOnce(now)).toBe(1);

        const secrets = [teacherId, teacherName, 'Mme Martin', 'Rendez-vous médical', 'Consigne écrite'];
        const leaks: string[] = [];
        for (const [who, cookie] of Object.entries(cookies)) {
          for (const [screen, load] of Object.entries(screens(cookie))) {
            const res = await load();
            if (res.status !== 200) leaks.push(`${who} ${screen} → ${res.status}`);
            for (const secret of secrets) if (text(res).includes(secret)) leaks.push(`${who} ${screen} : « ${secret} »`);
          }
        }
        // Le surveillant affecté garde l'affectation dans son historique, sans l'enseignant.
        const history = await get(surveillant, '/api/coverage/history');
        expect(text(history)).toContain(id);
        for (const secret of secrets) if (text(history).includes(secret)) leaks.push(`surveillant historique : « ${secret} »`);
        // Présences du jour : le pointage reste, sans commentaire ni lien vers l'affectation.
        const day0 = await get(cookies.admin, '/api/attendance/day', { date: day });
        expect(day0.status).toBe(200);
        for (const secret of [id, reference, 'Rendez-vous médical']) if (text(day0).includes(secret)) leaks.push(`présences : « ${secret} »`);
        // Le pointage lui-même reste (conservation du module présence, choix de l'établissement pour R09).
        expect(text(day0)).toContain(teacherName);
        expect(leaks).toEqual([]);
      } finally {
        await prisma.user.update({ where: { id: teacherId }, data: { displayName: original } });
      }
    });
  });
});
