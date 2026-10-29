import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { atLocalTime, localDate, localTime } from '../../src/common/school-time';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, minutesFrom, notificationsOf } from '../utils/coverage-fixtures';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Spec 006 — modification d'une affectation par l'admin (PATCH /api/coverage/:id) : socle (T004),
 * créneau (T009, US1), classe (T018, US2).
 */
describe('Modification d’une affectation par l’admin (spec 006)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  let violet: string;
  const TZ = process.env.SCHOOL_TIMEZONE ?? 'Europe/Paris';

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const post = (who: string, path: string, body: Record<string, unknown>) =>
    api().post(path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);
  const patch = (who: string, coverageId: string, body: Record<string, unknown>) =>
    api().patch(`/api/coverage/${coverageId}`).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  const slot = (start = 10, end = 70) => ({
    startAt: minutesFrom(new Date(), start).toISOString(),
    endAt: minutesFrom(new Date(), end).toISOString(),
  });

  async function createOk(body: Record<string, unknown> = {}): Promise<string> {
    const res = await post('admin', '/api/coverage', {
      clientId: randomUUID(),
      classId: violet,
      type: 'ABSENCE',
      assigneeId: id.surveillant,
      ...slot(),
      ...body,
    });
    if (res.status !== 201) throw new Error(`Création : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  }

  const versionOf = async (coverageId: string) =>
    (await prisma.request.findUniqueOrThrow({ where: { id: coverageId } })).version;

  async function act(who: string, coverageId: string, body: Record<string, unknown>) {
    return post(who, `/api/coverage/${coverageId}/actions`, { version: await versionOf(coverageId), ...body });
  }

  /** Modification avec la version courante. */
  async function modify(coverageId: string, body: Record<string, unknown>, who = 'admin') {
    return patch(who, coverageId, { version: await versionOf(coverageId), ...body });
  }

  /**
   * Créneau d'un seul jour de l'école (le formulaire saisit une date et deux heures) : un créneau qui
   * passerait minuit est reporté au lendemain matin, pour que le test passe à toute heure.
   */
  function daySlot(minutesAhead: number, duration: number) {
    let start = minutesFrom(new Date(), minutesAhead);
    let end = minutesFrom(start, duration);
    if (localDate(start, TZ) !== localDate(end, TZ)) {
      start = atLocalTime(localDate(minutesFrom(new Date(), 24 * 60), TZ), '09:00', TZ);
      end = minutesFrom(start, duration);
    }
    return {
      date: localDate(start, TZ),
      startTime: localTime(start, TZ),
      endTime: localTime(end, TZ),
      iso: { startAt: start.toISOString(), endAt: end.toISOString() },
    };
  }

  async function qrToken(classId: string): Promise<string> {
    const res = await get('superadmin', `/api/admin/coverage/classes/${classId}/qr`);
    return new URL(res.body.url).searchParams.get('c')!;
  }

  const detailOf = (coverageId: string) =>
    prisma.coverageDetail.findUniqueOrThrow({ where: { requestId: coverageId } });

  const eventsOf = (coverageId: string, type: string) =>
    prisma.requestEvent.findMany({ where: { requestId: coverageId, type: type as never } });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    await prisma.category.updateMany({ where: { kind: 'COVERAGE' }, data: { proofMode: 'QR' } });
    app = await createTestApp();
    for (const who of ['enseignante', 'admin', 'superadmin', 'surveillant', 'remplacant', 'surveillant2']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
    violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })).id;
  });

  beforeEach(() => clearCoverages(prisma));

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('socle (T004)', () => {
    it('version différente : 409 STATE_CHANGED, rien de modifié', async () => {
      const coverageId = await createOk();
      const before = await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId: coverageId } });
      const res = await patch('admin', coverageId, { version: 999, endTime: '23:00' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STATE_CHANGED');
      const after = await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId: coverageId } });
      expect(after.plannedEndAt).toEqual(before.plannedEndAt);
    });

    it('statut définitif (annulée) : 409 INVALID_TRANSITION', async () => {
      const coverageId = await createOk();
      expect((await act('admin', coverageId, { action: 'CANCEL', reason: 'Test' })).status).toBe(200);
      const res = await modify(coverageId, { endTime: '23:00' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('sans changement : 200, version inchangée, ni événement ni notification', async () => {
      const coverageId = await createOk();
      const version = await versionOf(coverageId);
      const before = await notificationsOf(prisma, 'surveillant', coverageId);
      const res = await patch('admin', coverageId, { version });
      expect(res.status).toBe(200);
      expect(await versionOf(coverageId)).toBe(version);
      expect(await eventsOf(coverageId, 'UPDATED')).toHaveLength(0);
      expect(await notificationsOf(prisma, 'surveillant', coverageId)).toHaveLength(before.length);
    });

    it('détail : modifiableFields selon le statut pour l’admin, vide pour le surveillant', async () => {
      const coverageId = await createOk();
      const admin = await get('admin', `/api/coverage/${coverageId}`);
      expect(admin.body.modifiableFields).toEqual(['classId', 'date', 'startTime', 'endTime']);
      expect(admin.body.allowedActions).toContain('UPDATE');
      const supervisor = await get('surveillant', `/api/coverage/${coverageId}`);
      expect(supervisor.body.modifiableFields).toEqual([]);
      expect(supervisor.body.allowedActions).not.toContain('UPDATE');
    });
  });

  describe('créneau (T009, US1)', () => {
    it('date et heures enregistrées dans le fuseau de l’école ; statut et surveillant inchangés', async () => {
      const coverageId = await createOk(daySlot(10, 60).iso);
      const target = daySlot(40, 45);
      const res = await modify(coverageId, { date: target.date, startTime: target.startTime, endTime: target.endTime });
      expect(res.status).toBe(200);
      const detail = await detailOf(coverageId);
      expect(detail.startAt).toEqual(atLocalTime(target.date, target.startTime, TZ));
      expect(detail.plannedEndAt).toEqual(atLocalTime(target.date, target.endTime, TZ));
      expect(detail.estimatedMinutes).toBe(45);
      const row = await prisma.request.findUniqueOrThrow({ where: { id: coverageId } });
      expect(row).toMatchObject({ status: 'ACCEPTED', assigneeId: id.surveillant });
      expect(res.body.version).toBe(row.version);
    });

    it('fin avant le début : 400 INVALID_RANGE, rien de modifié', async () => {
      const original = daySlot(10, 60);
      const coverageId = await createOk(original.iso);
      const before = await detailOf(coverageId);
      const res = await modify(coverageId, { startTime: original.endTime, endTime: original.startTime });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RANGE');
      expect(await detailOf(coverageId)).toMatchObject({ startAt: before.startAt, plannedEndAt: before.plannedEndAt });
    });

    it('début au-delà de 7 jours : 400 VALIDATION_ERROR sur startTime', async () => {
      const coverageId = await createOk(daySlot(10, 60).iso);
      const res = await modify(coverageId, {
        date: localDate(minutesFrom(new Date(), 8 * 24 * 60), TZ),
        startTime: '09:00',
        endTime: '10:00',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.fields[0].field).toBe('startTime');
    });

    it('pendant la présence : seule l’heure de fin change, jamais dans le passé', async () => {
      const coverageId = await createOk({
        startAt: minutesFrom(new Date(), -5).toISOString(),
        endAt: minutesFrom(new Date(), 60).toISOString(),
      });
      const presence = await act('surveillant', coverageId, { action: 'CONFIRM_PRESENCE', qrToken: await qrToken(violet) });
      expect(presence.status).toBe(200);

      for (const [field, value] of [
        ['startTime', '08:00'],
        ['date', localDate(minutesFrom(new Date(), 24 * 60), TZ)],
      ] as const) {
        const res = await modify(coverageId, { [field]: value });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details.fields[0]).toEqual({
          field,
          messages: ['Non modifiable pendant la présence en classe.'],
        });
      }

      const past = localTime(minutesFrom(new Date(), -30), TZ);
      const refused = await modify(coverageId, { endTime: past });
      expect(refused.status).toBe(400);
      expect(refused.body.error.code).toBe('INVALID_RANGE');

      const later = minutesFrom(new Date(), 90);
      const endTime = localDate(later, TZ) === localDate(new Date(), TZ) ? localTime(later, TZ) : '23:59';
      const accepted = await modify(coverageId, { endTime });
      expect(accepted.status).toBe(200);
      expect(accepted.body.status).toBe('ON_DUTY');
      expect(localTime((await detailOf(coverageId)).plannedEndAt!, TZ)).toBe(endTime);
    });

    it('chevauchement avec une autre affectation du surveillant : 409 qui nomme le conflit, rien de modifié', async () => {
      const first = daySlot(10, 60);
      const firstId = await createOk(first.iso);
      const secondId = await createOk(daySlot(180, 30).iso);
      const before = await detailOf(secondId);
      const res = await modify(secondId, { date: first.date, startTime: first.startTime, endTime: first.endTime });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NOT_AVAILABLE');
      expect(res.body.error.message).toMatch(/^Surveillant déjà affecté : 1ère année Violet, /);
      expect(res.body.error.message).toMatch(/Réassignez d’abord, puis modifiez\.$/);
      expect(res.body.error.details.conflict).toMatchObject({ id: firstId, className: '1ère année Violet' });
      expect(await detailOf(secondId)).toMatchObject({ startAt: before.startAt, plannedEndAt: before.plannedEndAt });
    });

    it('surveillant absent : 409 NOT_AVAILABLE sans conflit nommé', async () => {
      // Créneau et nouvelle heure de fin tirés du même jour : deux appels à daySlot pouvaient tomber
      // de part et d'autre de minuit (vers 22 h 30) et produire une fin avant le début (400).
      const longer = daySlot(10, 90);
      const coverageId = await createOk({
        startAt: longer.iso.startAt,
        endAt: minutesFrom(new Date(longer.iso.startAt), 60).toISOString(),
      });
      await prisma.user.update({ where: { id: id.surveillant }, data: { availability: 'ABSENT' } });
      try {
        const res = await modify(coverageId, { endTime: longer.endTime });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('NOT_AVAILABLE');
        expect(res.body.error.details?.conflict).toBeUndefined();
      } finally {
        await prisma.user.update({ where: { id: id.surveillant }, data: { availability: 'AVAILABLE' } });
      }
    });

    it('traces : événement UPDATED, audit COVERAGE_MANAGED sans motif, notifications, échéance recalculée', async () => {
      const original = daySlot(10, 60);
      const coverageId = await createOk({ ...original.iso, reason: 'Motif confidentiel' });
      const before = await prisma.request.findUniqueOrThrow({ where: { id: coverageId } });
      const audits = await prisma.auditLog.count({ where: { action: 'COVERAGE_MANAGED' } });
      const target = daySlot(70, 60);

      const res = await modify(coverageId, { date: target.date, startTime: target.startTime, endTime: target.endTime }, 'superadmin');
      expect(res.status).toBe(200);

      const [event] = await eventsOf(coverageId, 'UPDATED');
      // Valeurs d'origine exactes (créées à la seconde près), pas arrondies à la minute.
      expect(event.fromValue).toMatchObject({ classId: violet, startAt: original.iso.startAt });
      expect(event.toValue).toMatchObject({
        classId: violet,
        startAt: atLocalTime(target.date, target.startTime, TZ).toISOString(),
        plannedEndAt: atLocalTime(target.date, target.endTime, TZ).toISOString(),
        byAdmin: true,
      });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'COVERAGE_MANAGED', targetId: coverageId },
        orderBy: { createdAt: 'desc' },
      });
      expect(await prisma.auditLog.count({ where: { action: 'COVERAGE_MANAGED' } })).toBe(audits + 1);
      expect(audit.details).toMatchObject({ action: 'UPDATE' });
      expect(JSON.stringify(audit.details)).not.toContain('Motif confidentiel');
      // Contenu de l'événement seulement (seq est un BigInt, non sérialisable).
      expect(JSON.stringify([event.fromValue, event.toValue, event.comment])).not.toContain('Motif confidentiel');

      expect((await notificationsOf(prisma, 'surveillant', coverageId)).map((n) => n.type)).toContain('COVERAGE_UPDATED');
      expect((await notificationsOf(prisma, 'admin', coverageId)).map((n) => n.type)).toContain('COVERAGE_UPDATED');
      expect((await notificationsOf(prisma, 'superadmin', coverageId)).map((n) => n.type)).not.toContain('COVERAGE_UPDATED');

      const after = await prisma.request.findUniqueOrThrow({ where: { id: coverageId } });
      expect(before.currentDueAt).not.toBeNull();
      expect(after.currentDueAt).not.toEqual(before.currentDueAt);
    });
  });

  describe('classe (T018, US2)', () => {
    let bleu: { id: string; floorId: string | null };
    beforeAll(async () => {
      bleu = await prisma.schoolClass.findUniqueOrThrow({
        where: { name: '2e année Bleu' },
        select: { id: true, floorId: true },
      });
    });

    it('nouvelle classe active : étage copié, titre suivi (préfixe conservé), surveillant notifié', async () => {
      const coverageId = await createOk(daySlot(10, 60).iso);
      const res = await modify(coverageId, { classId: bleu.id }, 'superadmin');
      expect(res.status).toBe(200);
      expect(await detailOf(coverageId)).toMatchObject({ classId: bleu.id, floorId: bleu.floorId });
      const row = await prisma.request.findUniqueOrThrow({ where: { id: coverageId } });
      expect(row.title).toBe('Garde — 2e année Bleu');
      expect(row.status).toBe('ACCEPTED');
      expect((await notificationsOf(prisma, 'surveillant', coverageId)).map((n) => n.type)).toContain('COVERAGE_UPDATED');
      const [event] = await eventsOf(coverageId, 'UPDATED');
      expect(event.fromValue).toMatchObject({ classId: violet });
      expect(event.toValue).toMatchObject({ classId: bleu.id, byAdmin: true });
    });

    it('classe désactivée : 400 CLASS_INACTIVE, rien de modifié', async () => {
      const coverageId = await createOk(daySlot(10, 60).iso);
      await prisma.schoolClass.update({ where: { id: bleu.id }, data: { active: false } });
      try {
        const res = await modify(coverageId, { classId: bleu.id });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('CLASS_INACTIVE');
        expect((await detailOf(coverageId)).classId).toBe(violet);
      } finally {
        await prisma.schoolClass.update({ where: { id: bleu.id }, data: { active: true } });
      }
    });

    it('« En route » : reste « En route », départ conservé ; QR de la nouvelle classe seulement', async () => {
      const coverageId = await createOk({
        startAt: minutesFrom(new Date(), -5).toISOString(),
        endAt: minutesFrom(new Date(), 60).toISOString(),
      });
      expect((await act('surveillant', coverageId, { action: 'DEPART' })).status).toBe(200);
      const departed = (await prisma.request.findUniqueOrThrow({ where: { id: coverageId } })).status;
      expect(departed).toBe('EN_ROUTE');
      const departedAt = (await detailOf(coverageId)).departedAt;

      const res = await modify(coverageId, { classId: bleu.id });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('EN_ROUTE');
      expect((await detailOf(coverageId)).departedAt).toEqual(departedAt);

      // Présence : le QR code de l'ancienne classe ne mène plus à l'affectation, celui de la nouvelle oui.
      const old = await post('surveillant', '/api/coverage/presence/resolve', { token: await qrToken(violet) });
      expect(old.body.coverage?.id ?? null).not.toBe(coverageId);
      const fresh = await post('surveillant', '/api/coverage/presence/resolve', { token: await qrToken(bleu.id) });
      expect(fresh.status).toBe(200);
      expect(fresh.body.coverage?.id).toBe(coverageId);
    });

    it('pendant la présence : la classe n’est pas modifiable', async () => {
      const coverageId = await createOk({
        startAt: minutesFrom(new Date(), -5).toISOString(),
        endAt: minutesFrom(new Date(), 60).toISOString(),
      });
      expect((await act('surveillant', coverageId, { action: 'CONFIRM_PRESENCE', qrToken: await qrToken(violet) })).status).toBe(200);
      const res = await modify(coverageId, { classId: bleu.id });
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields[0]).toEqual({
        field: 'classId',
        messages: ['Non modifiable pendant la présence en classe.'],
      });
    });

    it('classe et créneau ensemble : une seule version, un seul événement', async () => {
      const coverageId = await createOk(daySlot(10, 60).iso);
      const version = await versionOf(coverageId);
      const target = daySlot(30, 60);
      const res = await modify(coverageId, { classId: bleu.id, startTime: target.startTime, endTime: target.endTime, date: target.date });
      expect(res.status).toBe(200);
      expect(await versionOf(coverageId)).toBe(version + 1);
      const events = await eventsOf(coverageId, 'UPDATED');
      expect(events).toHaveLength(1);
      expect(events[0].toValue).toMatchObject({ classId: bleu.id, startAt: atLocalTime(target.date, target.startTime, TZ).toISOString() });
    });
  });
});
