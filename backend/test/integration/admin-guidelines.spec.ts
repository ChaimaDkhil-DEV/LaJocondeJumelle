import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** 009, US3 (T014) : consignes gérées par le super administrateur, auditées sans leur texte. */
describe('Administration des consignes', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let admin: string;
  let enseignante: string;
  let photocopiesId: string;
  let superadminId: string;

  const api = () => request(app.getHttpServer());
  const send = (method: 'post' | 'patch' | 'delete', url: string, body?: unknown, cookie = superadmin) =>
    api()[method](url).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body as object);
  const base = { title: 'Pannes de reprographie', body: 'Photocopieuse en panne. Priorité : Haute', categoryId: null, active: true };
  const lastAudit = (guidelineId: string) =>
    prisma.auditLog.findFirstOrThrow({ where: { action: 'GUIDELINE_CHANGED', targetId: guidelineId }, orderBy: { createdAt: 'desc' } });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    superadmin = await loginAs(app, 'superadmin');
    admin = await loginAs(app, 'admin');
    enseignante = await loginAs(app, 'enseignante');
    photocopiesId = await categoryId(prisma, CATEGORIES.photocopies);
    superadminId = await userId(prisma, 'superadmin');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('crée une consigne (texte rogné), liste triée par titre avec la portée et l’auteur, et l’audite', async () => {
    const created = await send('post', '/api/admin/guidelines', { ...base, title: '  Pannes de reprographie ', categoryId: photocopiesId });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      title: 'Pannes de reprographie',
      categoryId: photocopiesId,
      categoryName: 'Photocopies',
      active: true,
      updatedBy: { id: superadminId },
    });
    await send('post', '/api/admin/guidelines', { ...base, title: 'Accueil des parents' });

    const list = await api().get('/api/admin/guidelines').set('Cookie', superadmin);
    expect(list.status).toBe(200);
    expect(list.body.map((g: { title: string }) => g.title)).toEqual(['Accueil des parents', 'Pannes de reprographie']);
    expect(list.body[0]).toMatchObject({ categoryId: null, categoryName: null });

    const audit = await lastAudit(created.body.id);
    expect(audit.actorId).toBe(superadminId);
    expect(audit.details).toEqual({ action: 'CREATED', guidelineId: created.body.id, title: 'Pannes de reprographie', categoryId: photocopiesId });
    expect(JSON.stringify(audit.details)).not.toContain('Photocopieuse en panne');
  });

  it('modifie, désactive puis supprime une consigne ; chaque étape est auditée', async () => {
    const { body: g } = await send('post', '/api/admin/guidelines', { ...base, title: 'À modifier' });

    const updated = await send('patch', `/api/admin/guidelines/${g.id}`, { body: 'Nouveau texte' });
    expect(updated.status).toBe(200);
    expect(updated.body.body).toBe('Nouveau texte');
    expect((await lastAudit(g.id)).details).toMatchObject({ action: 'UPDATED', title: 'À modifier', fields: ['body'] });

    const disabled = await send('patch', `/api/admin/guidelines/${g.id}`, { active: false });
    expect(disabled.body.active).toBe(false);
    expect((await lastAudit(g.id)).details).toMatchObject({ action: 'UPDATED', fields: ['active'], after: { active: false } });

    expect((await send('delete', `/api/admin/guidelines/${g.id}`)).status).toBe(204);
    expect(await prisma.guideline.findUnique({ where: { id: g.id } })).toBeNull();
    expect((await lastAudit(g.id)).details).toMatchObject({ action: 'DELETED', guidelineId: g.id, title: 'À modifier' });
    expect((await send('delete', `/api/admin/guidelines/${g.id}`)).status).toBe(404);
  });

  it.each([
    ['un titre vide', { title: '   ' }, 'title'],
    ['un titre de plus de 120 caractères', { title: 'x'.repeat(121) }, 'title'],
    ['un texte vide', { body: '' }, 'body'],
    ['un texte de plus de 4 000 caractères', { body: 'x'.repeat(4001) }, 'body'],
    ['une catégorie inconnue', { categoryId: '00000000-0000-4000-8000-000000000000' }, 'categoryId'],
  ])('refuse %s', async (_label, patch, field) => {
    const res = await send('post', '/api/admin/guidelines', { ...base, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields.map((f: { field: string }) => f.field)).toContain(field);
  });

  it('refuse une catégorie de garde (seules les demandes de travail ont des consignes)', async () => {
    const garde = await prisma.category.findUniqueOrThrow({ where: { name: 'Garde de classe' } });
    const res = await send('post', '/api/admin/guidelines', { ...base, categoryId: garde.id });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields[0].field).toBe('categoryId');
  });

  it.each([
    ['un admin', () => admin],
    ['une employée', () => enseignante],
  ])('refuse %s, comme le reste de l’espace Administrateur, et le journalise', async (_label, cookie) => {
    const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
    expect((await api().get('/api/admin/guidelines').set('Cookie', cookie())).status).toBe(403);
    expect((await send('post', '/api/admin/guidelines', base, cookie())).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBe(before + 2);
  });
});
