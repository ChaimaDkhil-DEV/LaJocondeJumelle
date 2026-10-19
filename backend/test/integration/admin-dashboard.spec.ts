import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OverdueJob } from '../../src/scheduler/overdue.job';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** Tableau de bord du super administrateur : accès, compteurs, délais, employés et activité. */
describe('Tableau de bord du super administrateur', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let enseignante: string;
  let reprographie: string;
  let responsable: string;
  let reprographieId: string;
  let enseignanteId: string;
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
    responsable = await loginAs(app, 'responsable');
    reprographieId = await userId(prisma, 'reprographie');
    enseignanteId = await userId(prisma, 'enseignante');
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

    const message = await api()
      .post(`/api/requests/${ids.accepted}/messages`)
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), text: 'Contenu privé du message' });
    expect(message.status).toBe(201);
    // Première réponse : message d'une autre personne que la demandeuse.
    const reply = await api()
      .post(`/api/requests/${ids.accepted}/messages`)
      .set('Cookie', reprographie)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), text: 'Réponse de la reprographie' });
    expect(reply.status).toBe(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('accès', () => {
    it.each(['summary', 'performance', 'employees', 'activity', 'export.csv'])('refuse /%s sans session', async (path) => {
      expect((await api().get(`/api/admin/dashboard/${path}`)).status).toBe(401);
    });

    it('refuse un employé et un responsable, et journalise le refus', async () => {
      expect((await get('summary', enseignante)).status).toBe(403);
      expect((await get('employees', responsable)).status).toBe(403);
      expect((await get('export.csv', responsable)).status).toBe(403);
      const denied = await prisma.auditLog.findMany({ where: { action: 'ACCESS_DENIED' } });
      const routes = denied.map((d) => (d.details as { route?: string } | null)?.route);
      expect(routes).toEqual(
        expect.arrayContaining(['/api/admin/dashboard/summary', '/api/admin/dashboard/employees', '/api/admin/dashboard/export.csv']),
      );
    });

    it('n’offre aucune route d’écriture', async () => {
      for (const method of ['post', 'patch', 'put', 'delete'] as const) {
        const res = await api()[method]('/api/admin/dashboard/summary').set('Cookie', superadmin).set('Origin', TEST_ORIGIN).send({});
        expect(res.status).toBe(404);
      }
    });

    it('valide les filtres', async () => {
      expect((await get('summary?tz=Mars/Olympus')).status).toBe(400);
      expect((await get('summary?from=2025-01-01&to=2026-06-01')).status).toBe(400);
      expect((await get('summary?from=2026-02-01&to=2026-01-01')).status).toBe(400);
      expect((await get('summary?priority=TRES_HAUTE')).status).toBe(400);
      expect((await get('activity?cursor=abc')).status).toBe(400);
    });
  });

  describe('synthèse', () => {
    it('compte chaque demande dans un seul groupe', async () => {
      const res = await get('summary?tz=Europe/Paris');
      expect(res.status).toBe(200);
      expect(res.body.counts).toEqual({
        total: 5,
        pendingValidation: 0,
        pendingTakeover: 2,
        inProgress: 1,
        done: 1,
        rejected: 0,
        cancelled: 1,
        overdueInPeriod: 1,
      });
      expect(res.body.current).toEqual({ overdueNow: 1, urgentActive: 1, unassigned: 0 });
      expect(res.body.messages).toEqual({ text: 2, voice: 0 });
      expect(res.body.byCategory).toEqual([
        { category: { id: photocopies, name: CATEGORIES.photocopies }, total: 5, active: 3, done: 1, overdue: 1 },
      ]);
      const daily = res.body.daily as Array<{ created: number; completed: number }>;
      expect(daily.length).toBeGreaterThanOrEqual(30);
      expect(daily.reduce((s, d) => s + d.created, 0)).toBe(5);
      expect(daily.reduce((s, d) => s + d.completed, 0)).toBe(1);
      expect(res.body.alerts.map((a: { id: string }) => a.id)).toEqual([ids.overdue]);
      expect(res.body.alerts[0]).toMatchObject({ overdueStage: 'TAKEOVER', priority: 'URGENT', assignee: { id: reprographieId } });
    });

    it('applique les filtres de priorité, catégorie, employé et période', async () => {
      expect((await get('summary?priority=URGENT')).body.counts.total).toBe(2);
      expect((await get('summary?priority=URGENT&priority=NORMAL')).body.counts.total).toBe(5);
      expect((await get(`summary?categoryId=${circuitB}`)).body.counts.total).toBe(0);
      expect((await get(`summary?employeeId=${reprographieId}`)).body.counts.total).toBe(5);
      const responsableId = await userId(prisma, 'responsable');
      expect((await get(`summary?employeeId=${responsableId}`)).body.counts.total).toBe(0);
      const past = await get('summary?from=2020-01-01&to=2020-01-31');
      expect(past.body.counts.total).toBe(0);
      expect(past.body.daily).toHaveLength(31);
    });

    it('compte les demandes terminées au jour de leur fin de traitement, quelle que soit leur création', async () => {
      const { createdAt } = await prisma.request.findUniqueOrThrow({ where: { id: ids.done } });
      await prisma.request.update({ where: { id: ids.done }, data: { createdAt: new Date(Date.now() - 60 * 86_400_000) } });
      try {
        const res = await get('summary');
        expect(res.body.counts.total).toBe(4);
        expect((res.body.daily as Array<{ completed: number }>).reduce((s, d) => s + d.completed, 0)).toBe(1);

        // Hors de la période de fin de traitement : non comptée.
        const past = await get('summary?from=2020-01-01&to=2020-01-31');
        expect((past.body.daily as Array<{ completed: number }>).reduce((s, d) => s + d.completed, 0)).toBe(0);
        // Les autres filtres s'appliquent toujours.
        const other = await get(`summary?categoryId=${circuitB}`);
        expect((other.body.daily as Array<{ completed: number }>).reduce((s, d) => s + d.completed, 0)).toBe(0);
      } finally {
        await prisma.request.update({ where: { id: ids.done }, data: { createdAt } });
      }
    });

    it('ne renvoie aucun contenu de demande ni de message', async () => {
      for (const path of ['summary', 'performance', 'employees', 'activity?limit=100']) {
        const text = JSON.stringify((await get(path)).body);
        expect(text).not.toMatch(/Description confidentielle|Contenu privé|passwordHash|storagePath|"comment"/);
      }
    });
  });

  describe('export CSV', () => {
    const parse = (text: string) => text.replace(/^\uFEFF/, '').trimEnd().split('\r\n').map((line) => line.split(';'));

    it('exporte les demandes de la période avec les filtres du tableau de bord', async () => {
      const res = await get('export.csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('demandes-de-travail.csv');
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.text.startsWith('\uFEFF')).toBe(true);

      const [header, ...rows] = parse(res.text);
      expect(header.slice(0, 5)).toEqual(['Référence', 'Titre', 'Catégorie', 'Priorité', 'Statut']);
      expect(rows).toHaveLength(5);
      const column = (name: string) => header.indexOf(name);
      const done = await prisma.request.findUniqueOrThrow({ where: { id: ids.done } });
      const doneRow = rows.find((r) => r[0] === done.reference)!;
      expect(doneRow[column('Statut')]).toBe('Terminée');
      expect(doneRow[column('Priorité')]).toBe('Urgente');
      expect(doneRow[column('Employé affecté')]).toBe('Reprographie');
      expect(doneRow[column('Prise en charge (min)')]).toMatch(/^\d+(,\d)?$/);
      expect(doneRow[column('Retard sur la période')]).toBe('Non');
      expect(doneRow[column('Première réponse (min)')]).toBe('');
      const accepted = await prisma.request.findUniqueOrThrow({ where: { id: ids.accepted } });
      expect(rows.find((r) => r[0] === accepted.reference)![column('Première réponse (min)')]).toMatch(/^\d+(,\d)?$/);

      const overdue = await prisma.request.findUniqueOrThrow({ where: { id: ids.overdue } });
      const overdueRow = rows.find((r) => r[0] === overdue.reference)!;
      expect(overdueRow[column('En retard actuellement')]).toBe('Oui (prise en charge)');
      expect(overdueRow[column('Retard sur la période')]).toBe('Oui');
      // Mesure absente : cellule vide plutôt que zéro.
      expect(overdueRow[column('Traitement net (min)')]).toBe('');

      expect(parse((await get('export.csv?priority=URGENT')).text)).toHaveLength(1 + 2);
      expect(parse((await get(`export.csv?categoryId=${circuitB}`)).text)).toHaveLength(1);
    });

    it('n’exporte ni description, ni message', async () => {
      expect((await get('export.csv')).text).not.toMatch(/Description confidentielle|Contenu privé/);
    });
  });

  describe('délais', () => {
    it('mesure les délais sur les seules demandes concernées', async () => {
      const res = await get('performance');
      expect(res.status).toBe(200);
      const { overall } = res.body;
      expect(overall.takeover.count).toBe(2);
      expect(overall.resolution.count).toBe(1);
      expect(overall.validation.count).toBe(0);
      expect(overall.resolution.avgMs).toBeGreaterThanOrEqual(0);
      // Première réponse : seule la reprographie a écrit ; le message de la demandeuse ne compte pas.
      expect(overall.firstReply.count).toBe(1);
      expect(overall.firstReply.avgMs).toBeGreaterThanOrEqual(0);
      expect(res.body.byPriority.find((p: { priority: string }) => p.priority === 'NORMAL').firstReply.count).toBe(1);
      // Seule la demande terminée est évaluée ; la demande en retard est encore en cours.
      expect(overall.compliance).toEqual({ evaluated: 1, onTime: 1, rate: 1 });
      const urgent = res.body.byPriority.find((p: { priority: string }) => p.priority === 'URGENT');
      expect(urgent.total).toBe(2);
    });
  });

  describe('employés', () => {
    it('agrège l’activité de chaque employé', async () => {
      const res = await get('employees');
      expect(res.status).toBe(200);
      const byId = new Map(res.body.items.map((i: { user: { id: string } }) => [i.user.id, i]));
      expect(byId.get(reprographieId)).toMatchObject({
        created: 0,
        assigned: 5,
        pendingTakeover: 2,
        inProgress: 1,
        done: 1,
        overdueNow: 1,
        overdueInPeriod: 1,
        takeover: { count: 2 },
        resolution: { count: 1 },
      });
      expect((byId.get(reprographieId) as { lastActionAt: string | null }).lastActionAt).not.toBeNull();
      expect(byId.get(enseignanteId)).toMatchObject({ created: 5, assigned: 0 });
      expect(Object.keys((byId.get(reprographieId) as { user: object }).user).sort()).toEqual(['active', 'displayName', 'id', 'jobTitle', 'role']);
    });

    it('affiche à zéro les comptes actifs sans demande, sans les super administrateurs ni les comptes désactivés', async () => {
      const responsableId = await userId(prisma, 'responsable');
      const superadminId = await userId(prisma, 'superadmin');
      const inactive = await prisma.user.create({ data: { username: `inactif-${randomUUID()}`, displayName: 'Compte désactivé', role: 'EMPLOYEE', active: false, passwordHash: 'x' } });

      const items = (await get('employees')).body.items as Array<{ user: { id: string } }>;
      const listed = items.map((i) => i.user.id);
      expect(items.find((i) => i.user.id === responsableId)).toMatchObject({ created: 0, assigned: 0, done: 0, takeover: { avgMs: null, count: 0 } });
      expect(listed).not.toContain(superadminId);
      expect(listed).not.toContain(inactive.id);
      // Les comptes avec activité restent en tête.
      expect(listed.indexOf(reprographieId)).toBeLessThan(listed.indexOf(responsableId));
    });

    it('limite les comptes sans activité aux destinataires des catégories filtrées', async () => {
      const responsableId = await userId(prisma, 'responsable');
      const listed = ((await get(`employees?categoryId=${photocopies}`)).body.items as Array<{ user: { id: string } }>).map((i) => i.user.id);
      expect(listed).toContain(reprographieId);
      expect(listed).not.toContain(responsableId);
    });

    it('se limite à l’employé filtré', async () => {
      const res = await get(`employees?employeeId=${enseignanteId}`);
      expect(res.body.items.map((i: { user: { id: string } }) => i.user.id)).toEqual([enseignanteId]);
    });
  });

  describe('activité', () => {
    it('liste les actions, les plus récentes d’abord, avec des métadonnées seulement', async () => {
      const res = await get('activity?limit=100');
      expect(res.status).toBe(200);
      const items = res.body.items as Array<{ type: string; details: Record<string, unknown>; request: { id: string }; createdAt: string }>;
      expect(Object.keys(items[0]).sort()).toEqual(['actor', 'createdAt', 'details', 'id', 'request', 'type']);
      const dates = items.map((i) => Date.parse(i.createdAt));
      expect([...dates].sort((a, b) => b - a)).toEqual(dates);
      expect(items.find((i) => i.type === 'OVERDUE')).toMatchObject({ actor: null, details: { stage: 'TAKEOVER' }, request: { id: ids.overdue } });
      expect(items.find((i) => i.type === 'MESSAGE_ADDED')?.details).toEqual({ kind: 'TEXT' });
      expect(items.find((i) => i.type === 'ASSIGNED')?.details).toEqual({ assignee: { id: reprographieId, displayName: expect.any(String) } });
      const cancel = items.find((i) => i.type === 'STATUS_CHANGED' && i.details.to === 'CANCELLED');
      expect(cancel).toMatchObject({ details: { from: 'SENT', to: 'CANCELLED' }, request: { id: ids.cancelled } });
    });

    it('pagine sans doublon ni perte', async () => {
      const all = (await get('activity?limit=100')).body.items.map((i: { id: string }) => i.id);
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res: request.Response = await get(`activity?limit=4${cursor ? `&cursor=${cursor}` : ''}`);
        seen.push(...res.body.items.map((i: { id: string }) => i.id));
        cursor = res.body.nextCursor;
      } while (cursor);
      expect(seen).toEqual(all);
    });
  });
});
