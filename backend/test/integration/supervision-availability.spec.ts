import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import {
  addSupport,
  clearCoverages,
  createCoverage,
  minutesFrom,
} from '../utils/coverage-fixtures';
import { useMiddayTimezone } from '../utils/school-timezone';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T012 — Disponibilité des surveillants (data-model §5, FR-010, FR-015i) : candidats = membres actifs
 * du groupe Surveillants ; étage de la classe d'abord ; raisons d'indisponibilité ; un renfort actif
 * rend occupé ; fin inconnue = +∞ ; un indisponible n'est jamais assigné (plus de forçage).
 */
describe('Disponibilité des surveillants (004)', () => {
  let restoreTz = () => undefined as void;
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookies: Record<string, string> = {};
  let now: Date;
  let target: string;

  const api = () => request(app.getHttpServer());
  const candidates = (as = 'admin', id = target) =>
    api().get(`/api/coverage/${id}/candidates`).set('Cookie', cookies[as]);
  const act = (body: Record<string, unknown>, as = 'admin', id = target) =>
    api()
      .post(`/api/coverage/${id}/actions`)
      .set('Cookie', cookies[as])
      .set('Origin', TEST_ORIGIN)
      .send(body);

  type Candidate = {
    id: string;
    displayName: string;
    sameFloor: boolean;
    available: boolean;
    reason: string | null;
  };
  const byName = async (as?: string) =>
    Object.fromEntries(((await candidates(as)).body as Candidate[]).map((c) => [c.displayName, c]));

  beforeAll(async () => {
    // Créneaux « du jour » sans passage de minuit, quelle que soit l'heure d'exécution.
    ({ restore: restoreTz } = useMiddayTimezone());
    app = await createTestApp();
    await resetDatabase(prisma);
    await seedDemo(prisma);
    for (const username of ['admin', 'superadmin', 'surveillant', 'enseignante'])
      cookies[username] = await loginAs(app, username);
  });

  beforeEach(async () => {
    await clearCoverages(prisma);
    now = new Date();
    // Demande en attente pour la classe du 1er étage, dans une heure.
    target = await createCoverage(prisma, {
      status: 'PENDING',
      startAt: minutesFrom(now, 60),
      plannedEndAt: minutesFrom(now, 120),
    });
  });

  afterAll(async () => {
    restoreTz();
    await app.close();
    await prisma.$disconnect();
  });

  it('candidats : membres actifs du groupe Surveillants, étage de la classe d’abord', async () => {
    const res = await candidates();
    expect(res.status).toBe(200);
    expect(
      res.body.map((c: Candidate) => [c.displayName, c.sameFloor, c.available, c.reason]),
    ).toEqual([
      ['Remplaçante', true, true, null],
      ['Surveillant', true, true, null],
      ['Surveillant 2e étage', false, true, null],
    ]);
    expect(res.body[0]).toMatchObject({ floor: { name: '1er étage' } });
  });

  it('un membre désactivé n’est pas proposé ; son assignation est refusée', async () => {
    await prisma.user.update({ where: { username: 'remplacant' }, data: { active: false } });
    expect(Object.keys(await byName())).toEqual(['Surveillant', 'Surveillant 2e étage']);
    const res = await act({ action: 'ASSIGN', assigneeId: await userId(prisma, 'remplacant') });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
  });

  it('disponibilité déclarée : « Indisponible » et « Absent » ; disponibles d’abord dans chaque étage', async () => {
    await prisma.user.update({
      where: { username: 'remplacant' },
      data: { availability: 'UNAVAILABLE' },
    });
    await prisma.user.update({
      where: { username: 'surveillant2' },
      data: { availability: 'ABSENT' },
    });
    const res = await candidates();
    expect(res.body.map((c: Candidate) => [c.displayName, c.available, c.reason])).toEqual([
      ['Surveillant', true, null],
      ['Remplaçante', false, 'UNAVAILABLE'],
      ['Surveillant 2e étage', false, 'ABSENT'],
    ]);
  });

  it('affectation active qui chevauche : occupé ; sans chevauchement : disponible', async () => {
    await createCoverage(prisma, {
      status: 'ACCEPTED',
      source: 'ADMIN_DIRECT',
      assignee: 'surveillant',
      startAt: minutesFrom(now, 90),
      plannedEndAt: minutesFrom(now, 150),
    });
    await createCoverage(prisma, {
      status: 'ACCEPTED',
      source: 'ADMIN_DIRECT',
      assignee: 'surveillant2',
      startAt: minutesFrom(now, 200),
      plannedEndAt: minutesFrom(now, 260),
    });
    const list = await byName();
    expect(list['Surveillant']).toMatchObject({ available: false, reason: 'ON_GUARD' });
    expect(list['Surveillant 2e étage']).toMatchObject({ available: true, reason: null });
  });

  it('fin inconnue (« jusqu’à l’arrivée ») : occupé jusqu’à la fin de la journée de l’école (FR-016a)', async () => {
    await createCoverage(prisma, {
      status: 'ON_DUTY',
      source: 'ADMIN_DIRECT',
      assignee: 'remplacant',
      startAt: minutesFrom(now, -30),
      plannedEndAt: null,
    });
    // Créneau plus tard dans la journée : occupé.
    expect((await byName())['Remplaçante']).toMatchObject({ available: false, reason: 'ON_GUARD' });
    // Créneau du lendemain : disponible (la fin inconnue s'arrête à minuit, heure de l'école).
    const tomorrow = await createCoverage(prisma, {
      status: 'PENDING',
      className: '2e année Bleu',
      startAt: minutesFrom(now, 24 * 60),
      plannedEndAt: minutesFrom(now, 25 * 60),
    });
    const next = (await candidates('admin', tomorrow)).body as Candidate[];
    expect(next.find((c) => c.displayName === 'Remplaçante')).toMatchObject({
      available: true,
      reason: null,
    });
  });

  it('un renfort actif rend occupé ; libéré, il redevient disponible (FR-015i)', async () => {
    const onDuty = await createCoverage(prisma, {
      status: 'ON_DUTY',
      source: 'SUPERVISOR_REPORT',
      className: '2e année Bleu',
      teacher: null,
      assignee: 'surveillant2',
      startAt: minutesFrom(now, -10),
      plannedEndAt: minutesFrom(now, 100),
    });
    const support = await addSupport(prisma, onDuty, 'surveillant');
    expect((await byName())['Surveillant']).toMatchObject({ available: false, reason: 'SUPPORT' });

    await prisma.coverageSupport.update({
      where: { id: support },
      data: { releasedAt: new Date() },
    });
    expect((await byName())['Surveillant']).toMatchObject({ available: true, reason: null });
  });

  describe('assignation', () => {
    it('un surveillant indisponible est refusé : 409 NOT_AVAILABLE, sans forçage possible', async () => {
      await prisma.user.update({
        where: { username: 'surveillant' },
        data: { availability: 'UNAVAILABLE' },
      });
      const assigneeId = await userId(prisma, 'surveillant');
      const refused = await act({ action: 'ASSIGN', assigneeId });
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('NOT_AVAILABLE');

      const forced = await act({ action: 'ASSIGN', assigneeId, force: true });
      expect(forced.status).toBe(400);
      expect(forced.body.error.code).toBe('VALIDATION_ERROR');
      expect((await prisma.request.findUniqueOrThrow({ where: { id: target } })).status).toBe(
        'PENDING',
      );
    });

    it('un employé hors du groupe Surveillants n’est pas assignable', async () => {
      const res = await act({ action: 'ASSIGN', assigneeId: await userId(prisma, 'reprographie') });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
    });

    it('un surveillant d’un autre étage disponible est assignable', async () => {
      const res = await act({ action: 'ASSIGN', assigneeId: await userId(prisma, 'surveillant2') });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ACCEPTED',
        assignee: { displayName: 'Surveillant 2e étage' },
      });
    });
  });

  it('candidats refusés au surveillant et à l’enseignant : 404, refus journalisé', async () => {
    for (const as of ['surveillant', 'enseignante']) {
      const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
      expect((await candidates(as)).status).toBe(404);
      expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBe(before + 1);
    }
  });
});
