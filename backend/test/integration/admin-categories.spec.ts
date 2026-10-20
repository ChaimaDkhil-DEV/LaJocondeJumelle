import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T100 — US8 : catégories, destinataires, responsables, délais, permissions par rôle et réglages. */
describe('Administration des catégories et réglages', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let enseignante: string;
  let reprographieId: string;
  let responsableId: string;
  let enseignanteId: string;

  const api = () => request(app.getHttpServer());
  const send = (method: 'post' | 'patch' | 'put', url: string, body: unknown) =>
    api()[method](url).set('Cookie', superadmin).set('Origin', TEST_ORIGIN).send(body as object);

  const base = {
    name: 'Matériel de sport',
    circuit: 'A_DIRECT',
    creatorRoles: ['EMPLOYEE', 'ADMIN'],
    closureMode: 'REQUESTER',
    autoCloseAfterMinutes: 0,
    finalValidation: false,
    assignmentMode: 'MANUAL',
    photoRequired: false,
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    superadmin = await loginAs(app, 'superadmin');
    enseignante = await loginAs(app, 'enseignante');
    reprographieId = await userId(prisma, 'reprographie');
    responsableId = await userId(prisma, 'admin');
    enseignanteId = await userId(prisma, 'enseignante');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('Catégories', () => {
    it('liste les catégories avec destinataires, responsables et délais', async () => {
      const res = await api().get('/api/admin/categories').set('Cookie', superadmin);
      expect(res.status).toBe(200);
      const photocopies = res.body.find((c: { name: string }) => c.name === 'Photocopies');
      expect(photocopies).toMatchObject({
        circuit: 'A_DIRECT',
        recipients: [{ id: reprographieId, displayName: 'Reprographie' }],
        managers: [{ id: responsableId, displayName: 'Admin — surveillante générale' }],
      });
      expect(photocopies.deadlineRules).toHaveLength(4);
    });

    it('crée une catégorie avec les délais par défaut, et l’audite', async () => {
      const res = await send('post', '/api/admin/categories', base);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Matériel de sport', active: true, recipients: [], managers: [] });
      expect(res.body.deadlineRules.find((r: { priority: string }) => r.priority === 'URGENT')).toMatchObject({
        validationMinutes: null,
        takeoverMinutes: 15,
        completionMinutes: 120,
      });
      await expect(prisma.auditLog.count({ where: { action: 'CATEGORY_CHANGED', targetId: res.body.id } })).resolves.toBe(1);
    });

    it.each([
      ['un nom déjà utilisé', { ...base, name: 'Photocopies' }, 409],
      ['un nom de plus de 60 caractères', { ...base, name: 'x'.repeat(61) }, 400],
      ['une validation finale en circuit A', { ...base, name: 'A1', finalValidation: true }, 400],
      ['une affectation automatique en circuit A', { ...base, name: 'A2', assignmentMode: 'AUTO' }, 400],
      ['une affectation automatique sans employé désigné', { ...base, name: 'B1', circuit: 'B_ADMIN_VALIDATION', assignmentMode: 'AUTO' }, 400],
      ['un délai de grâce négatif', { ...base, name: 'A3', closureMode: 'AUTO', autoCloseAfterMinutes: -1 }, 400],
    ])('refuse %s', async (_label, body, status) => {
      expect((await send('post', '/api/admin/categories', body)).status).toBe(status);
    });

    it('modifie une catégorie sans toucher aux demandes déjà créées (FR-022)', async () => {
      const id = await categoryId(prisma, CATEGORIES.photocopies);
      const created = await api()
        .post('/api/requests')
        .set('Cookie', enseignante)
        .set('Origin', TEST_ORIGIN)
        .send({ clientId: randomUUID(), title: 'Avant', description: 'x', categoryId: id, recipientId: reprographieId, priority: 'NORMAL' });
      const before = await prisma.request.findUniqueOrThrow({ where: { id: created.body.id } });

      const res = await send('patch', `/api/admin/categories/${id}`, { photoRequired: true, closureMode: 'REQUESTER' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ photoRequired: true, closureMode: 'REQUESTER' });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'CATEGORY_CHANGED', targetId: id }, orderBy: { createdAt: 'desc' } });
      expect(audit.details).toMatchObject({ before: { photoRequired: false }, after: { photoRequired: true } });

      const after = await prisma.request.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(after.rulesSnapshot).toEqual(before.rulesSnapshot);
      await send('patch', `/api/admin/categories/${id}`, { photoRequired: false, closureMode: 'AUTO' }).expect(200);
    });

    it('définit destinataires et responsables (les responsables doivent avoir le rôle requis)', async () => {
      const created = await send('post', '/api/admin/categories', { ...base, name: 'Informatique' });
      const id = created.body.id;
      const recipients = await send('put', `/api/admin/categories/${id}/recipients`, { userIds: [reprographieId, enseignanteId] });
      expect(recipients.status).toBe(200);
      expect(recipients.body.recipients.map((r: { id: string }) => r.id).sort()).toEqual([reprographieId, enseignanteId].sort());

      expect((await send('put', `/api/admin/categories/${id}/managers`, { userIds: [enseignanteId] })).status).toBe(400);
      const managers = await send('put', `/api/admin/categories/${id}/managers`, { userIds: [responsableId] });
      expect(managers.body.managers).toEqual([{ id: responsableId, displayName: 'Admin — surveillante générale' }]);
    });

    it('exige que l’employé désigné en affectation automatique fasse partie des destinataires', async () => {
      const created = await send('post', '/api/admin/categories', {
        ...base,
        name: 'Ménage',
        circuit: 'B_ADMIN_VALIDATION',
        closureMode: 'MANAGER',
      });
      const id = created.body.id;
      expect((await send('patch', `/api/admin/categories/${id}`, { assignmentMode: 'AUTO', autoAssigneeId: reprographieId })).status).toBe(400);
      await send('put', `/api/admin/categories/${id}/recipients`, { userIds: [reprographieId] }).expect(200);
      expect((await send('patch', `/api/admin/categories/${id}`, { assignmentMode: 'AUTO', autoAssigneeId: reprographieId })).status).toBe(200);
      expect((await send('put', `/api/admin/categories/${id}/recipients`, { userIds: [] })).status).toBe(400);
    });

    it('règle les délais par priorité (entiers positifs ou vides), audités', async () => {
      const id = await categoryId(prisma, CATEGORIES.circuitB);
      const rules = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => ({
        priority,
        validationMinutes: 60,
        takeoverMinutes: priority === 'URGENT' ? 5 : null,
        completionMinutes: 240,
      }));
      const res = await send('put', `/api/admin/categories/${id}/deadlines`, { rules });
      expect(res.status).toBe(200);
      expect(res.body.find((r: { priority: string }) => r.priority === 'URGENT')).toMatchObject({ takeoverMinutes: 5 });
      await expect(prisma.auditLog.count({ where: { action: 'DEADLINE_RULE_CHANGED', targetId: id } })).resolves.toBe(1);

      expect((await send('put', `/api/admin/categories/${id}/deadlines`, { rules: rules.slice(0, 3) })).status).toBe(400);
      expect((await send('put', `/api/admin/categories/${id}/deadlines`, { rules: rules.map((r) => ({ ...r, completionMinutes: 0 })) })).status).toBe(400);
      const photocopies = await categoryId(prisma, CATEGORIES.photocopies);
      expect((await send('put', `/api/admin/categories/${photocopies}/deadlines`, { rules })).status).toBe(400); // validation en circuit A
    });
  });

  describe('Permissions par rôle', () => {
    it('lit et remplace les permissions, avec un audit avant/après', async () => {
      const current = await api().get('/api/admin/role-permissions').set('Cookie', superadmin);
      expect(current.body).toEqual({
        EMPLOYEE: ['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE'],
        ADMIN: ['PRIORITY_CHANGE_MANAGED', 'PRIORITY_CHANGE_OWN', 'REQUEST_CREATE', 'REQUEST_REASSIGN'],
      });
      const res = await send('put', '/api/admin/role-permissions', { EMPLOYEE: ['REQUEST_CREATE'], ADMIN: current.body.ADMIN });
      expect(res.status).toBe(200);
      expect(res.body.EMPLOYEE).toEqual(['REQUEST_CREATE']);
      await expect(prisma.auditLog.count({ where: { action: 'ROLE_PERMISSIONS_CHANGED' } })).resolves.toBe(1);
      expect((await send('put', '/api/admin/role-permissions', { EMPLOYEE: ['ADMIN_MANAGE'], ADMIN: [] })).status).toBe(400);
      await send('put', '/api/admin/role-permissions', current.body).expect(200);
    });
  });

  describe('Réglages', () => {
    it('lit et modifie les réglages, un audit par réglage changé', async () => {
      const current = await api().get('/api/admin/settings').set('Cookie', superadmin);
      expect(current.body).toMatchObject({ voiceMaxSeconds: 180, sessionIdleMinutes: 60 });
      const res = await send('put', '/api/admin/settings', { voiceMaxSeconds: 120, draftsEnabled: false });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ voiceMaxSeconds: 120, draftsEnabled: false });
      await expect(prisma.auditLog.count({ where: { action: 'SETTING_CHANGED' } })).resolves.toBe(2);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'SETTING_CHANGED', targetId: 'voiceMaxSeconds' } });
      expect(audit.details).toMatchObject({ before: { value: 180 }, after: { value: 120 } });

      // Les écrans lisent les réglages utiles sans droit d'administration.
      const client = await api().get('/api/settings/client').set('Cookie', enseignante);
      expect(client.body).toEqual({ voiceMaxSeconds: 120, attachmentMaxBytes: 10 * 1024 * 1024, attachmentMaxPerMessage: 5, draftsEnabled: false });
      await send('put', '/api/admin/settings', { voiceMaxSeconds: 180, draftsEnabled: true }).expect(200);
    });

    it.each([
      ['une durée de vocal hors bornes', { voiceMaxSeconds: 5 }],
      ['une taille de pièce jointe au-delà du plafond technique', { attachmentMaxBytes: 100 * 1024 * 1024 }],
      ['un type de photo non pris en charge', { allowedPhotoTypes: ['image/gif'] }],
      ['un seuil d’alerte de 100 %', { deadlineWarnPercent: 100 }],
      ['un réglage inconnu', { couleur: 'bleu' }],
    ])('refuse %s', async (_label, body) => {
      expect((await send('put', '/api/admin/settings', body)).status).toBe(400);
    });
  });
});
