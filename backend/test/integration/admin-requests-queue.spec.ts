import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createSecondAdmin } from '../utils/second-admin';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T013 — 018, US1 : file commune, « mes demandes » et compteurs de l'espace de travail (contracts/api.md). */
describe('Espace de travail des administrateurs — file commune et listes', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let admin: string;
  let admin2: string;
  let superadmin: string;
  let adminId: string;
  let admin2Id: string;
  let circuitB: string;
  let photocopies: string;
  let reprographieId: string;

  const api = () => request(app.getHttpServer());
  const get = (cookie: string, path: string) => api().get(path).set('Cookie', cookie);
  const post = (cookie: string, path: string, body: Record<string, unknown> = {}) =>
    api().post(path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const ids = (res: { body: { items: Array<{ id: string }> } }) => res.body.items.map((r) => r.id);

  async function submit(title: string, priority = 'NORMAL', category = circuitB): Promise<{ id: string; version: number }> {
    const extra = category === photocopies ? { recipientId: reprographieId } : {};
    const res = await post(enseignante, '/api/requests', { clientId: randomUUID(), title, description: 'Salle 12', categoryId: category, priority, ...extra });
    expect(res.status).toBe(201);
    return res.body;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    admin2Id = await createSecondAdmin(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    admin = await loginAs(app, 'admin');
    admin2 = await loginAs(app, 'admin2');
    superadmin = await loginAs(app, 'superadmin');
    adminId = await userId(prisma, 'admin');
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
    reprographieId = await userId(prisma, 'reprographie');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('file commune : demandes libres en attente de validation, urgentes d’abord puis les plus anciennes, avec les champs utiles', async () => {
    const first = await submit('Réparer le vidéoprojecteur');
    const second = await submit('Changer une ampoule');
    const urgent = await submit('Fuite d’eau', 'URGENT');
    const direct = await submit('Photocopies du contrôle', 'NORMAL', photocopies);

    for (const cookie of [admin, admin2]) {
      const res = await get(cookie, '/api/admin/requests/available');
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual([urgent.id, first.id, second.id]);
      expect(ids(res)).not.toContain(direct.id);
    }
    const res = await get(admin, '/api/admin/requests/available');
    expect(res.body.items[1]).toMatchObject({
      id: first.id,
      title: 'Réparer le vidéoprojecteur',
      description: 'Salle 12',
      priority: 'NORMAL',
      status: 'PENDING_ADMIN_VALIDATION',
      requester: { displayName: expect.any(String) },
      category: { id: circuitB },
      adminOwner: null,
      adminOwnedAt: null,
      version: first.version,
    });
    expect(res.body.items[1].createdAt).toBeTruthy();
    expect(res.body.items[1].reference).toMatch(/^D-/);
  });

  it('file commune : limitée aux catégories de l’admin ; le super administrateur la voit entière', async () => {
    const other = await prisma.category.create({
      data: {
        name: 'Informatique (admin2 seul)',
        circuit: 'B_ADMIN_VALIDATION',
        routingMode: 'VIA_ADMIN',
        creatorRoles: ['EMPLOYEE'],
        closureMode: 'MANAGER',
        recipients: { create: { userId: reprographieId } },
        managers: { create: { userId: admin2Id } },
      },
    });
    const { id } = await submit('Installer un logiciel', 'NORMAL', other.id);
    expect(ids(await get(admin, '/api/admin/requests/available'))).not.toContain(id);
    expect(ids(await get(admin2, '/api/admin/requests/available'))).toContain(id);
    expect(ids(await get(superadmin, '/api/admin/requests/available'))).toContain(id);
  });

  it('une demande prise quitte la file de tous et entre dans « mes demandes » de son responsable seulement', async () => {
    const { id, version } = await submit('Remplacer une serrure');
    expect((await post(admin, `/api/admin/requests/${id}/claim`, { version })).status).toBe(200);

    for (const cookie of [admin, admin2, superadmin]) expect(ids(await get(cookie, '/api/admin/requests/available'))).not.toContain(id);
    const mine = await get(admin, '/api/admin/requests/mine');
    expect(ids(mine)).toContain(id);
    expect(mine.body.items.find((r: { id: string }) => r.id === id)).toMatchObject({ adminOwner: { id: adminId, displayName: expect.any(String) } });
    expect(ids(await get(admin2, '/api/admin/requests/mine'))).not.toContain(id);
    expect(ids(await get(superadmin, '/api/admin/requests/mine'))).toEqual([]);
  });

  it('« mes demandes » : toutes, en cours, terminées — d’après la session, jamais d’après un identifiant transmis', async () => {
    const open = await submit('Poser une étagère');
    const closed = await submit('Demande à refuser');
    await post(admin2, `/api/admin/requests/${open.id}/claim`, { version: open.version });
    const claimed = await post(admin2, `/api/admin/requests/${closed.id}/claim`, { version: closed.version });
    const rejected = await post(admin2, `/api/requests/${closed.id}/actions`, { action: 'REJECT', version: claimed.body.version, reason: 'Hors périmètre.' });
    expect(rejected.status).toBe(200);

    expect(ids(await get(admin2, '/api/admin/requests/mine?scope=all'))).toEqual(expect.arrayContaining([open.id, closed.id]));
    const active = ids(await get(admin2, '/api/admin/requests/mine?scope=active'));
    expect(active).toContain(open.id);
    expect(active).not.toContain(closed.id);
    const finished = ids(await get(admin2, '/api/admin/requests/mine?scope=finished'));
    expect(finished).toContain(closed.id);
    expect(finished).not.toContain(open.id);

    // Un identifiant d'administrateur dans la requête est ignoré ou refusé, jamais suivi.
    const spoofed = await get(admin, `/api/admin/requests/mine?adminId=${admin2Id}&ownerId=${admin2Id}`);
    if (spoofed.status === 200) expect(ids(spoofed)).not.toContain(open.id);
    else expect(spoofed.status).toBe(400);
    expect((await get(admin2, '/api/admin/requests/mine?scope=autre')).status).toBe(400);
  });

  it('compteurs : chaque chiffre égale la taille de la liste correspondante', async () => {
    for (const cookie of [admin, admin2, superadmin]) {
      const summary = await get(cookie, '/api/admin/requests/summary');
      expect(summary.status).toBe(200);
      const count = async (path: string) => (await get(cookie, `${path}${path.includes('?') ? '&' : '?'}limit=100`)).body.items.length;
      expect(summary.body).toEqual({
        available: await count('/api/admin/requests/available'),
        mine: await count('/api/admin/requests/mine'),
        active: await count('/api/admin/requests/mine?scope=active'),
        finished: await count('/api/admin/requests/mine?scope=finished'),
        transfersReceivedPending: 0,
        transfersSentPending: 0,
      });
    }
    expect((await get(admin2, '/api/admin/requests/summary')).body.mine).toBeGreaterThan(0);
  });

  it('refuse l’espace de travail à une enseignante (403) et journalise le refus', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
    for (const path of ['/api/admin/requests/available', '/api/admin/requests/mine', '/api/admin/requests/summary', '/api/admin/assignments/mine']) {
      expect((await get(enseignante, path)).status).toBe(403);
    }
    await expect(prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).resolves.toBe(before + 4);
    expect((await api().get('/api/admin/requests/available')).status).toBe(401);
  });
});
