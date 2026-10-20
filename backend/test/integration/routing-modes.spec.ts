import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Mode de routage par catégorie, appliqué côté serveur :
 * - VIA_ADMIN (démo circuit B) : validation obligatoire par l'administration de la catégorie ;
 * - DIRECT (Photocopies) : vers le service, sans validation ; administration en lecture seule ;
 * - PEER (« Enseignants », créée ici) : d'un enseignant à un autre, sans validation ; administration
 *   en lecture seule.
 * « Administration » : tout compte Responsable et le super administrateur ; « autre responsable »
 * n'est responsable d'aucune catégorie.
 */
describe('Modes de routage', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  let viaAdmin: string;
  let direct: string;
  let peer: string;

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const post = (who: string, path: string, body: Record<string, unknown>) => api().post(path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  function create(who: string, categoryIdValue: string, extra: Record<string, unknown> = {}) {
    return post(who, '/api/requests', { clientId: randomUUID(), title: 'Demande', description: 'x', categoryId: categoryIdValue, priority: 'NORMAL', ...extra });
  }

  async function act(who: string, requestId: string, action: string, extra: Record<string, unknown> = {}) {
    const { version } = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    return post(who, `/api/requests/${requestId}/actions`, { action, version, ...extra });
  }

  async function addUser(username: string, role: Role): Promise<void> {
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { username: 'enseignante' } });
    await prisma.user.create({ data: { username, displayName: username, role, passwordHash, mustChangePassword: false } });
  }

  /** Statut HTTP de la lecture du détail pour chaque personne. */
  async function visibility(requestId: string): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const who of Object.keys(cookie)) result[who] = (await get(who, `/api/requests/${requestId}`)).status;
    return result;
  }

  /** L'administration consulte sans rien pouvoir faire, côté serveur. */
  async function expectReadOnly(who: string, requestId: string): Promise<void> {
    const detail = await get(who, `/api/requests/${requestId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.allowedActions).toEqual([]);
    expect(detail.body.canWriteInThread).toBe(false);
    const message = await post(who, `/api/requests/${requestId}/messages`, { clientId: randomUUID(), text: 'Intervention' });
    expect(message.status).toBe(403);
    expect(message.body.error.message).toMatch(/Vous consultez cette demande/);
    const { version } = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    const priority = await api().patch(`/api/requests/${requestId}/priority`).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send({ priority: 'URGENT', version });
    expect(priority.status).toBe(403);
    // Actions possibles depuis « Envoyée », mais pas pour l'administration : refus 403, demande inchangée.
    const before = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    for (const action of ['REASSIGN', 'ACCEPT', 'DECLINE', 'CANCEL']) {
      expect((await act(who, requestId, action, { assigneeId: id.reprographie, reason: 'x' })).status).toBe(403);
    }
    // Approuver n'existe pas hors validation : transition invalide (409).
    expect((await act(who, requestId, 'APPROVE', { assigneeId: id.reprographie })).status).toBe(409);
    expect(await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ status: before.status, assigneeId: before.assigneeId, version: before.version });
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    await addUser('collegue', 'EMPLOYEE');
    await addUser('absente', 'EMPLOYEE');
    await addUser('partie', 'EMPLOYEE');
    await addUser('tiers', 'EMPLOYEE');
    await addUser('autre-responsable', 'ADMIN');
    app = await createTestApp();
    for (const who of ['enseignante', 'reprographie', 'admin', 'autre-responsable', 'superadmin', 'collegue', 'tiers']) {
      cookie[who] = await loginAs(app, who);
    }
    for (const who of ['enseignante', 'reprographie', 'collegue', 'absente', 'partie']) id[who] = await userId(prisma, who);
    viaAdmin = await categoryId(prisma, CATEGORIES.circuitB);
    direct = await categoryId(prisma, CATEGORIES.photocopies);

    // Catégorie « Enseignants » en mode PEER, créée par le super administrateur.
    const created = await post('superadmin', '/api/admin/categories', { name: 'Enseignants', routingMode: 'PEER', creatorRoles: ['EMPLOYEE'], closureMode: 'REQUESTER' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ routingMode: 'PEER', circuit: 'A_DIRECT' });
    peer = created.body.id;
    const members = await api()
      .put(`/api/admin/categories/${peer}/recipients`)
      .set('Cookie', cookie.superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ userIds: ['enseignante', 'collegue', 'absente', 'partie'].map((u) => id[u]) });
    expect(members.status).toBe(200);
    // Après coup : une collègue absente, une autre partie (compte désactivé).
    await prisma.user.update({ where: { id: id.absente }, data: { availability: 'ABSENT' } });
    await prisma.user.update({ where: { id: id.partie }, data: { active: false } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('VIA_ADMIN', () => {
    it('validation obligatoire : la demande attend l’administration, le demandeur ne choisit pas l’agent', async () => {
      expect((await create('enseignante', viaAdmin, { recipientId: id.reprographie })).body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
      const res = await create('enseignante', viaAdmin);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'PENDING_ADMIN_VALIDATION', assignee: null });
    });

    it('en attente : visible du demandeur, des responsables de la catégorie et du super administrateur seulement', async () => {
      const { body } = await create('enseignante', viaAdmin);
      expect(await visibility(body.id)).toEqual({
        enseignante: 200,
        admin: 200,
        superadmin: 200,
        reprographie: 404,
        'autre-responsable': 404,
        collegue: 404,
        tiers: 404,
      });
      const list = await get('autre-responsable', '/api/requests?scope=all&limit=100');
      expect(list.body.items.map((r: { id: string }) => r.id)).not.toContain(body.id);
    });

    it('seule l’administration de la catégorie confirme ou refuse ; refus motivé', async () => {
      const { body } = await create('enseignante', viaAdmin);
      expect((await act('enseignante', body.id, 'APPROVE', { assigneeId: id.reprographie })).status).toBe(403);
      expect((await act('autre-responsable', body.id, 'APPROVE', { assigneeId: id.reprographie })).status).toBe(404);
      const noReason = await act('admin', body.id, 'REJECT');
      expect(noReason.status).toBe(422);
      expect(noReason.body.error.code).toBe('REASON_REQUIRED');
      const approved = await act('admin', body.id, 'APPROVE', { assigneeId: id.reprographie });
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({ status: 'SENT', assignee: { id: id.reprographie } });

      const other = (await create('enseignante', viaAdmin)).body;
      const rejected = await act('admin', other.id, 'REJECT', { reason: 'Pas de surveillant disponible.' });
      expect(rejected.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'Pas de surveillant disponible.' });
    });

    it('l’enseignant peut annuler pendant l’attente', async () => {
      const { body } = await create('enseignante', viaAdmin);
      const cancelled = await act('enseignante', body.id, 'CANCEL');
      expect(cancelled.body.status).toBe('CANCELLED');
    });
  });

  describe('DIRECT', () => {
    it('sans validation : envoyée directement au service de la catégorie, destinataire par défaut', async () => {
      const res = await create('enseignante', direct);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'SENT', assignee: { id: id.reprographie } });
      const statuses = await prisma.requestEvent.findMany({ where: { requestId: res.body.id, type: 'STATUS_CHANGED' } });
      expect(statuses.map((e) => (e.toValue as { status: string }).status)).toEqual(['SENT']);
    });

    it('visible de toute l’administration, en lecture seule, et de personne d’autre', async () => {
      const { body } = await create('enseignante', direct);
      expect(await visibility(body.id)).toEqual({
        enseignante: 200,
        reprographie: 200,
        admin: 200,
        'autre-responsable': 200,
        superadmin: 200,
        collegue: 404,
        tiers: 404,
      });
      for (const admin of ['admin', 'autre-responsable', 'superadmin']) await expectReadOnly(admin, body.id);
      const list = await get('autre-responsable', '/api/requests?scope=all&limit=100');
      expect(list.body.items.map((r: { id: string }) => r.id)).toContain(body.id);
    });

    it('la consultation ne notifie pas l’administration', async () => {
      const { body } = await create('enseignante', direct);
      await get('admin', `/api/requests/${body.id}`);
      const notified = await prisma.notification.findMany({ where: { requestId: body.id }, select: { userId: true } });
      expect(notified.map((n) => n.userId)).toEqual([id.reprographie]);
    });
  });

  describe('PEER', () => {
    it('sans validation : directement à l’enseignant choisi, qui peut répondre', async () => {
      const res = await create('enseignante', peer, { recipientId: id.collegue });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'SENT', assignee: { id: id.collegue } });
      expect((await post('collegue', `/api/requests/${res.body.id}/messages`, { clientId: randomUUID(), text: 'Bien reçu' })).status).toBe(201);
    });

    it('visible des deux enseignants et de l’administration en lecture seule', async () => {
      const { body } = await create('enseignante', peer, { recipientId: id.collegue });
      expect(await visibility(body.id)).toEqual({
        enseignante: 200,
        collegue: 200,
        admin: 200,
        'autre-responsable': 200,
        superadmin: 200,
        reprographie: 404,
        tiers: 404,
      });
      for (const admin of ['admin', 'autre-responsable', 'superadmin']) await expectReadOnly(admin, body.id);
    });

    it('cas limites : destinataire obligatoire, jamais soi-même, compte désactivé refusé, absente signalée sans blocage', async () => {
      expect((await create('enseignante', peer)).body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
      const self = await create('enseignante', peer, { recipientId: id.enseignante });
      expect(self.status).toBe(400);
      expect(self.body.error.details.fields[0]).toMatchObject({ field: 'recipientId' });
      expect((await create('enseignante', peer, { recipientId: id.partie })).body.error.code).toBe('RECIPIENT_NOT_ALLOWED');

      const recipients = await get('enseignante', `/api/categories/${peer}/recipients`);
      const byId = new Map(recipients.body.map((r: { id: string; availability: string }) => [r.id, r.availability]));
      expect([...byId.keys()].sort()).toEqual([id.absente, id.collegue].sort());
      expect(byId.get(id.absente)).toBe('ABSENT');

      const toAbsent = await create('enseignante', peer, { recipientId: id.absente });
      expect(toAbsent.status).toBe(201);
      expect(toAbsent.body).toMatchObject({ status: 'SENT', assignee: { id: id.absente } });
    });
  });

  it('catégorie antérieure (clôture confiée à l’administration) en mode direct : clôture seulement, jamais de réaffectation', async () => {
    const legacy = await prisma.category.create({
      data: {
        name: 'Ancienne catégorie',
        circuit: 'A_DIRECT',
        routingMode: 'DIRECT',
        creatorRoles: ['EMPLOYEE'],
        closureMode: 'MANAGER',
        recipients: { create: [{ userId: id.reprographie }, { userId: id.collegue }] },
        managers: { create: { userId: await userId(prisma, 'admin') } },
      },
    });
    const { body } = await create('enseignante', legacy.id, { recipientId: id.reprographie });
    const reassign = await act('admin', body.id, 'REASSIGN', { assigneeId: id.collegue });
    expect(reassign.status).toBe(403);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: body.id } })).assigneeId).toBe(id.reprographie);
  });

  describe('Création et configuration', () => {
    it('l’administration peut créer dans toutes les catégories, même non ouvertes à son rôle', async () => {
      const res = await create('autre-responsable', peer, { recipientId: id.collegue });
      expect(res.status).toBe(201);
      expect((await create('reprographie', viaAdmin)).status).toBe(201);
      // Un employé reste limité aux catégories ouvertes à son rôle.
      const managersOnly = await post('superadmin', '/api/admin/categories', { name: 'Réservée administration', routingMode: 'DIRECT', creatorRoles: ['ADMIN'], closureMode: 'REQUESTER' });
      expect((await create('tiers', managersOnly.body.id)).status).toBe(403);
    });

    it('le circuit découle du mode ; règles incohérentes refusées', async () => {
      const make = (body: Record<string, unknown>) => post('superadmin', '/api/admin/categories', { creatorRoles: ['EMPLOYEE'], closureMode: 'REQUESTER', ...body });
      expect((await make({ name: 'Via admin', routingMode: 'VIA_ADMIN' })).body).toMatchObject({ circuit: 'B_ADMIN_VALIDATION', routingMode: 'VIA_ADMIN' });
      expect((await make({ name: 'Ancien client', circuit: 'B_ADMIN_VALIDATION' })).body).toMatchObject({ routingMode: 'VIA_ADMIN' });
      expect((await make({ name: 'Incohérente', routingMode: 'PEER', circuit: 'B_ADMIN_VALIDATION' })).status).toBe(400);
      expect((await make({ name: 'Clôture admin', routingMode: 'DIRECT', closureMode: 'MANAGER' })).status).toBe(400);
      expect((await make({ name: 'Garde peer', kind: 'COVERAGE', routingMode: 'PEER', creatorRoles: ['MANAGER'], closureMode: 'MANAGER' })).status).toBe(400);
    });
  });
});
