import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createSecondAdmin } from '../utils/second-admin';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T048, T049 — 018, US5 : supervision par le super administrateur (toutes les demandes et leur
 * responsable, administrateurs et leur charge, propositions de transfert) et réattribution administrative
 * (FR-026 à FR-028). Routes /super-admin/* : super administrateur seulement.
 */
describe('Supervision et réattribution par le super administrateur', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let admin: string;
  let admin2: string;
  let superadmin: string;
  let adminId: string;
  let admin2Id: string;
  let admin3Id: string;
  let superadminId: string;
  let reprographieId: string;
  let circuitB: string;
  let photocopies: string;

  const api = () => request(app.getHttpServer());
  const get = (cookie: string, path: string) => api().get(path).set('Cookie', cookie);
  const post = (cookie: string, path: string, body: Record<string, unknown> = {}) =>
    api().post(path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const reassign = (id: string, body: Record<string, unknown>, cookie = superadmin) => post(cookie, `/api/super-admin/requests/${id}/reassign`, body);
  const row = (id: string) => prisma.request.findUniqueOrThrow({ where: { id } });
  const history = (id: string) => prisma.requestAssignment.findMany({ where: { requestId: id }, orderBy: { seq: 'asc' } });
  const notified = async (id: string, type: string) =>
    (await prisma.notification.findMany({ where: { requestId: id, type: type as never } })).map((n) => n.userId).sort();
  const ids = (res: { body: { items: Array<{ id: string }> } }) => res.body.items.map((r) => r.id);

  async function submit(title = 'Réparer le vidéoprojecteur', priority = 'NORMAL'): Promise<{ id: string; version: number }> {
    const res = await post(enseignante, '/api/requests', { clientId: randomUUID(), title, description: 'Salle 12', categoryId: circuitB, priority });
    expect(res.status).toBe(201);
    return res.body;
  }

  /** Demande prise en charge par « admin » (ou par le compte donné). */
  async function owned(cookie = admin, title?: string, priority?: string): Promise<{ id: string; version: number }> {
    const created = await submit(title, priority);
    const claimed = await post(cookie, `/api/admin/requests/${created.id}/claim`, { version: created.version });
    expect(claimed.status).toBe(200);
    return { id: created.id, version: claimed.body.version };
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    admin2Id = await createSecondAdmin(prisma);
    admin3Id = await createSecondAdmin(prisma, 'admin3', 'Troisième administrateur');
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    admin = await loginAs(app, 'admin');
    admin2 = await loginAs(app, 'admin2');
    superadmin = await loginAs(app, 'superadmin');
    adminId = await userId(prisma, 'admin');
    superadminId = await userId(prisma, 'superadmin');
    reprographieId = await userId(prisma, 'reprographie');
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('réattribution administrative (FR-028)', () => {
    it('d’un administrateur à un autre, sans leur accord : historique, version, notifications, audit, statut inchangé', async () => {
      const { id, version } = await owned();
      const res = await reassign(id, { adminId: admin2Id, reason: 'Mme Admin est absente cette semaine.' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, status: 'PENDING_ADMIN_VALIDATION', version: version + 1, adminOwner: { id: admin2Id } });

      expect(await row(id)).toMatchObject({ adminOwnerId: admin2Id, status: 'PENDING_ADMIN_VALIDATION' });
      const lines = await history(id);
      expect(lines.map((h) => h.operation)).toEqual(['CLAIMED', 'REASSIGNED']);
      expect(lines[1]).toMatchObject({
        adminId: admin2Id,
        previousAdminId: adminId,
        actorId: superadminId,
        reason: 'Mme Admin est absente cette semaine.',
        transferId: null,
      });
      expect(await notified(id, 'ADMIN_OWNER_REASSIGNED')).toEqual([adminId, admin2Id].sort());
      const audit = await prisma.auditLog.findMany({ where: { action: 'REQUEST_MANAGED', targetId: id }, orderBy: { createdAt: 'asc' } });
      expect(audit.at(-1)).toMatchObject({
        actorId: superadminId,
        details: { action: 'OWNER_REASSIGNED', before: { adminOwnerId: adminId }, after: { adminOwnerId: admin2Id }, reasonGiven: true },
      });
      // Le texte du motif reste dans l'historique, jamais dans le journal d'audit.
      expect(JSON.stringify(audit.at(-1)!.details)).not.toContain('absente');

      // Le nouveau responsable agit, l'ancien consulte.
      expect((await get(admin2, `/api/requests/${id}`)).body.allowedActions.sort()).toEqual(['APPROVE', 'CHANGE_PRIORITY', 'REJECT']);
      expect((await get(admin, `/api/requests/${id}`)).body.allowedActions).toEqual([]);
    });

    it('annule la proposition de transfert en attente, avec sa cause, et prévient ses participants', async () => {
      const { id } = await owned();
      const proposed = await post(admin, `/api/admin/requests/${id}/transfers`, { type: 'DELEGATION_REQUEST', recipientId: admin2Id, reason: 'Surcharge.' });
      expect(proposed.status).toBe(201);
      expect((await reassign(id, { adminId: admin3Id, reason: 'Répartition de la charge.' })).status).toBe(200);

      await expect(prisma.requestTransfer.findUniqueOrThrow({ where: { id: proposed.body.id } })).resolves.toMatchObject({
        status: 'CANCELLED',
        cancelCause: 'REASSIGNED_BY_SUPER_ADMIN',
      });
      expect(await notified(id, 'TRANSFER_CANCELLED')).toEqual([adminId, admin2Id].sort());
      expect(await notified(id, 'ADMIN_OWNER_REASSIGNED')).toEqual([adminId, admin3Id].sort());
      expect((await row(id)).adminOwnerId).toBe(admin3Id);
      const late = await post(admin2, `/api/admin/transfers/${proposed.body.id}/accept`);
      expect(late.status).toBe(409);
      expect((await row(id)).adminOwnerId).toBe(admin3Id);
    });

    it('attribue une demande libre à un administrateur', async () => {
      const { id } = await submit();
      const res = await reassign(id, { adminId: admin2Id, reason: 'Demande restée sans suite.' });
      expect(res.status).toBe(200);
      expect((await row(id)).adminOwnerId).toBe(admin2Id);
      const lines = await history(id);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ operation: 'REASSIGNED', adminId: admin2Id, previousAdminId: null, actorId: superadminId });
      expect(await notified(id, 'ADMIN_OWNER_REASSIGNED')).toEqual([admin2Id]);
    });

    it('libération : la demande redevient libre et retourne dans la file commune', async () => {
      const { id } = await owned();
      const res = await reassign(id, { adminId: null, reason: 'Compte en cours de désactivation.' });
      expect(res.status).toBe(200);
      expect(res.body.adminOwner).toBeNull();
      expect(await row(id)).toMatchObject({ adminOwnerId: null, adminOwnedAt: null });
      const lines = await history(id);
      expect(lines.at(-1)).toMatchObject({ operation: 'RELEASED', adminId, previousAdminId: adminId, actorId: superadminId, reason: 'Compte en cours de désactivation.' });
      expect(await notified(id, 'ADMIN_OWNER_REASSIGNED')).toEqual([adminId]);
      expect(ids(await get(admin2, '/api/admin/requests/available'))).toContain(id);
      const audit = await prisma.auditLog.findMany({ where: { action: 'REQUEST_MANAGED', targetId: id }, orderBy: { createdAt: 'asc' } });
      expect(audit.at(-1)).toMatchObject({ details: { action: 'OWNER_RELEASED', before: { adminOwnerId: adminId }, after: { adminOwnerId: null } } });
    });

    it('motif obligatoire ; cible inactive, hors catégorie, non-admin, inconnue ou déjà responsable : refusées, rien ne change', async () => {
      const { id } = await owned();
      for (const reason of [undefined, '', '   ']) {
        const res = await reassign(id, { adminId: admin2Id, ...(reason === undefined ? {} : { reason }) });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('REASON_REQUIRED');
      }
      const invalid = async (target: string) => {
        const res = await reassign(id, { adminId: target, reason: 'Répartition.' });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('TRANSFER_RECIPIENT_INVALID');
      };
      await invalid(adminId);
      await invalid(reprographieId);
      await invalid(superadminId);
      await invalid(randomUUID());
      await prisma.user.update({ where: { id: admin3Id }, data: { active: false } });
      await invalid(admin3Id);
      await prisma.user.update({ where: { id: admin3Id }, data: { active: true } });
      await prisma.categoryManager.delete({ where: { categoryId_userId: { categoryId: circuitB, userId: admin3Id } } });
      await invalid(admin3Id);
      await prisma.categoryManager.create({ data: { categoryId: circuitB, userId: admin3Id } });

      expect((await reassign(id, { reason: 'Répartition.' })).status).toBe(400);
      expect((await reassign(id, { adminId: 'pas-un-uuid', reason: 'Répartition.' })).status).toBe(400);
      expect((await reassign(id, { adminId: admin2Id, reason: 'x'.repeat(501) })).status).toBe(400);
      expect((await row(id)).adminOwnerId).toBe(adminId);
      expect(await history(id)).toHaveLength(1);
    });

    it('demande terminée, libération d’une demande déjà libre, demande hors périmètre ou inconnue : refusées', async () => {
      const { id, version } = await owned();
      await post(admin, `/api/requests/${id}/actions`, { action: 'REJECT', version, reason: 'Hors périmètre.' });
      const finished = await reassign(id, { adminId: admin2Id, reason: 'Répartition.' });
      expect(finished.status).toBe(409);
      expect(finished.body.error.code).toBe('TRANSFER_NOT_POSSIBLE');

      const free = await submit();
      const release = await reassign(free.id, { adminId: null, reason: 'Rien à libérer.' });
      expect(release.status).toBe(409);
      expect(release.body.error.code).toBe('TRANSFER_NOT_POSSIBLE');

      // Demande directe (circuit A) : jamais de responsable administratif.
      const direct = await post(enseignante, '/api/requests', {
        clientId: randomUUID(),
        title: 'Photocopies',
        description: 'x',
        categoryId: photocopies,
        priority: 'NORMAL',
        recipientId: reprographieId,
      });
      expect((await reassign(direct.body.id, { adminId: adminId, reason: 'x' })).status).toBe(404);
      expect((await reassign(randomUUID(), { adminId: admin2Id, reason: 'x' })).status).toBe(404);
      expect((await reassign('pas-un-uuid', { adminId: admin2Id, reason: 'x' })).status).toBe(404);
    });

    it('ne contourne aucune règle métier : le statut, l’employé affecté et les délais ne bougent pas', async () => {
      const { id, version } = await owned();
      const approved = await post(admin, `/api/requests/${id}/actions`, { action: 'APPROVE', version, assigneeId: reprographieId });
      const before = await row(id);
      expect((await reassign(id, { adminId: admin2Id, reason: 'Suivi de la validation finale.' })).status).toBe(200);
      const after = await row(id);
      expect(after).toMatchObject({
        status: 'SENT',
        assigneeId: reprographieId,
        currentStage: before.currentStage,
        currentDueAt: before.currentDueAt,
        priority: before.priority,
        version: approved.body.version + 1,
      });
      // L'ancien responsable ne peut plus réaffecter l'employé ; le nouveau le peut.
      expect((await post(admin, `/api/requests/${id}/actions`, { action: 'REASSIGN', version: after.version, assigneeId: reprographieId })).status).toBe(403);
      expect((await post(admin2, `/api/requests/${id}/actions`, { action: 'REASSIGN', version: after.version, assigneeId: reprographieId })).status).toBe(200);
    });
  });

  describe('administrateurs proposés pour une réattribution', () => {
    const candidates = (id: string, cookie = superadmin) => get(cookie, `/api/super-admin/requests/${id}/reassign-candidates`);

    it('seuls les admins actifs de la catégorie de la demande, sans celui qui l’a déjà ; nom et fonction seulement', async () => {
      const { id } = await owned();
      const res = await candidates(id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: admin2Id, displayName: 'Seconde administratrice', jobTitle: 'Administration' },
        { id: admin3Id, displayName: 'Troisième administrateur', jobTitle: 'Administration' },
      ]);

      // Un compte désactivé et un admin sorti de la catégorie ne sont pas proposés.
      await prisma.user.update({ where: { id: admin3Id }, data: { active: false } });
      expect((await candidates(id)).body.map((a: { id: string }) => a.id)).toEqual([admin2Id]);
      await prisma.user.update({ where: { id: admin3Id }, data: { active: true } });
      await prisma.categoryManager.delete({ where: { categoryId_userId: { categoryId: circuitB, userId: admin2Id } } });
      expect((await candidates(id)).body.map((a: { id: string }) => a.id)).toEqual([admin3Id]);
      await prisma.categoryManager.create({ data: { categoryId: circuitB, userId: admin2Id } });

      // Chaque administrateur proposé est accepté par la réattribution : la liste et la règle du serveur sont les mêmes.
      for (const candidate of (await candidates(id)).body as Array<{ id: string }>) {
        const fresh = await owned();
        expect((await reassign(fresh.id, { adminId: candidate.id, reason: 'Répartition.' })).status).toBe(200);
      }
    });

    it('demande libre : tous les admins actifs de la catégorie sont proposés', async () => {
      const { id } = await submit();
      expect((await candidates(id)).body.map((a: { id: string }) => a.id).sort()).toEqual([adminId, admin2Id, admin3Id].sort());
    });

    it('demande inconnue ou hors périmètre : 404 ; admin et enseignante : 403', async () => {
      const { id } = await owned();
      expect((await candidates(randomUUID())).status).toBe(404);
      expect((await candidates('pas-un-uuid')).status).toBe(404);
      const direct = await post(enseignante, '/api/requests', { clientId: randomUUID(), title: 'Photocopies', description: 'x', categoryId: photocopies, priority: 'NORMAL', recipientId: reprographieId });
      expect((await candidates(direct.body.id)).status).toBe(404);
      expect((await candidates(id, admin)).status).toBe(403);
      expect((await candidates(id, enseignante)).status).toBe(403);
    });
  });

  describe('pagination de la supervision', () => {
    it('demandes : pages successives par curseur, sans doublon ni trou', async () => {
      for (let i = 0; i < 5; i += 1) await submit(`Pagination ${i}`);
      const all = ids(await get(superadmin, '/api/super-admin/requests?limit=100'));
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res = await get(superadmin, `/api/super-admin/requests?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        expect(res.status).toBe(200);
        expect(res.body.items.length).toBeLessThanOrEqual(3);
        seen.push(...ids(res));
        cursor = res.body.nextCursor;
        pages += 1;
      } while (cursor && pages < 100);
      expect(pages).toBeGreaterThan(1);
      expect(seen).toEqual(all);
      expect(new Set(seen).size).toBe(seen.length);
      // Les filtres s'appliquent aussi aux pages suivantes.
      const first = await get(superadmin, '/api/super-admin/requests?limit=2&ownership=free');
      expect(first.body.nextCursor).toBeTruthy();
      const next = await get(superadmin, `/api/super-admin/requests?limit=2&ownership=free&cursor=${encodeURIComponent(first.body.nextCursor)}`);
      for (const item of next.body.items) expect(item.adminOwner).toBeNull();
    });

    it('transferts : pages successives par curseur', async () => {
      for (let i = 0; i < 3; i += 1) {
        const { id } = await owned();
        const proposed = await post(admin, `/api/admin/requests/${id}/transfers`, { type: 'DELEGATION_REQUEST', recipientId: admin2Id, reason: 'Surcharge.' });
        await post(admin, `/api/admin/transfers/${proposed.body.id}/cancel`);
      }
      const all = ids(await get(superadmin, '/api/super-admin/transfers?limit=100&status=CANCELLED'));
      const first = await get(superadmin, '/api/super-admin/transfers?limit=2&status=CANCELLED');
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toBeTruthy();
      const next = await get(superadmin, `/api/super-admin/transfers?limit=2&status=CANCELLED&cursor=${encodeURIComponent(first.body.nextCursor)}`);
      expect([...ids(first), ...ids(next)]).toEqual(all.slice(0, 4));
    });
  });

  describe('supervision des demandes (FR-026)', () => {
    let free: string;
    let mineOpen: string;
    let mineUrgent: string;
    let otherOpen: string;
    let finished: string;

    beforeAll(async () => {
      free = (await submit('Libre')).id;
      mineOpen = (await owned(admin, 'À admin')).id;
      mineUrgent = (await owned(admin, 'Urgente à admin', 'URGENT')).id;
      otherOpen = (await owned(admin2, 'À admin2')).id;
      const done = await owned(admin2, 'Terminée');
      await post(admin2, `/api/requests/${done.id}/actions`, { action: 'REJECT', version: done.version, reason: 'Non.' });
      finished = done.id;
    });

    const list = (query = '') => get(superadmin, `/api/super-admin/requests?limit=100${query}`);

    it('toutes les demandes « via l’administration » avec leur responsable ; jamais les demandes directes ni les brouillons', async () => {
      const res = await list();
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual(expect.arrayContaining([free, mineOpen, mineUrgent, otherOpen, finished]));
      const byId = new Map(res.body.items.map((r: { id: string }) => [r.id, r]));
      expect(byId.get(free)).toMatchObject({ adminOwner: null, adminOwnerUnavailable: false });
      expect(byId.get(mineOpen)).toMatchObject({ adminOwner: { id: adminId, displayName: expect.any(String) }, adminOwnerUnavailable: false });
      for (const item of res.body.items) expect(item.category.id).toBe(circuitB);
    });

    it('filtres : libres ou prises, en cours ou terminées, administrateur, statut, priorité, période — et leurs combinaisons', async () => {
      const freeOnly = ids(await list('&ownership=free'));
      expect(freeOnly).toContain(free);
      expect(freeOnly).not.toContain(mineOpen);
      const ownedOnly = ids(await list('&ownership=owned'));
      expect(ownedOnly).toEqual(expect.arrayContaining([mineOpen, otherOpen, finished]));
      expect(ownedOnly).not.toContain(free);

      const active = ids(await list('&state=active'));
      expect(active).toContain(mineOpen);
      expect(active).not.toContain(finished);
      expect(ids(await list('&state=finished'))).toContain(finished);
      expect(ids(await list('&state=finished'))).not.toContain(mineOpen);

      const ofAdmin = ids(await list(`&adminId=${adminId}`));
      expect(ofAdmin).toEqual(expect.arrayContaining([mineOpen, mineUrgent]));
      expect(ofAdmin).not.toContain(otherOpen);
      expect(ofAdmin).not.toContain(free);

      expect(ids(await list('&status=REJECTED'))).toContain(finished);
      expect(ids(await list('&status=REJECTED'))).not.toContain(mineOpen);
      const urgent = ids(await list('&priority=URGENT'));
      expect(urgent).toContain(mineUrgent);
      expect(urgent).not.toContain(mineOpen);

      const today = new Date().toISOString().slice(0, 10);
      expect(ids(await list(`&from=${today}&to=${today}`))).toContain(mineOpen);
      expect(ids(await list('&to=2020-01-01'))).toEqual([]);
      expect(ids(await list('&from=2999-01-01'))).toEqual([]);

      expect(ids(await list(`&adminId=${adminId}&priority=URGENT&state=active`))).toEqual([mineUrgent]);
      expect(ids(await list(`&adminId=${admin2Id}&state=finished`))).toEqual([finished]);

      for (const bad of ['&ownership=autre', '&state=autre', '&status=AUTRE', '&priority=HAUTE', '&adminId=pas-un-uuid', '&from=hier', '&inconnu=1']) {
        expect((await list(bad)).status).toBe(400);
      }
    });

    it('signale les demandes dont le responsable n’est plus disponible (désactivé ou sorti de la catégorie)', async () => {
      const flagged = async () =>
        (await list(`&adminId=${admin2Id}`)).body.items.find((r: { id: string }) => r.id === otherOpen).adminOwnerUnavailable as boolean;
      expect(await flagged()).toBe(false);
      await prisma.user.update({ where: { id: admin2Id }, data: { active: false } });
      expect(await flagged()).toBe(true);
      // Rien n'est réattribué en silence.
      expect((await row(otherOpen)).adminOwnerId).toBe(admin2Id);
      await prisma.user.update({ where: { id: admin2Id }, data: { active: true } });
      await prisma.categoryManager.delete({ where: { categoryId_userId: { categoryId: circuitB, userId: admin2Id } } });
      expect(await flagged()).toBe(true);
      await prisma.categoryManager.create({ data: { categoryId: circuitB, userId: admin2Id } });
      expect(await flagged()).toBe(false);
    });

    it('administrateurs et leur charge : demandes en cours, terminées, propositions en attente, dernière opération', async () => {
      const proposed = await post(admin, `/api/admin/requests/${mineOpen}/transfers`, { type: 'DELEGATION_REQUEST', recipientId: admin2Id, reason: 'Surcharge.' });
      expect(proposed.status).toBe(201);
      const res = await get(superadmin, '/api/super-admin/administrators');
      expect(res.status).toBe(200);
      const byId = new Map<string, Record<string, unknown>>(res.body.map((a: { id: string }) => [a.id, a]));
      expect([...byId.keys()].sort()).toEqual([adminId, admin2Id, admin3Id].sort());
      const count = async (ownerId: string, state: string) => (await list(`&adminId=${ownerId}&state=${state}`)).body.items.length;
      for (const id of [adminId, admin2Id, admin3Id]) {
        expect(byId.get(id)).toMatchObject({
          active: true,
          displayName: expect.any(String),
          ownedActive: await count(id, 'active'),
          ownedFinished: await count(id, 'finished'),
        });
      }
      expect(byId.get(adminId)).toMatchObject({ transfersPending: 1 });
      expect(byId.get(admin2Id)).toMatchObject({ transfersPending: 1 });
      expect(byId.get(admin3Id)).toMatchObject({ transfersPending: 0 });
      expect(byId.get(adminId)!.lastOperationAt).toBeTruthy();
      // Aucune donnée personnelle au-delà du nom, de la fonction et de l'état du compte.
      expect(Object.keys(byId.get(adminId)!).sort()).toEqual(
        ['active', 'displayName', 'id', 'jobTitle', 'lastOperationAt', 'ownedActive', 'ownedFinished', 'transfersPending'].sort(),
      );
      await post(admin, `/api/admin/transfers/${proposed.body.id}/cancel`);
    });
  });

  describe('propositions de transfert (FR-027)', () => {
    it('toutes les propositions, par statut', async () => {
      const a = await owned();
      const pending = (await post(admin, `/api/admin/requests/${a.id}/transfers`, { type: 'DELEGATION_REQUEST', recipientId: admin2Id, reason: 'Surcharge.' })).body.id;
      const b = await owned();
      const refused = (await post(admin, `/api/admin/requests/${b.id}/transfers`, { type: 'DELEGATION_REQUEST', recipientId: admin2Id, reason: 'Surcharge.' })).body.id;
      await post(admin2, `/api/admin/transfers/${refused}/reject`);

      const all = await get(superadmin, '/api/super-admin/transfers?limit=100');
      expect(all.status).toBe(200);
      expect(ids(all)).toEqual(expect.arrayContaining([pending, refused]));
      for (const t of all.body.items) expect(t).toMatchObject({ canAccept: false, canReject: false, canCancel: false });

      const only = async (status: string) => ids(await get(superadmin, `/api/super-admin/transfers?limit=100&status=${status}`));
      expect(await only('PENDING')).toContain(pending);
      expect(await only('PENDING')).not.toContain(refused);
      expect(await only('REJECTED')).toContain(refused);
      expect(await only('ACCEPTED')).not.toContain(pending);
      for (const status of ['CANCELLED', 'EXPIRED']) expect((await get(superadmin, `/api/super-admin/transfers?status=${status}`)).status).toBe(200);
      expect((await get(superadmin, '/api/super-admin/transfers?status=AUTRE')).status).toBe(400);
    });
  });

  describe('accès (FR-030, FR-031)', () => {
    it('chaque route /super-admin/* est refusée à un admin et à une enseignante (403 journalisé), et exige une session', async () => {
      const id = (await owned()).id;
      const routes: Array<['get' | 'post', string]> = [
        ['get', '/api/super-admin/requests'],
        ['get', '/api/super-admin/administrators'],
        ['get', '/api/super-admin/transfers'],
        ['get', `/api/super-admin/requests/${id}/reassign-candidates`],
        ['post', `/api/super-admin/requests/${id}/reassign`],
      ];
      for (const cookie of [admin, enseignante]) {
        const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
        for (const [verb, path] of routes) {
          const res = await api()[verb](path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send({ adminId: admin2Id, reason: 'Je me l’attribue.' });
          expect(res.status).toBe(403);
        }
        await expect(prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).resolves.toBe(before + routes.length);
      }
      for (const [verb, path] of routes) expect((await api()[verb](path).set('Origin', TEST_ORIGIN).send({})).status).toBe(401);
      expect((await row(id)).adminOwnerId).toBe(adminId);
    });
  });
});
