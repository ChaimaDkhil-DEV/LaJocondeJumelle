import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ADMIN_ALLOWED } from '../utils/admin-route-access';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { allRoutes, ROUTE_UUID as U, type AppRoute } from '../utils/routes';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Audit de sécurité du 2026-11-18, tests manquants G.1 : matrice route × profil, parents compris.
 *
 * Chaque route de l'application (relevée sur les métadonnées Nest) est classée ici : publique, appel de serveur à
 * serveur, ou liste des profils qui passent le contrôle d'accès. Une route ajoutée sans classement fait échouer
 * le test. Pour chaque route et chaque profil :
 *  - sans session : 401 (sauf routes publiques) ;
 *  - compte parent hors des routes @ParentAllowed() : 403 (garde de session) ;
 *  - profil non autorisé : 403 ou 404 (le serveur ne révèle pas l'existence, principe V) ;
 *  - profil autorisé : jamais 401 ni 403, et pas 404 sur une route sans identifiant.
 * Les identifiants de chemin sont inconnus (ROUTE_UUID) et les corps ne créent rien : un profil autorisé obtient
 * 200, 400, 404, 409 ou 422 sans effet de bord notable. Le contrôle fin des droits sur une ressource existante
 * (propriétaire, tiers du même rôle) relève des suites de chaque module.
 */

/** Profils de la matrice : rôles, et groupes Enseignants et Surveillants pour les employés (004, 016, 017). */
const PROFILES = {
  SA: 'superadmin', // SUPER_ADMIN
  AD: 'admin', // ADMIN
  EN: 'enseignante', // EMPLOYEE, groupe Enseignants
  SV: 'surveillant', // EMPLOYEE, groupe Surveillants
  EMP: 'reprographie', // EMPLOYEE sans groupe
  PARENT: 'parent.matrice', // PARENT, représentant actif lié à un élève
} as const;
type Profile = keyof typeof PROFILES;

const STAFF: readonly Profile[] = ['SA', 'AD', 'EN', 'SV', 'EMP'];
const EVERYONE: readonly Profile[] = [...STAFF, 'PARENT'];
const ADMINS: readonly Profile[] = ['SA', 'AD'];
/** Le super administrateur passe tous les contrôles de rôle du module des affectations (004, FR-004b). */
const COVERAGE_ADMIN = ADMINS;
const SUPERVISOR: readonly Profile[] = ['SA', 'SV'];
const TEACHER_REQUESTS: readonly Profile[] = ['SA', 'EN'];
/** Présence des enseignants (016) et emploi du temps personnel (020) : l'enseignant seul. */
const TEACHER: readonly Profile[] = ['EN'];

type Access = 'PUBLIC' | 'INTEGRATION' | readonly Profile[];

/** Routes hors /admin/* : profils autorisés (contrats des specs 001 à 020). */
const MATRIX: Record<string, Access> = {
  'GET /api/health': 'PUBLIC',
  'POST /api/auth/login': 'PUBLIC',
  'GET /api/auth/captcha': 'PUBLIC',
  [`GET /api/integrations/n8n/parent-communications/${U}`]: 'INTEGRATION',
  'POST /api/integrations/n8n/deliveries': 'INTEGRATION',

  // Portes d'entrée du compte parent (@ParentAllowed) partagées avec le personnel.
  'POST /api/auth/logout': EVERYONE,
  'GET /api/auth/me': EVERYONE,
  'POST /api/auth/password': EVERYONE,
  'GET /api/settings/client': EVERYONE,
  'GET /api/notifications': EVERYONE,
  'POST /api/notifications/read': EVERYONE,
  'POST /api/files': EVERYONE,
  [`GET /api/files/${U}`]: EVERYONE,
  'GET /api/users/avatars': EVERYONE,
  [`GET /api/users/${U}/avatar`]: EVERYONE,

  // Messages de l'école (015, 017) : le parent seul.
  'GET /api/parent/messages/children': ['PARENT'],
  'GET /api/parent/messages/conversations': ['PARENT'],
  'POST /api/parent/messages/conversations': ['PARENT'],
  [`GET /api/parent/messages/conversations/${U}`]: ['PARENT'],
  [`POST /api/parent/messages/conversations/${U}/messages`]: ['PARENT'],
  [`GET /api/parent/messages/by-message/${U}`]: ['PARENT'],

  // Personnel : notifications push, préférences, demandes, assistance, photo de profil.
  'GET /api/push/config': STAFF,
  'PUT /api/push/subscriptions': STAFF,
  'GET /api/push/subscriptions': STAFF,
  'DELETE /api/push/subscriptions/current': STAFF,
  [`DELETE /api/push/subscriptions/${U}`]: STAFF,
  'GET /api/notifications/preferences': STAFF,
  'PATCH /api/notifications/preferences': STAFF,
  'GET /api/categories': STAFF,
  [`GET /api/categories/${U}/recipients`]: STAFF,
  'POST /api/requests': STAFF,
  'GET /api/requests': STAFF,
  'GET /api/requests/tracking': STAFF,
  [`GET /api/requests/${U}`]: STAFF,
  [`GET /api/requests/${U}/history`]: STAFF,
  [`PATCH /api/requests/${U}/priority`]: STAFF,
  [`GET /api/requests/${U}/assignees`]: STAFF,
  [`POST /api/requests/${U}/actions`]: STAFF,
  [`PATCH /api/requests/${U}`]: STAFF,
  [`DELETE /api/requests/${U}`]: STAFF,
  [`GET /api/requests/${U}/messages`]: STAFF,
  [`POST /api/requests/${U}/messages`]: STAFF,
  'POST /api/assist/suggestions': STAFF,
  'POST /api/assist/transcriptions': STAFF,
  [`POST /api/users/${U}/avatar`]: STAFF,
  [`DELETE /api/users/${U}/avatar`]: STAFF,

  // Supervision (018) : le super administrateur seul.
  'GET /api/super-admin/requests': ['SA'],
  'GET /api/super-admin/administrators': ['SA'],
  'GET /api/super-admin/transfers': ['SA'],
  [`GET /api/super-admin/requests/${U}/reassign-candidates`]: ['SA'],
  [`POST /api/super-admin/requests/${U}/reassign`]: ['SA'],

  // Affectations (004, 006, 008, 013) : les autres employés obtiennent 404 sur tout le module (FR-023b).
  'GET /api/coverage/stats': COVERAGE_ADMIN,
  'GET /api/coverage/stats/export.csv': COVERAGE_ADMIN,
  'GET /api/coverage/form-options': COVERAGE_ADMIN,
  'POST /api/coverage': COVERAGE_ADMIN,
  'GET /api/coverage/candidates': COVERAGE_ADMIN,
  'GET /api/coverage/merge-proposals': COVERAGE_ADMIN,
  [`POST /api/coverage/merge-proposals/${U}/decision`]: COVERAGE_ADMIN,
  'GET /api/coverage': COVERAGE_ADMIN,
  'GET /api/coverage/team': COVERAGE_ADMIN,
  [`PATCH /api/coverage/team/${U}/availability`]: COVERAGE_ADMIN,
  [`GET /api/coverage/${U}/candidates`]: COVERAGE_ADMIN,
  [`PATCH /api/coverage/${U}`]: COVERAGE_ADMIN,
  'POST /api/coverage/empty-class': SUPERVISOR,
  'GET /api/coverage/mine': SUPERVISOR,
  'GET /api/coverage/history': SUPERVISOR,
  'PATCH /api/coverage/availability': SUPERVISOR,
  'GET /api/coverage/teachers': ['SA', 'AD', 'SV'],
  'POST /api/coverage/teacher-requests': TEACHER_REQUESTS,
  'GET /api/coverage/my-requests': TEACHER_REQUESTS,
  [`PATCH /api/coverage/${U}/teacher-request`]: TEACHER_REQUESTS,
  'GET /api/coverage/classes': ['SA', 'AD', 'EN', 'SV'],
  'POST /api/coverage/presence/resolve': ['SA', 'AD', 'EN', 'SV'],
  [`GET /api/coverage/${U}`]: ['SA', 'AD', 'EN', 'SV'],
  [`POST /api/coverage/${U}/actions`]: ['SA', 'AD', 'EN', 'SV'],
  // Disponibilité et capacités de l'utilisateur dans le module (menu) : ses propres données.
  'GET /api/coverage/availability': STAFF,

  // Présence des enseignants (016) : l'enseignant pointe, l'administration suit et corrige.
  'POST /api/attendance/resolve': TEACHER,
  'POST /api/attendance/arrive': TEACHER,
  'POST /api/attendance/depart': TEACHER,
  'POST /api/attendance/return': TEACHER,
  'GET /api/attendance/mine': TEACHER,
  'GET /api/attendance/day': ADMINS,
  'GET /api/attendance/expected': ADMINS,
  'GET /api/attendance/present': ADMINS,
  'POST /api/attendance/departures': ADMINS,
  [`POST /api/attendance/departures/${U}/return`]: ADMINS,
  'POST /api/attendance/manual': ADMINS,
  [`PATCH /api/attendance/substitutes/${U}`]: ADMINS,
  [`PATCH /api/attendance/${U}`]: ADMINS,

  // Emplois du temps (020).
  'GET /api/timetable/mine': TEACHER,
  'GET /api/timetable/sessions': ADMINS,
  'POST /api/timetable/sessions': ADMINS,
  [`PATCH /api/timetable/sessions/${U}`]: ADMINS,
  [`POST /api/timetable/sessions/${U}/cancel`]: ADMINS,
  'GET /api/timetable/series': ADMINS,
  'POST /api/timetable/series': ADMINS,
  [`PATCH /api/timetable/series/${U}`]: ADMINS,
  [`POST /api/timetable/series/${U}/cancel`]: ADMINS,

  // Communications de l'enseignant avec l'administration (017).
  'GET /api/communications/teacher/students': TEACHER,
  'GET /api/communications/teacher/conversations': TEACHER,
  'POST /api/communications/teacher/conversations': TEACHER,
  [`GET /api/communications/teacher/conversations/${U}`]: TEACHER,
  [`POST /api/communications/teacher/conversations/${U}/messages`]: TEACHER,
};

/** Routes /admin/* : le super administrateur, et l'admin pour ADMIN_ALLOWED (011, admin-routes-access.spec.ts). */
function accessOf(route: AppRoute): Access | undefined {
  if (route.prefix === 'admin') return ADMIN_ALLOWED.includes(route.key) ? ADMINS : ['SA'];
  return MATRIX[route.key];
}

/**
 * Requêtes valides là où la validation précède le contrôle des droits : sans elles, un profil non autorisé
 * obtiendrait 400 et le refus ne serait pas prouvé. Identifiants inconnus : rien n'est créé.
 */
const DAY = '2026-11-19';
const START = '2026-11-19T08:00:00.000Z';
const END = '2026-11-19T09:00:00.000Z';
const QR = { token: 'jeton-inconnu' };
const REQUESTS: Record<string, { query?: Record<string, string>; body: () => object }> = {
  'POST /api/coverage': {
    body: () => ({ clientId: randomUUID(), classId: U, type: 'ABSENCE', teacherId: null, startAt: START, endAt: END, assigneeId: U }),
  },
  'POST /api/coverage/empty-class': { body: () => ({ clientId: randomUUID(), classId: U }) },
  'GET /api/coverage/candidates': { query: { classId: U, startAt: START, endAt: END }, body: () => ({}) },
  [`POST /api/coverage/merge-proposals/${U}/decision`]: { body: () => ({ decision: 'REJECT' }) },
  'POST /api/coverage/teacher-requests': {
    body: () => ({ clientId: randomUUID(), type: 'LATENESS', classId: U, date: DAY, startTime: '08:00', durationMinutes: 30 }),
  },
  [`PATCH /api/coverage/${U}/teacher-request`]: { body: () => ({ version: 0 }) },
  'PATCH /api/coverage/availability': { body: () => ({ availability: 'AVAILABLE' }) },
  [`PATCH /api/coverage/team/${U}/availability`]: { body: () => ({ availability: 'AVAILABLE' }) },
  'POST /api/coverage/presence/resolve': { body: () => QR },
  [`POST /api/coverage/${U}/actions`]: { body: () => ({ action: 'CANCEL' }) },
  [`PATCH /api/coverage/${U}`]: { body: () => ({ version: 0 }) },
  'POST /api/attendance/resolve': { body: () => QR },
  'POST /api/attendance/arrive': { body: () => QR },
  'POST /api/attendance/depart': { body: () => QR },
  'POST /api/attendance/return': { body: () => QR },
  'POST /api/attendance/departures': { body: () => ({ teacherId: U }) },
  'POST /api/attendance/manual': { body: () => ({ teacherId: U, classId: U, status: 'ABSENT' }) },
  [`PATCH /api/attendance/substitutes/${U}`]: { body: () => ({ teacherId: null }) },
  [`PATCH /api/attendance/${U}`]: { body: () => ({ reason: 'Correction' }) },
  'GET /api/timetable/mine': { query: { from: DAY, to: DAY }, body: () => ({}) },
  'GET /api/timetable/sessions': { query: { from: DAY, to: DAY }, body: () => ({}) },
  'POST /api/timetable/sessions': { body: () => ({ teacherId: U, classId: U, date: DAY, startTime: '08:00', endTime: '09:00' }) },
  [`POST /api/timetable/sessions/${U}/cancel`]: { body: () => ({ reason: 'Annulation' }) },
  'POST /api/timetable/series': {
    body: () => ({ teacherId: U, classId: U, weekday: 1, startTime: '08:00', endTime: '09:00', startDate: DAY, endDate: '2026-12-19' }),
  },
  [`PATCH /api/timetable/series/${U}`]: { body: () => ({ from: DAY }) },
  [`POST /api/timetable/series/${U}/cancel`]: { body: () => ({ from: DAY, to: DAY, reason: 'Annulation' }) },
  'POST /api/parent/messages/conversations': { body: () => ({ studentId: U, text: 'Bonjour' }) },
  [`POST /api/parent/messages/conversations/${U}/messages`]: { body: () => ({ text: 'Bonjour' }) },
  'POST /api/communications/teacher/conversations': { body: () => ({ studentId: U, text: 'Bonjour' }) },
  [`POST /api/communications/teacher/conversations/${U}/messages`]: { body: () => ({ text: 'Bonjour' }) },
};

/** Routes qui ferment la session appelante : rejouées avec une session ouverte pour l'occasion. */
const CLOSES_SESSION = new Set(['POST /api/auth/logout']);

describe('Matrice route × profil (audit G.1)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let routes: AppRoute[];
  const cookies = {} as Record<Profile, string>;

  async function call(route: AppRoute, cookie?: string): Promise<number> {
    const spec = REQUESTS[route.key];
    let req = request(app.getHttpServer())[route.verb](route.path).set('Origin', TEST_ORIGIN);
    if (spec?.query) req = req.query(spec.query);
    if (cookie) req = req.set('Cookie', cookie);
    return (await req.send(spec?.body() ?? {})).status;
  }

  async function statusFor(route: AppRoute, profile: Profile): Promise<number> {
    const cookie = CLOSES_SESSION.has(route.key) ? await loginAs(app, PROFILES[profile]) : cookies[profile];
    return call(route, cookie);
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    // Compte parent : représentant actif, lié à un élève actif (mot de passe du seed, déjà changé).
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { username: PROFILES.EN } });
    const parent = await prisma.user.create({
      data: { username: PROFILES.PARENT, displayName: 'Parent matrice', role: 'PARENT', passwordHash, mustChangePassword: false },
    });
    const schoolClass = await prisma.schoolClass.findFirstOrThrow({ where: { active: true } });
    const student = await prisma.student.create({
      data: { firstName: 'Lina', lastName: 'Matrice', classId: schoolClass.id, parentPhone: '0600000000' },
    });
    await prisma.guardian.create({
      data: { firstName: 'Sonia', lastName: 'Matrice', userId: parent.id, students: { create: { studentId: student.id } } },
    });
    app = await createTestApp();
    routes = allRoutes(app);
    for (const profile of Object.keys(PROFILES) as Profile[]) cookies[profile] = await loginAs(app, PROFILES[profile]);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('relève un nombre plausible de routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(150);
  });

  it('chaque route est classée, et chaque route classée existe', () => {
    const existing = new Set(routes.map((r) => r.key));
    expect(routes.filter((r) => accessOf(r) === undefined).map((r) => r.key)).toEqual([]);
    expect(Object.keys(MATRIX).filter((k) => !existing.has(k))).toEqual([]);
  });

  it('les routes publiques sont exactement celles attendues', () => {
    const declared = (access: Access) => routes.filter((r) => accessOf(r) === access).map((r) => r.key).sort();
    expect(routes.filter((r) => r.isPublic && !r.isIntegration).map((r) => r.key).sort()).toEqual(declared('PUBLIC'));
    expect(routes.filter((r) => r.isIntegration).map((r) => r.key).sort()).toEqual(declared('INTEGRATION'));
  });

  it('les portes d’entrée du compte parent (@ParentAllowed) sont exactement les routes ouvertes au parent', () => {
    const declared = routes.filter((r) => {
      const access = accessOf(r);
      return Array.isArray(access) && access.includes('PARENT');
    });
    expect(routes.filter((r) => r.parentAllowed && !r.isPublic).map((r) => r.key).sort()).toEqual(declared.map((r) => r.key).sort());
  });

  it('sans session : 401 sur toute route non publique', async () => {
    const failures: string[] = [];
    for (const route of routes.filter((r) => !r.isPublic)) {
      const status = await call(route);
      if (status !== 401) failures.push(`${route.key} → ${status}`);
    }
    expect(failures).toEqual([]);
  });

  it('routes n8n sans jeton : 401 ou 403, même avec une session du personnel', async () => {
    const failures: string[] = [];
    for (const route of routes.filter((r) => r.isIntegration)) {
      for (const cookie of [undefined, cookies.SA]) {
        const status = await call(route, cookie);
        if (status !== 401 && status !== 403) failures.push(`${route.key} → ${status}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('routes publiques : jamais 401 ni 403 sans session', async () => {
    const failures: string[] = [];
    for (const route of routes.filter((r) => accessOf(r) === 'PUBLIC')) {
      const status = await call(route);
      if (status === 401 || status === 403) failures.push(`${route.key} → ${status}`);
    }
    expect(failures).toEqual([]);
  });

  it.each(Object.keys(PROFILES) as Profile[])('profil %s : refusé (403/404) hors de ses routes, jamais 401/403 sur ses routes', async (profile) => {
    const failures: string[] = [];
    for (const route of routes) {
      const access = accessOf(route);
      if (!Array.isArray(access)) continue;
      const status = await statusFor(route, profile);
      if (access.includes(profile)) {
        // Sans identifiant de chemin, un 404 serait un refus déguisé.
        const denied = status === 401 || status === 403 || (status === 404 && !route.path.includes(U));
        if (denied) failures.push(`autorisé, mais ${route.key} → ${status}`);
      } else if (profile === 'PARENT' && !route.parentAllowed) {
        if (status !== 403) failures.push(`garde parent attendue (403), mais ${route.key} → ${status}`);
      } else if (status !== 403 && status !== 404) {
        failures.push(`refus attendu (403/404), mais ${route.key} → ${status}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('« Messages de l’école » : sur une conversation existante, le personnel est refusé (403), le parent lit et écrit', async () => {
    const student = await prisma.student.findFirstOrThrow({ where: { lastName: 'Matrice' } });
    const send = (cookie: string, verb: 'get' | 'post', path: string, body: object = {}) =>
      request(app.getHttpServer())[verb](path).set('Origin', TEST_ORIGIN).set('Cookie', cookie).send(body);
    const started = await send(cookies.PARENT, 'post', '/api/parent/messages/conversations', { studentId: student.id, text: 'Bonjour' });
    expect(started.status).toBe(201);
    const conversation = `/api/parent/messages/conversations/${started.body.id}`;
    const message = await prisma.parentCommunication.findFirstOrThrow({ where: { conversationId: started.body.id } });

    const since = new Date();
    const failures: string[] = [];
    for (const profile of STAFF) {
      const attempts = [
        ['GET', conversation, await send(cookies[profile], 'get', conversation)],
        ['POST', `${conversation}/messages`, await send(cookies[profile], 'post', `${conversation}/messages`, { text: 'Intrus' })],
        ['GET', `/api/parent/messages/by-message/${message.id}`, await send(cookies[profile], 'get', `/api/parent/messages/by-message/${message.id}`)],
        ['POST', '/api/parent/messages/conversations', await send(cookies[profile], 'post', '/api/parent/messages/conversations', { studentId: student.id, text: 'Intrus' })],
      ] as const;
      for (const [verb, path, res] of attempts) if (res.status !== 403) failures.push(`${profile} ${verb} ${path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: PROFILES.AD } });
    const logged = await prisma.auditLog.count({
      where: { action: 'ACCESS_DENIED', actorId: admin.id, createdAt: { gte: since }, details: { path: ['reason'], equals: 'NOT_PARENT' } },
    });
    expect(logged).toBe(4);
    // Rien n'a été écrit par le personnel : seul le premier message du parent existe.
    expect(await prisma.parentCommunication.count({ where: { conversationId: started.body.id } })).toBe(1);

    expect((await send(cookies.PARENT, 'get', conversation)).status).toBe(200);
    expect((await send(cookies.PARENT, 'post', `${conversation}/messages`, { text: 'Merci' })).status).toBe(201);
  });
});
