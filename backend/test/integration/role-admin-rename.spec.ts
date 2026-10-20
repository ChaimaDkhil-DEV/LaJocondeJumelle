import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ERROR_CATALOG } from '../../src/common/errors';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T042 — US4 : le rôle « Responsable » devient « Admin » sans perte d'accès (FR-002, FR-004 à
 * FR-004d, Q22, Q24). Le compte `admin` (ex-`responsable`) garde ses permissions, les catégories
 * qu'il gère, la création dans toute catégorie et ses droits selon le mode de routage ; aucun
 * message de l'API n'emploie « responsable » au sens du rôle ; le super administrateur reste distinct.
 */
describe('Rôle Admin (ex-Responsable)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const send = (
    who: string,
    method: 'post' | 'put' | 'patch',
    path: string,
    body: Record<string, unknown>,
  ) => api()[method](path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  async function create(who: string, category: string, extra: Record<string, unknown> = {}) {
    const res = await send(who, 'post', '/api/requests', {
      clientId: randomUUID(),
      title: 'Demande',
      description: 'x',
      categoryId: category,
      priority: 'NORMAL',
      ...extra,
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; version: number };
  }

  async function act(
    who: string,
    requestId: string,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    const { version } = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    return send(who, 'post', `/api/requests/${requestId}/actions`, { action, version, ...extra });
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const who of ['admin', 'superadmin', 'enseignante', 'reprographie']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('le compte admin porte le rôle ADMIN et ses permissions ; le super administrateur reste distinct', async () => {
    const me = await get('admin', '/api/auth/me');
    expect(me.body).toMatchObject({ role: 'ADMIN' });
    expect(me.body.permissions).toEqual([
      'PRIORITY_CHANGE_MANAGED',
      'PRIORITY_CHANGE_OWN',
      'REQUEST_CREATE',
      'REQUEST_REASSIGN',
    ]);
    expect((await get('superadmin', '/api/auth/me')).body).toMatchObject({ role: 'SUPER_ADMIN' });
    // L'administration réservée au super administrateur le reste.
    expect((await get('admin', '/api/admin/users')).status).toBe(403);
  });

  it('catégories gérées et rôles créateurs conservés', async () => {
    const managed = await prisma.categoryManager.findMany({
      where: { userId: id.admin },
      include: { category: true },
    });
    expect(managed.map((m) => m.category.name).sort()).toEqual(
      [
        'Garde de classe',
        CATEGORIES.circuitB,
        CATEGORIES.petitsTravaux,
        CATEGORIES.photocopies,
      ].sort(),
    );
    const categories = await prisma.category.findMany({ where: { kind: 'WORK' } });
    for (const category of categories) expect(category.creatorRoles).toContain('ADMIN');
  });

  it('création dans toute catégorie active, y compris réservée aux admins', async () => {
    const reserved = await send('superadmin', 'post', '/api/admin/categories', {
      name: 'Réservée aux admins',
      routingMode: 'DIRECT',
      creatorRoles: ['ADMIN'],
      closureMode: 'REQUESTER',
    });
    expect(reserved.status).toBe(201);
    const forms = await get('admin', '/api/categories');
    expect(forms.body.map((c: { name: string }) => c.name)).toContain('Réservée aux admins');
    expect(
      (await get('enseignante', '/api/categories')).body.map((c: { name: string }) => c.name),
    ).not.toContain('Réservée aux admins');
  });

  it('VIA_ADMIN : validation, refus motivé, priorité et discussion dans les catégories gérées', async () => {
    const viaAdmin = await categoryId(prisma, CATEGORIES.circuitB);
    const toApprove = await create('enseignante', viaAdmin);
    const approved = await act('admin', toApprove.id, 'APPROVE', { assigneeId: id.reprographie });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ assignee: { id: id.reprographie } });

    const toReject = await create('enseignante', viaAdmin);
    const noReason = await act('admin', toReject.id, 'REJECT');
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');
    expect((await act('admin', toReject.id, 'REJECT', { reason: 'Hors périmètre' })).status).toBe(
      200,
    );

    const { version } = await prisma.request.findUniqueOrThrow({ where: { id: toApprove.id } });
    const priority = await send('admin', 'patch', `/api/requests/${toApprove.id}/priority`, {
      priority: 'URGENT',
      version,
    });
    expect(priority.status).toBe(200);
    const message = await send('admin', 'post', `/api/requests/${toApprove.id}/messages`, {
      clientId: randomUUID(),
      text: 'Merci',
    });
    expect(message.status).toBe(201);
  });

  it('DIRECT : consultation en lecture seule, aucune action, aucun message, aucune notification', async () => {
    const direct = await categoryId(prisma, CATEGORIES.photocopies);
    const req = await create('enseignante', direct, { recipientId: id.reprographie });
    const detail = await get('admin', `/api/requests/${req.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.allowedActions).toEqual([]);
    expect(detail.body.canWriteInThread).toBe(false);
    expect(
      (
        await send('admin', 'post', `/api/requests/${req.id}/messages`, {
          clientId: randomUUID(),
          text: 'x',
        })
      ).status,
    ).toBe(403);
    expect(
      await prisma.notification.count({ where: { userId: id.admin, requestId: req.id } }),
    ).toBe(0);
  });

  it('les messages d’erreur de l’API n’emploient pas « responsable »', async () => {
    for (const entry of Object.values(ERROR_CATALOG))
      expect(entry.message).not.toMatch(/responsable/i);

    const category = await categoryId(prisma, CATEGORIES.photocopies);
    const managers = await send('superadmin', 'put', `/api/admin/categories/${category}/managers`, {
      userIds: [id.reprographie],
    });
    expect(managers.status).toBe(400);
    expect(JSON.stringify(managers.body)).not.toMatch(/responsable/i);
    expect(JSON.stringify(managers.body)).toMatch(/admins/);

    const coverage = await send('superadmin', 'post', '/api/admin/categories', {
      name: 'Garde bis',
      kind: 'COVERAGE',
      routingMode: 'DIRECT',
      creatorRoles: ['EMPLOYEE'],
      closureMode: 'MANAGER',
    });
    expect(coverage.status).toBe(400);
    expect(JSON.stringify(coverage.body)).not.toMatch(/responsable/i);
  });
});
