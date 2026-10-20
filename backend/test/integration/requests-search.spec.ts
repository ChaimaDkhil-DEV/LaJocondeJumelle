import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type Priority, type RequestStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T089 — US7 : recherche et filtres combinés, toujours limités aux demandes autorisées (FR-034, FR-035). */
describe('Recherche et filtres', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;
  let responsable: string;
  let autre: string;
  let photocopies: string;
  let petitsTravaux: string;
  let enseignanteId: string;
  let reprographieId: string;
  let counter = 0;

  const api = () => request(app.getHttpServer());
  const ids = (res: request.Response) => (res.body.items as Array<{ id: string }>).map((r) => r.id);

  async function insert(data: {
    title: string;
    status: RequestStatus;
    priority: Priority;
    category: string;
    createdAt: string;
    overdue?: boolean;
    requesterId?: string;
  }): Promise<string> {
    counter += 1;
    const row = await prisma.request.create({
      data: {
        number: 500_000 + counter,
        reference: `D-2026-${String(500_000 + counter)}`,
        clientId: randomUUID(),
        title: data.title,
        description: 'x',
        categoryId: data.category,
        priority: data.priority,
        requesterId: data.requesterId ?? enseignanteId,
        assigneeId: reprographieId,
        status: data.status,
        createdAt: new Date(data.createdAt),
        overdueStage: data.overdue ? 'TAKEOVER' : null,
        rulesSnapshot: {},
      },
    });
    return row.id;
  }

  let a: string;
  let b: string;
  let c: string;
  let d: string;
  let e: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    responsable = await loginAs(app, 'admin');
    autre = await loginAs(app, 'autre');
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
    petitsTravaux = await categoryId(prisma, CATEGORIES.petitsTravaux);
    enseignanteId = await userId(prisma, 'enseignante');
    reprographieId = await userId(prisma, 'reprographie');

    a = await insert({ title: 'Photocopies brevet blanc', status: 'IN_PROGRESS', priority: 'URGENT', category: photocopies, createdAt: '2026-03-10T09:00:00Z' });
    b = await insert({ title: 'Photocopies conseil de classe', status: 'IN_PROGRESS', priority: 'NORMAL', category: photocopies, createdAt: '2026-04-02T09:00:00Z' });
    c = await insert({ title: 'Étagère salle 12', status: 'DONE', priority: 'URGENT', category: petitsTravaux, createdAt: '2026-04-15T09:00:00Z' });
    d = await insert({ title: 'Affiches portes ouvertes', status: 'SENT', priority: 'HIGH', category: photocopies, createdAt: '2026-05-20T09:00:00Z', overdue: true });
    // Demande d'un autre employé, hors de la visibilité de l'enseignante.
    e = await insert({
      title: 'Photocopies réunion cantine',
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      category: photocopies,
      createdAt: '2026-03-12T09:00:00Z',
      requesterId: await userId(prisma, 'autre'),
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('combine statut et priorité (V15)', async () => {
    const res = await api().get('/api/requests?scope=mine&status=IN_PROGRESS&priority=URGENT').set('Cookie', enseignante);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([a]);
  });

  it('accepte plusieurs valeurs par filtre', async () => {
    const res = await api().get('/api/requests?scope=mine&priority=URGENT&priority=HIGH').set('Cookie', enseignante);
    expect(ids(res).sort()).toEqual([a, c, d].sort());
  });

  it('filtre par catégorie, destinataire et demandeur', async () => {
    expect(ids(await api().get(`/api/requests?scope=mine&categoryId=${petitsTravaux}`).set('Cookie', enseignante))).toEqual([c]);
    expect(ids(await api().get(`/api/requests?scope=all&assigneeId=${reprographieId}`).set('Cookie', enseignante)).sort()).toEqual(
      [a, b, c, d].sort(),
    );
    expect(ids(await api().get(`/api/requests?scope=assigned&requesterId=${enseignanteId}`).set('Cookie', reprographie)).sort()).toEqual(
      [a, b, c, d].sort(),
    );
  });

  it('filtre par période, bornes incluses (dates seules = journées entières)', async () => {
    const res = await api().get('/api/requests?scope=mine&from=2026-04-01&to=2026-04-15').set('Cookie', enseignante);
    expect(ids(res).sort()).toEqual([b, c].sort());
  });

  it('filtre les demandes en retard', async () => {
    expect(ids(await api().get('/api/requests?scope=mine&overdue=true').set('Cookie', enseignante))).toEqual([d]);
    expect(ids(await api().get('/api/requests?scope=mine&overdue=false').set('Cookie', enseignante))).not.toContain(d);
  });

  it('recherche dans le titre, sans tenir compte de la casse', async () => {
    const res = await api().get(`/api/requests?scope=all&q=${encodeURIComponent('PHOTOCOPIES')}`).set('Cookie', enseignante);
    expect(ids(res).sort()).toEqual([a, b].sort());
  });

  it('ne renvoie jamais une demande non autorisée (FR-035)', async () => {
    const forTeacher = await api().get('/api/requests?scope=all&q=cantine').set('Cookie', enseignante);
    expect(ids(forTeacher)).toEqual([]);
    const forManager = await api().get('/api/requests?scope=all&q=cantine').set('Cookie', responsable);
    expect(ids(forManager)).toEqual([e]);
    const forOther = await api().get('/api/requests?scope=all').set('Cookie', autre);
    expect(ids(forOther)).toEqual([e]);
  });

  it('pagine de façon stable, filtres compris', async () => {
    const page1 = await api().get('/api/requests?scope=mine&status=IN_PROGRESS&status=DONE&status=SENT&limit=2').set('Cookie', enseignante);
    const page2 = await api()
      .get(`/api/requests?scope=mine&status=IN_PROGRESS&status=DONE&status=SENT&limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set('Cookie', enseignante);
    expect([...ids(page1), ...ids(page2)]).toEqual([d, c, b, a]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it.each([
    ['une date invalide', 'from=hier'],
    ['un statut inconnu', 'status=PERDU'],
    ['un identifiant de catégorie invalide', 'categoryId=abc'],
    ['une recherche trop longue', `q=${'x'.repeat(121)}`],
  ])('refuse %s (400)', async (_label, query) => {
    const res = await api().get(`/api/requests?${query}`).set('Cookie', enseignante);
    expect(res.status).toBe(400);
  });
});
