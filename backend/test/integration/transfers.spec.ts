import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createSecondAdmin } from '../utils/second-admin';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T032, T033 — 018, US2 et US3 : propositions de transfert entre administrateurs (délégation, demande de
 * reprise), réponses, annulation, listes (contracts/api.md). Rien ne change de mains sans l'accord du
 * destinataire.
 */
describe('Transferts entre administrateurs', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let admin: string;
  let admin2: string;
  let admin3: string;
  let superadmin: string;
  let adminId: string;
  let admin2Id: string;
  let admin3Id: string;
  let reprographieId: string;
  let circuitB: string;

  const api = () => request(app.getHttpServer());
  const get = (cookie: string, path: string) => api().get(path).set('Cookie', cookie);
  const post = (cookie: string, path: string, body: Record<string, unknown> = {}) =>
    api().post(path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const act = (cookie: string, id: string, body: Record<string, unknown>) => post(cookie, `/api/requests/${id}/actions`, body);
  const propose = (cookie: string, id: string, body: Record<string, unknown>) => post(cookie, `/api/admin/requests/${id}/transfers`, body);
  const owner = async (id: string) => (await prisma.request.findUniqueOrThrow({ where: { id } })).adminOwnerId;
  const notified = async (id: string, type: string) =>
    (await prisma.notification.findMany({ where: { requestId: id, type: type as never } })).map((n) => n.userId).sort();
  const audited = async (id: string) =>
    (await prisma.auditLog.findMany({ where: { action: 'REQUEST_MANAGED', targetId: id }, orderBy: { createdAt: 'asc' } })).map(
      (e) => (e.details as { action: string }).action,
    );
  const denied = () => prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
  const ids = (res: { body: { items: Array<{ id: string }> } }) => res.body.items.map((t) => t.id);

  /** Demande soumise puis prise en charge par « admin ». */
  async function owned(): Promise<{ id: string; version: number }> {
    const created = await post(enseignante, '/api/requests', {
      clientId: randomUUID(),
      title: 'Réparer le vidéoprojecteur',
      description: 'Salle 12',
      categoryId: circuitB,
      priority: 'NORMAL',
    });
    expect(created.status).toBe(201);
    const claimed = await post(admin, `/api/admin/requests/${created.body.id}/claim`, { version: created.body.version });
    expect(claimed.status).toBe(200);
    return { id: created.body.id, version: claimed.body.version };
  }

  const delegation = (id: string, recipientId = admin2Id, reason = 'Je suis sur une urgence.') =>
    propose(admin, id, { type: 'DELEGATION_REQUEST', recipientId, reason });
  const takeover = (id: string, cookie = admin2, reason = 'Je connais ce fournisseur.') => propose(cookie, id, { type: 'TAKEOVER_REQUEST', reason });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    admin2Id = await createSecondAdmin(prisma);
    admin3Id = await createSecondAdmin(prisma, 'admin3', 'Troisième administrateur');
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    admin = await loginAs(app, 'admin');
    admin2 = await loginAs(app, 'admin2');
    admin3 = await loginAs(app, 'admin3');
    superadmin = await loginAs(app, 'superadmin');
    adminId = await userId(prisma, 'admin');
    reprographieId = await userId(prisma, 'reprographie');
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('délégation (US2)', () => {
    it('proposition : en attente, délai de réponse du réglage, destinataire notifié, responsable inchangé et toujours actif', async () => {
      const { id, version } = await owned();
      const before = Date.now();
      const res = await delegation(id);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        type: 'DELEGATION_REQUEST',
        status: 'PENDING',
        reason: 'Je suis sur une urgence.',
        responseReason: null,
        cancelCause: null,
        request: { id, title: 'Réparer le vidéoprojecteur', priority: 'NORMAL', status: 'PENDING_ADMIN_VALIDATION' },
        initiator: { id: adminId, displayName: expect.any(String) },
        recipient: { id: admin2Id, displayName: 'Seconde administratrice' },
        currentOwner: { id: adminId },
        respondedAt: null,
        cancelledAt: null,
        canAccept: false,
        canReject: false,
        canCancel: true,
      });
      const delay = new Date(res.body.expiresAt).getTime() - before;
      expect(delay).toBeGreaterThan(119 * 60_000);
      expect(delay).toBeLessThan(121 * 60_000);

      expect(await owner(id)).toBe(adminId);
      expect(await notified(id, 'TRANSFER_DELEGATION_REQUESTED')).toEqual([admin2Id]);
      expect(await audited(id)).toEqual(['CLAIM', 'TRANSFER_PROPOSED']);

      // Vue du destinataire : il peut répondre, pas annuler.
      const seen = await get(admin2, `/api/admin/transfers/${res.body.id}`);
      expect(seen.body).toMatchObject({ canAccept: true, canReject: true, canCancel: false });
      // Détail de la demande : la proposition en attente y est signalée, et plus aucune autre n'est possible.
      const detail = await get(admin, `/api/requests/${id}`);
      expect(detail.body.ownership).toEqual({ canClaim: false, canDelegate: false, canAskTakeover: false, pendingTransferId: res.body.id });

      // Pendant l'attente, le responsable continue de traiter la demande (FR-016).
      const approved = await act(admin, id, { action: 'APPROVE', version, assigneeId: reprographieId });
      expect(approved.status).toBe(200);
      expect(await owner(id)).toBe(adminId);
      await expect(prisma.requestTransfer.findUniqueOrThrow({ where: { id: res.body.id } })).resolves.toMatchObject({ status: 'PENDING' });
    });

    it('acceptation : le collègue devient responsable, l’historique garde l’ancien, l’auteur est notifié', async () => {
      const { id } = await owned();
      const proposed = await delegation(id);
      const versionBefore = (await prisma.request.findUniqueOrThrow({ where: { id } })).version;

      const res = await post(admin2, `/api/admin/transfers/${proposed.body.id}/accept`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ACCEPTED', canAccept: false, canReject: false, canCancel: false });
      expect(res.body.respondedAt).toBeTruthy();

      const row = await prisma.request.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ adminOwnerId: admin2Id, version: versionBefore + 1, status: 'PENDING_ADMIN_VALIDATION' });
      const history = await prisma.requestAssignment.findMany({ where: { requestId: id }, orderBy: { seq: 'asc' } });
      expect(history.map((h) => h.operation)).toEqual(['CLAIMED', 'TRANSFERRED']);
      expect(history[1]).toMatchObject({
        adminId: admin2Id,
        previousAdminId: adminId,
        actorId: admin2Id,
        reason: 'Je suis sur une urgence.',
        transferId: proposed.body.id,
      });
      expect(await notified(id, 'TRANSFER_ACCEPTED')).toEqual([adminId]);
      expect(await audited(id)).toEqual(['CLAIM', 'TRANSFER_PROPOSED', 'TRANSFER_ACCEPTED']);

      // La demande change d'espace : le nouveau responsable agit, l'ancien consulte.
      expect((await get(admin2, '/api/admin/requests/mine')).body.items.map((r: { id: string }) => r.id)).toContain(id);
      expect((await get(admin, '/api/admin/requests/mine')).body.items.map((r: { id: string }) => r.id)).not.toContain(id);
      expect((await get(admin, `/api/requests/${id}`)).body.allowedActions).toEqual([]);
      expect((await get(admin2, `/api/requests/${id}`)).body.allowedActions.sort()).toEqual(['APPROVE', 'CHANGE_PRIORITY', 'REJECT']);
    });

    it('refus, avec ou sans motif : le responsable garde la demande et en est notifié', async () => {
      for (const responseReason of ['Je suis en congé demain.', undefined]) {
        const { id } = await owned();
        const proposed = await delegation(id);
        const res = await post(admin2, `/api/admin/transfers/${proposed.body.id}/reject`, responseReason ? { responseReason } : {});
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'REJECTED', responseReason: responseReason ?? null });
        expect(res.body.respondedAt).toBeTruthy();
        expect(await owner(id)).toBe(adminId);
        await expect(prisma.requestAssignment.count({ where: { requestId: id } })).resolves.toBe(1);
        expect(await notified(id, 'TRANSFER_REJECTED')).toEqual([adminId]);
        expect(await audited(id)).toEqual(['CLAIM', 'TRANSFER_PROPOSED', 'TRANSFER_REJECTED']);
        // Après un refus, une nouvelle proposition redevient possible.
        expect((await get(admin, `/api/requests/${id}`)).body.ownership).toMatchObject({ canDelegate: true, pendingTransferId: null });
      }
    });

    it('annulation par l’auteur : tracée, le destinataire est prévenu, rien d’autre ne change', async () => {
      const { id } = await owned();
      const proposed = await delegation(id);
      const res = await post(admin, `/api/admin/transfers/${proposed.body.id}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', cancelCause: 'INITIATOR' });
      expect(res.body.cancelledAt).toBeTruthy();
      expect(await owner(id)).toBe(adminId);
      expect(await notified(id, 'TRANSFER_CANCELLED')).toEqual([admin2Id]);
      expect(await audited(id)).toEqual(['CLAIM', 'TRANSFER_PROPOSED', 'TRANSFER_CANCELLED']);
      // Le destinataire ne peut plus y répondre.
      const late = await post(admin2, `/api/admin/transfers/${proposed.body.id}/accept`);
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe('TRANSFER_ALREADY_ANSWERED');
    });

    it('motif obligatoire ; destinataire soi-même, inactif, hors catégorie, non-admin ou absent : refusés avec un message utile', async () => {
      const { id } = await owned();
      for (const reason of [undefined, '', '   ']) {
        const res = await propose(admin, id, { type: 'DELEGATION_REQUEST', recipientId: admin2Id, ...(reason === undefined ? {} : { reason }) });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('REASON_REQUIRED');
      }
      const invalid = async (recipientId: string | undefined) => {
        const res = await propose(admin, id, { type: 'DELEGATION_REQUEST', reason: 'Surcharge.', ...(recipientId ? { recipientId } : {}) });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('TRANSFER_RECIPIENT_INVALID');
        expect(res.body.error.message).toMatch(/administrateur/i);
      };
      await invalid(adminId);
      await invalid(undefined);
      await invalid(reprographieId);
      await invalid(await userId(prisma, 'superadmin'));
      await invalid(randomUUID());
      await prisma.user.update({ where: { id: admin3Id }, data: { active: false } });
      await invalid(admin3Id);
      await prisma.user.update({ where: { id: admin3Id }, data: { active: true } });
      await prisma.categoryManager.delete({ where: { categoryId_userId: { categoryId: circuitB, userId: admin3Id } } });
      await invalid(admin3Id);
      await prisma.categoryManager.create({ data: { categoryId: circuitB, userId: admin3Id } });

      expect((await propose(admin, id, { type: 'DELEGATION_REQUEST', recipientId: 'pas-un-uuid', reason: 'x' })).status).toBe(400);
      expect((await propose(admin, id, { type: 'AUTRE', recipientId: admin2Id, reason: 'x' })).status).toBe(400);
      expect((await propose(admin, id, { type: 'DELEGATION_REQUEST', recipientId: admin2Id, reason: 'x'.repeat(501) })).status).toBe(400);
      await expect(prisma.requestTransfer.count({ where: { requestId: id } })).resolves.toBe(0);
    });

    it('une seule proposition en attente par demande', async () => {
      const { id } = await owned();
      expect((await delegation(id)).status).toBe(201);
      for (const again of [await delegation(id, admin3Id), await takeover(id, admin3)]) {
        expect(again.status).toBe(409);
        expect(again.body.error.code).toBe('TRANSFER_PENDING_EXISTS');
      }
      await expect(prisma.requestTransfer.count({ where: { requestId: id } })).resolves.toBe(1);
    });

    it('seul le responsable délègue ; seul le destinataire répond ; seul l’auteur annule (403 journalisés)', async () => {
      const { id } = await owned();
      let before = await denied();
      const notMine = await propose(admin2, id, { type: 'DELEGATION_REQUEST', recipientId: admin3Id, reason: 'Je la confie.' });
      expect(notMine.status).toBe(403);
      expect(await denied()).toBe(before + 1);

      const proposed = await delegation(id);
      before = await denied();
      expect((await post(admin3, `/api/admin/transfers/${proposed.body.id}/accept`)).status).toBe(403);
      expect((await post(admin, `/api/admin/transfers/${proposed.body.id}/accept`)).status).toBe(403);
      expect((await post(admin, `/api/admin/transfers/${proposed.body.id}/reject`)).status).toBe(403);
      expect((await post(admin2, `/api/admin/transfers/${proposed.body.id}/cancel`)).status).toBe(403);
      expect((await post(superadmin, `/api/admin/transfers/${proposed.body.id}/accept`)).status).toBe(403);
      expect(await denied()).toBe(before + 5);
      expect((await post(enseignante, `/api/admin/transfers/${proposed.body.id}/accept`)).status).toBe(403);
      expect((await post(admin2, `/api/admin/transfers/${randomUUID()}/accept`)).status).toBe(404);
      expect((await post(admin2, '/api/admin/transfers/pas-un-uuid/accept')).status).toBe(404);

      expect(await owner(id)).toBe(adminId);
      await expect(prisma.requestTransfer.findUniqueOrThrow({ where: { id: proposed.body.id } })).resolves.toMatchObject({ status: 'PENDING' });
    });

    it('collègues proposés pour une délégation : admins actifs de la catégorie, sans soi-même, nom et fonction seulement', async () => {
      const { id } = await owned();
      const res = await get(admin, `/api/admin/requests/${id}/transfer-candidates`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: admin2Id, displayName: 'Seconde administratrice', jobTitle: 'Administration' },
        { id: admin3Id, displayName: 'Troisième administrateur', jobTitle: 'Administration' },
      ]);
      expect((await get(admin2, `/api/admin/requests/${id}/transfer-candidates`)).status).toBe(403);
      expect((await get(enseignante, `/api/admin/requests/${id}/transfer-candidates`)).status).toBe(403);
    });
  });

  describe('demande de reprise (US3)', () => {
    it('adressée au responsable par le serveur ; acceptée : le demandeur devient responsable', async () => {
      const { id } = await owned();
      const asked = await takeover(id);
      expect(asked.status).toBe(201);
      expect(asked.body).toMatchObject({
        type: 'TAKEOVER_REQUEST',
        status: 'PENDING',
        initiator: { id: admin2Id },
        recipient: { id: adminId },
        currentOwner: { id: adminId },
        canCancel: true,
        canAccept: false,
      });
      expect(await owner(id)).toBe(adminId);
      expect(await notified(id, 'TRANSFER_TAKEOVER_REQUESTED')).toEqual([adminId]);

      // Le demandeur ne s'accorde pas lui-même la demande.
      expect((await post(admin2, `/api/admin/transfers/${asked.body.id}/accept`)).status).toBe(403);
      expect(await owner(id)).toBe(adminId);

      const accepted = await post(admin, `/api/admin/transfers/${asked.body.id}/accept`);
      expect(accepted.status).toBe(200);
      expect(await owner(id)).toBe(admin2Id);
      const history = await prisma.requestAssignment.findMany({ where: { requestId: id }, orderBy: { seq: 'asc' } });
      expect(history[1]).toMatchObject({ operation: 'TRANSFERRED', adminId: admin2Id, previousAdminId: adminId, actorId: adminId, transferId: asked.body.id });
      expect(await notified(id, 'TRANSFER_ACCEPTED')).toEqual([admin2Id]);
    });

    it('refusée : le responsable garde la demande, le refus est enregistré', async () => {
      const { id } = await owned();
      const asked = await takeover(id);
      const res = await post(admin, `/api/admin/transfers/${asked.body.id}/reject`, { responseReason: 'Je termine dans l’heure.' });
      expect(res.body).toMatchObject({ status: 'REJECTED', responseReason: 'Je termine dans l’heure.' });
      expect(await owner(id)).toBe(adminId);
      expect(await notified(id, 'TRANSFER_REJECTED')).toEqual([admin2Id]);
    });

    it('un destinataire transmis par le navigateur est refusé ; le responsable ne demande pas sa propre demande', async () => {
      const { id } = await owned();
      const forced = await propose(admin2, id, { type: 'TAKEOVER_REQUEST', reason: 'x', recipientId: admin3Id });
      expect(forced.status).toBe(400);
      const self = await takeover(id, admin);
      expect(self.status).toBe(422);
      expect(self.body.error.code).toBe('TRANSFER_RECIPIENT_INVALID');
      await expect(prisma.requestTransfer.count({ where: { requestId: id } })).resolves.toBe(0);
    });

    it('demande libre ou terminée : pas de transfert possible', async () => {
      const free = await post(enseignante, '/api/requests', { clientId: randomUUID(), title: 'Libre', description: 'x', categoryId: circuitB, priority: 'NORMAL' });
      const onFree = await takeover(free.body.id);
      expect(onFree.status).toBe(409);
      expect(onFree.body.error.code).toBe('TRANSFER_NOT_POSSIBLE');

      const { id, version } = await owned();
      await act(admin, id, { action: 'REJECT', version, reason: 'Hors périmètre.' });
      for (const res of [await takeover(id), await delegation(id)]) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('TRANSFER_NOT_POSSIBLE');
      }
    });

    it('admin hors de la catégorie, employé, demande inconnue : refusés sans rien révéler', async () => {
      const { id } = await owned();
      await prisma.categoryManager.delete({ where: { categoryId_userId: { categoryId: circuitB, userId: admin3Id } } });
      expect((await takeover(id, admin3)).status).toBe(404);
      await prisma.categoryManager.create({ data: { categoryId: circuitB, userId: admin3Id } });
      expect((await takeover(randomUUID())).status).toBe(404);
      expect((await takeover(id, enseignante)).status).toBe(403);
      expect((await takeover(id, superadmin)).status).toBe(403);
    });
  });

  describe('listes (FR-019)', () => {
    it('reçues, envoyées, historique : chacun ne voit que les siennes, les plus récentes d’abord', async () => {
      const a = await owned();
      const pending = (await delegation(a.id)).body.id as string;
      const b = await owned();
      const refused = (await delegation(b.id)).body.id as string;
      await post(admin2, `/api/admin/transfers/${refused}/reject`);
      const c = await owned();
      const asked = (await takeover(c.id, admin3)).body.id as string;

      const received = await get(admin2, '/api/admin/transfers/received');
      expect(received.status).toBe(200);
      expect(ids(received)).toContain(pending);
      expect(ids(received)).not.toContain(refused);
      expect(ids(received)).not.toContain(asked);
      for (const t of received.body.items) expect(t).toMatchObject({ status: 'PENDING', recipient: { id: admin2Id }, canAccept: true });
      expect(ids(await get(admin2, '/api/admin/transfers/received?status=all'))).toEqual(expect.arrayContaining([pending, refused]));

      const sent = await get(admin, '/api/admin/transfers/sent');
      expect(ids(sent)).toContain(pending);
      expect(ids(sent)).not.toContain(refused);
      expect(ids(await get(admin, '/api/admin/transfers/received'))).toContain(asked);
      expect(ids(await get(admin3, '/api/admin/transfers/sent'))).toEqual([asked]);

      for (const cookie of [admin, admin2]) {
        const history = await get(cookie, '/api/admin/transfers/history');
        expect(ids(history)).toContain(refused);
        expect(ids(history)).not.toContain(pending);
        for (const t of history.body.items) expect(t.status).not.toBe('PENDING');
        const dates = history.body.items.map((t: { createdAt: string }) => t.createdAt);
        expect(dates).toEqual([...dates].sort().reverse());
      }
      expect(ids(await get(admin3, '/api/admin/transfers/history'))).not.toContain(refused);

      const summary = await get(admin2, '/api/admin/requests/summary');
      expect(summary.body.transfersReceivedPending).toBe(received.body.items.length);
      expect((await get(admin, '/api/admin/requests/summary')).body.transfersSentPending).toBe(sent.body.items.length);

      expect((await get(admin, '/api/admin/transfers/received?status=autre')).status).toBe(400);
      expect((await get(admin, `/api/admin/transfers/received?recipientId=${admin2Id}`)).status).toBe(400);
      expect((await get(enseignante, '/api/admin/transfers/received')).status).toBe(403);
    });

    it('une proposition n’est lisible que par ses participants, les admins de la catégorie et le super administrateur', async () => {
      const { id } = await owned();
      const proposed = (await delegation(id)).body.id as string;
      for (const cookie of [admin, admin2, admin3, superadmin]) expect((await get(cookie, `/api/admin/transfers/${proposed}`)).status).toBe(200);
      await prisma.categoryManager.delete({ where: { categoryId_userId: { categoryId: circuitB, userId: admin3Id } } });
      expect((await get(admin3, `/api/admin/transfers/${proposed}`)).status).toBe(404);
      await prisma.categoryManager.create({ data: { categoryId: circuitB, userId: admin3Id } });
      expect((await get(enseignante, `/api/admin/transfers/${proposed}`)).status).toBe(403);
    });
  });
});
