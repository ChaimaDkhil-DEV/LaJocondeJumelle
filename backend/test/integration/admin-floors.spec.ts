import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T011 — Étages et groupes à clé système (004, FR-006, FR-006a, R7) : administration par le super
 * administrateur ; classes rattachées à un étage ; étage d'un surveillant sur sa fiche de compte.
 * Les routes /admin/* refusent les autres comptes comme toutes les routes d'administration
 * (SuperAdminGuard : 403 et ACCESS_DENIED « NOT_SUPER_ADMIN »).
 */
describe('Administration des étages (004)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookies: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const send = (as: string, method: 'post' | 'patch', url: string, body: Record<string, unknown>) =>
    api()[method](url).set('Cookie', cookies[as]).set('Origin', TEST_ORIGIN).send(body);
  const get = (as: string, url: string) => api().get(url).set('Cookie', cookies[as]);

  const floorId = async (name: string) =>
    (await prisma.floor.findUniqueOrThrow({ where: { name } })).id;
  const groupOf = (systemKey: 'SUPERVISORS' | 'TEACHERS') =>
    prisma.employeeGroup.findUniqueOrThrow({ where: { systemKey }, include: { members: true } });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const username of ['superadmin', 'admin', 'surveillant', 'enseignante'])
      cookies[username] = await loginAs(app, username);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('étages', () => {
    it('liste par position avec le nombre de surveillants rattachés', async () => {
      const res = await get('superadmin', '/api/admin/floors');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({
          name: '1er étage',
          position: 1,
          active: true,
          supervisorCount: 2,
          warning: null,
        }),
        expect.objectContaining({
          name: '2e étage',
          position: 2,
          active: true,
          supervisorCount: 1,
          warning: null,
        }),
      ]);
    });

    it('création : avertissement « étage sans surveillant », non bloquant, et audit FLOOR_CHANGED', async () => {
      const res = await send('superadmin', 'post', '/api/admin/floors', {
        name: '3e étage',
        position: 3,
      });
      expect(res.status).toBe(201);
      expect(res.body.find((f: { name: string }) => f.name === '3e étage')).toMatchObject({
        position: 3,
        active: true,
        supervisorCount: 0,
        warning: 'NO_SUPERVISOR',
      });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'FLOOR_CHANGED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).toMatchObject({
        actorId: await userId(prisma, 'superadmin'),
        targetType: 'Floor',
        targetId: await floorId('3e étage'),
      });
      expect(audit.details).toMatchObject({
        after: { name: '3e étage', position: 3, active: true },
      });
    });

    it('nom en double refusé', async () => {
      const res = await send('superadmin', 'post', '/api/admin/floors', {
        name: '1er étage',
        position: 9,
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('validation : nom obligatoire (60 caractères au plus), position entière', async () => {
      const res = await send('superadmin', 'post', '/api/admin/floors', {
        name: ' ',
        position: 'haut',
      });
      expect(res.status).toBe(400);
      const fields = res.body.error.details.fields.map((f: { field: string }) => f.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'position']));
      expect(
        (
          await send('superadmin', 'post', '/api/admin/floors', {
            name: 'x'.repeat(61),
            position: 1,
          })
        ).status,
      ).toBe(400);
    });

    it('modification : renommage, ordre et désactivation, audités avant/après', async () => {
      const id = await floorId('3e étage');
      const res = await send('superadmin', 'patch', `/api/admin/floors/${id}`, {
        name: 'Combles',
        position: 4,
        active: false,
      });
      expect(res.status).toBe(200);
      expect(res.body.find((f: { id: string }) => f.id === id)).toMatchObject({
        name: 'Combles',
        position: 4,
        active: false,
      });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'FLOOR_CHANGED', targetId: id },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit.details).toMatchObject({
        before: { name: '3e étage', position: 3, active: true },
        after: { name: 'Combles', position: 4, active: false },
      });
      expect(
        (
          await send(
            'superadmin',
            'patch',
            '/api/admin/floors/00000000-0000-4000-8000-000000000000',
            { name: 'X' },
          )
        ).status,
      ).toBe(404);
    });

    it.each(['admin', 'surveillant', 'enseignante'])(
      'refusé à %s, refus journalisé',
      async (as) => {
        const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
        expect((await get(as, '/api/admin/floors')).status).toBe(403);
        expect(
          (await send(as, 'post', '/api/admin/floors', { name: 'Toit', position: 9 })).status,
        ).toBe(403);
        expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBe(
          before + 2,
        );
        expect(await prisma.floor.count({ where: { name: 'Toit' } })).toBe(0);
      },
    );
  });

  describe('classes rattachées à un étage', () => {
    it('étage obligatoire à la création et à la modification', async () => {
      const missing = await send('superadmin', 'post', '/api/admin/coverage/classes', {
        name: 'CE1 Vert',
      });
      expect(missing.status).toBe(400);
      expect(missing.body.error.details.fields.map((f: { field: string }) => f.field)).toContain(
        'floorId',
      );

      const unknown = await send('superadmin', 'post', '/api/admin/coverage/classes', {
        name: 'CE1 Vert',
        floorId: '00000000-0000-4000-8000-000000000000',
      });
      expect(unknown.status).toBe(400);

      const created = await send('superadmin', 'post', '/api/admin/coverage/classes', {
        name: 'CE1 Vert',
        floorId: await floorId('2e étage'),
      });
      expect(created.status).toBe(201);
      const row = created.body.find((c: { name: string }) => c.name === 'CE1 Vert');
      expect(row.floor).toEqual({ id: await floorId('2e étage'), name: '2e étage' });

      expect(
        (
          await send('superadmin', 'patch', `/api/admin/coverage/classes/${row.id}`, {
            name: 'CE1 Vert',
          })
        ).status,
      ).toBe(400);
      const moved = await send('superadmin', 'patch', `/api/admin/coverage/classes/${row.id}`, {
        name: 'CE1 Vert',
        floorId: await floorId('1er étage'),
      });
      expect(moved.status).toBe(200);
      expect(moved.body.find((c: { id: string }) => c.id === row.id).floor.name).toBe('1er étage');
    });

    it('le nombre de classes est compté par étage', async () => {
      const res = await get('superadmin', '/api/admin/floors');
      expect(res.body.find((f: { name: string }) => f.name === '1er étage').classCount).toBe(2);
    });
  });

  describe('étage d’un surveillant (fiche de compte)', () => {
    it('facultatif, modifiable et effaçable par le super administrateur', async () => {
      const id = await userId(prisma, 'surveillant2');
      const set = await send('superadmin', 'patch', `/api/admin/users/${id}`, {
        floorId: await floorId('1er étage'),
      });
      expect(set.status).toBe(200);
      expect(set.body.floor).toEqual({ id: await floorId('1er étage'), name: '1er étage' });

      const cleared = await send('superadmin', 'patch', `/api/admin/users/${id}`, {
        floorId: null,
      });
      expect(cleared.status).toBe(200);
      expect(cleared.body.floor).toBeNull();

      expect(
        (
          await send('superadmin', 'patch', `/api/admin/users/${id}`, {
            floorId: '00000000-0000-4000-8000-000000000000',
          })
        ).status,
      ).toBe(400);
    });
  });

  describe('groupes à clé système (R7)', () => {
    it('exposent leur clé ; renommage permis', async () => {
      const group = await groupOf('SUPERVISORS');
      const res = await send('superadmin', 'patch', `/api/admin/coverage/groups/${group.id}`, {
        name: 'Équipe de surveillance',
        memberIds: group.members.map((m) => m.userId),
      });
      expect(res.status).toBe(200);
      expect(res.body.find((g: { id: string }) => g.id === group.id)).toMatchObject({
        name: 'Équipe de surveillance',
        systemKey: 'SUPERVISORS',
        active: true,
      });
    });

    it('ni désactivation ni suppression : 409 SYSTEM_GROUP', async () => {
      for (const key of ['SUPERVISORS', 'TEACHERS'] as const) {
        const group = await groupOf(key);
        const res = await send('superadmin', 'patch', `/api/admin/coverage/groups/${group.id}`, {
          name: group.name,
          memberIds: group.members.map((m) => m.userId),
          active: false,
        });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('SYSTEM_GROUP');
        expect((await groupOf(key)).active).toBe(true);
      }
    });

    it('un admin ou un super administrateur peut être membre (enseignant, surveillant)', async () => {
      const teachers = await groupOf('TEACHERS');
      const ids = [
        ...teachers.members.map((m) => m.userId),
        await userId(prisma, 'admin'),
        await userId(prisma, 'superadmin'),
      ];
      const res = await send('superadmin', 'patch', `/api/admin/coverage/groups/${teachers.id}`, {
        name: teachers.name,
        memberIds: ids,
      });
      expect(res.status).toBe(200);
      expect((await groupOf('TEACHERS')).members).toHaveLength(3);
    });
  });
});
