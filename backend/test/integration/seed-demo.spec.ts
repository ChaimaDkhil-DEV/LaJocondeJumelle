import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { runDemoSeed } from '../../prisma/seed-demo';
import { CLASSES, FLOORS, LEVELS } from '../../prisma/demo/school-data';
import { DEMO_TIMETABLE_TEACHERS } from '../../prisma/demo/timetable';
import { atLocalTime } from '../../src/common/school-time';
import { SEED_PASSWORD } from '../utils/auth-helpers';
import { createTestApp, sessionCookie, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Jeu de démonstration en base : établissement, personnel, élèves, demandes du 12 au 30 octobre 2026,
 * historique, notifications, tableau de bord réel, idempotence, authentification et droits.
 */
describe('Seed de démonstration', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const TZ = 'Europe/Paris';
  const FROM = atLocalTime('2026-10-12', '00:00', TZ);
  const TO = atLocalTime('2026-10-31', '00:00', TZ);
  /** Après la période : toute l'histoire prévue a eu lieu. */
  const NOW = new Date('2026-11-02T08:00:00Z');

  const login = async (username: string) => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').set('Origin', TEST_ORIGIN).send({ username, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return sessionCookie(res.headers['set-cookie']);
  };

  const previousTimezone = process.env.SCHOOL_TIMEZONE;

  beforeAll(async () => {
    process.env.SCHOOL_TIMEZONE = TZ;
    await resetDatabase(prisma);
    await runDemoSeed(prisma, { password: SEED_PASSWORD, now: NOW, log: () => undefined });
    app = await createTestApp();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await resetDatabase(prisma);
    await prisma.$disconnect();
    if (previousTimezone === undefined) delete process.env.SCHOOL_TIMEZONE;
    else process.env.SCHOOL_TIMEZONE = previousTimezone;
  });

  it('établissement : 5 étages avec 2 surveillants chacun, 8 niveaux, 32 classes fleuries (4 par niveau)', async () => {
    const floors = await prisma.floor.findMany({ include: { users: true, classes: true } });
    expect(floors.map((f) => f.name).sort()).toEqual(FLOORS.map((f) => f.name).sort());
    for (const floor of floors) expect(floor.users.filter((u) => u.jobTitle?.startsWith('Surveill'))).toHaveLength(2);
    const levels = await prisma.gradeLevel.findMany({ include: { classes: true }, orderBy: { position: 'asc' } });
    expect(levels.map((l) => l.name)).toEqual(LEVELS.map((l) => l.name));
    for (const level of levels) expect(level.classes).toHaveLength(4);
    const classes = await prisma.schoolClass.findMany({ where: { levelId: { not: null } } });
    expect(classes.map((c) => c.name).sort()).toEqual(CLASSES.map((c) => c.name).sort());
    expect(classes.every((c) => c.floorId)).toBe(true);
  });

  it('personnel : 49 membres + la direction, rôles existants, groupes Enseignants (35) et Surveillants (10)', async () => {
    // Les comptes parents (015) ne font pas partie du personnel.
    const users = await prisma.user.findMany({ where: { role: { not: 'PARENT' } } });
    expect(users).toHaveLength(50);
    expect(users.filter((u) => u.role === 'SUPER_ADMIN').map((u) => u.username)).toEqual(['direction']);
    expect(users.filter((u) => u.role === 'ADMIN').map((u) => u.username)).toEqual(['samira.belkhodja']);
    expect(users.every((u) => u.active && u.jobTitle)).toBe(true);
    const groups = await prisma.employeeGroup.findMany({ where: { systemKey: { not: null } }, include: { members: true } });
    expect(groups.find((g) => g.systemKey === 'TEACHERS')?.members).toHaveLength(35);
    expect(groups.find((g) => g.systemKey === 'SUPERVISORS')?.members).toHaveLength(10);
    for (const job of ['Économe', 'Technicien de maintenance', 'Responsable informatique']) {
      expect(users.filter((u) => u.jobTitle === job)).toHaveLength(1);
    }
  });

  it('élèves : toutes les classes, un téléphone de parent chacun', async () => {
    const students = await prisma.student.findMany({ include: { class: true } });
    expect(students.length).toBeGreaterThan(32 * 20);
    expect(new Set(students.map((s) => s.classId)).size).toBe(32);
    expect(students.every((s) => /^\+216 99 \d{3} \d{3}$/.test(s.parentPhone))).toBe(true);
  });

  it('historique des classes (021) : chaque élève a une période, la dernière est sa classe actuelle (SC-004)', async () => {
    const orphans = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Student" s
      WHERE NOT EXISTS (SELECT 1 FROM "StudentClassHistory" h WHERE h."studentId" = s."id")`;
    expect(orphans[0].n).toBe(0);
    const mismatched = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Student" s
      WHERE (SELECT h."classId" FROM "StudentClassHistory" h WHERE h."studentId" = s."id" ORDER BY h."startedAt" DESC, h."seq" DESC LIMIT 1) <> s."classId"`;
    expect(mismatched[0].n).toBe(0);
    const students = await prisma.student.count();
    expect(await prisma.studentClassHistory.count()).toBe(students);
  });

  it('demandes du 12 au 30 octobre, catégories et priorités existantes, numérotation chronologique', async () => {
    const requests = await prisma.request.findMany({ include: { category: true }, orderBy: { number: 'asc' } });
    expect(requests.length).toBeGreaterThanOrEqual(120);
    expect(requests.every((r) => r.createdAt >= FROM && r.createdAt < TO)).toBe(true);
    const created = requests.map((r) => r.createdAt.getTime());
    expect(created).toEqual([...created].sort((a, b) => a - b));
    expect(requests[0].reference).toBe('D-2026-000001');
    expect(requests.every((r) => r.category.kind === 'WORK')).toBe(true);
    expect(new Set(requests.map((r) => r.status)).size).toBe(11);
    expect(new Set(requests.map((r) => r.priority))).toEqual(new Set(['NORMAL', 'URGENT']));
  });

  it('historique : chronologique, ordre d’écriture (seq) cohérent, statut final atteint', async () => {
    const requests = await prisma.request.findMany({ where: { status: { not: 'DRAFT' } }, include: { events: { orderBy: { seq: 'asc' } } } });
    for (const r of requests) {
      const times = r.events.map((e) => e.createdAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(r.events[0].type).toBe('CREATED');
      const last = r.events.filter((e) => e.type === 'STATUS_CHANGED').at(-1);
      expect((last?.toValue as { status: string }).status).toBe(r.status);
    }
    // Les triggers d'ajout seul sont actifs après le seed.
    await expect(prisma.$executeRawUnsafe('DELETE FROM "RequestEvent"')).rejects.toThrow(/ajout seul/);
  });

  it('notifications liées aux bons utilisateurs (demandeur, employé affecté, admins, direction)', async () => {
    const notifications = await prisma.notification.findMany({ include: { request: { include: { category: { include: { managers: true } } } }, user: true } });
    expect(notifications.length).toBeGreaterThan(100);
    for (const n of notifications) {
      // Le seed de démonstration ne crée que des notifications de demande.
      const r = n.request!;
      const related =
        n.userId === r.requesterId ||
        n.userId === r.assigneeId ||
        r.category.managers.some((m) => m.userId === n.userId) ||
        n.user.role === 'SUPER_ADMIN' ||
        (await prisma.requestEvent.count({ where: { requestId: r.id, type: { in: ['ASSIGNED', 'REASSIGNED'] }, toValue: { path: ['assigneeId'], equals: n.userId } } })) > 0;
      expect(related).toBe(true);
    }
  });

  it('tableau de bord du super administrateur : chiffres calculés sur les vraies demandes', async () => {
    const cookie = await login('direction');
    const res = await request(app.getHttpServer())
      .get('/api/admin/dashboard/summary')
      .query({ from: FROM.toISOString(), to: new Date(TO.getTime() - 1).toISOString(), tz: TZ })
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    const inDb = await prisma.request.count({ where: { kind: 'WORK', status: { not: 'DRAFT' }, createdAt: { gte: FROM, lt: TO } } });
    const byStatus = (res.body.byStatus as Array<{ count: number }>).reduce((sum, s) => sum + s.count, 0);
    expect(byStatus).toBe(inDb);
    const daily = (res.body.daily as Array<{ created: number }>).reduce((sum, d) => sum + d.created, 0);
    expect(daily).toBe(inDb);
  });

  it('authentification et droits : enseignante sans accès aux élèves, direction oui ; service unique validé par l’API', async () => {
    const teacher = await login('amira.bensalem');
    expect((await request(app.getHttpServer()).get('/api/admin/students').set('Cookie', teacher)).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/requests').set('Cookie', teacher)).status).toBe(200);

    const direction = await login('direction');
    const list = await request(app.getHttpServer()).get('/api/admin/students').set('Cookie', direction);
    expect(list.status).toBe(200);
    const levels = await request(app.getHttpServer()).get('/api/admin/levels').set('Cookie', direction);
    expect(levels.body).toHaveLength(8);
    const classId = levels.body[0].classes[0].id as string;
    const created = await request(app.getHttpServer())
      .post('/api/admin/students')
      .set('Cookie', direction)
      .set('Origin', TEST_ORIGIN)
      .send({ firstName: 'Lina', lastName: 'Essai', classId, parentPhone: '+216 99 009 901' });
    expect(created.status).toBe(201);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'STUDENT_CHANGED', targetId: created.body.id } });
    expect(audit?.details).toEqual({ action: 'create', classId });
  });

  it('situation d’un élève (021, SC-007) : répond en moins de 3 secondes sur le jeu de démonstration complet', async () => {
    const direction = await login('direction');
    const student = await prisma.student.findFirstOrThrow({ orderBy: { id: 'asc' } });
    const at = encodeURIComponent('2026-10-20T10:30');
    const started = Date.now();
    const res = await request(app.getHttpServer()).get(`/api/admin/students/${student.id}/situation?at=${at}`).set('Cookie', direction);
    const elapsed = Date.now() - started;
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ class: { availability: 'KNOWN' } });
    expect(elapsed).toBeLessThan(3000);
  });

  it('communication avec les parents : classes des enseignants, trois familles avec un compte parent prêt à écrire à l’école', async () => {
    const classes = await prisma.schoolClass.findMany({ include: { teachers: true } });
    // Titulaire + trois enseignants spécialistes par classe.
    expect(classes.every((c) => c.teachers.length === 4)).toBe(true);
    const parents = await prisma.user.findMany({ where: { role: 'PARENT' }, include: { guardianAccount: { include: { students: true } } } });
    expect(parents).toHaveLength(3);
    expect(parents.every((p) => p.active && !p.mustChangePassword && p.guardianAccount?.active)).toBe(true);
    const family = parents.find((p) => (p.guardianAccount?.students.length ?? 0) === 2)!;
    const cookie = await login(family.username);
    const children = await request(app.getHttpServer()).get('/api/parent/messages/children').set('Cookie', cookie);
    expect(children.status).toBe(200);
    expect(children.body).toHaveLength(2);
    expect(new Set(children.body.map((c: { class: { id: string } }) => c.class.id)).size).toBe(2);
    // 017 : le parent écrit à l'école, jamais à un enseignant ; les enseignants ne lui sont pas listés.
    expect(children.body.every((c: { teachers?: unknown }) => c.teachers === undefined)).toBe(true);
  });

  it('idempotent : une nouvelle exécution ne duplique rien', async () => {
    const counts = async () => ({
      users: await prisma.user.count(),
      classes: await prisma.schoolClass.count(),
      students: await prisma.student.count(),
      classHistory: await prisma.studentClassHistory.count(),
      requests: await prisma.request.count(),
      events: await prisma.requestEvent.count(),
      notifications: await prisma.notification.count(),
      categories: await prisma.category.count(),
      floors: await prisma.floor.count(),
      guardians: await prisma.guardian.count(),
      teacherClasses: await prisma.teacherClass.count(),
      timetableSeries: await prisma.timetableSeries.count(),
      teachingSessions: await prisma.teachingSession.count(),
    });
    const before = await counts();
    const report = await runDemoSeed(prisma, { password: SEED_PASSWORD, now: NOW, log: () => undefined });
    expect(report.skippedRequests).toBe(true);
    expect(report.createdUsers).toBe(0);
    expect(report.timetable).toMatchObject({ series: 0, sessions: 0 });
    expect(await counts()).toEqual(before);
  }, 120_000);

  it('emplois du temps (020) : une partie des enseignants seulement, à partir du jour du seed', async () => {
    const teachers = await prisma.employeeGroupMember.count({ where: { group: { systemKey: 'TEACHERS' } } });
    const withTimetable = await prisma.teachingSession.findMany({ distinct: ['teacherId'], select: { teacherId: true } });
    expect(withTimetable).toHaveLength(DEMO_TIMETABLE_TEACHERS + 1);
    expect(withTimetable.length).toBeLessThan(teachers);
    const first = await prisma.teachingSession.findFirstOrThrow({ orderBy: { startAt: 'asc' } });
    expect(first.startAt.getTime()).toBeGreaterThanOrEqual(atLocalTime('2026-11-02', '00:00', TZ).getTime());
    expect(await prisma.teachingSession.count({ where: { status: 'CANCELLED' } })).toBe(0);
  });
});
