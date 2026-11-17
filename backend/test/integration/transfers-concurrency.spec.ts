import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransfersService } from '../../src/transfers/transfers.service';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createSecondAdmin } from '../utils/second-admin';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T034, T035 — 018 : accès concurrents aux propositions (SC-002, research R2), propositions rendues
 * caduques (FR-017) et expiration (FR-018). Aucune de ces situations ne change le responsable sans
 * l'accord du destinataire.
 */
describe('Transferts — concurrence, caducité, expiration', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let transfers: TransfersService;
  let enseignante: string;
  let admin: string;
  let admin2: string;
  let admin3: string;
  let adminId: string;
  let admin2Id: string;
  let admin3Id: string;
  let circuitB: string;

  const api = () => request(app.getHttpServer());
  const get = (cookie: string, path: string) => api().get(path).set('Cookie', cookie);
  const post = (cookie: string, path: string, body: Record<string, unknown> = {}) =>
    api().post(path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const row = (id: string) => prisma.request.findUniqueOrThrow({ where: { id } });
  const transfer = (id: string) => prisma.requestTransfer.findUniqueOrThrow({ where: { id } });
  const history = (id: string) => prisma.requestAssignment.findMany({ where: { requestId: id }, orderBy: { seq: 'asc' } });
  const notified = async (id: string, type: string) =>
    (await prisma.notification.findMany({ where: { requestId: id, type: type as never } })).map((n) => n.userId).sort();

  async function owned(): Promise<{ id: string; version: number }> {
    const created = await post(enseignante, '/api/requests', {
      clientId: randomUUID(),
      title: 'Réparer le vidéoprojecteur',
      description: 'Salle 12',
      categoryId: circuitB,
      priority: 'NORMAL',
    });
    const claimed = await post(admin, `/api/admin/requests/${created.body.id}/claim`, { version: created.body.version });
    expect(claimed.status).toBe(200);
    return { id: created.body.id, version: claimed.body.version };
  }

  const delegate = async (id: string, recipientId = admin2Id) => {
    const res = await post(admin, `/api/admin/requests/${id}/transfers`, { type: 'DELEGATION_REQUEST', recipientId, reason: 'Surcharge.' });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    admin2Id = await createSecondAdmin(prisma);
    admin3Id = await createSecondAdmin(prisma, 'admin3', 'Troisième administrateur');
    app = await createTestApp();
    transfers = app.get(TransfersService);
    enseignante = await loginAs(app, 'enseignante');
    admin = await loginAs(app, 'admin');
    admin2 = await loginAs(app, 'admin2');
    admin3 = await loginAs(app, 'admin3');
    adminId = await userId(prisma, 'admin');
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('deux acceptations simultanées : une seule est appliquée, une seule ligne d’historique (SC-002)', async () => {
    for (let round = 0; round < 12; round += 1) {
      const { id } = await owned();
      const transferId = await delegate(id);
      const results = await Promise.all([
        post(admin2, `/api/admin/transfers/${transferId}/accept`),
        post(admin2, `/api/admin/transfers/${transferId}/accept`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe('TRANSFER_ALREADY_ANSWERED');
      expect((await row(id)).adminOwnerId).toBe(admin2Id);
      expect((await history(id)).map((h) => h.operation)).toEqual(['CLAIMED', 'TRANSFERRED']);
      expect(await notified(id, 'TRANSFER_ACCEPTED')).toEqual([adminId]);
      await expect(prisma.auditLog.count({ where: { action: 'REQUEST_MANAGED', targetId: id } })).resolves.toBe(3);
    }
  });

  it('acceptation et refus simultanés, acceptation et annulation simultanées : une seule issue', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { id } = await owned();
      const transferId = await delegate(id);
      const other = round % 2 === 0 ? post(admin2, `/api/admin/transfers/${transferId}/reject`) : post(admin, `/api/admin/transfers/${transferId}/cancel`);
      const results = await Promise.all([post(admin2, `/api/admin/transfers/${transferId}/accept`), other]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const final = await transfer(transferId);
      expect(['ACCEPTED', 'REJECTED', 'CANCELLED']).toContain(final.status);
      // Le responsable n'a changé que si c'est l'acceptation qui l'a emporté.
      expect((await row(id)).adminOwnerId).toBe(final.status === 'ACCEPTED' ? admin2Id : adminId);
      expect(await history(id)).toHaveLength(final.status === 'ACCEPTED' ? 2 : 1);
    }
  });

  it('deux propositions simultanées sur la même demande : une seule est enregistrée', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { id } = await owned();
      const results = await Promise.all([
        post(admin2, `/api/admin/requests/${id}/transfers`, { type: 'TAKEOVER_REQUEST', reason: 'Je m’en charge.' }),
        post(admin3, `/api/admin/requests/${id}/transfers`, { type: 'TAKEOVER_REQUEST', reason: 'Je m’en charge.' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe('TRANSFER_PENDING_EXISTS');
      await expect(prisma.requestTransfer.count({ where: { requestId: id, status: 'PENDING' } })).resolves.toBe(1);
    }
  });

  it('demande terminée avant la réponse : la proposition est annulée dans la même opération, la cause est tracée', async () => {
    // Refus par le responsable.
    const a = await owned();
    const first = await delegate(a.id);
    const rejected = await post(admin, `/api/requests/${a.id}/actions`, { action: 'REJECT', version: a.version, reason: 'Hors périmètre.' });
    expect(rejected.status).toBe(200);
    await expect(transfer(first)).resolves.toMatchObject({ status: 'CANCELLED', cancelCause: 'REQUEST_FINISHED' });
    expect((await transfer(first)).cancelledAt).not.toBeNull();
    expect(await notified(a.id, 'TRANSFER_CANCELLED')).toEqual([admin2Id]);

    // Annulation par la demandeuse : les deux administrateurs sont prévenus.
    const b = await owned();
    const second = await delegate(b.id);
    await post(enseignante, `/api/requests/${b.id}/actions`, { action: 'CANCEL', version: b.version });
    await expect(transfer(second)).resolves.toMatchObject({ status: 'CANCELLED', cancelCause: 'REQUEST_FINISHED' });
    expect(await notified(b.id, 'TRANSFER_CANCELLED')).toEqual([adminId, admin2Id].sort());

    // Répondre ensuite est refusé, et rien ne change de mains.
    const late = await post(admin2, `/api/admin/transfers/${second}/accept`);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('TRANSFER_ALREADY_ANSWERED');
    expect((await row(b.id)).adminOwnerId).toBe(adminId);
    expect((await get(admin2, `/api/admin/transfers/${second}`)).body).toMatchObject({ canAccept: false, canReject: false });
  });

  it('responsable changé entre la proposition et la réponse : refus explicite, proposition annulée, responsable intact', async () => {
    const { id } = await owned();
    const transferId = await delegate(id);
    // Le responsable change par un autre chemin (ici, directement en base : aucune route du lot 2 ne le fait sans annuler la proposition).
    await prisma.request.update({ where: { id }, data: { adminOwnerId: admin3Id, adminOwnedAt: new Date(), version: { increment: 1 } } });

    const res = await post(admin2, `/api/admin/transfers/${transferId}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRANSFER_OWNER_CHANGED');
    await expect(transfer(transferId)).resolves.toMatchObject({ status: 'CANCELLED', cancelCause: 'OWNER_CHANGED' });
    expect((await row(id)).adminOwnerId).toBe(admin3Id);
    expect((await history(id)).map((h) => h.operation)).toEqual(['CLAIMED']);
  });

  it('destinataire devenu inactif ou sorti de la catégorie avant d’accepter : refusé, proposition annulée', async () => {
    const { id } = await owned();
    const transferId = await delegate(id, admin3Id);
    await prisma.categoryManager.delete({ where: { categoryId_userId: { categoryId: circuitB, userId: admin3Id } } });
    const res = await post(admin3, `/api/admin/transfers/${transferId}/accept`);
    await prisma.categoryManager.create({ data: { categoryId: circuitB, userId: admin3Id } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TRANSFER_RECIPIENT_INVALID');
    await expect(transfer(transferId)).resolves.toMatchObject({ status: 'CANCELLED', cancelCause: 'PARTICIPANT_UNAVAILABLE' });
    expect((await row(id)).adminOwnerId).toBe(adminId);
  });

  describe('expiration (passage du job)', () => {
    const expire = (id: string) => prisma.requestTransfer.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    it('proposition échue : « expirée », les deux administrateurs prévenus une seule fois, aucun transfert', async () => {
      const { id } = await owned();
      const due = await delegate(id);
      const other = await owned();
      const notDue = await delegate(other.id);
      await expire(due);

      const first = await transfers.expireDue();
      expect(first.expired).toBeGreaterThanOrEqual(1);
      await expect(transfer(due)).resolves.toMatchObject({ status: 'EXPIRED', cancelCause: null });
      expect((await transfer(due)).cancelledAt).not.toBeNull();
      await expect(transfer(notDue)).resolves.toMatchObject({ status: 'PENDING' });
      expect((await row(id)).adminOwnerId).toBe(adminId);
      expect(await history(id)).toHaveLength(1);
      expect(await notified(id, 'TRANSFER_EXPIRED')).toEqual([adminId, admin2Id].sort());
      const audit = await prisma.auditLog.findMany({ where: { action: 'REQUEST_MANAGED', targetId: id }, orderBy: { createdAt: 'asc' } });
      expect(audit.at(-1)).toMatchObject({ actorId: null, details: { action: 'TRANSFER_EXPIRED', transferId: due } });

      // Second passage : rien de plus, aucune notification en double.
      const second = await transfers.expireDue();
      expect(second.expired).toBe(0);
      expect(await notified(id, 'TRANSFER_EXPIRED')).toHaveLength(2);

      // Une nouvelle proposition redevient possible sur la demande.
      expect((await get(admin, `/api/requests/${id}`)).body.ownership).toMatchObject({ canDelegate: true, pendingTransferId: null });
    });

    it('réponse à une proposition échue que le job n’a pas encore vue : refusée, marquée expirée, aucun transfert', async () => {
      const { id } = await owned();
      const transferId = await delegate(id);
      await expire(transferId);
      expect((await get(admin2, `/api/admin/transfers/${transferId}`)).body).toMatchObject({ canAccept: false, canReject: false });
      const res = await post(admin2, `/api/admin/transfers/${transferId}/accept`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TRANSFER_ALREADY_ANSWERED');
      await expect(transfer(transferId)).resolves.toMatchObject({ status: 'EXPIRED' });
      expect((await row(id)).adminOwnerId).toBe(adminId);
      expect(await notified(id, 'TRANSFER_EXPIRED')).toEqual([adminId, admin2Id].sort());
    });

    it('participant désactivé ou sorti de la catégorie : la proposition est annulée au passage du job', async () => {
      const a = await owned();
      const toInactive = await delegate(a.id, admin3Id);
      const b = await owned();
      const kept = await delegate(b.id);
      await prisma.user.update({ where: { id: admin3Id }, data: { active: false } });

      const result = await transfers.expireDue();
      await prisma.user.update({ where: { id: admin3Id }, data: { active: true } });
      expect(result.cancelled).toBeGreaterThanOrEqual(1);
      await expect(transfer(toInactive)).resolves.toMatchObject({ status: 'CANCELLED', cancelCause: 'PARTICIPANT_UNAVAILABLE' });
      await expect(transfer(kept)).resolves.toMatchObject({ status: 'PENDING' });
      expect((await row(a.id)).adminOwnerId).toBe(adminId);
      expect(await notified(a.id, 'TRANSFER_CANCELLED')).toContain(adminId);
    });

    it('délai de réponse : celui du réglage au moment de la proposition', async () => {
      await prisma.setting.upsert({
        where: { key: 'transferResponseMinutes' },
        create: { key: 'transferResponseMinutes', value: 30 },
        update: { value: 30 },
      });
      const fresh = await createTestApp();
      try {
        const cookie = await loginAs(fresh, 'admin');
        const { id } = await owned();
        const before = Date.now();
        const res = await request(fresh.getHttpServer())
          .post(`/api/admin/requests/${id}/transfers`)
          .set('Cookie', cookie)
          .set('Origin', TEST_ORIGIN)
          .send({ type: 'DELEGATION_REQUEST', recipientId: admin2Id, reason: 'Surcharge.' });
        expect(res.status).toBe(201);
        const delay = new Date(res.body.expiresAt).getTime() - before;
        expect(delay).toBeGreaterThan(29 * 60_000);
        expect(delay).toBeLessThan(31 * 60_000);
      } finally {
        await fresh.close();
        await prisma.setting.delete({ where: { key: 'transferResponseMinutes' } });
      }
    });
  });
});
