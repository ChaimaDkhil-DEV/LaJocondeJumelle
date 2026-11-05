import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { localTime } from '../../src/common/school-time';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, createCoverage, minutesFrom, notificationsOf } from '../utils/coverage-fixtures';
import { useMiddayTimezone } from '../utils/school-timezone';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Pointage des enseignants par QR : le QR identifie la classe, la session l'enseignant, l'heure vient du
 * serveur. Pas d'emploi du temps : la référence d'un retard ne vient que d'une demande annoncée, et une
 * absence n'est jamais déduite d'un défaut de scan.
 */
describe('Pointage des enseignants par QR', () => {
  let restoreTz = () => undefined as void;
  let schoolTz = 'Etc/GMT';
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  const VIOLET = '1ère année Violet';
  const BLEU = '2e année Bleu';

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const send = (method: 'post' | 'patch', who: string, path: string, body: Record<string, unknown>) =>
    api()[method](path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);
  const post = (who: string, path: string, body: Record<string, unknown>) => send('post', who, path, body);
  const patch = (who: string, path: string, body: Record<string, unknown>) => send('patch', who, path, body);

  /** Jeton du QR imprimé de la classe, lu avec le compte du super administrateur. */
  async function tokenOf(className: string): Promise<string> {
    const schoolClass = await prisma.schoolClass.findUniqueOrThrow({ where: { name: className } });
    const res = await get('superadmin', `/api/admin/coverage/classes/${schoolClass.id}/qr`);
    expect(res.status).toBe(200);
    return new URL((res.body as { url: string }).url).searchParams.get('c')!;
  }

  const arrive = async (who: string, className = VIOLET, extra: Record<string, unknown> = {}) =>
    post(who, '/api/attendance/arrive', { token: await tokenOf(className), ...extra });

  const classId = async (name: string) => (await prisma.schoolClass.findUniqueOrThrow({ where: { name } })).id;
  const rowsOf = (who: string) => prisma.teacherAttendance.findMany({ where: { teacherId: id[who] } });
  /** Heure locale de l'école (HH:MM), décalée de `minutes` (négatif : dans le passé). */
  const hhmm = (minutesAgo: number) => localTime(minutesFrom(new Date(), -minutesAgo), schoolTz);
  /** Demande d'enseignante du jour : annonce de retard ou d'absence sur la classe. */
  const announce = (type: 'LATENESS' | 'ABSENCE', startMinutes: number, endMinutes: number, className = VIOLET) =>
    createCoverage(prisma, {
      status: 'PENDING',
      type,
      className,
      startAt: minutesFrom(new Date(), startMinutes),
      plannedEndAt: minutesFrom(new Date(), endMinutes),
    });

  /** Vide les pointages en neutralisant le déclencheur de non-suppression, pour la durée du nettoyage seulement. */
  async function clearAttendances() {
    await prisma.$transaction([
      prisma.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
      prisma.$executeRawUnsafe('DELETE FROM "TeacherAttendance"'),
    ]);
  }

  beforeAll(async () => {
    ({ restore: restoreTz, tz: schoolTz } = useMiddayTimezone());
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const who of ['enseignante', 'reprographie', 'admin', 'superadmin', 'surveillant']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
    // Second enseignant (remplaçant potentiel) : membre du groupe Enseignants.
    const teachers = await prisma.employeeGroup.findFirstOrThrow({ where: { systemKey: 'TEACHERS' } });
    await prisma.employeeGroupMember.create({ data: { groupId: teachers.id, userId: id.reprographie } });
  });

  beforeEach(async () => {
    await clearAttendances();
    await clearCoverages(prisma);
  });

  afterAll(async () => {
    restoreTz();
    await app.close();
    await prisma.$disconnect();
  });

  describe('Scan par un enseignant', () => {
    it('enregistre l’arrivée sous l’identité de la session, à l’heure du serveur, sans jugement sans demande annoncée', async () => {
      const before = Date.now();
      const res = await arrive('enseignante');
      expect(res.status).toBe(201);
      const { attendance, match } = res.body as {
        attendance: { teacher: { id: string }; class: { name: string }; method: string; status: string; arrivedAt: string; announcedLateMinutes: number | null; requestId: string | null };
        match: { kind: string };
      };
      expect(attendance).toMatchObject({ method: 'QR', status: 'ARRIVED', announcedLateMinutes: null, requestId: null });
      expect(attendance.teacher.id).toBe(id.enseignante);
      expect(attendance.class.name).toBe(VIOLET);
      expect(match.kind).toBe('NONE');
      // Heure du serveur : l'instant de la requête, jamais une valeur du client.
      expect(new Date(attendance.arrivedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(new Date(attendance.arrivedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('double scan : le pointage existant est renvoyé, sans doublon', async () => {
      const first = await arrive('enseignante');
      const second = await arrive('enseignante');
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect((second.body as { created: boolean; attendance: { id: string } }).created).toBe(false);
      expect((second.body as { attendance: { id: string } }).attendance.id).toBe((first.body as { attendance: { id: string } }).attendance.id);
      expect(await rowsOf('enseignante')).toHaveLength(1);
    });

    it('scans simultanés : un seul pointage (unicité en base)', async () => {
      const token = await tokenOf(VIOLET);
      const results = await Promise.all(Array.from({ length: 6 }, () => post('enseignante', '/api/attendance/arrive', { token })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 200)).toHaveLength(5);
      expect(await rowsOf('enseignante')).toHaveLength(1);
    });

    it('une autre classe le même jour : pointage distinct', async () => {
      expect((await arrive('enseignante', VIOLET)).status).toBe(201);
      expect((await arrive('enseignante', BLEU)).status).toBe(201);
      expect(await rowsOf('enseignante')).toHaveLength(2);
    });

    it('identité falsifiée depuis le frontend : la session prime, jamais le corps de la requête', async () => {
      const res = await arrive('enseignante', VIOLET, { teacherId: id.reprographie, userId: id.reprographie, arrivedAt: '2020-01-01T00:00:00Z' });
      expect([201, 400]).toContain(res.status);
      if (res.status === 201) {
        expect((res.body as { attendance: { teacher: { id: string } } }).attendance.teacher.id).toBe(id.enseignante);
      }
      expect(await rowsOf('reprographie')).toHaveLength(0);
      const stored = await rowsOf('enseignante');
      for (const row of stored) expect(row.arrivedAt!.getFullYear()).not.toBe(2020);
    });

    it('non authentifié : refusé', async () => {
      const token = await tokenOf(VIOLET);
      const res = await api().post('/api/attendance/arrive').set('Origin', TEST_ORIGIN).send({ token });
      expect(res.status).toBe(401);
    });

    it.each(['surveillant', 'admin', 'superadmin'])('%s (hors groupe Enseignants) : 404 journalisé, aucun pointage', async (who) => {
      const res = await arrive(who);
      expect(res.status).toBe(404);
      expect(await prisma.teacherAttendance.count()).toBe(0);
      const denied = await prisma.auditLog.findFirst({ where: { action: 'ACCESS_DENIED', actorId: id[who], targetType: 'Attendance' } });
      expect(denied).not.toBeNull();
    });

    it('QR invalide : refusé', async () => {
      const res = await post('enseignante', '/api/attendance/arrive', { token: 'c1.n-importe-quoi' });
      expect(res.status).toBe(422);
      expect((res.body as { error: { code: string } }).error.code).toBe('QR_INVALID');
    });

    it('QR révoqué : l’ancien QR imprimé est refusé, le nouveau accepté', async () => {
      const oldToken = await tokenOf(VIOLET);
      expect((await post('superadmin', `/api/admin/coverage/classes/${await classId(VIOLET)}/qr/revoke`, {})).status).toBe(201);
      const refused = await post('enseignante', '/api/attendance/arrive', { token: oldToken });
      expect(refused.status).toBe(422);
      expect((refused.body as { error: { code: string } }).error.code).toBe('QR_INVALID');
      expect((await arrive('enseignante')).status).toBe(201);
    });

    it('classe désactivée : QR refusé', async () => {
      const token = await tokenOf(BLEU);
      await prisma.schoolClass.update({ where: { name: BLEU }, data: { active: false } });
      try {
        expect((await post('enseignante', '/api/attendance/arrive', { token })).status).toBe(422);
      } finally {
        await prisma.schoolClass.update({ where: { name: BLEU }, data: { active: true } });
      }
    });

    it('ouvrir la page (résolution) n’enregistre rien', async () => {
      const res = await post('enseignante', '/api/attendance/resolve', { token: await tokenOf(VIOLET) });
      expect(res.status).toBe(200);
      expect((res.body as { class: { name: string }; attendance: unknown }).class.name).toBe(VIOLET);
      expect((res.body as { attendance: unknown }).attendance).toBeNull();
      expect(await prisma.teacherAttendance.count()).toBe(0);
    });
  });

  describe('Rattachement à une demande annoncée', () => {
    it('retard annoncé : minutes depuis l’heure annoncée, historique de la demande et alerte à l’admin', async () => {
      const requestId = await announce('LATENESS', -25, 35);
      const res = await arrive('enseignante');
      expect(res.status).toBe(201);
      const attendance = (res.body as { attendance: { requestId: string; announcedType: string; announcedLateMinutes: number; status: string } }).attendance;
      expect(attendance).toMatchObject({ requestId, announcedType: 'LATENESS', status: 'ARRIVED' });
      expect(attendance.announcedLateMinutes).toBeGreaterThanOrEqual(25);
      expect(attendance.announcedLateMinutes).toBeLessThanOrEqual(26);

      expect(await prisma.requestEvent.count({ where: { requestId, type: 'TEACHER_ARRIVED', actorId: id.enseignante } })).toBe(1);
      expect((await notificationsOf(prisma, 'admin', requestId)).map((n) => n.type)).toContain('COVERAGE_TEACHER_ARRIVED');
      // La garde n'est ni clôturée ni annulée automatiquement : l'action reste humaine.
      expect((await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('PENDING');
    });

    it('absence annoncée mais présent : anomalie signalée à l’admin, rien n’est annulé', async () => {
      const requestId = await announce('ABSENCE', -10, 120);
      const res = await arrive('enseignante');
      expect(res.status).toBe(201);
      expect((res.body as { attendance: { anomaly: boolean } }).attendance.anomaly).toBe(true);
      expect((await notificationsOf(prisma, 'admin', requestId)).map((n) => n.type)).toContain('COVERAGE_ATTENDANCE_ANOMALY');
      expect((await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('PENDING');
    });

    it('demande d’une autre classe ou annulée : aucun rattachement', async () => {
      await announce('LATENESS', -25, 35, BLEU);
      const cancelled = await announce('LATENESS', -25, 35);
      await prisma.request.update({ where: { id: cancelled }, data: { status: 'CANCELLED' } });
      const res = await arrive('enseignante');
      expect((res.body as { attendance: { requestId: string | null } }).attendance.requestId).toBeNull();
    });

    it('une absence n’est jamais déduite d’un défaut de scan', async () => {
      await announce('LATENESS', -25, 35);
      // Personne ne scanne : aucun pointage, aucune absence créée.
      const day = await get('admin', '/api/attendance/day');
      expect(day.status).toBe(200);
      expect((day.body as { attendances: unknown[] }).attendances).toHaveLength(0);
      expect((day.body as { announced: Array<{ attendanceId: string | null }> }).announced[0].attendanceId).toBeNull();
      expect(await prisma.teacherAttendance.count()).toBe(0);
      expect(await prisma.teacherAttendance.count({ where: { status: 'ABSENT' } })).toBe(0);
    });
  });

  describe('Remplaçant autorisé', () => {
    it('l’admin désigne le remplaçant ; il pointe sous son propre compte, le titulaire est conservé', async () => {
      const requestId = await announce('ABSENCE', -10, 120);
      const set = await patch('admin', `/api/attendance/substitutes/${requestId}`, { teacherId: id.reprographie });
      expect(set.status).toBe(200);
      expect(await prisma.requestEvent.count({ where: { requestId, type: 'SUBSTITUTE_SET' } })).toBe(1);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'COVERAGE_MANAGED', targetId: requestId, actorId: id.admin } });
      expect(audit).not.toBeNull();

      const res = await arrive('reprographie');
      expect(res.status).toBe(201);
      const attendance = (res.body as { attendance: { teacher: { id: string }; substituteFor: { id: string } | null; anomaly: boolean; requestId: string } }).attendance;
      expect(attendance.teacher.id).toBe(id.reprographie);
      expect(attendance.substituteFor?.id).toBe(id.enseignante);
      expect(attendance.requestId).toBe(requestId);
      expect(attendance.anomaly).toBe(false);
      // Le titulaire n'a aucun pointage à son nom.
      expect(await rowsOf('enseignante')).toHaveLength(0);

      const detail = await get('admin', `/api/coverage/${requestId}`);
      expect((detail.body as { substituteTeacher: { id: string } }).substituteTeacher.id).toBe(id.reprographie);
    });

    it('sans autorisation, un enseignant ne peut pas se déclarer remplaçant : simple arrivée', async () => {
      const requestId = await announce('ABSENCE', -10, 120);
      const res = await arrive('reprographie');
      expect(res.status).toBe(201);
      const attendance = (res.body as { attendance: { substituteFor: unknown; requestId: string | null } }).attendance;
      expect(attendance.substituteFor).toBeNull();
      expect(attendance.requestId).toBeNull();
      expect((await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId } })).substituteTeacherId).toBeNull();
    });

    it('un enseignant ne peut pas désigner de remplaçant', async () => {
      const requestId = await announce('ABSENCE', -10, 120);
      expect((await patch('enseignante', `/api/attendance/substitutes/${requestId}`, { teacherId: id.reprographie })).status).toBe(404);
      expect((await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId } })).substituteTeacherId).toBeNull();
    });

    it('refus : titulaire lui-même, non-enseignant, demande de retard', async () => {
      const absence = await announce('ABSENCE', -10, 120);
      expect((await patch('admin', `/api/attendance/substitutes/${absence}`, { teacherId: id.enseignante })).status).toBe(400);
      expect((await patch('admin', `/api/attendance/substitutes/${absence}`, { teacherId: id.surveillant })).status).toBe(400);
      const lateness = await announce('LATENESS', -10, 120, BLEU);
      expect((await patch('admin', `/api/attendance/substitutes/${lateness}`, { teacherId: id.reprographie })).status).toBe(400);
    });

    it('le remplaçant peut être retiré', async () => {
      const requestId = await announce('ABSENCE', -10, 120);
      await patch('admin', `/api/attendance/substitutes/${requestId}`, { teacherId: id.reprographie });
      expect((await patch('admin', `/api/attendance/substitutes/${requestId}`, { teacherId: null })).status).toBe(200);
      expect((await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId } })).substituteTeacherId).toBeNull();
    });
  });

  describe('Mes présences et suivi', () => {
    it('« Mes présences » : uniquement les pointages de l’enseignant', async () => {
      await arrive('enseignante');
      await arrive('reprographie', BLEU);
      const mine = await get('enseignante', '/api/attendance/mine');
      expect(mine.status).toBe(200);
      const list = mine.body as Array<{ teacher: { id: string } }>;
      expect(list).toHaveLength(1);
      expect(list[0].teacher.id).toBe(id.enseignante);
      expect((await get('surveillant', '/api/attendance/mine')).status).toBe(404);
    });

    it('suivi réservé à l’admin', async () => {
      expect((await get('admin', '/api/attendance/day')).status).toBe(200);
      expect((await get('superadmin', '/api/attendance/day')).status).toBe(200);
      expect((await get('enseignante', '/api/attendance/day')).status).toBe(404);
      expect((await get('surveillant', '/api/attendance/day')).status).toBe(404);
      expect((await api().get('/api/attendance/day')).status).toBe(401);
    });

    it('classe vide puis arrivée de l’enseignant : les deux événements sont conservés, la classe devient occupée', async () => {
      await createCoverage(prisma, {
        status: 'ON_DUTY',
        source: 'SUPERVISOR_REPORT',
        type: 'EMPTY_CLASS',
        teacher: null,
        assignee: 'surveillant',
        startAt: minutesFrom(new Date(), -20),
        plannedEndAt: minutesFrom(new Date(), 40),
      });
      let day = (await get('admin', '/api/attendance/day')).body as { classStates: Array<{ class: { name: string }; current: string; events: Array<{ kind: string }> }>; emptyClasses: unknown[] };
      expect(day.emptyClasses).toHaveLength(1);
      expect(day.classStates.find((c) => c.class.name === VIOLET)?.current).toBe('EMPTY');

      await arrive('enseignante');
      day = (await get('admin', '/api/attendance/day')).body as typeof day;
      const state = day.classStates.find((c) => c.class.name === VIOLET)!;
      expect(state.current).toBe('OCCUPIED');
      expect(state.events.map((e) => e.kind)).toEqual(['EMPTY', 'ARRIVAL']);
      expect(day.emptyClasses).toHaveLength(1);
    });
  });

  describe('Régularisation manuelle', () => {
    const manual = (body: Record<string, unknown>, who = 'admin') =>
      post(who, '/api/attendance/manual', { teacherId: id.enseignante, classId: undefined, ...body });

    it('présent avec heure d’arrivée distincte de l’heure de saisie, auteur et méthode conservés', async () => {
      const res = await manual({ classId: await classId(VIOLET), status: 'ON_TIME', arrivedTime: hhmm(40), comment: 'Oubli de scan' });
      expect(res.status).toBe(201);
      const row = res.body as { method: string; status: string; arrivedAt: string; recordedAt: string; recordedBy: { id: string }; teacher: { id: string }; comment: string };
      expect(row).toMatchObject({ method: 'MANUAL', status: 'ON_TIME', comment: 'Oubli de scan' });
      expect(row.recordedBy.id).toBe(id.admin);
      expect(row.teacher.id).toBe(id.enseignante);
      expect(new Date(row.recordedAt).getTime() - new Date(row.arrivedAt).getTime()).toBeGreaterThan(30 * 60_000);
      expect(await prisma.auditLog.count({ where: { action: 'ATTENDANCE_MANUAL', targetId: (res.body as { id: string }).id, actorId: id.admin } })).toBe(1);
    });

    it('en retard sans heure connue, et absence avec motif', async () => {
      expect((await manual({ classId: await classId(VIOLET), status: 'LATE' })).status).toBe(201);
      const absent = await manual({ classId: await classId(BLEU), status: 'ABSENT', comment: 'Absent, prévenu par téléphone' });
      expect(absent.status).toBe(201);
      expect((absent.body as { status: string; arrivedAt: string | null }).arrivedAt).toBeNull();
    });

    it('refus si un pointage existe déjà : jamais deux présences contradictoires', async () => {
      await arrive('enseignante');
      const res = await manual({ classId: await classId(VIOLET), status: 'ABSENT', comment: 'x' });
      expect(res.status).toBe(409);
      expect((res.body as { error: { code: string } }).error.code).toBe('ATTENDANCE_EXISTS');
      expect(await rowsOf('enseignante')).toHaveLength(1);
      expect((await rowsOf('enseignante'))[0].method).toBe('QR');
    });

    it('validations : absence sans motif, heure future, heure d’arrivée d’une absence, date future, non-enseignant', async () => {
      const violet = await classId(VIOLET);
      expect((await manual({ classId: violet, status: 'ABSENT' })).status).toBe(400);
      expect((await manual({ classId: violet, status: 'ABSENT', comment: 'x', arrivedTime: hhmm(10) })).status).toBe(400);
      expect((await manual({ classId: violet, status: 'LATE', arrivedTime: hhmm(-90) })).status).toBe(400);
      expect((await manual({ classId: violet, status: 'ON_TIME', date: '2999-01-01' })).status).toBe(400);
      expect((await manual({ classId: violet, status: 'ON_TIME', teacherId: id.surveillant })).status).toBe(400);
      expect(await prisma.teacherAttendance.count()).toBe(0);
    });

    it.each(['enseignante', 'surveillant'])('%s ne peut pas régulariser', async (who) => {
      const res = await manual({ classId: await classId(VIOLET), status: 'ON_TIME' }, who);
      expect(res.status).toBe(404);
      expect(await prisma.teacherAttendance.count()).toBe(0);
    });

    it('rattache la saisie à un retard annoncé', async () => {
      const requestId = await announce('LATENESS', -60, 30);
      const res = await manual({ classId: await classId(VIOLET), status: 'LATE', arrivedTime: hhmm(30) });
      expect(res.status).toBe(201);
      const row = res.body as { requestId: string; announcedLateMinutes: number };
      expect(row.requestId).toBe(requestId);
      expect(row.announcedLateMinutes).toBeGreaterThanOrEqual(29);
      expect(row.announcedLateMinutes).toBeLessThanOrEqual(31);
    });
  });

  describe('Corrections et historique', () => {
    it('qualifier un scan « en retard » : motif obligatoire, avant/après au journal d’audit, heure du serveur conservée', async () => {
      const scan = (await arrive('enseignante')).body as { attendance: { id: string; arrivedAt: string } };
      const id1 = scan.attendance.id;
      expect((await patch('admin', `/api/attendance/${id1}`, { status: 'LATE' })).status).toBe(400); // motif manquant
      const res = await patch('admin', `/api/attendance/${id1}`, { status: 'LATE', reason: 'Arrivé après la sonnerie' });
      expect(res.status).toBe(200);
      expect((res.body as { status: string; method: string; arrivedAt: string }).status).toBe('LATE');
      expect((res.body as { method: string }).method).toBe('QR');
      expect((res.body as { arrivedAt: string }).arrivedAt).toBe(scan.attendance.arrivedAt);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ATTENDANCE_CORRECTED', targetId: id1 } });
      expect(audit.actorId).toBe(id.admin);
      expect(audit.details).toMatchObject({ before: { status: 'ARRIVED' }, after: { status: 'LATE' }, reason: 'Arrivé après la sonnerie' });
    });

    it('un scan ne peut être contredit : ni absence, ni changement d’heure', async () => {
      const scan = (await arrive('enseignante')).body as { attendance: { id: string } };
      expect((await patch('admin', `/api/attendance/${scan.attendance.id}`, { status: 'ABSENT', comment: 'x', reason: 'test' })).status).toBe(400);
      expect((await patch('admin', `/api/attendance/${scan.attendance.id}`, { arrivedTime: hhmm(5), reason: 'test' })).status).toBe(400);
      expect((await prisma.teacherAttendance.findUniqueOrThrow({ where: { id: scan.attendance.id } })).status).toBe('ARRIVED');
    });

    it('une saisie manuelle se corrige (heure, statut) et chaque correction est tracée', async () => {
      const created = await post('admin', '/api/attendance/manual', { teacherId: id.enseignante, classId: await classId(VIOLET), status: 'LATE', arrivedTime: hhmm(50) });
      const rowId = (created.body as { id: string }).id;
      const res = await patch('admin', `/api/attendance/${rowId}`, { status: 'ON_TIME', arrivedTime: hhmm(70), reason: 'Erreur de saisie' });
      expect(res.status).toBe(200);
      expect((res.body as { status: string }).status).toBe('ON_TIME');
      await patch('admin', `/api/attendance/${rowId}`, { comment: 'Précision', reason: 'Ajout' });
      expect(await prisma.auditLog.count({ where: { action: 'ATTENDANCE_CORRECTED', targetId: rowId } })).toBe(2);
    });

    it('l’enseignant ne peut pas modifier une régularisation ni son propre pointage', async () => {
      const scan = (await arrive('enseignante')).body as { attendance: { id: string } };
      expect((await patch('enseignante', `/api/attendance/${scan.attendance.id}`, { status: 'ON_TIME', reason: 'moi' })).status).toBe(404);
      expect((await patch('surveillant', `/api/attendance/${scan.attendance.id}`, { status: 'ON_TIME', reason: 'x' })).status).toBe(404);
      expect((await prisma.teacherAttendance.findUniqueOrThrow({ where: { id: scan.attendance.id } })).status).toBe('ARRIVED');
    });

    it('l’historique ne se supprime pas : la base refuse suppression et vidage', async () => {
      await arrive('enseignante');
      await expect(prisma.teacherAttendance.deleteMany()).rejects.toThrow(/ne peut pas être vidée|interdit/i);
      await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "TeacherAttendance"')).rejects.toThrow(/interdit/i);
      expect(await prisma.teacherAttendance.count()).toBe(1);
    });
  });
});
