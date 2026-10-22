import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createCoverage, minutesFrom } from '../utils/coverage-fixtures';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T081 — Matrice des permissions du module (plan.md, principe V) : chaque route × chaque rôle.
 * Hors périmètre : `404` et refus journalisé `ACCESS_DENIED` ; administration du module : `403`
 * journalisé (SuperAdminGuard, écart documenté) ; sans session : `401`.
 */

type Who = 'reprographie' | 'enseignante' | 'surveillant' | 'admin' | 'superadmin';
const ROLES: Who[] = ['reprographie', 'enseignante', 'surveillant', 'admin', 'superadmin'];

const ADMINS: Who[] = ['admin', 'superadmin'];
const SUPERVISORS: Who[] = ['surveillant', 'superadmin'];
const TEACHERS: Who[] = ['enseignante', 'superadmin'];
const MODULE: Who[] = ['enseignante', 'surveillant', 'admin', 'superadmin'];

interface RouteCase {
  name: string;
  method: 'get' | 'post' | 'patch';
  path: () => string;
  body?: () => Record<string, unknown>;
  allowed: Who[];
  /** Refus de l'administration du module (SuperAdminGuard) : 403. */
  forbidden?: boolean;
}

describe('Matrice des permissions des affectations (T081)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  let violet: string;
  let coverageId: string;
  let proposalId: string;

  const send = (who: Who | null, c: RouteCase) => {
    let req = request(app.getHttpServer())[c.method](c.path());
    if (who) req = req.set('Cookie', cookie[who]);
    if (c.method !== 'get') req = req.set('Origin', TEST_ORIGIN).send(c.body?.() ?? {});
    return req;
  };
  const denials = (who: Who) =>
    prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } });
  const slot = () => ({
    startAt: minutesFrom(new Date(), 600).toISOString(),
    endAt: minutesFrom(new Date(), 660).toISOString(),
  });

  const CASES: RouteCase[] = [
    {
      name: 'GET /coverage (file de l’admin)',
      method: 'get',
      path: () => '/api/coverage',
      allowed: ADMINS,
    },
    {
      name: 'GET /coverage/stats',
      method: 'get',
      path: () => '/api/coverage/stats',
      allowed: ADMINS,
    },
    {
      name: 'GET /coverage/form-options',
      method: 'get',
      path: () => '/api/coverage/form-options',
      allowed: ADMINS,
    },
    {
      name: 'GET /coverage/candidates (créneau)',
      method: 'get',
      path: () =>
        `/api/coverage/candidates?classId=${violet}&startAt=${encodeURIComponent(slot().startAt)}&endAt=${encodeURIComponent(slot().endAt)}`,
      allowed: ADMINS,
    },
    {
      name: 'GET /coverage/team',
      method: 'get',
      path: () => '/api/coverage/team',
      allowed: ADMINS,
    },
    {
      name: 'PATCH /coverage/team/:userId/availability',
      method: 'patch',
      path: () => `/api/coverage/team/${id.remplacant}/availability`,
      body: () => ({ availability: 'AVAILABLE' }),
      allowed: ADMINS,
    },
    {
      name: 'POST /coverage (affectation directe)',
      method: 'post',
      path: () => '/api/coverage',
      body: () => ({
        clientId: randomUUID(),
        classId: violet,
        type: 'ABSENCE',
        assigneeId: id.remplacant,
        ...slot(),
      }),
      allowed: ADMINS,
    },
    {
      name: 'GET /coverage/:id/candidates',
      method: 'get',
      path: () => `/api/coverage/${coverageId}/candidates`,
      allowed: ADMINS,
    },
    {
      name: 'GET /coverage/merge-proposals',
      method: 'get',
      path: () => '/api/coverage/merge-proposals',
      allowed: ADMINS,
    },
    {
      name: 'POST /coverage/merge-proposals/:id/decision',
      method: 'post',
      path: () => `/api/coverage/merge-proposals/${proposalId}/decision`,
      body: () => ({ decision: 'REJECT' }),
      allowed: ADMINS,
    },
    {
      name: 'POST /coverage/empty-class',
      method: 'post',
      path: () => '/api/coverage/empty-class',
      body: () => ({ clientId: randomUUID(), classId: violet, teacherId: null }),
      allowed: SUPERVISORS,
    },
    {
      name: 'GET /coverage/mine',
      method: 'get',
      path: () => '/api/coverage/mine',
      allowed: SUPERVISORS,
    },
    {
      name: 'GET /coverage/history',
      method: 'get',
      path: () => '/api/coverage/history',
      allowed: SUPERVISORS,
    },
    {
      name: 'PATCH /coverage/availability (soi-même)',
      method: 'patch',
      path: () => '/api/coverage/availability',
      body: () => ({ availability: 'AVAILABLE' }),
      allowed: SUPERVISORS,
    },
    {
      name: 'GET /coverage/teachers',
      method: 'get',
      path: () => '/api/coverage/teachers',
      allowed: ['surveillant', 'admin', 'superadmin'],
    },
    {
      name: 'POST /coverage/teacher-requests',
      method: 'post',
      path: () => '/api/coverage/teacher-requests',
      body: () => ({
        clientId: randomUUID(),
        type: 'LATENESS',
        classId: violet,
        date: tomorrow(),
        startTime: '08:00',
        endTime: '09:00',
      }),
      allowed: TEACHERS,
    },
    {
      name: 'GET /coverage/my-requests',
      method: 'get',
      path: () => '/api/coverage/my-requests',
      allowed: TEACHERS,
    },
    {
      name: 'GET /coverage/classes',
      method: 'get',
      path: () => '/api/coverage/classes',
      allowed: MODULE,
    },
    {
      name: 'POST /coverage/presence/resolve',
      method: 'post',
      path: () => '/api/coverage/presence/resolve',
      body: () => ({ token: qr }),
      allowed: MODULE,
    },
    // Affectation directe de l'admin, assignée à « remplacant » : ni l'enseignante, ni « surveillant » n'y ont accès.
    {
      name: 'GET /coverage/:id',
      method: 'get',
      path: () => `/api/coverage/${coverageId}`,
      allowed: ADMINS,
    },
    {
      name: 'POST /coverage/:id/actions',
      method: 'post',
      path: () => `/api/coverage/${coverageId}/actions`,
      body: () => ({ action: 'EXTEND', minutes: 5 }),
      allowed: ADMINS,
    },
    // Spec 006 : modification d'une affectation (version volontairement fausse : aucune écriture).
    {
      name: 'PATCH /coverage/:id (modification par l’admin)',
      method: 'patch',
      path: () => `/api/coverage/${coverageId}`,
      body: () => ({ version: 999 }),
      allowed: ADMINS,
    },
    // Administration du module : super administrateur seulement.
    {
      name: 'GET /admin/coverage/dashboard',
      method: 'get',
      path: () => '/api/admin/coverage/dashboard',
      allowed: ['superadmin'],
      forbidden: true,
    },
    {
      name: 'GET /admin/coverage/groups',
      method: 'get',
      path: () => '/api/admin/coverage/groups',
      allowed: ['superadmin'],
      forbidden: true,
    },
    {
      name: 'GET /admin/coverage/classes',
      method: 'get',
      path: () => '/api/admin/coverage/classes',
      allowed: ['superadmin'],
      forbidden: true,
    },
    {
      name: 'GET /admin/coverage/classes/:id/qr',
      method: 'get',
      path: () => `/api/admin/coverage/classes/${violet}/qr`,
      allowed: ['superadmin'],
      forbidden: true,
    },
    {
      name: 'GET /admin/floors',
      method: 'get',
      path: () => '/api/admin/floors',
      allowed: ['superadmin'],
      forbidden: true,
    },
  ];

  let qr = '';
  let tomorrowDate = '';
  const tomorrow = () => tomorrowDate;

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const who of [...ROLES, 'remplacant']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
    violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } }))
      .id;
    coverageId = await createCoverage(prisma, {
      status: 'ACCEPTED',
      source: 'ADMIN_DIRECT',
      startAt: minutesFrom(new Date(), 5),
      plannedEndAt: minutesFrom(new Date(), 60),
      assignee: 'remplacant',
      teacher: null,
    });
    const target = await createCoverage(prisma, {
      status: 'PENDING',
      startAt: minutesFrom(new Date(), 5),
      plannedEndAt: minutesFrom(new Date(), 60),
    });
    const source = await createCoverage(prisma, {
      status: 'ON_DUTY',
      source: 'SUPERVISOR_REPORT',
      startAt: minutesFrom(new Date(), -5),
      plannedEndAt: null,
      assignee: 'surveillant2',
      requester: 'surveillant2',
      teacher: null,
    });
    proposalId = (
      await prisma.coverageMergeProposal.create({
        data: { sourceRequestId: source, targetRequestId: target },
      })
    ).id;
    const qrRes = await request(app.getHttpServer())
      .get(`/api/admin/coverage/classes/${violet}/qr`)
      .set('Cookie', cookie.superadmin);
    qr = new URL(qrRes.body.url).searchParams.get('c')!;
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    tomorrowDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe.each(CASES)('$name', (c) => {
    it('sans session : 401', async () => {
      expect((await send(null, c)).status).toBe(401);
    });

    it.each(ROLES)('%s', async (who) => {
      const before = await denials(who);
      const res = await send(who, c);
      if (c.allowed.includes(who)) {
        expect([401, 403, 404]).not.toContain(res.status);
        expect(res.status).toBeLessThan(500);
      } else {
        expect(res.status).toBe(c.forbidden ? 403 : 404);
        expect(await denials(who)).toBe(before + 1);
      }
    });
  });

  it('GET /coverage/availability : ouvert à tout compte connecté, capacités du seul appelant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/coverage/availability')
      .set('Cookie', cookie.reprographie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      isTeacher: false,
      isSupervisor: false,
      canManage: false,
      activeGuards: [],
    });
    expect(res.body.capabilities).toMatchObject({
      view: false,
      report: false,
      declareEmptyClass: false,
      manage: false,
    });
  });
});
