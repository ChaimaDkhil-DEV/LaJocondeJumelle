import type { INestApplication } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T025 — US3 : en circuit B, l'approbation affecte selon le mode et la personne figés à la
 * soumission (D1, FR-008), avec les exceptions EXC-1 (D9) et EXC-2 (D8, FR-011).
 * Écrit avant la correction (FR-009) : confirme le constat [DÉDUIT] A04.
 */
describe('Affectation automatique figée à la soumission', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let responsable: string;
  let responsableId: string;
  let sequence = 0;

  const api = () => request(app.getHttpServer());

  /** Catégorie en circuit B, affectation automatique vers E1 ; E1, E2, E3 destinataires actifs. */
  async function autoCategory() {
    sequence += 1;
    const employee = (name: string) =>
      prisma.user.create({ data: { username: `${name}-${sequence}`, displayName: `${name} ${sequence}`, role: 'EMPLOYEE', passwordHash: 'x' } });
    const [e1, e2, e3] = await Promise.all([employee('e1'), employee('e2'), employee('e3')]);
    const category = await prisma.category.create({
      data: {
        name: `Affectation figée ${sequence}`,
        circuit: 'B_ADMIN_VALIDATION',
        routingMode: 'VIA_ADMIN',
        creatorRoles: ['EMPLOYEE'],
        closureMode: 'MANAGER',
        assignmentMode: 'AUTO',
        autoAssigneeId: e1.id,
        recipients: { create: [{ userId: e1.id }, { userId: e2.id }, { userId: e3.id }] },
        managers: { create: { userId: responsableId } },
      },
    });
    return { categoryId: category.id, e1: e1.id, e2: e2.id, e3: e3.id };
  }

  async function submit(categoryId: string): Promise<{ id: string; version: number }> {
    const res = await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), title: 'Nettoyer la salle 12', description: 'x', categoryId, priority: 'NORMAL' });
    expect(res.status).toBe(201);
    return res.body;
  }

  function approve(id: string, version: number, assigneeId?: string) {
    return api()
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', responsable)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'APPROVE', version, ...(assigneeId ? { assigneeId } : {}) });
  }

  /** Source enregistrée sur l'événement ASSIGNED créé par l'approbation. */
  async function assigneeSource(id: string): Promise<unknown> {
    const history = await api().get(`/api/requests/${id}/history`).set('Cookie', responsable);
    const assigned = history.body.filter((e: { type: string }) => e.type === 'ASSIGNED');
    expect(assigned).toHaveLength(1);
    return assigned[0].toValue.assigneeSource;
  }

  /** La demande n'a pas bougé : même statut, même version, personne d'affectée. */
  async function expectUnchanged(id: string, version: number): Promise<void> {
    const detail = await api().get(`/api/requests/${id}`).set('Cookie', responsable);
    expect(detail.body).toMatchObject({ status: 'PENDING_ADMIN_VALIDATION', version, assignee: null });
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    responsable = await loginAs(app, 'responsable');
    responsableId = await userId(prisma, 'responsable');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('(1) la personne figée à la soumission est affectée, même si la catégorie désigne ensuite E2', async () => {
    const { categoryId, e1, e2 } = await autoCategory();
    const { id, version } = await submit(categoryId);
    await prisma.category.update({ where: { id: categoryId }, data: { autoAssigneeId: e2 } });

    const res = await approve(id, version);
    expect(res.status).toBe(200);
    expect(res.body.assignee).toMatchObject({ id: e1 });
    expect(await assigneeSource(id)).toBe('SNAPSHOT');
  });

  it('(2) le mode figé s’applique, même si la catégorie passe en affectation manuelle (N1)', async () => {
    const { categoryId, e1 } = await autoCategory();
    const { id, version } = await submit(categoryId);
    await prisma.category.update({ where: { id: categoryId }, data: { assignmentMode: 'MANUAL', autoAssigneeId: null } });

    const res = await approve(id, version);
    expect(res.status).toBe(200);
    expect(res.body.assignee).toMatchObject({ id: e1 });
    expect(await assigneeSource(id)).toBe('SNAPSHOT');
  });

  it('(3) personne figée désactivée : refus sans écriture, puis choix du responsable (EXC-2, D8)', async () => {
    const { categoryId, e1, e3 } = await autoCategory();
    const { id, version } = await submit(categoryId);
    await prisma.user.update({ where: { id: e1 }, data: { active: false } });

    const refused = await approve(id, version);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('AUTO_ASSIGNEE_UNAVAILABLE');
    await expectUnchanged(id, version);

    const res = await approve(id, version, e3);
    expect(res.status).toBe(200);
    expect(res.body.assignee).toMatchObject({ id: e3 });
    expect(await assigneeSource(id)).toBe('MANAGER_CHOICE');
  });

  it('(3b) personne figée retirée des destinataires : même refus, puis choix du responsable (EXC-2, D8)', async () => {
    const { categoryId, e1, e3 } = await autoCategory();
    const { id, version } = await submit(categoryId);
    await prisma.categoryRecipient.delete({ where: { categoryId_userId: { categoryId, userId: e1 } } });

    const refused = await approve(id, version);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('AUTO_ASSIGNEE_UNAVAILABLE');
    await expectUnchanged(id, version);

    const res = await approve(id, version, e3);
    expect(res.status).toBe(200);
    expect(res.body.assignee).toMatchObject({ id: e3 });
    expect(await assigneeSource(id)).toBe('MANAGER_CHOICE');
  });

  it('(4) personne figée indisponible : un choix non affectable reste refusé, sans écriture', async () => {
    const { categoryId, e1, e2, e3 } = await autoCategory();
    const { id, version } = await submit(categoryId);
    await prisma.user.updateMany({ where: { id: { in: [e1, e2] } }, data: { active: false } });
    await prisma.categoryRecipient.delete({ where: { categoryId_userId: { categoryId, userId: e3 } } });

    for (const choice of [e2, e3]) {
      const res = await approve(id, version, choice);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
    }
    await expectUnchanged(id, version);
  });

  it('(5) personne figée disponible : un employé proposé par le responsable est ignoré', async () => {
    const { categoryId, e1, e2 } = await autoCategory();
    const { id, version } = await submit(categoryId);

    const res = await approve(id, version, e2);
    expect(res.status).toBe(200);
    expect(res.body.assignee).toMatchObject({ id: e1 });
    expect(await assigneeSource(id)).toBe('SNAPSHOT');
  });

  it('(6) demande antérieure sans personne figée : la catégorie actuelle désigne l’employé (EXC-1, D9)', async () => {
    const { categoryId, e2 } = await autoCategory();
    const { id, version } = await submit(categoryId);
    const stored = await prisma.request.findUniqueOrThrow({ where: { id } });
    const legacy = { ...(stored.rulesSnapshot as Prisma.JsonObject) };
    delete legacy.autoAssigneeId;
    await prisma.request.update({ where: { id }, data: { rulesSnapshot: legacy } });
    await prisma.category.update({ where: { id: categoryId }, data: { autoAssigneeId: e2 } });

    const res = await approve(id, version);
    expect(res.status).toBe(200);
    expect(res.body.assignee).toMatchObject({ id: e2 });
    expect(await assigneeSource(id)).toBe('CATEGORY_CURRENT');
  });
});
