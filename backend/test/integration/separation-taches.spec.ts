import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createSecondAdmin } from '../utils/second-admin';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Audit de sécurité R13 — séparation des tâches (018, FR-034) : le demandeur n'agit jamais au titre de
 * l'administration sur sa propre demande (validation, prise en charge, transfert, réattribution), et
 * personne n'est désigné pour réaliser sa propre demande.
 */
describe('Séparation des tâches : personne ne traite sa propre demande', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let admin: string;
  let admin2: string;
  let superadmin: string;
  let reprographie: string;
  let adminId: string;
  let reprographieId: string;
  let circuitB: string;
  let photocopies: string;

  const api = () => request(app.getHttpServer());
  const get = (cookie: string, path: string) => api().get(path).set('Cookie', cookie);
  const post = (cookie: string, path: string, body: Record<string, unknown> = {}) =>
    api().post(path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const act = (cookie: string, id: string, body: Record<string, unknown>) => post(cookie, `/api/requests/${id}/actions`, body);
  const version = async (id: string) => (await prisma.request.findUniqueOrThrow({ where: { id } })).version;

  /** Demande du circuit B (validation par l'administration) créée par le compte donné. */
  async function submitted(cookie: string): Promise<string> {
    const created = await post(cookie, '/api/requests', {
      clientId: randomUUID(),
      title: 'Changer la serrure du bureau',
      description: 'Bureau de la direction',
      categoryId: circuitB,
      priority: 'NORMAL',
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING_ADMIN_VALIDATION');
    return created.body.id as string;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    await createSecondAdmin(prisma);
    app = await createTestApp();
    admin = await loginAs(app, 'admin');
    admin2 = await loginAs(app, 'admin2');
    superadmin = await loginAs(app, 'superadmin');
    reprographie = await loginAs(app, 'reprographie');
    adminId = await userId(prisma, 'admin');
    reprographieId = await userId(prisma, 'reprographie');
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('validation administrative', () => {
    it('un admin ne voit aucune action d’administration sur sa propre demande, un collègue si', async () => {
      const id = await submitted(admin);
      const own = await get(admin, `/api/requests/${id}`);
      expect(own.status).toBe(200);
      expect(own.body.allowedActions).toEqual(expect.not.arrayContaining(['APPROVE', 'REJECT']));
      expect(own.body.ownership.canClaim).toBe(false);

      const colleague = await get(admin2, `/api/requests/${id}`);
      expect(colleague.body.allowedActions).toEqual(expect.arrayContaining(['APPROVE', 'REJECT']));
      expect(colleague.body.ownership.canClaim).toBe(true);
    });

    it('un admin ne peut ni approuver ni refuser sa propre demande (403), un collègue l’approuve', async () => {
      const id = await submitted(admin);
      const approve = await act(admin, id, { action: 'APPROVE', version: await version(id), assigneeId: reprographieId });
      expect(approve.status).toBe(403);
      const reject = await act(admin, id, { action: 'REJECT', version: await version(id), reason: 'Doublon' });
      expect(reject.status).toBe(403);
      expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING_ADMIN_VALIDATION');

      const approved = await act(admin2, id, { action: 'APPROVE', version: await version(id), assigneeId: reprographieId });
      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe('SENT');
    });

    it('le super administrateur ne valide pas non plus sa propre demande', async () => {
      const id = await submitted(superadmin);
      const res = await act(superadmin, id, { action: 'APPROVE', version: await version(id), assigneeId: reprographieId });
      expect(res.status).toBe(403);
      expect((await act(admin, id, { action: 'APPROVE', version: await version(id), assigneeId: reprographieId })).status).toBe(200);
    });

    it('la liste des employés à désigner ne s’ouvre pas au demandeur', async () => {
      const id = await submitted(admin);
      expect((await get(admin, `/api/requests/${id}/assignees`)).status).toBe(403);
    });
  });

  describe('prise en charge et file commune', () => {
    it('sa propre demande n’apparaît pas dans sa file commune, mais dans celle d’un collègue', async () => {
      const id = await submitted(admin);
      const mine = await get(admin, '/api/admin/requests/available');
      expect(mine.body.items.map((r: { id: string }) => r.id)).not.toContain(id);
      const colleague = await get(admin2, '/api/admin/requests/available');
      expect(colleague.body.items.map((r: { id: string }) => r.id)).toContain(id);
    });

    it('un admin ne prend pas en charge sa propre demande (403 journalisé)', async () => {
      const id = await submitted(admin);
      const denied = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', targetId: id } });
      const res = await post(admin, `/api/admin/requests/${id}/claim`, { version: await version(id) });
      expect(res.status).toBe(403);
      expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', targetId: id } })).toBe(denied + 1);
      expect((await prisma.request.findUniqueOrThrow({ where: { id } })).adminOwnerId).toBeNull();
    });
  });

  describe('transferts et réattribution', () => {
    /** Demande de « admin » prise en charge par « admin2 ». */
    async function ownedByColleague(): Promise<string> {
      const id = await submitted(admin);
      expect((await post(admin2, `/api/admin/requests/${id}/claim`, { version: await version(id) })).status).toBe(200);
      return id;
    }

    it('le demandeur n’est jamais proposé ni accepté comme destinataire d’une délégation', async () => {
      const id = await ownedByColleague();
      const candidates = await get(admin2, `/api/admin/requests/${id}/transfer-candidates`);
      expect(candidates.status).toBe(200);
      expect(candidates.body.map((c: { id: string }) => c.id)).not.toContain(adminId);
      const res = await post(admin2, `/api/admin/requests/${id}/transfers`, {
        type: 'DELEGATION_REQUEST',
        recipientId: adminId,
        reason: 'Je pars en formation.',
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('TRANSFER_RECIPIENT_INVALID');
    });

    it('le demandeur ne peut pas demander la reprise de sa propre demande', async () => {
      const id = await ownedByColleague();
      const detail = await get(admin, `/api/requests/${id}`);
      expect(detail.body.ownership.canAskTakeover).toBe(false);
      const res = await post(admin, `/api/admin/requests/${id}/transfers`, { type: 'TAKEOVER_REQUEST', reason: 'Je m’en occupe.' });
      expect(res.status).toBe(403);
    });

    it('le super administrateur ne confie pas une demande à son propre demandeur', async () => {
      const id = await ownedByColleague();
      const options = await get(superadmin, `/api/super-admin/requests/${id}/reassign-candidates`);
      expect(options.status).toBe(200);
      expect(options.body.candidates.map((c: { id: string }) => c.id)).not.toContain(adminId);
      const res = await post(superadmin, `/api/super-admin/requests/${id}/reassign`, { adminId, reason: 'Répartition de la charge.' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('TRANSFER_RECIPIENT_INVALID');
    });
  });

  describe('désignation de la personne qui réalise la demande', () => {
    it('un destinataire ne se choisit pas lui-même et n’est pas proposé à sa propre demande', async () => {
      const recipients = await get(reprographie, `/api/categories/${photocopies}/recipients`);
      expect(recipients.status).toBe(200);
      expect(recipients.body.map((r: { id: string }) => r.id)).not.toContain(reprographieId);

      const res = await post(reprographie, '/api/requests', {
        clientId: randomUUID(),
        title: 'Photocopies pour la réunion',
        description: '30 exemplaires',
        categoryId: photocopies,
        priority: 'NORMAL',
        recipientId: reprographieId,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
    });

    it('seul destinataire de la catégorie, il n’est pas désigné d’office pour sa propre demande', async () => {
      const res = await post(reprographie, '/api/requests', {
        clientId: randomUUID(),
        title: 'Photocopies pour la réunion',
        description: '30 exemplaires',
        categoryId: photocopies,
        priority: 'NORMAL',
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
    });

    it('un admin ne désigne pas le demandeur pour réaliser la demande', async () => {
      const id = await submitted(reprographie);
      const assignees = await get(admin, `/api/requests/${id}/assignees`);
      expect(assignees.status).toBe(200);
      expect(assignees.body.map((a: { id: string }) => a.id)).not.toContain(reprographieId);
      const res = await act(admin, id, { action: 'APPROVE', version: await version(id), assigneeId: reprographieId });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
    });
  });
});
