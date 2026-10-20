import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type NotificationType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OverdueJob } from '../../src/scheduler/overdue.job';
import { SuperAdminAlertsJob } from '../../src/scheduler/super-admin-alerts.job';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Notifications du super administrateur (demandes de travail) : seulement « urgente », « sans
 * employé affecté » et « en retard », une fois par demande et par type ; messages seulement sur
 * une demande urgente ou en retard ; rien sur une demande terminée. Les autres rôles ne changent pas.
 * Le super administrateur est ici aussi responsable des catégories : c'est le cas le plus exposé.
 */
describe('Notifications du super administrateur', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let alertsJob: SuperAdminAlertsJob;
  let overdueJob: OverdueJob;
  let enseignante: string;
  let reprographie: string;
  let superadmin: string;
  let superadminId: string;
  let reprographieId: string;
  let responsableId: string;
  let photocopies: string;
  let circuitB: string;

  const api = () => request(app.getHttpServer());

  async function create(priority: string, options: { category?: string; cookie?: string; recipient?: boolean } = {}): Promise<string> {
    const res = await api()
      .post('/api/requests')
      .set('Cookie', options.cookie ?? enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        title: `Demande ${priority}`,
        description: 'x',
        categoryId: options.category ?? photocopies,
        ...(options.recipient === false ? {} : { recipientId: reprographieId }),
        priority,
      });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  async function act(cookie: string, id: string, action: string, extra: Record<string, unknown> = {}) {
    const { version } = await prisma.request.findUniqueOrThrow({ where: { id } });
    const res = await api().post(`/api/requests/${id}/actions`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send({ action, version, ...extra });
    expect(res.status).toBe(200);
  }

  async function message(cookie: string, id: string): Promise<void> {
    const res = await api().post(`/api/requests/${id}/messages`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send({ clientId: randomUUID(), text: 'Bonjour' });
    expect(res.status).toBe(201);
  }

  async function forSuperAdmin(id: string): Promise<Array<{ type: NotificationType; readAt: Date | null }>> {
    return prisma.notification.findMany({ where: { requestId: id, userId: superadminId }, select: { type: true, readAt: true }, orderBy: { createdAt: 'asc' } });
  }

  async function expire(id: string, field: 'currentDueAt' | 'warnAt'): Promise<void> {
    await prisma.request.update({ where: { id }, data: { [field]: new Date(Date.now() - 60_000) } });
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    alertsJob = app.get(SuperAdminAlertsJob);
    overdueJob = app.get(OverdueJob);
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    superadmin = await loginAs(app, 'superadmin');
    superadminId = await userId(prisma, 'superadmin');
    reprographieId = await userId(prisma, 'reprographie');
    responsableId = await userId(prisma, 'admin');
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
    // Le super administrateur est aussi responsable de ces catégories (sans filtrage, il recevrait tout).
    await prisma.categoryManager.createMany({
      data: [photocopies, circuitB].map((id) => ({ categoryId: id, userId: superadminId })),
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('demande normale : ni création, ni message, ni changement de statut ; le responsable est notifié comme avant', async () => {
    const id = await create('NORMAL', { category: circuitB, recipient: false });
    await message(enseignante, id);
    await act(superadmin, id, 'APPROVE', { assigneeId: reprographieId });
    await act(reprographie, id, 'ACCEPT');
    await alertsJob.runOnce();
    expect(await forSuperAdmin(id)).toEqual([]);
    const forManager = await prisma.notification.findMany({ where: { requestId: id, userId: responsableId } });
    expect(forManager.map((n) => n.type)).toEqual(expect.arrayContaining(['REQUEST_NEW', 'MESSAGE_NEW']));
  });

  it('demande urgente : une alerte à la création, les messages, puis plus rien une fois terminée', async () => {
    const id = await create('URGENT');
    expect((await forSuperAdmin(id)).map((n) => n.type)).toEqual(['URGENT']);

    await message(enseignante, id);
    await act(reprographie, id, 'ACCEPT');
    expect((await forSuperAdmin(id)).map((n) => n.type)).toEqual(['URGENT', 'MESSAGE_NEW']);

    await act(reprographie, id, 'START');
    await act(reprographie, id, 'COMPLETE');
    const after = await forSuperAdmin(id);
    expect(after.map((n) => n.type)).toEqual(['URGENT', 'MESSAGE_NEW']);
    // Demande terminée : les notifications en attente sont marquées comme lues.
    expect(after.every((n) => n.readAt !== null)).toBe(true);

    await expire(id, 'currentDueAt');
    await alertsJob.runOnce();
    expect(await forSuperAdmin(id)).toHaveLength(2);
  });

  it('passage en « Urgente » : une seule alerte, même après plusieurs changements', async () => {
    const id = await create('NORMAL');
    for (const priority of ['URGENT', 'HIGH', 'URGENT']) {
      const { version } = await prisma.request.findUniqueOrThrow({ where: { id } });
      const res = await api().patch(`/api/requests/${id}/priority`).set('Cookie', enseignante).set('Origin', TEST_ORIGIN).send({ priority, version });
      expect(res.status).toBe(200);
    }
    expect((await forSuperAdmin(id)).map((n) => n.type)).toEqual(['URGENT']);
  });

  it('demande en retard : une seule alerte par la tâche planifiée, puis les messages', async () => {
    const id = await create('NORMAL');
    await message(enseignante, id);
    expect(await forSuperAdmin(id)).toEqual([]);

    await expire(id, 'currentDueAt');
    await overdueJob.runOnce(); // notifie les responsables : le super administrateur en est filtré
    expect(await alertsJob.runOnce()).toBeGreaterThanOrEqual(1);
    await alertsJob.runOnce();
    await overdueJob.runOnce();
    expect((await forSuperAdmin(id)).map((n) => n.type)).toEqual(['OVERDUE']);
    expect(await prisma.notification.count({ where: { requestId: id, userId: reprographieId, type: 'OVERDUE' } })).toBe(1);

    await message(enseignante, id);
    expect((await forSuperAdmin(id)).map((n) => n.type)).toEqual(['OVERDUE', 'MESSAGE_NEW']);

    // Annulée : alerte marquée comme lue, aucune nouvelle notification.
    await act(enseignante, id, 'CANCEL');
    const after = await forSuperAdmin(id);
    expect(after).toHaveLength(2);
    expect(after.every((n) => n.readAt !== null)).toBe(true);
  });

  it('demande sans employé affecté : une alerte au seuil « bientôt en retard », puis « en retard »', async () => {
    const id = await create('NORMAL', { category: circuitB, recipient: false });
    await alertsJob.runOnce();
    expect(await forSuperAdmin(id)).toEqual([]);

    await expire(id, 'warnAt');
    await alertsJob.runOnce();
    await alertsJob.runOnce();
    expect((await forSuperAdmin(id)).map((n) => n.type)).toEqual(['UNASSIGNED']);

    await expire(id, 'currentDueAt');
    await alertsJob.runOnce();
    expect((await forSuperAdmin(id)).map((n) => n.type)).toEqual(['UNASSIGNED', 'OVERDUE']);
  });

  it('rien sur une demande terminée ou annulée, même si le délai est dépassé', async () => {
    const id = await create('NORMAL');
    await act(enseignante, id, 'CANCEL');
    await prisma.request.update({ where: { id }, data: { currentStage: 'TAKEOVER', currentDueAt: new Date(Date.now() - 60_000), warnAt: new Date(Date.now() - 120_000) } });
    await alertsJob.runOnce();
    expect(await forSuperAdmin(id)).toEqual([]);
  });

  it('demande du super administrateur lui-même : notifications habituelles conservées', async () => {
    const id = await create('NORMAL', { cookie: superadmin });
    await message(reprographie, id);
    await act(reprographie, id, 'DECLINE', { reason: 'Machine en panne.' });
    expect((await forSuperAdmin(id)).map((n) => n.type)).toEqual(['MESSAGE_NEW', 'REJECTED']);
  });
});
