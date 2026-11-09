import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OverdueJob } from '../../src/scheduler/overdue.job';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Tableau de bord : la liste des demandes d'un indicateur (GET /api/admin/dashboard/requests) contient
 * exactement les demandes comptées par ce chiffre dans la synthèse, avec les mêmes filtres.
 */
describe('Tableau de bord : demandes d’un indicateur', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let enseignante: string;
  let reprographie: string;
  let responsable: string;
  let reprographieId: string;
  let photocopies: string;
  let circuitB: string;
  const ids: Record<'done' | 'accepted' | 'sent' | 'cancelled' | 'overdue', string> = {
    done: '',
    accepted: '',
    sent: '',
    cancelled: '',
    overdue: '',
  };

  const api = () => request(app.getHttpServer());
  const get = (path: string, cookie = superadmin) => api().get(`/api/admin/dashboard/${path}`).set('Cookie', cookie);
  const listIds = async (qs: string): Promise<string[]> => {
    const res = await get(`requests?${qs}`);
    expect(res.status).toBe(200);
    return (res.body.items as Array<{ id: string }>).map((r) => r.id);
  };

  async function create(priority: string): Promise<string> {
    const res = await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), title: `Demande ${priority}`, description: 'Description confidentielle', categoryId: photocopies, recipientId: reprographieId, priority });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  async function run(id: string, steps: Array<[string, string]>): Promise<void> {
    let version = (await prisma.request.findUniqueOrThrow({ where: { id } })).version;
    for (const [cookie, action] of steps) {
      const res = await api().post(`/api/requests/${id}/actions`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send({ action, version });
      expect(res.status).toBe(200);
      version = res.body.version;
    }
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    superadmin = await loginAs(app, 'superadmin');
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    responsable = await loginAs(app, 'admin');
    reprographieId = await userId(prisma, 'reprographie');
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);

    ids.done = await create('URGENT');
    await run(ids.done, [
      [reprographie, 'ACCEPT'],
      [reprographie, 'START'],
      [reprographie, 'COMPLETE'],
    ]);
    ids.accepted = await create('NORMAL');
    await run(ids.accepted, [[reprographie, 'ACCEPT']]);
    ids.sent = await create('NORMAL');
    ids.cancelled = await create('NORMAL');
    await run(ids.cancelled, [[enseignante, 'CANCEL']]);
    ids.overdue = await create('URGENT');
    await prisma.request.update({ where: { id: ids.overdue }, data: { currentDueAt: new Date(Date.now() - 60_000) } });
    await app.get(OverdueJob).runOnce();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('accès et validation', () => {
    it('refuse sans session', async () => {
      expect((await api().get('/api/admin/dashboard/requests?indicator=total')).status).toBe(401);
    });

    it('refuse un employé et un responsable', async () => {
      expect((await get('requests?indicator=total', enseignante)).status).toBe(403);
      expect((await get('requests?indicator=total', responsable)).status).toBe(403);
    });

    it.each([
      ['sans indicateur', 'requests'],
      ['indicateur inconnu', 'requests?indicator=tout'],
      ['curseur invalide', 'requests?indicator=total&cursor=abc'],
      ['curseur sans identifiant valide', `requests?indicator=total&cursor=${Buffer.from(JSON.stringify([new Date().toISOString(), 'x'])).toString('base64url')}`],
      ['période inversée', 'requests?indicator=total&from=2026-02-01&to=2026-01-01'],
    ])('refuse une requête invalide : %s', async (_case, path) => {
      expect((await get(path)).status).toBe(400);
    });
  });

  describe('même périmètre que le chiffre de la synthèse', () => {
    const expected = () => ({
      total: [ids.overdue, ids.cancelled, ids.sent, ids.accepted, ids.done],
      pendingValidation: [],
      pendingTakeover: [ids.overdue, ids.sent],
      inProgress: [ids.accepted],
      done: [ids.done],
      rejected: [],
      cancelled: [ids.cancelled],
      overdueInPeriod: [ids.overdue],
      overdueNow: [ids.overdue],
      urgentActive: [ids.overdue],
      unassigned: [],
    });

    it.each(Object.keys(expected()))('%s : les demandes comptées, les plus récentes d’abord', async (indicator) => {
      const summary = (await get('summary')).body as { counts: Record<string, number>; current: Record<string, number> };
      const counted = indicator in summary.current ? summary.current[indicator] : summary.counts[indicator];
      const list = await listIds(`indicator=${indicator}`);
      expect(list).toEqual(expected()[indicator as keyof ReturnType<typeof expected>]);
      expect(list).toHaveLength(counted!);
    });

    it('sans employé affecté : la demande envoyée sans employé', async () => {
      const { assigneeId } = await prisma.request.findUniqueOrThrow({ where: { id: ids.sent } });
      await prisma.request.update({ where: { id: ids.sent }, data: { assigneeId: null } });
      try {
        expect((await get('summary')).body.current.unassigned).toBe(1);
        expect(await listIds('indicator=unassigned')).toEqual([ids.sent]);
      } finally {
        await prisma.request.update({ where: { id: ids.sent }, data: { assigneeId } });
      }
    });
  });

  describe('filtres', () => {
    it('applique priorité, catégorie et employé comme la synthèse (employé : demandeur ou affecté)', async () => {
      expect(await listIds('indicator=total&priority=URGENT')).toEqual([ids.overdue, ids.done]);
      expect(await listIds(`indicator=total&categoryId=${circuitB}`)).toEqual([]);
      expect(await listIds(`indicator=total&employeeId=${reprographieId}`)).toHaveLength(5);
      const enseignanteId = await userId(prisma, 'enseignante');
      expect(await listIds(`indicator=total&employeeId=${enseignanteId}`)).toHaveLength(5);
      expect(await listIds(`indicator=total&employeeId=${await userId(prisma, 'admin')}`)).toEqual([]);
    });

    it('période : appliquée aux chiffres de la période, ignorée pour la situation actuelle', async () => {
      const past = 'from=2020-01-01&to=2020-01-31';
      expect(await listIds(`indicator=total&${past}`)).toEqual([]);
      expect(await listIds(`indicator=overdueInPeriod&${past}`)).toEqual([]);
      expect(await listIds(`indicator=urgentActive&${past}`)).toEqual([ids.overdue]);
      expect(await listIds(`indicator=overdueNow&${past}`)).toEqual([ids.overdue]);
    });
  });

  it('pagine sans doublon ni oubli', async () => {
    const first = await get('requests?indicator=total&limit=2');
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await get(`requests?indicator=total&limit=2&cursor=${first.body.nextCursor}`);
    const third = await get(`requests?indicator=total&limit=2&cursor=${second.body.nextCursor}`);
    expect(third.body.nextCursor).toBeNull();
    const all = [...first.body.items, ...second.body.items, ...third.body.items].map((r: { id: string }) => r.id);
    expect(all).toEqual([ids.overdue, ids.cancelled, ids.sent, ids.accepted, ids.done]);
  });

  it('renvoie seulement les champs utiles à la liste, sans contenu de demande', async () => {
    const res = await get('requests?indicator=overdueNow');
    expect(res.body.items[0]).toEqual({
      id: ids.overdue,
      reference: expect.any(String),
      title: 'Demande URGENT',
      priority: 'URGENT',
      status: 'SENT',
      overdueStage: 'TAKEOVER',
      currentDueAt: expect.any(String),
      createdAt: expect.any(String),
      category: { id: photocopies, name: CATEGORIES.photocopies },
      requester: { id: expect.any(String), displayName: expect.any(String) },
      assignee: { id: reprographieId, displayName: expect.any(String) },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Description confidentielle|passwordHash|storagePath/);
  });
});
