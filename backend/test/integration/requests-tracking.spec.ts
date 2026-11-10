import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type RequestStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 016 — « Suivi de mes demandes » (accueil de l'enseignant) : trois groupes de statuts (en attente,
 * validées / traitées, archives), comptés et listés côté serveur, limités aux demandes que
 * l'utilisateur connecté a lui-même envoyées.
 */
describe('Suivi de mes demandes', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let autre: string;
  let enseignanteId: string;
  let autreId: string;
  let photocopies: string;
  let counter = 0;
  const byStatus = new Map<RequestStatus, string>();

  const api = () => request(app.getHttpServer());
  const ids = (res: request.Response) => (res.body.items as Array<{ id: string }>).map((r) => r.id).sort();

  async function insert(status: RequestStatus, requesterId: string, kind: 'WORK' | 'COVERAGE' = 'WORK'): Promise<string> {
    counter += 1;
    const row = await prisma.request.create({
      data: {
        number: 700_000 + counter,
        reference: `D-2026-${String(700_000 + counter)}`,
        clientId: randomUUID(),
        title: `Demande ${status}`,
        description: 'x',
        categoryId: photocopies,
        priority: 'NORMAL',
        requesterId,
        status,
        kind,
        rulesSnapshot: {},
      },
    });
    return row.id;
  }

  // D2 : une demande acceptée est en cours de traitement (« En attente »).
  const PENDING: RequestStatus[] = ['PENDING_ADMIN_VALIDATION', 'SENT', 'ACCEPTED', 'IN_PROGRESS', 'TO_CORRECT', 'PENDING_FINAL_VALIDATION'];
  const HANDLED: RequestStatus[] = ['DONE'];
  const ARCHIVED: RequestStatus[] = ['CLOSED', 'REJECTED', 'CANCELLED'];

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    autre = await loginAs(app, 'autre');
    enseignanteId = await userId(prisma, 'enseignante');
    autreId = await userId(prisma, 'autre');
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);

    for (const status of [...PENDING, ...HANDLED, ...ARCHIVED, 'DRAFT'] as RequestStatus[]) {
      byStatus.set(status, await insert(status, enseignanteId));
    }
    // Demandes d'un autre enseignant : jamais comptées ni listées pour l'enseignante.
    await insert('SENT', autreId);
    await insert('DONE', autreId);
    await insert('CLOSED', autreId);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('compte les demandes envoyées par l’utilisateur, par groupe (brouillons exclus)', async () => {
    const res = await api().get('/api/requests/tracking').set('Cookie', enseignante);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pending: PENDING.length, handled: HANDLED.length, archived: ARCHIVED.length });
  });

  it('ne compte jamais les demandes des autres', async () => {
    const res = await api().get('/api/requests/tracking').set('Cookie', autre);
    expect(res.body).toEqual({ pending: 1, handled: 1, archived: 1 });
  });

  it.each([
    ['pending', PENDING],
    ['handled', HANDLED],
    ['archived', ARCHIVED],
  ] as const)('liste le groupe « %s » : exactement ses statuts, seulement les demandes de l’utilisateur', async (group, statuses) => {
    const res = await api().get(`/api/requests?scope=mine&tracking=${group}`).set('Cookie', enseignante);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(statuses.map((s) => byStatus.get(s)!).sort());
  });

  it('un groupe inconnu est refusé', async () => {
    const res = await api().get('/api/requests?scope=mine&tracking=everything').set('Cookie', enseignante);
    expect(res.status).toBe(400);
  });

  it('suit les changements de statut : le compteur se met à jour', async () => {
    const sent = byStatus.get('SENT')!;
    await prisma.request.update({ where: { id: sent }, data: { status: 'CANCELLED' } });
    const res = await api().get('/api/requests/tracking').set('Cookie', enseignante);
    expect(res.body).toEqual({ pending: PENDING.length - 1, handled: HANDLED.length, archived: ARCHIVED.length + 1 });
    await prisma.request.update({ where: { id: sent }, data: { status: 'SENT' } });
  });

  it('les affectations (couverture de classe) ne sont pas des demandes de travail : non comptées', async () => {
    await insert('SENT', enseignanteId, 'COVERAGE');
    const res = await api().get('/api/requests/tracking').set('Cookie', enseignante);
    expect(res.body.pending).toBe(PENDING.length);
  });

  it('sans session : 401', async () => {
    expect((await api().get('/api/requests/tracking')).status).toBe(401);
  });
});
