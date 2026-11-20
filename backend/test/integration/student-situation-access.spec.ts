import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { local, newStudent, schoolSetup, userByName } from '../utils/situation-fixtures';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Historique et situation d'un élève (021, US4) : réservés à l'administration, refus journalisés sans rien révéler,
 * chaque consultation de situation journalisée, journal de l'élève lisible par l'administration.
 */
describe('Accès et traçabilité : historique et situation d’un élève', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookies: Record<string, string> = {};
  let studentId: string;
  let otherStudentId: string;
  let admin: string;

  const get = (as: string, url: string) => request(app.getHttpServer()).get(url).set('Cookie', cookies[as]);
  const routes = (id: string) => [
    `/api/admin/students/${id}/class-history`,
    `/api/admin/students/${id}/situation?at=${encodeURIComponent(local('10:42'))}`,
    `/api/admin/students/${id}/audit`,
  ];
  const viewed = (id: string) => prisma.auditLog.findMany({ where: { action: 'STUDENT_SITUATION_VIEWED', targetId: id }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const username of ['superadmin', 'admin', 'surveillant', 'enseignante']) cookies[username] = await loginAs(app, username);
    admin = await userByName(prisma, 'admin');
    const setup = await schoolSetup(prisma);
    const klass = await setup.newClass('Accès situation');
    studentId = (await newStudent(prisma, klass.id, admin)).id;
    otherStudentId = (await newStudent(prisma, klass.id, admin)).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('qui peut lire', () => {
    it.each(['surveillant', 'enseignante'])('%s : refusé sur les trois routes, refus journalisé, rien révélé de l’élève', async (who) => {
      const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
      for (const url of routes(studentId)) {
        const res = await get(who, url);
        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).not.toMatch(/Situation|Aya/);
      }
      expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBe(before + 3);
    });

    it('un élève qui n’existe pas reçoit la même réponse qu’un élève existant pour un rôle refusé', async () => {
      const existing = await get('enseignante', routes(studentId)[0]);
      const missing = await get('enseignante', routes('00000000-0000-4000-8000-00000000dead')[0]);
      expect(missing.status).toBe(existing.status);
      expect(missing.body).toEqual(existing.body);
    });

    it('sans session : 401', async () => {
      for (const url of routes(studentId)) expect((await request(app.getHttpServer()).get(url)).status).toBe(401);
    });

    it.each(['admin', 'superadmin'])('%s : lit l’historique, la situation et le journal', async (who) => {
      for (const url of routes(studentId)) expect((await get(who, url)).status).toBe(200);
    });

    it('administration : un élève inconnu donne 404 sur les trois routes', async () => {
      for (const url of routes('00000000-0000-4000-8000-00000000dead')) expect((await get('admin', url)).status).toBe(404);
    });
  });

  describe('journalisation des consultations', () => {
    it('une consultation de situation crée une entrée : auteur, élève, instant, adresse IP', async () => {
      const before = (await viewed(studentId)).length;
      const at = local('10:42');
      expect((await get('admin', `/api/admin/students/${studentId}/situation?at=${encodeURIComponent(at)}`)).status).toBe(200);
      const entries = await viewed(studentId);
      expect(entries).toHaveLength(before + 1);
      const entry = entries.at(-1)!;
      expect(entry).toMatchObject({ actorId: admin, targetType: 'Student', targetId: studentId });
      expect(entry.details).toEqual({ studentId, at });
      expect(entry.ip).toBeTruthy();
    });

    it('une demande refusée (instant invalide, élève inconnu, rôle refusé) n’écrit aucune consultation', async () => {
      const before = await prisma.auditLog.count({ where: { action: 'STUDENT_SITUATION_VIEWED' } });
      await get('admin', `/api/admin/students/${studentId}/situation?at=hier`);
      await get('admin', `/api/admin/students/${studentId}/situation?at=2999-01-01T10:00`);
      await get('admin', routes('00000000-0000-4000-8000-00000000dead')[1]);
      await get('enseignante', routes(studentId)[1]);
      expect(await prisma.auditLog.count({ where: { action: 'STUDENT_SITUATION_VIEWED' } })).toBe(before);
    });

    it('lire l’historique de classe ou le journal n’est pas une consultation de situation', async () => {
      const before = await prisma.auditLog.count({ where: { action: 'STUDENT_SITUATION_VIEWED' } });
      await get('admin', routes(studentId)[0]);
      await get('admin', routes(studentId)[2]);
      expect(await prisma.auditLog.count({ where: { action: 'STUDENT_SITUATION_VIEWED' } })).toBe(before);
    });
  });

  describe('journal de l’élève : GET /admin/students/:id/audit', () => {
    type Page = { items: Array<{ id: string; action: string; targetId: string | null; actor: { id: string } | null; details: unknown }>; nextCursor: string | null };

    it('liste les entrées de cet élève, la plus récente d’abord, et aucune autre', async () => {
      await prisma.auditLog.create({ data: { action: 'STUDENT_CHANGED', actorId: admin, targetType: 'Student', targetId: studentId, details: { action: 'update', fields: ['classId'] } } });
      await prisma.auditLog.create({ data: { action: 'STUDENT_CHANGED', actorId: admin, targetType: 'Student', targetId: otherStudentId, details: { action: 'update', fields: ['lastName'] } } });
      await prisma.auditLog.create({ data: { action: 'LOGIN_SUCCESS', actorId: admin } });
      await get('admin', routes(studentId)[1]);
      const res = await get('admin', routes(studentId)[2]);
      expect(res.status).toBe(200);
      const page = res.body as Page;
      expect(page.items.length).toBeGreaterThanOrEqual(2);
      expect(new Set(page.items.map((i) => i.targetId))).toEqual(new Set([studentId]));
      expect(page.items.map((i) => i.action)).toEqual(expect.arrayContaining(['STUDENT_CHANGED', 'STUDENT_SITUATION_VIEWED']));
      expect(page.items[0].action).toBe('STUDENT_SITUATION_VIEWED');
      expect(page.items[0].actor).toMatchObject({ id: admin });
    });

    it('pagine avec un curseur, sans doublon ni oubli', async () => {
      const first = (await get('admin', `${routes(studentId)[2]}?limit=1`)).body as Page;
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toBeTruthy();
      const second = (await get('admin', `${routes(studentId)[2]}?limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`)).body as Page;
      expect(second.items).toHaveLength(1);
      expect(second.items[0].id).not.toBe(first.items[0].id);
    });

    it('ne renvoie jamais de secret ni de téléphone', async () => {
      const res = await get('admin', routes(studentId)[2]);
      expect(JSON.stringify(res.body)).not.toMatch(/passw|token|\+216/i);
    });
  });

  it('les routes d’écriture existantes restent fermées aux rôles refusés (aucune route d’écriture de l’historique)', async () => {
    const res = await request(app.getHttpServer()).post(`/api/admin/students/${studentId}/class-history`).set('Cookie', cookies.admin).set('Origin', TEST_ORIGIN).send({ classId: studentId });
    expect(res.status).toBe(404);
  });
});
