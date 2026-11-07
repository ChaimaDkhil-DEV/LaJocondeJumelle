import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** Passage d'un élève de la cantine au panier par l'administration, en gardant l'historique. */
describe('Service de restauration des élèves', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let surveillante: string;
  let direction: string;
  let employe: string;
  let classId: string;

  const api = () => request(app.getHttpServer());
  const get = (cookie: string, url: string) => api().get(url).set('Cookie', cookie);
  const patch = (cookie: string, url: string, body: Record<string, unknown>) =>
    api().patch(url).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);

  async function createStudent(data: { mealService?: 'CANTINE' | 'PANIER'; active?: boolean } = {}) {
    return prisma.student.create({
      data: { firstName: 'Amine', lastName: 'Ben Salah', classId, parentPhone: '0612345678', mealService: 'CANTINE', ...data },
    });
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    surveillante = await loginAs(app, 'admin');
    direction = await loginAs(app, 'superadmin');
    employe = await loginAs(app, 'enseignante');
    const floor = await prisma.floor.create({ data: { name: 'Étage repas', position: 90 } });
    const level = await prisma.gradeLevel.create({ data: { name: 'Niveau repas', cycle: 'PRIMARY', position: 90 } });
    classId = (await prisma.schoolClass.create({ data: { name: 'Classe repas', floorId: floor.id, levelId: level.id } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('la surveillante générale fait passer un élève au panier, et le changement est historisé', async () => {
    const student = await createStudent();

    const res = await patch(surveillante, `/api/meal-services/students/${student.id}`, { mealService: 'PANIER', reason: '  Allergie  ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: student.id, mealService: 'PANIER' });
    expect((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).mealService).toBe('PANIER');

    const history = await get(surveillante, `/api/meal-services/students/${student.id}/history`);
    expect(history.status).toBe(200);
    expect(history.body).toEqual([
      {
        id: expect.any(String),
        fromService: 'CANTINE',
        toService: 'PANIER',
        reason: 'Allergie',
        createdAt: expect.any(String),
        actor: { id: expect.any(String), displayName: expect.any(String) },
      },
    ]);
  });

  it('garde chaque aller-retour, du plus récent au plus ancien', async () => {
    const student = await createStudent();
    const url = `/api/meal-services/students/${student.id}`;
    expect((await patch(surveillante, url, { mealService: 'PANIER' })).status).toBe(200);
    expect((await patch(surveillante, url, { mealService: 'CANTINE' })).status).toBe(200);

    const history = await get(surveillante, `${url}/history`);
    expect(history.body.map((c: { fromService: string; toService: string; reason: string | null }) => [c.fromService, c.toService, c.reason])).toEqual([
      ['PANIER', 'CANTINE', null],
      ['CANTINE', 'PANIER', null],
    ]);
  });

  it('une modification depuis la fiche du super administrateur entre aussi dans l’historique', async () => {
    const student = await createStudent();
    const body = { firstName: student.firstName, lastName: student.lastName, classId, parentPhone: student.parentPhone };

    const renamed = await patch(direction, `/api/admin/students/${student.id}`, { ...body, firstName: 'Amina', mealService: 'CANTINE' });
    expect(renamed.status).toBe(200);
    expect(await prisma.studentMealChange.count({ where: { studentId: student.id } })).toBe(0);

    const changed = await patch(direction, `/api/admin/students/${student.id}`, { ...body, mealService: 'PANIER' });
    expect(changed.status).toBe(200);
    expect(changed.body.mealService).toBe('PANIER');
    const change = await prisma.studentMealChange.findFirstOrThrow({ where: { studentId: student.id } });
    expect(change).toMatchObject({ fromService: 'CANTINE', toService: 'PANIER', reason: null });
  });

  it('refuse le service déjà en place, sans rien historiser', async () => {
    const student = await createStudent();
    const res = await patch(surveillante, `/api/meal-services/students/${student.id}`, { mealService: 'CANTINE' });
    expect(res.status).toBe(400);
    expect(await prisma.studentMealChange.count({ where: { studentId: student.id } })).toBe(0);
  });

  it('refuse un élève désactivé ou inconnu, et un service ou un motif invalide', async () => {
    const inactive = await createStudent({ active: false });
    const active = await createStudent();
    const url = `/api/meal-services/students/${active.id}`;
    expect((await patch(surveillante, `/api/meal-services/students/${inactive.id}`, { mealService: 'PANIER' })).status).toBe(404);
    expect((await patch(surveillante, '/api/meal-services/students/inconnu', { mealService: 'PANIER' })).status).toBe(404);
    expect((await patch(surveillante, url, { mealService: 'LES_DEUX' })).status).toBe(400);
    expect((await patch(surveillante, url, { mealService: 'PANIER', reason: 'x'.repeat(301) })).status).toBe(400);
  });

  it('la liste ne montre que les élèves actifs, sans le téléphone du parent', async () => {
    const inactive = await createStudent({ active: false });
    const active = await createStudent();
    const res = await get(surveillante, '/api/meal-services/students');
    expect(res.status).toBe(200);
    const ids = res.body.map((s: { id: string }) => s.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(inactive.id);
    expect(res.body[0]).not.toHaveProperty('parentPhone');
  });

  it('refuse les autres rôles et journalise le refus', async () => {
    const student = await createStudent();
    expect((await get(employe, '/api/meal-services/students')).status).toBe(403);
    expect((await get(employe, `/api/meal-services/students/${student.id}/history`)).status).toBe(403);
    expect((await patch(employe, `/api/meal-services/students/${student.id}`, { mealService: 'PANIER' })).status).toBe(403);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).mealService).toBe('CANTINE');
    const denied = await prisma.auditLog.findMany({ where: { action: 'ACCESS_DENIED' } });
    expect(denied.map((d) => (d.details as { reason?: string }).reason)).toContain('NOT_ADMINISTRATION');
  });

  it('exige une session et une origine autorisée', async () => {
    const student = await createStudent();
    expect((await api().get('/api/meal-services/students')).status).toBe(401);
    const noOrigin = await api().patch(`/api/meal-services/students/${student.id}`).set('Cookie', surveillante).send({ mealService: 'PANIER' });
    expect(noOrigin.status).toBe(403);
  });

  it('l’administration accède aussi à la gestion des élèves (011, FR-003)', async () => {
    expect((await get(surveillante, '/api/admin/students')).status).toBe(200);
  });

  it('le journal d’audit ne contient ni le service ni le motif', async () => {
    const student = await createStudent();
    await patch(surveillante, `/api/meal-services/students/${student.id}`, { mealService: 'PANIER', reason: 'Motif privé' });
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'STUDENT_CHANGED', targetId: student.id } });
    expect(entry.details).toEqual({ action: 'update', fields: ['mealService'] });
  });

  it('la base refuse de modifier, supprimer ou vider l’historique', async () => {
    const student = await createStudent();
    await patch(surveillante, `/api/meal-services/students/${student.id}`, { mealService: 'PANIER' });
    const change = await prisma.studentMealChange.findFirstOrThrow({ where: { studentId: student.id } });
    await expect(prisma.studentMealChange.update({ where: { id: change.id }, data: { reason: 'réécrit' } })).rejects.toThrow(/ajout seul/);
    await expect(prisma.studentMealChange.delete({ where: { id: change.id } })).rejects.toThrow(/ajout seul/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "StudentMealChange"')).rejects.toThrow(/ajout seul/);
  });
});
