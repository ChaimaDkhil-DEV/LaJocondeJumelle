import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T074 — US5 : circuit avec validation administrative (V13). */
describe('Circuit B — validation administrative', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;
  let responsable: string;
  let circuitB: string;
  let reprographieId: string;
  let enseignanteId: string;
  let responsableId: string;

  const api = () => request(app.getHttpServer());

  async function submit(category = circuitB, priority = 'NORMAL'): Promise<{ id: string; version: number }> {
    const res = await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), title: 'Réparer le vidéoprojecteur', description: 'Salle 12', categoryId: category, priority });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_ADMIN_VALIDATION');
    return res.body;
  }

  function act(cookie: string, id: string, body: Record<string, unknown>) {
    return api().post(`/api/requests/${id}/actions`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    responsable = await loginAs(app, 'responsable');
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
    reprographieId = await userId(prisma, 'reprographie');
    enseignanteId = await userId(prisma, 'enseignante');
    responsableId = await userId(prisma, 'responsable');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('la soumission notifie les responsables, apparaît dans « À valider » et reste invisible des agents', async () => {
    const { id } = await submit();
    await expect(prisma.notification.findMany({ where: { requestId: id } })).resolves.toEqual([
      expect.objectContaining({ userId: responsableId, type: 'REQUEST_NEW' }),
    ]);
    const managed = await api().get('/api/requests?scope=managed&status=PENDING_ADMIN_VALIDATION').set('Cookie', responsable);
    expect(managed.body.items.map((r: { id: string }) => r.id)).toContain(id);
    const detail = await api().get(`/api/requests/${id}`).set('Cookie', responsable);
    expect(detail.body.allowedActions.sort()).toEqual(['APPROVE', 'CHANGE_PRIORITY', 'REJECT']);
    expect(detail.body.rulesSnapshot).toMatchObject({ circuit: 'B_ADMIN_VALIDATION', assignmentMode: 'MANUAL', finalValidation: true });

    expect((await api().get(`/api/requests/${id}`).set('Cookie', reprographie)).status).toBe(404);
    const assigned = await api().get('/api/requests?scope=assigned').set('Cookie', reprographie);
    expect(assigned.body.items.map((r: { id: string }) => r.id)).not.toContain(id);
  });

  it('liste les employés affectables aux seuls responsables', async () => {
    const { id } = await submit();
    const res = await api().get(`/api/requests/${id}/assignees`).set('Cookie', responsable);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: reprographieId, displayName: 'Reprographie', jobTitle: 'Reprographie' }]);
    expect((await api().get(`/api/requests/${id}/assignees`).set('Cookie', enseignante)).status).toBe(403);
    expect((await api().get(`/api/requests/${id}/assignees`).set('Cookie', reprographie)).status).toBe(404);
  });

  it('refus : motif obligatoire, statut final « Refusée », demandeuse notifiée avec le motif', async () => {
    const { id, version } = await submit();
    const noReason = await act(responsable, id, { action: 'REJECT', version });
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');

    const rejected = await act(responsable, id, { action: 'REJECT', version, reason: 'Matériel sous garantie : contacter le fournisseur.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'Matériel sous garantie : contacter le fournisseur.' });
    expect(rejected.body.timestamps.rejectedAt).toBeTruthy();
    await expect(prisma.notification.count({ where: { requestId: id, userId: enseignanteId, type: 'REJECTED' } })).resolves.toBe(1);
  });

  it('approbation manuelle : employé obligatoire et choisi parmi les destinataires de la catégorie', async () => {
    const { id, version } = await submit(circuitB, 'URGENT');
    const missing = await act(responsable, id, { action: 'APPROVE', version });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe('ASSIGNEE_REQUIRED');

    const outside = await act(responsable, id, { action: 'APPROVE', version, assigneeId: enseignanteId });
    expect(outside.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');

    const approved = await act(responsable, id, { action: 'APPROVE', version, assigneeId: reprographieId });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'SENT', assignee: { id: reprographieId } });
    expect(approved.body.timestamps.approvedAt).toBeTruthy();
    expect(approved.body.timestamps.assignedAt).toBeTruthy();

    const notifications = await prisma.notification.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' } });
    // Le super administrateur n'a reçu qu'une alerte « urgente », à la soumission (pas à l'approbation).
    const superadminId = await userId(prisma, 'superadmin');
    const sent = notifications.map((n) => `${n.userId}:${n.type}`).sort();
    expect(sent).toEqual(
      [`${responsableId}:URGENT`, `${superadminId}:URGENT`, `${enseignanteId}:STATUS_CHANGED`, `${reprographieId}:URGENT`].sort(),
    );
    expect((await api().get(`/api/requests/${id}`).set('Cookie', reprographie)).status).toBe(200);
  });

  it('affectation automatique : l’employé désigné par la catégorie, sans saisie', async () => {
    const auto = await prisma.category.create({
      data: {
        name: 'Ménage (affectation automatique)',
        circuit: 'B_ADMIN_VALIDATION',
        routingMode: 'VIA_ADMIN',
        creatorRoles: ['EMPLOYEE'],
        closureMode: 'MANAGER',
        assignmentMode: 'AUTO',
        autoAssigneeId: reprographieId,
        recipients: { create: { userId: reprographieId } },
        managers: { create: { userId: responsableId } },
      },
    });
    const { id, version } = await submit(auto.id);
    const detail = await api().get(`/api/requests/${id}`).set('Cookie', responsable);
    expect(detail.body.rulesSnapshot.assignmentMode).toBe('AUTO');
    const approved = await act(responsable, id, { action: 'APPROVE', version });
    expect(approved.status).toBe(200);
    expect(approved.body.assignee).toMatchObject({ id: reprographieId });
  });

  it('annulation par la demandeuse tant que la demande attend la validation', async () => {
    const { id, version } = await submit();
    const cancelled = await act(enseignante, id, { action: 'CANCEL', version });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    await expect(prisma.notification.count({ where: { requestId: id, userId: responsableId, type: 'CANCELLED' } })).resolves.toBe(1);
  });

  it('validation finale : « Terminée » passe en attente, le responsable valide ou renvoie à corriger', async () => {
    const { id, version } = await submit();
    let res = await act(responsable, id, { action: 'APPROVE', version, assigneeId: reprographieId });
    res = await act(reprographie, id, { action: 'ACCEPT', version: res.body.version });
    res = await act(reprographie, id, { action: 'START', version: res.body.version });

    const photo = await api()
      .post('/api/files')
      .set('Cookie', reprographie)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'PHOTO')
      .attach('file', join(__dirname, '..', 'fixtures', 'images', 'photo.png'));
    res = await act(reprographie, id, { action: 'COMPLETE', version: res.body.version, proofFileIds: [photo.body.id] });
    expect(res.body.status).toBe('PENDING_FINAL_VALIDATION');
    await expect(
      prisma.notification.count({ where: { requestId: id, userId: responsableId, type: 'STATUS_CHANGED' } }),
    ).resolves.toBe(1);

    const managerView = await api().get(`/api/requests/${id}`).set('Cookie', responsable);
    // Travail terminé : lecture seule, la priorité est figée ; seules restent les actions du circuit.
    expect(managerView.body.allowedActions.sort()).toEqual(['REQUEST_CORRECTION', 'VALIDATE_FINAL']);
    expect(managerView.body.canWriteInThread).toBe(false);
    const requesterView = await api().get(`/api/requests/${id}`).set('Cookie', enseignante);
    expect(requesterView.body.allowedActions).toEqual([]);

    res = await act(responsable, id, { action: 'REQUEST_CORRECTION', version: res.body.version, reason: 'Le câble HDMI manque.' });
    expect(res.body.status).toBe('TO_CORRECT');
    res = await act(reprographie, id, { action: 'RESUME', version: res.body.version });
    const photo2 = await api()
      .post('/api/files')
      .set('Cookie', reprographie)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'PHOTO')
      .attach('file', join(__dirname, '..', 'fixtures', 'images', 'photo.png'));
    res = await act(reprographie, id, { action: 'COMPLETE', version: res.body.version, proofFileIds: [photo2.body.id] });
    res = await act(responsable, id, { action: 'VALIDATE_FINAL', version: res.body.version });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
    expect(res.body.timestamps.finalValidatedAt).toBeTruthy();
    expect(res.body.timestamps.closedAt).toBeTruthy();
  });

  it('un employé non responsable ne peut ni approuver ni valider (403, journalisé)', async () => {
    const { id, version } = await submit();
    const res = await act(enseignante, id, { action: 'APPROVE', version, assigneeId: reprographieId });
    expect(res.status).toBe(403);
    await expect(
      prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: enseignanteId, targetId: id } }),
    ).resolves.toBe(1);
  });
});
