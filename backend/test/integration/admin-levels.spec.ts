import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Niveaux scolaires : en production, aucune migration ni aucun écran ne les créait, alors que l'inscription
 * d'un élève exige une classe rattachée à un niveau. Le jeu de données des tests n'en contient aucun, comme
 * la production : le parcours complet (niveau, classe, élève) doit donc être possible depuis l'administration.
 */
describe('Niveaux scolaires', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookies: Record<string, string> = {};
  let floorId: string;

  const api = () => request(app.getHttpServer());
  const get = (as: string, url: string) => api().get(url).set('Cookie', cookies[as]);
  const send = (as: string, method: 'post' | 'patch', url: string, body: Record<string, unknown>) =>
    api()[method](url).set('Cookie', cookies[as]).set('Origin', TEST_ORIGIN).send(body);

  type Level = { id: string; name: string; cycle: string; position: number; classes: Array<{ id: string; name: string; studentCount: number }> };
  const levelsOf = async (): Promise<Level[]> => (await get('superadmin', '/api/admin/levels')).body as Level[];
  const createLevel = (body: Record<string, unknown>) => send('superadmin', 'post', '/api/admin/levels', body);
  const idOfLevel = (list: Level[], name: string) => list.find((l) => l.name === name)!.id;
  const createClass = async (name: string, extra: Record<string, unknown> = {}) => {
    const res = await send('superadmin', 'post', '/api/admin/coverage/classes', { name, floorId, ...extra });
    expect(res.status).toBe(201);
    return (res.body as Array<{ id: string; name: string }>).find((c) => c.name === name)!.id;
  };
  const patchClass = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    send('superadmin', 'patch', `/api/admin/coverage/classes/${id}`, { name, floorId, ...extra });
  const classRow = async (id: string) =>
    ((await get('superadmin', '/api/admin/coverage/classes')).body as Array<{ id: string; level: { id: string; name: string } | null }>).find((c) => c.id === id)!;
  const student = (classId: string) =>
    send('superadmin', 'post', '/api/admin/students', {
      firstName: 'Amine',
      lastName: 'Ben Salah',
      classId,
      parentPhone: '+216 20 123 456',
      mealService: 'CANTINE',
    });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const username of ['superadmin', 'admin', 'surveillant', 'enseignante']) cookies[username] = await loginAs(app, username);
    floorId = (await prisma.floor.findFirstOrThrow()).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('une base de production n’a aucun niveau au départ', async () => {
    expect(await levelsOf()).toEqual([]);
  });

  describe('création et modification', () => {
    it('crée un niveau, le renvoie dans la liste et le journalise', async () => {
      const res = await createLevel({ name: 'Préparatoire 1', cycle: 'PREPARATORY', position: 1 });
      expect(res.status).toBe(201);
      expect(res.body).toEqual([expect.objectContaining({ name: 'Préparatoire 1', cycle: 'PREPARATORY', position: 1, classes: [] })]);
      const id = (res.body as Level[])[0].id;
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'LEVEL_CHANGED', targetId: id } });
      expect(audit.targetType).toBe('GradeLevel');
      expect(audit.details).toMatchObject({ after: { name: 'Préparatoire 1', cycle: 'PREPARATORY', position: 1 } });
      expect(audit.actorId).not.toBeNull();
    });

    it('liste par position croissante', async () => {
      await createLevel({ name: 'Niveau C', cycle: 'PRIMARY', position: 30 });
      await createLevel({ name: 'Niveau B', cycle: 'PRIMARY', position: 20 });
      const names = (await levelsOf()).map((l) => l.name);
      expect(names.indexOf('Niveau B')).toBeLessThan(names.indexOf('Niveau C'));
    });

    it.each([
      ['nom vide', { name: '  ', cycle: 'PRIMARY', position: 40 }],
      ['nom trop long', { name: 'x'.repeat(61), cycle: 'PRIMARY', position: 41 }],
      ['cycle inconnu', { name: 'Cycle inconnu', cycle: 'COLLEGE', position: 42 }],
      ['position non entière', { name: 'Position décimale', cycle: 'PRIMARY', position: 1.5 }],
      ['position négative', { name: 'Position négative', cycle: 'PRIMARY', position: -1 }],
      ['position absente', { name: 'Sans position', cycle: 'PRIMARY' }],
    ])('refuse : %s', async (_label, body) => {
      const before = (await levelsOf()).length;
      expect((await createLevel(body)).status).toBe(400);
      expect(await levelsOf()).toHaveLength(before);
    });

    it('refuse un nom déjà pris, en le disant', async () => {
      await createLevel({ name: 'Doublon nom', cycle: 'PRIMARY', position: 50 });
      const res = await createLevel({ name: 'Doublon nom', cycle: 'PRIMARY', position: 51 });
      expect(res.status).toBe(409);
      expect((res.body as { error: { message: string } }).error.message).toBe('Ce niveau existe déjà.');
    });

    it('refuse une position déjà prise, en le disant', async () => {
      await createLevel({ name: 'Position prise', cycle: 'PRIMARY', position: 60 });
      const res = await createLevel({ name: 'Autre nom', cycle: 'PRIMARY', position: 60 });
      expect(res.status).toBe(409);
      expect((res.body as { error: { message: string } }).error.message).toBe('Cette position est déjà utilisée par un autre niveau.');
    });

    it('modifie le nom, le cycle ou la position, partiellement, avec l’avant et l’après au journal', async () => {
      const id = idOfLevel((await createLevel({ name: 'À renommer', cycle: 'PREPARATORY', position: 70 })).body as Level[], 'À renommer');
      const renamed = await send('superadmin', 'patch', `/api/admin/levels/${id}`, { name: 'Renommé' });
      expect(renamed.status).toBe(200);
      expect((renamed.body as Level[]).find((l) => l.id === id)).toMatchObject({ name: 'Renommé', cycle: 'PREPARATORY', position: 70 });

      await send('superadmin', 'patch', `/api/admin/levels/${id}`, { cycle: 'PRIMARY', position: 71 });
      expect((await levelsOf()).find((l) => l.id === id)).toMatchObject({ name: 'Renommé', cycle: 'PRIMARY', position: 71 });

      const entries = await prisma.auditLog.findMany({ where: { action: 'LEVEL_CHANGED', targetId: id }, orderBy: { createdAt: 'asc' } });
      expect(entries).toHaveLength(3);
      expect(entries[1].details).toMatchObject({ before: { name: 'À renommer' }, after: { name: 'Renommé' } });
    });

    it('refuse de prendre le nom ou la position d’un autre niveau', async () => {
      const list = (await createLevel({ name: 'Cible A', cycle: 'PRIMARY', position: 80 })).body as Level[];
      const b = idOfLevel((await createLevel({ name: 'Cible B', cycle: 'PRIMARY', position: 81 })).body as Level[], 'Cible B');
      expect(idOfLevel(list, 'Cible A')).toBeTruthy();
      expect((await send('superadmin', 'patch', `/api/admin/levels/${b}`, { name: 'Cible A' })).status).toBe(409);
      expect((await send('superadmin', 'patch', `/api/admin/levels/${b}`, { position: 80 })).status).toBe(409);
      expect((await levelsOf()).find((l) => l.id === b)).toMatchObject({ name: 'Cible B', position: 81 });
    });

    it('niveau inconnu ou identifiant invalide : introuvable', async () => {
      expect((await send('superadmin', 'patch', '/api/admin/levels/00000000-0000-4000-8000-000000000000', { name: 'x' })).status).toBe(404);
      expect((await send('superadmin', 'patch', '/api/admin/levels/pas-un-uuid', { name: 'x' })).status).toBe(404);
    });
  });

  describe('droits', () => {
    it('l’admin lit, crée et modifie (011, FR-001), à son nom dans le journal', async () => {
      expect((await get('admin', '/api/admin/levels')).status).toBe(200);
      const created = await send('admin', 'post', '/api/admin/levels', { name: 'Niveau admin', cycle: 'PRIMARY', position: 950 });
      expect(created.status).toBe(201);
      const id = idOfLevel(created.body as Level[], 'Niveau admin');
      expect((await send('admin', 'patch', `/api/admin/levels/${id}`, { name: 'Niveau admin modifié' })).status).toBe(200);
      const adminId = (await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })).id;
      expect(await prisma.auditLog.count({ where: { action: 'LEVEL_CHANGED', actorId: adminId, targetId: id } })).toBe(2);
    });

    it.each(['surveillant', 'enseignante'])('%s ne peut ni lire, ni créer, ni modifier', async (who) => {
      const before = await prisma.gradeLevel.count();
      expect((await get(who, '/api/admin/levels')).status).toBe(403);
      expect((await send(who, 'post', '/api/admin/levels', { name: `Refusé ${who}`, cycle: 'PRIMARY', position: 900 })).status).toBe(403);
      const any = await prisma.gradeLevel.findFirstOrThrow();
      expect((await send(who, 'patch', `/api/admin/levels/${any.id}`, { name: 'Piraté' })).status).toBe(403);
      expect(await prisma.gradeLevel.count()).toBe(before);
      expect((await prisma.gradeLevel.findUniqueOrThrow({ where: { id: any.id } })).name).not.toBe('Piraté');
    });

    it('non authentifié : refusé', async () => {
      expect((await api().post('/api/admin/levels').set('Origin', TEST_ORIGIN).send({ name: 'x', cycle: 'PRIMARY', position: 901 })).status).toBe(401);
    });
  });

  describe('rattacher une classe à un niveau', () => {
    it('à la création, puis la liste des classes l’indique ; sans niveau : null', async () => {
      const id = idOfLevel((await createLevel({ name: 'Pour classe', cycle: 'PRIMARY', position: 100 })).body as Level[], 'Pour classe');
      const withLevel = await createClass('Classe avec niveau', { levelId: id });
      const without = await createClass('Salle sans niveau');
      expect((await classRow(withLevel)).level).toEqual({ id, name: 'Pour classe' });
      expect((await classRow(without)).level).toBeNull();
      expect((await levelsOf()).find((l) => l.id === id)!.classes.map((c) => c.name)).toEqual(['Classe avec niveau']);
    });

    it('niveau absent du corps : inchangé ; autre niveau : déplacé ; journalisé', async () => {
      const a = idOfLevel((await createLevel({ name: 'Niveau X', cycle: 'PRIMARY', position: 110 })).body as Level[], 'Niveau X');
      const b = idOfLevel((await createLevel({ name: 'Niveau Y', cycle: 'PRIMARY', position: 111 })).body as Level[], 'Niveau Y');
      const id = await createClass('Classe mobile', { levelId: a });

      expect((await patchClass(id, 'Classe mobile renommée')).status).toBe(200);
      expect((await classRow(id)).level?.id).toBe(a);

      expect((await patchClass(id, 'Classe mobile renommée', { levelId: b })).status).toBe(200);
      expect((await classRow(id)).level?.id).toBe(b);

      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'CLASS_CHANGED', targetId: id }, orderBy: { createdAt: 'desc' } });
      expect(audit.details).toMatchObject({ before: { levelId: a }, after: { levelId: b } });
    });

    it('niveau inconnu ou invalide : refusé, la classe ne change pas', async () => {
      const id = await createClass('Classe niveau inconnu');
      expect((await patchClass(id, 'Classe niveau inconnu', { levelId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
      expect((await patchClass(id, 'Classe niveau inconnu', { levelId: 'pas-un-uuid' })).status).toBe(400);
      expect((await classRow(id)).level).toBeNull();
    });

    it('retirer le niveau d’une classe sans élèves est possible', async () => {
      const lvl = idOfLevel((await createLevel({ name: 'Niveau retiré', cycle: 'PRIMARY', position: 120 })).body as Level[], 'Niveau retiré');
      const id = await createClass('Classe à vider', { levelId: lvl });
      expect((await patchClass(id, 'Classe à vider', { levelId: null })).status).toBe(200);
      expect((await classRow(id)).level).toBeNull();
    });
  });

  describe('élèves : le parcours complet, comme en production', () => {
    it('sans niveau, l’inscription est refusée ; avec un niveau, elle fonctionne et le niveau suit la classe', async () => {
      const id = await createClass('Classe des élèves');
      const refused = await student(id);
      expect(refused.status).toBe(400);
      expect((refused.body as { error: { message: string } }).error.message).toBe('Choisissez une classe active d’un niveau scolaire.');

      const lvl = idOfLevel((await createLevel({ name: '1re année primaire', cycle: 'PRIMARY', position: 130 })).body as Level[], '1re année primaire');
      expect((await patchClass(id, 'Classe des élèves', { levelId: lvl })).status).toBe(200);

      const created = await student(id);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ firstName: 'Amine', class: { id, level: { id: lvl, name: '1re année primaire' } } });
      expect((await levelsOf()).find((l) => l.id === lvl)!.classes).toEqual([expect.objectContaining({ id, studentCount: 1 })]);

      // Renommer le niveau se voit sur l'élève sans le toucher.
      await send('superadmin', 'patch', `/api/admin/levels/${lvl}`, { name: 'CP' });
      const list = (await get('superadmin', '/api/admin/students')).body as Array<{ class: { id: string; level: { name: string } } }>;
      expect(list.find((s) => s.class.id === id)!.class.level.name).toBe('CP');
    });

    it('une classe qui a des élèves actifs ne peut plus perdre son niveau', async () => {
      const lvl = idOfLevel((await createLevel({ name: 'Niveau protégé', cycle: 'PRIMARY', position: 140 })).body as Level[], 'Niveau protégé');
      const id = await createClass('Classe protégée', { levelId: lvl });
      expect((await student(id)).status).toBe(201);

      const res = await patchClass(id, 'Classe protégée', { levelId: null });
      expect(res.status).toBe(400);
      expect((res.body as { error: { message: string } }).error.message).toBe('Cette classe a des élèves actifs : elle doit garder un niveau scolaire.');
      expect((await classRow(id)).level?.id).toBe(lvl);
    });

    it('si les élèves sont désactivés, le niveau peut être retiré', async () => {
      const lvl = idOfLevel((await createLevel({ name: 'Niveau libéré', cycle: 'PRIMARY', position: 150 })).body as Level[], 'Niveau libéré');
      const id = await createClass('Classe libérée', { levelId: lvl });
      const created = (await student(id)).body as { id: string };
      await send('superadmin', 'patch', `/api/admin/students/${created.id}`, {
        firstName: 'Amine',
        lastName: 'Ben Salah',
        classId: id,
        parentPhone: '+216 20 123 456',
        mealService: 'CANTINE',
        active: false,
      });
      expect((await patchClass(id, 'Classe libérée', { levelId: null })).status).toBe(200);
    });

    it('l’admin liste, inscrit et modifie un élève (011, FR-003), avec les mêmes contrôles', async () => {
      const lvl = idOfLevel((await createLevel({ name: 'Niveau élèves admin', cycle: 'PRIMARY', position: 160 })).body as Level[], 'Niveau élèves admin');
      const classId = await createClass('Classe élèves admin', { levelId: lvl });
      expect((await get('admin', '/api/admin/students')).status).toBe(200);
      const body = { firstName: 'Rim', lastName: 'Admin', classId, parentPhone: '+216 20 123 457', mealService: 'CANTINE' };
      const invalid = await send('admin', 'post', '/api/admin/students', { ...body, firstName: '' });
      expect(invalid.status).toBe(400);
      const created = await send('admin', 'post', '/api/admin/students', body);
      expect(created.status).toBe(201);
      const id = (created.body as { id: string }).id;
      expect((await send('admin', 'patch', `/api/admin/students/${id}`, { ...body, mealService: 'PANIER' })).status).toBe(200);
      const adminId = (await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })).id;
      expect(await prisma.auditLog.count({ where: { action: 'STUDENT_CHANGED', actorId: adminId, targetId: id } })).toBe(2);
    });

    it('un employé ne lit ni n’inscrit d’élève (refus NOT_ADMINISTRATION)', async () => {
      const denied = { action: 'ACCESS_DENIED', details: { path: ['reason'], equals: 'NOT_ADMINISTRATION' } } as const;
      const before = await prisma.auditLog.count({ where: denied });
      expect((await get('enseignante', '/api/admin/students')).status).toBe(403);
      expect((await send('enseignante', 'post', '/api/admin/students', { firstName: 'X', lastName: 'Y' })).status).toBe(403);
      expect(await prisma.auditLog.count({ where: denied })).toBe(before + 2);
    });
  });
});
