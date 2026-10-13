import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import request from 'supertest';
import { AutoCloseJob } from '../../src/scheduler/auto-close.job';
import { OverdueJob } from '../../src/scheduler/overdue.job';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Non-régression : l'ajout des couvertures de classe ne change rien au comportement des demandes de
 * travail (listes, actions, visibilité, tâche des retards, clôture automatique, accès aux fichiers).
 */
describe('Demandes de travail inchangées par le module de couverture', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookies: Record<string, string> = {};
  let reprographieId: string;
  let workId: string;
  let coverageId: string;
  let coverageCategoryId: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const u of ['enseignante', 'reprographie', 'responsable', 'superadmin', 'surveillant']) cookies[u] = await loginAs(app, u);
    reprographieId = await userId(prisma, 'reprographie');
    coverageCategoryId = (await prisma.category.findUniqueOrThrow({ where: { name: 'Garde de classe' } })).id;

    const work = await api()
      .post('/api/requests')
      .set('Cookie', cookies.enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        title: 'Photocopies',
        description: '30 copies',
        categoryId: await categoryId(prisma, CATEGORIES.photocopies),
        recipientId: reprographieId,
        priority: 'URGENT',
      });
    expect(work.status).toBe(201);
    workId = work.body.id;

    const coverage = await api()
      .post('/api/coverage')
      .set('Cookie', cookies.responsable)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        categoryId: coverageCategoryId,
        classId: (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })).id,
        groupIds: [(await prisma.employeeGroup.findUniqueOrThrow({ where: { name: 'Surveillants/Remplaçants' } })).id],
      });
    expect(coverage.status).toBe(201);
    coverageId = coverage.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('les listes de demandes de travail n’incluent jamais les couvertures', async () => {
    for (const user of ['enseignante', 'reprographie', 'responsable', 'superadmin']) {
      const res = await api().get('/api/requests').set('Cookie', cookies[user]);
      expect(res.status).toBe(200);
      const listed = res.body.items.map((i: { id: string }) => i.id);
      expect(listed).not.toContain(coverageId);
      if (user !== 'responsable') expect(listed).toContain(workId);
    }
    // Le responsable voit toujours les demandes des catégories qu'il gère.
    const managed = await api().get('/api/requests').query({ scope: 'managed' }).set('Cookie', cookies.responsable);
    expect(managed.body.items.map((i: { id: string }) => i.id)).toEqual([workId]);
  });

  it('les routes des demandes de travail ne servent pas les couvertures (détail, historique, actions)', async () => {
    for (const path of [`/api/requests/${coverageId}`, `/api/requests/${coverageId}/history`, `/api/requests/${coverageId}/messages`]) {
      expect((await api().get(path).set('Cookie', cookies.superadmin)).status).toBe(404);
    }
    const res = await api()
      .post(`/api/requests/${coverageId}/actions`)
      .set('Cookie', cookies.responsable)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'CANCEL', version: 0 });
    expect(res.status).toBe(404);
  });

  it('la catégorie de couverture n’est pas proposée pour une demande de travail et y est refusée', async () => {
    const categories = await api().get('/api/categories').set('Cookie', cookies.responsable);
    expect(categories.body.map((c: { name: string }) => c.name)).not.toContain('Garde de classe');
    const res = await api()
      .post('/api/requests')
      .set('Cookie', cookies.responsable)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), title: 'x', description: 'x', categoryId: coverageCategoryId, priority: 'NORMAL' });
    expect(res.status).toBe(400);
    expect((await api().get(`/api/categories/${coverageCategoryId}/recipients`).set('Cookie', cookies.responsable)).status).toBe(404);
  });

  it('les actions sur une demande de travail fonctionnent comme avant', async () => {
    const detail = await api().get(`/api/requests/${workId}`).set('Cookie', cookies.reprographie);
    expect(detail.body.allowedActions).toEqual(expect.arrayContaining(['ACCEPT', 'DECLINE']));
    const accepted = await api()
      .post(`/api/requests/${workId}/actions`)
      .set('Cookie', cookies.reprographie)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'ACCEPT', version: detail.body.version });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('ACCEPTED');
    // Les couvertures n'apparaissent pas dans le compteur de l'employé de reprographie.
    const assigned = await api().get('/api/requests').query({ scope: 'assigned' }).set('Cookie', cookies.reprographie);
    expect(assigned.body.items.map((i: { id: string }) => i.id)).toEqual([workId]);
  });

  it('la tâche des retards ignore les couvertures ; la clôture automatique aussi', async () => {
    await prisma.request.update({ where: { id: coverageId }, data: { currentDueAt: new Date(Date.now() - 60_000) } });
    await prisma.request.update({ where: { id: workId }, data: { currentDueAt: new Date(Date.now() - 60_000) } });
    expect(await app.get(OverdueJob).runOnce()).toBe(1);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: workId } })).overdueStage).toBe('COMPLETION');
    const coverage = await prisma.request.findUniqueOrThrow({ where: { id: coverageId } });
    expect(coverage).toMatchObject({ status: 'BROADCAST', overdueStage: null });

    await prisma.request.update({ where: { id: coverageId }, data: { autoCloseAt: new Date(Date.now() - 1000) } });
    expect(await app.get(AutoCloseJob).runOnce()).toBe(0);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: coverageId } })).status).toBe('BROADCAST');
  });

  it('l’accès aux fichiers des demandes de travail est inchangé', async () => {
    const upload = await api()
      .post('/api/files')
      .set('Cookie', cookies.enseignante)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'PHOTO')
      .field('requestId', workId)
      .attach('file', join(__dirname, '..', 'fixtures', 'images', 'photo.png'));
    expect(upload.status).toBe(201);
    for (const user of ['enseignante', 'reprographie', 'responsable', 'superadmin']) {
      expect((await api().get(`/api/files/${upload.body.id}`).set('Cookie', cookies[user])).status).toBe(200);
    }
    expect((await api().get(`/api/files/${upload.body.id}`).set('Cookie', cookies.surveillant)).status).toBe(404);
    // Un fichier ne peut pas être rattaché à une couverture par la route des fichiers.
    const toCoverage = await api()
      .post('/api/files')
      .set('Cookie', cookies.responsable)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'PHOTO')
      .field('requestId', coverageId)
      .attach('file', join(__dirname, '..', 'fixtures', 'images', 'photo.png'));
    expect(toCoverage.status).toBe(404);
  });
});
