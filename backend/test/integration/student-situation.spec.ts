import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createCoverage } from '../utils/coverage-fixtures';
import { DAY, local, newArrival, newSession, newStudent, schoolSetup, userByName, utc } from '../utils/situation-fixtures';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Situation d'un élève à un instant donné (021) : classe, séance prévue, enseignant, annonce, remplaçant,
 * surveillants, avec la disponibilité de chaque rubrique. Les heures sont à Paris (UTC+1 le 12 novembre 2026).
 */
describe('Situation d’un élève à un instant donné', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let cookie: string;
  let setup: Awaited<ReturnType<typeof schoolSetup>>;
  /** Enseignant de la scène en cours : un par scène, la base interdit deux séances simultanées pour un enseignant. */
  let teacher: string;
  let teacherUsername: string;
  let admin: string;
  let supervisor: string;
  let substitute: string;
  let substituteName: string;
  let counter = 0;

  // La forme de chaque rubrique est vérifiée par les assertions ; le type reste souple pour les lire sans les redéclarer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Section = { availability: string; value?: Record<string, any>; warning?: string; reasonUnavailable?: string };
  type Situation = { student: { id: string }; moment: { requested: string; evaluatedAt: string; timeZone: string } } & Record<'class' | 'session' | 'teacher' | 'announcement' | 'substitute' | 'supervisors' | 'changes', Section>;

  const ask = (studentId: string, at: string) => request(app.getHttpServer()).get(`/api/admin/students/${studentId}/situation`).query({ at }).set('Cookie', cookie);
  const situation = async (studentId: string, at: string): Promise<Situation> => {
    const res = await ask(studentId, at);
    expect(res.status).toBe(200);
    return res.body as Situation;
  };
  const freshTeacher = async () => {
    teacherUsername = `titulaire-${++counter}`;
    teacher = (await prisma.user.create({ data: { username: teacherUsername, displayName: `Mme Titulaire ${counter}`, role: 'EMPLOYEE', passwordHash: 'x' } })).id;
  };
  /** Classe, élève et séance de 10 h à 11 h dans cette classe. */
  const scene = async (options: { session?: boolean; student?: Parameters<typeof newStudent>[4] } = {}) => {
    await freshTeacher();
    const klass = await setup.newClass(`Situation ${++counter}`);
    const student = await newStudent(prisma, klass.id, admin, '2026-09-01T07:00:00Z', options.student);
    const session = options.session === false ? null : await newSession(prisma, { teacherId: teacher, classId: klass.id, authorId: admin });
    return { klass, student, session };
  };
  const event = (requestId: string, type: 'SUBSTITUTE_SET' | 'ASSIGNED' | 'REASSIGNED' | 'RELEASED', at: string, fromValue: object | undefined, toValue: object | undefined, actorId = admin) =>
    prisma.requestEvent.create({ data: { requestId, actorId, type, fromValue, toValue, createdAt: utc(at) } });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    cookie = await loginAs(app, 'admin');
    setup = await schoolSetup(prisma);
    admin = await userByName(prisma, 'admin');
    supervisor = await userByName(prisma, 'surveillant');
    substitute = await userByName(prisma, 'remplacant');
    substituteName = (await prisma.user.findUniqueOrThrow({ where: { id: substitute } })).displayName;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('séance prévue, titulaire arrivé à l’heure : classe, séance et arrivée, le reste « aucun »', async () => {
    const { klass, student } = await scene();
    await newArrival(prisma, { teacherId: teacher, classId: klass.id, recordedById: teacher, at: '09:02:00' });
    const s = await situation(student.id, local('10:42'));
    expect(s.moment).toMatchObject({ requested: local('10:42'), evaluatedAt: '2026-11-12T09:42:59.999Z', timeZone: 'Europe/Paris' });
    expect(s.class).toMatchObject({ availability: 'KNOWN', value: { id: klass.id, name: klass.name, room: 'Salle 12', reconstructed: false } });
    expect(s.session).toMatchObject({ availability: 'KNOWN', value: { subject: 'Mathématiques', room: 'Salle 12', status: 'SCHEDULED', teacher: { displayName: expect.any(String) } } });
    expect(s.teacher.availability).toBe('KNOWN');
    expect(s.teacher.value?.arrivals).toEqual([expect.objectContaining({ method: 'QR', arrivedAt: '2026-11-12T09:02:00.000Z' })]);
    for (const section of ['announcement', 'substitute', 'supervisors', 'changes'] as const) expect(s[section].availability).toBe('NONE');
  });

  it('une date sans fuseau est lue dans celui de l’école ; les secondes sont ignorées', async () => {
    const { klass, student } = await scene();
    await newArrival(prisma, { teacherId: teacher, classId: klass.id, recordedById: teacher, at: '09:42:30' });
    const withOffset = await situation(student.id, local('10:42'));
    const without = await situation(student.id, `${DAY}T10:42:17`);
    expect(without.moment.evaluatedAt).toBe(withOffset.moment.evaluatedAt);
    expect(without.teacher.value?.arrivals).toHaveLength(1);
  });

  it('titulaire absent annoncé, remplaçant désigné et arrivé : annonce, remplaçant en vigueur, arrivée du remplaçant', async () => {
    const { klass, student } = await scene();
    const requestId = await createCoverage(prisma, { status: 'ACCEPTED', source: 'TEACHER_REQUEST', type: 'ABSENCE', className: klass.name, startAt: utc('08:00:00'), plannedEndAt: utc('16:00:00'), teacher: teacherUsername });
    await prisma.coverageDetail.update({ where: { requestId }, data: { substituteTeacherId: substitute, reason: 'Maladie' } });
    await event(requestId, 'SUBSTITUTE_SET', '07:30:00', { teacherId: null }, { teacherId: substitute });
    await newArrival(prisma, { teacherId: substitute, classId: klass.id, recordedById: substitute, at: '09:05:00', substituteForId: teacher });
    const s = await situation(student.id, local('10:42'));
    expect(s.announcement).toMatchObject({ availability: 'KNOWN', value: { type: 'ABSENCE', reason: 'Maladie' } });
    expect(s.substitute).toMatchObject({ availability: 'KNOWN', value: { inForce: { id: substitute, displayName: substituteName }, arrived: { arrivedAt: '2026-11-12T09:05:00.000Z' } } });
    expect(s.teacher.value?.arrivals.map((a: { teacher: { id: string } }) => a.teacher.id)).toEqual([substitute]);
  });

  it('arrivée après l’instant : aucun enseignant arrivé à ce moment-là', async () => {
    const { klass, student } = await scene();
    await newArrival(prisma, { teacherId: teacher, classId: klass.id, recordedById: teacher, at: '09:30:00', status: 'LATE' });
    const s = await situation(student.id, local('10:15'));
    expect(s.teacher.availability).toBe('NONE');
    expect(s.teacher.value?.arrivals).toEqual([]);
    expect(s.teacher.value?.laterArrivals).toEqual([expect.objectContaining({ arrivedAt: '2026-11-12T09:30:00.000Z' })]);
  });

  it('surveillant de garde : nommé à l’intérieur de sa garde, plus après sa fin', async () => {
    const { klass, student } = await scene();
    const requestId = await createCoverage(prisma, { status: 'DONE', source: 'SUPERVISOR_REPORT', type: 'EMPTY_CLASS', className: klass.name, startAt: utc('09:08:00'), plannedEndAt: null, assignee: 'surveillant' });
    await prisma.coverageDetail.update({ where: { requestId }, data: { presenceAt: utc('09:08:00'), relievedAt: utc('09:35:00') } });
    await event(requestId, 'ASSIGNED', '09:08:00', undefined, { assigneeId: supervisor }, supervisor);
    await prisma.coveragePresence.create({ data: { requestId, userId: supervisor, method: 'QR', createdAt: utc('09:08:00') } });
    const during = await situation(student.id, local('10:20'));
    expect(during.supervisors).toMatchObject({ availability: 'KNOWN', value: { source: 'SUPERVISOR_REPORT', assignee: { state: 'PRESENT', user: { id: supervisor }, presentSince: '2026-11-12T09:08:00.000Z' } } });
    expect((await situation(student.id, local('10:40'))).supervisors.availability).toBe('NONE');
  });

  it('un renfort libéré avant l’instant n’est pas listé', async () => {
    const { klass, student } = await scene();
    const requestId = await createCoverage(prisma, { status: 'ON_DUTY', source: 'SUPERVISOR_REPORT', type: 'EMPTY_CLASS', className: klass.name, startAt: utc('09:08:00'), plannedEndAt: null, assignee: 'surveillant' });
    await event(requestId, 'ASSIGNED', '09:08:00', undefined, { assigneeId: supervisor }, supervisor);
    await prisma.coverageSupport.create({ data: { requestId, userId: admin, joinedAt: utc('09:10:00'), releasedAt: utc('09:30:00') } });
    await prisma.coverageSupport.create({ data: { requestId, userId: teacher, joinedAt: utc('09:12:00') } });
    const s = await situation(student.id, local('10:42'));
    expect(s.supervisors.value?.reinforcements.map((r: { user: { id: string } }) => r.user.id)).toEqual([teacher]);
  });

  it('aucune séance prévue : « aucun », la classe reste connue', async () => {
    const { student } = await scene({ session: false });
    const s = await situation(student.id, local('10:42'));
    expect(s.session.availability).toBe('NONE');
    expect(s.class.availability).toBe('KNOWN');
  });

  it('séance annulée : motif, heure et auteur', async () => {
    await freshTeacher();
    const klass = await setup.newClass(`Situation ${++counter}`);
    const student = await newStudent(prisma, klass.id, admin);
    await newSession(prisma, { teacherId: teacher, classId: klass.id, authorId: admin, status: 'CANCELLED', cancelReason: 'Sortie scolaire', cancelledById: admin });
    const s = await situation(student.id, local('10:42'));
    expect(s.session.value).toMatchObject({ status: 'CANCELLED', cancellation: { reason: 'Sortie scolaire', at: '2026-11-12T07:00:00.000Z', by: { id: admin } } });
  });

  it('classe reconstituée avant la mise en service : probable, avec avertissement ; dépendances non « connues »', async () => {
    const { klass, student } = await scene({ student: { reconstructed: true, historyCreatedAt: '2026-11-20T10:00:00Z' } });
    await newArrival(prisma, { teacherId: teacher, classId: klass.id, recordedById: teacher });
    const s = await situation(student.id, local('10:42'));
    expect(s.class).toMatchObject({ availability: 'PROBABLE', value: { reconstructed: true } });
    expect(s.class.warning).toMatch(/non garantie/i);
    expect(s.session.availability).toBe('PROBABLE');
    expect(s.teacher.availability).toBe('PROBABLE');
  });

  it('avant la création de l’élève : classe et dépendances indisponibles, sans valeur devinée', async () => {
    const { student } = await scene();
    const s = await situation(student.id, '2026-08-01T10:00:00+02:00');
    expect(s.class).toMatchObject({ availability: 'UNAVAILABLE', reasonUnavailable: expect.stringMatching(/création de l’élève/) });
    for (const section of ['session', 'teacher', 'announcement', 'substitute', 'supervisors', 'changes'] as const) {
      expect(s[section]).toMatchObject({ availability: 'UNAVAILABLE' });
      expect(s[section].value).toBeUndefined();
    }
  });

  it('élève passé d’une classe à l’autre : la classe est celle en vigueur à l’instant demandé', async () => {
    const first = await setup.newClass(`Situation ${++counter}`);
    const second = await setup.newClass(`Situation ${++counter}`);
    const student = await newStudent(prisma, first.id, admin);
    await prisma.student.update({ where: { id: student.id }, data: { classId: second.id } });
    await prisma.studentClassHistory.create({ data: { studentId: student.id, classId: second.id, startedAt: utc('09:40:00'), changedById: admin } });
    expect((await situation(student.id, local('10:30'))).class.value?.id).toBe(first.id);
    expect((await situation(student.id, local('10:40'))).class.value?.id).toBe(second.id);
  });

  it('élève et classe désactivés depuis : la situation répond encore', async () => {
    const { klass, student } = await scene();
    await prisma.student.update({ where: { id: student.id }, data: { active: false } });
    await prisma.schoolClass.update({ where: { id: klass.id }, data: { active: false } });
    expect((await ask(student.id, local('10:42'))).status).toBe(200);
  });

  it('enseignant parti de l’établissement sans retour à l’instant : signalé', async () => {
    const { klass, student } = await scene();
    await newArrival(prisma, { teacherId: teacher, classId: klass.id, recordedById: teacher });
    await prisma.teacherDeparture.create({ data: { teacherId: teacher, localDate: new Date(`${DAY}T00:00:00.000Z`), departedAt: utc('09:30:00'), method: 'QR', recordedById: teacher } });
    const s = await situation(student.id, local('10:42'));
    expect(s.teacher.value?.departures).toEqual([expect.objectContaining({ departedAt: '2026-11-12T09:30:00.000Z' })]);
  });

  describe('modifications autour de l’instant (US3)', () => {
    type AuditAction = 'TIMETABLE_CHANGED' | 'ATTENDANCE_CORRECTED' | 'COVERAGE_MANAGED';
    const audit = (action: AuditAction, targetType: string, targetId: string, createdAt: Date, details: object, actorId = admin) =>
      prisma.auditLog.create({ data: { action, actorId, targetType, targetId, details, createdAt } });
    type Change = { kind: string; at: string; by: { id: string } | null; before: unknown; after: unknown; reason: string | null; madeAfterMoment: boolean };
    const changesOf = (s: Situation) => (s.changes.value ?? []) as unknown as Change[];

    it('un changement de salle fait le matin figure avec son auteur, l’ancienne et la nouvelle salle', async () => {
      const { student, session } = await scene();
      await audit('TIMETABLE_CHANGED', 'TeachingSession', session!.id, utc('08:00:00'), { action: 'SESSION_UPDATED', before: { room: 'Salle 8' }, after: { room: 'Salle 12' } });
      const s = await situation(student.id, local('10:42'));
      expect(s.changes.availability).toBe('KNOWN');
      expect(changesOf(s)).toEqual([expect.objectContaining({ kind: 'TIMETABLE_CHANGED', at: '2026-11-12T08:00:00.000Z', by: expect.objectContaining({ id: admin }), before: { room: 'Salle 8' }, after: { room: 'Salle 12' }, madeAfterMoment: false })]);
    });

    it('une arrivée corrigée le lendemain : valeur corrigée affichée, marquée corrigée, correction signalée comme postérieure', async () => {
      const { klass, student } = await scene();
      const row = await newArrival(prisma, { teacherId: teacher, classId: klass.id, recordedById: teacher, at: '09:12:00', status: 'LATE' });
      await audit('ATTENDANCE_CORRECTED', 'TeacherAttendance', row.id, new Date('2026-11-13T08:00:00Z'), {
        before: { status: 'ON_TIME', arrivedAt: '2026-11-12T09:02:00.000Z' },
        after: { status: 'LATE', arrivedAt: '2026-11-12T09:12:00.000Z' },
        reason: 'Erreur de saisie',
      });
      const s = await situation(student.id, local('10:42'));
      expect(s.teacher.value?.arrivals).toEqual([expect.objectContaining({ arrivedAt: '2026-11-12T09:12:00.000Z', corrected: true })]);
      expect(changesOf(s)).toEqual([expect.objectContaining({ kind: 'ATTENDANCE_CORRECTED', reason: 'Erreur de saisie', madeAfterMoment: true, before: expect.objectContaining({ arrivedAt: '2026-11-12T09:02:00.000Z' }) })]);
    });

    it('un remplaçant changé deux fois : celui en vigueur selon l’instant, les deux désignations listées', async () => {
      const { klass, student } = await scene();
      const first = (await prisma.user.create({ data: { username: `premier-${counter}`, displayName: 'M. Premier', role: 'EMPLOYEE', passwordHash: 'x' } })).id;
      const requestId = await createCoverage(prisma, { status: 'ACCEPTED', source: 'TEACHER_REQUEST', type: 'ABSENCE', className: klass.name, startAt: utc('08:00:00'), plannedEndAt: utc('16:00:00'), teacher: teacherUsername });
      await prisma.coverageDetail.update({ where: { requestId }, data: { substituteTeacherId: substitute } });
      await event(requestId, 'SUBSTITUTE_SET', '07:30:00', { teacherId: null }, { teacherId: first });
      await event(requestId, 'SUBSTITUTE_SET', '09:30:00', { teacherId: first }, { teacherId: substitute });
      await audit('COVERAGE_MANAGED', 'Request', requestId, utc('07:30:00'), { action: 'SET_SUBSTITUTE', before: { teacherId: null }, after: { teacherId: first } });
      await audit('COVERAGE_MANAGED', 'Request', requestId, utc('09:30:00'), { action: 'SET_SUBSTITUTE', before: { teacherId: first }, after: { teacherId: substitute } });
      const early = await situation(student.id, local('10:15'));
      const late = await situation(student.id, local('10:42'));
      expect(early.substitute.value?.inForce).toMatchObject({ id: first });
      expect(late.substitute.value?.inForce).toMatchObject({ id: substitute });
      expect(late.substitute.value?.previous.map((p: { teacher: { id: string } }) => p.teacher.id)).toEqual([first, substitute]);
      expect(changesOf(late)).toHaveLength(2);
      expect(changesOf(early).map((c) => c.madeAfterMoment)).toEqual([false, true]);
    });

    it('n’affiche ni les changements d’une autre classe ni ceux d’un autre enseignant', async () => {
      const mine = await scene();
      const other = await scene();
      await audit('TIMETABLE_CHANGED', 'TeachingSession', other.session!.id, utc('08:00:00'), { action: 'SESSION_UPDATED', before: { room: 'A' }, after: { room: 'B' } });
      await audit('TIMETABLE_CHANGED', 'TeachingSession', '00000000-0000-4000-8000-0000000000aa', utc('08:00:00'), { action: 'SESSION_UPDATED', before: { room: 'C' }, after: { room: 'D' } });
      const s = await situation(mine.student.id, local('10:42'));
      expect(s.changes.availability).toBe('NONE');
    });
  });

  describe('validation de l’instant', () => {
    it.each([['absent', undefined], ['mal formé', 'hier soir'], ['date seule', '2026-11-12'], ['dans le futur', '2999-01-01T10:00:00Z']])('%s : 400, sans rien lire de l’élève', async (_name, at) => {
      const { student } = await scene();
      const res = await request(app.getHttpServer()).get(`/api/admin/students/${student.id}/situation`).query(at === undefined ? {} : { at }).set('Cookie', cookie);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    });

    it('élève inconnu : 404', async () => {
      expect((await ask('00000000-0000-4000-8000-00000000dead', local('10:42'))).status).toBe(404);
    });
  });
});
