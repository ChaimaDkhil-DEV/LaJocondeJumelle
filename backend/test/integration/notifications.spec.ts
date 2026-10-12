import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T067 — API des notifications (contracts/rest-api.md §Notifications). */
describe('Notifications', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;

  const api = () => request(app.getHttpServer());

  async function createRequest(title: string): Promise<void> {
    await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        title,
        description: 'x',
        categoryId: await categoryId(prisma, CATEGORIES.photocopies),
        recipientId: await userId(prisma, 'reprographie'),
        priority: 'NORMAL',
      })
      .expect(201);
  }

  function markRead(cookie: string, body: Record<string, unknown>) {
    return api().post('/api/notifications/read').set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    for (const title of ['Demande A', 'Demande B', 'Demande C']) await createRequest(title);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('liste les notifications non lues de l’utilisateur, avec le total et la demande liée', async () => {
    const res = await api().get('/api/notifications?unread=true').set('Cookie', reprographie);
    expect(res.status).toBe(200);
    expect(res.body.unreadTotal).toBe(3);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0]).toEqual({
      id: expect.any(String),
      type: 'REQUEST_NEW',
      priority: 'NORMAL',
      request: { id: expect.any(String), reference: expect.stringMatching(/^D-/), title: 'Demande C' },
      createdAt: expect.any(String),
      readAt: null,
    });

    const own = await api().get('/api/notifications?unread=true').set('Cookie', enseignante);
    expect(own.body).toMatchObject({ items: [], unreadTotal: 0 });
  });

  it('pagine par curseur', async () => {
    const page1 = await api().get('/api/notifications?limit=2').set('Cookie', reprographie);
    expect(page1.body.items).toHaveLength(2);
    const page2 = await api()
      .get(`/api/notifications?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set('Cookie', reprographie);
    expect(page2.body.items.map((n: { request: { title: string } }) => n.request.title)).toEqual(['Demande A']);
  });

  it('marque comme lues les notifications choisies, sans toucher à celles des autres', async () => {
    const list = await api().get('/api/notifications?unread=true').set('Cookie', reprographie);
    const [first] = list.body.items as Array<{ id: string }>;

    // Un autre utilisateur ne peut pas marquer les notifications de la reprographie.
    expect((await markRead(enseignante, { ids: [first.id] })).status).toBe(204);
    await expect(prisma.notification.findUniqueOrThrow({ where: { id: first.id } })).resolves.toMatchObject({ readAt: null });

    expect((await markRead(reprographie, { ids: [first.id] })).status).toBe(204);
    const after = await api().get('/api/notifications?unread=true').set('Cookie', reprographie);
    expect(after.body.unreadTotal).toBe(2);
  });

  it('marque tout comme lu', async () => {
    expect((await markRead(reprographie, { all: true })).status).toBe(204);
    const after = await api().get('/api/notifications?unread=true').set('Cookie', reprographie);
    expect(after.body).toMatchObject({ items: [], unreadTotal: 0 });
    const all = await api().get('/api/notifications').set('Cookie', reprographie);
    expect(all.body.items.every((n: { readAt: string | null }) => n.readAt !== null)).toBe(true);
  });

  it.each([
    ['un corps vide', {}],
    ['ids et all à la fois', { ids: [randomUUID()], all: true }],
    ['all à false', { all: false }],
    ['des identifiants invalides', { ids: ['pas-un-uuid'] }],
  ])('refuse %s (400)', async (_label, body) => {
    const res = await markRead(reprographie, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
