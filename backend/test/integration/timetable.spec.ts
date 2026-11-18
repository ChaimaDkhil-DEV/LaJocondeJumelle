import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, localDate } from '../../src/common/school-time';
import { isoWeekday } from '../../src/timetable/domain/series';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, createCoverage } from '../utils/coverage-fixtures';
import { useMiddayTimezone } from '../utils/school-timezone';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Emplois du temps (020) : gestion par l'administration (US1, US2) et consultation par l'enseignant (US4).
 * Conflits refusés par la base et listés ; séances jamais supprimées ; chaque écriture auditée.
 */
describe('Emplois du temps', () => {
  let restoreTz = () => undefined as void;
  let tz = 'Etc/GMT';
  const prisma = new PrismaClient();
  let app: INestApplication;
  let emit: jest.SpyInstance;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  const cls: Record<'violet' | 'bleu', string> = { violet: '', bleu: '' };
  let today = '';

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const send = (method: 'post' | 'patch', who: string, path: string, body: Record<string, unknown> = {}) =>
    api()[method](path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);
  const post = (who: string, path: string, body: Record<string, unknown> = {}) => send('post', who, path, body);

  const single = (over: Record<string, unknown> = {}) => ({
    teacherId: id.enseignante,
    classId: cls.violet,
    date: addDays(today, 7),
    startTime: '08:00',
    endTime: '09:00',
    ...over,
  });
  const series = (over: Record<string, unknown> = {}) => ({
    teacherId: id.enseignante,
    classId: cls.violet,
    weekday: isoWeekday(addDays(today, 7)),
    startTime: '08:00',
    endTime: '09:00',
    subject: 'Mathématiques',
    room: 'Salle 3',
    startDate: addDays(today, 1),
    endDate: addDays(today, 28),
    ...over,
  });
  const sessionCount = () => prisma.teachingSession.count();
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action: 'TIMETABLE_CHANGED', details: { path: ['action'], equals: action } }, orderBy: { createdAt: 'asc' } });

  async function clearAll() {
    await prisma.$transaction([
      prisma.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
      prisma.$executeRawUnsafe('DELETE FROM "TeachingSession"'),
      prisma.$executeRawUnsafe('DELETE FROM "TimetableSeries"'),
      prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "action" IN ('TIMETABLE_CHANGED', 'ACCESS_DENIED')`),
    ]);
  }

  beforeAll(async () => {
    ({ restore: restoreTz, tz } = useMiddayTimezone());
    today = localDate(new Date(), tz);
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const who of ['enseignante', 'reprographie', 'admin', 'superadmin', 'surveillant', 'autre']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
    const teachers = await prisma.employeeGroup.findFirstOrThrow({ where: { systemKey: 'TEACHERS' } });
    await prisma.employeeGroupMember.create({ data: { groupId: teachers.id, userId: id.reprographie } });
    cls.violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })).id;
    cls.bleu = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '2e année Bleu' } })).id;
    emit = jest.spyOn(app.get(RealtimeService), 'emitToUsers');
  });

  beforeEach(async () => {
    await clearAll();
    await clearCoverages(prisma);
    emit.mockClear();
  });

  afterAll(async () => {
    restoreTz();
    await app.close();
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // US1 — création
  // ---------------------------------------------------------------------------

  describe('US1 — séries et séances', () => {
    it('une série crée une séance par semaine, avec enseignant, classe, niveau, matière et salle', async () => {
      const res = await post('admin', '/api/timetable/series', series());
      expect(res.status).toBe(201);
      expect(res.body.sessionCount).toBe(4);
      expect(res.body.series).toMatchObject({ weekday: series().weekday, startTime: '08:00', endTime: '09:00', subject: 'Mathématiques' });

      const list = await get('admin', `/api/timetable/sessions?from=${today}&to=${addDays(today, 30)}&teacherId=${id.enseignante}`);
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(4);
      const klass = await prisma.schoolClass.findUniqueOrThrow({ where: { id: cls.violet }, include: { level: true } });
      expect(list.body[0]).toMatchObject({
        seriesId: res.body.series.id,
        detached: false,
        teacher: { id: id.enseignante },
        class: { id: cls.violet, name: '1ère année Violet' },
        level: klass.level ? { id: klass.level.id, name: klass.level.name } : null,
        subject: 'Mathématiques',
        room: 'Salle 3',
        status: 'SCHEDULED',
        cancelReason: null,
        weekday: series().weekday,
      });
      const dates = (list.body as Array<{ date: string }>).map((s) => s.date);
      expect(dates).toEqual([7, 14, 21, 28].map((d) => addDays(today, d)));
    });

    it('une séance isolée sans salle affiche la salle de la classe', async () => {
      const res = await post('superadmin', '/api/timetable/sessions', single());
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ seriesId: null, room: 'Salle 12', subject: null, date: addDays(today, 7), status: 'SCHEDULED' });
    });

    it.each([
      ['un compte hors du groupe Enseignants', () => ({ teacherId: id.autre }), 'teacherId'],
      ['une classe inconnue', () => ({ classId: '00000000-0000-4000-8000-000000000999' }), 'classId'],
      ['une date passée', () => ({ date: addDays(today, -1) }), 'date'],
      ['une fin avant le début', () => ({ startTime: '10:00', endTime: '09:00' }), 'endTime'],
    ])('refuse %s (400 sur le champ)', async (_label, over, field) => {
      const res = await post('admin', '/api/timetable/sessions', single(over()));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect((res.body.error.details.fields as Array<{ field: string }>).map((f) => f.field)).toContain(field);
      expect(await sessionCount()).toBe(0);
    });

    it('refuse un enseignant ou une classe désactivés', async () => {
      await prisma.schoolClass.update({ where: { id: cls.bleu }, data: { active: false } });
      try {
        expect((await post('admin', '/api/timetable/sessions', single({ classId: cls.bleu }))).status).toBe(400);
      } finally {
        await prisma.schoolClass.update({ where: { id: cls.bleu }, data: { active: true } });
      }
    });

    it('conflit d’enseignant : rien n’est créé et chaque date en conflit est listée', async () => {
      expect((await post('admin', '/api/timetable/series', series())).status).toBe(201);
      const before = await sessionCount();
      const res = await post('admin', '/api/timetable/series', series({ classId: cls.bleu, startTime: '08:30', endTime: '09:30' }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TIMETABLE_CONFLICT');
      const conflicts = res.body.error.details.conflicts as Array<{ kind: string; date: string; teacher: { id: string }; class: { id: string } }>;
      expect(conflicts).toHaveLength(4);
      expect(conflicts.every((c) => c.kind === 'TEACHER' && c.teacher.id === id.enseignante && c.class.id === cls.violet)).toBe(true);
      expect(conflicts[0]).toMatchObject({ sessionId: expect.any(String), startAt: expect.any(String), proposed: { date: conflicts[0].date } });
      expect(await sessionCount()).toBe(before);
    });

    it('conflit de classe avec un autre enseignant', async () => {
      expect((await post('admin', '/api/timetable/sessions', single())).status).toBe(201);
      const res = await post('admin', '/api/timetable/sessions', single({ teacherId: id.reprographie, startTime: '08:30', endTime: '09:30' }));
      expect(res.status).toBe(409);
      expect(res.body.error.details.conflicts).toEqual([expect.objectContaining({ kind: 'CLASS' })]);
    });

    it('des séances bout à bout sont acceptées', async () => {
      expect((await post('admin', '/api/timetable/sessions', single())).status).toBe(201);
      expect((await post('admin', '/api/timetable/sessions', single({ startTime: '09:00', endTime: '10:00' }))).status).toBe(201);
    });

    it('deux enregistrements simultanés qui se chevauchent : un seul passe, l’autre reçoit le conflit', async () => {
      const [a, b] = await Promise.all([
        post('admin', '/api/timetable/sessions', single()),
        post('superadmin', '/api/timetable/sessions', single({ classId: cls.bleu, startTime: '08:30', endTime: '09:30' })),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect([a, b].find((r) => r.status === 409)!.body.error.code).toBe('TIMETABLE_CONFLICT');
      expect(await sessionCount()).toBe(1);
    });

    it('la liste est bornée à 31 jours et refuse un paramètre inconnu', async () => {
      expect((await get('admin', `/api/timetable/sessions?from=${today}&to=${addDays(today, 32)}`)).status).toBe(400);
      expect((await get('admin', `/api/timetable/sessions?from=${today}&to=${addDays(today, 6)}&foo=1`)).status).toBe(400);
    });

    it('les séries d’un enseignant se listent avec le nombre de séances à venir', async () => {
      await post('admin', '/api/timetable/series', series());
      const res = await get('admin', `/api/timetable/series?teacherId=${id.enseignante}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([expect.objectContaining({ teacher: { id: id.enseignante, displayName: expect.any(String) }, upcomingCount: 4 })]);
    });

    it.each(['enseignante', 'surveillant', 'autre'])('%s : 404 et refus journalisé', async (who) => {
      const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } });
      expect((await post(who, '/api/timetable/sessions', single())).status).toBe(404);
      expect((await get(who, `/api/timetable/sessions?from=${today}&to=${today}`)).status).toBe(404);
      expect((await post(who, '/api/timetable/series', series())).status).toBe(404);
      expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } })).toBe(before + 3);
      expect(await sessionCount()).toBe(0);
    });

    it('chaque création est journalisée et annoncée en direct', async () => {
      await post('admin', '/api/timetable/series', series());
      await post('admin', '/api/timetable/sessions', single({ classId: cls.bleu, startTime: '10:00', endTime: '11:00' }));
      const [created] = await audits('SERIES_CREATED');
      expect(created).toMatchObject({ actorId: id.admin, targetType: 'TimetableSeries' });
      expect(created.details).toMatchObject({ sessionCount: 4, after: { teacherId: id.enseignante, classId: cls.violet, startTime: '08:00' } });
      const [one] = await audits('SESSION_CREATED');
      expect(one.details).toMatchObject({ after: { teacherId: id.enseignante, classId: cls.bleu, date: addDays(today, 7) } });

      const calls = emit.mock.calls.filter(([, event]) => event === 'timetable:updated');
      expect(calls).toHaveLength(2);
      const [recipients, , payload] = calls[0] as [string[], string, { dates: string[] }];
      expect([...recipients]).toEqual(expect.arrayContaining([id.admin, id.superadmin, id.enseignante]));
      expect(payload.dates).toHaveLength(4);
    });
  });

  // ---------------------------------------------------------------------------
  // US2 — changements exceptionnels
  // ---------------------------------------------------------------------------

  describe('US2 — changements exceptionnels', () => {
    const patch = (who: string, path: string, body: Record<string, unknown>) => send('patch', who, path, body);
    const sessionsOf = (seriesId: string) => prisma.teachingSession.findMany({ where: { seriesId }, orderBy: { startAt: 'asc' } });
    const createSeries = async (over: Record<string, unknown> = {}) => {
      const res = await post('admin', '/api/timetable/series', series(over));
      expect(res.status).toBe(201);
      return res.body.series.id as string;
    };
    /** Séance d'aujourd'hui déjà commencée (l'heure locale des tests est ≈ 12 h). */
    const started = async () => {
      const res = await post('admin', '/api/timetable/sessions', single({ date: today, startTime: '09:00', endTime: '10:00' }));
      expect(res.status).toBe(201);
      return res.body.id as string;
    };

    it('modifier une séance à venir : seule elle change, détachée de sa série, conflits vérifiés', async () => {
      const seriesId = await createSeries();
      const [first, second] = await sessionsOf(seriesId);
      const res = await patch('admin', `/api/timetable/sessions/${first.id}`, { startTime: '10:00', endTime: '11:00', room: 'Labo' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: first.id, detached: true, room: 'Labo' });
      const after = await sessionsOf(seriesId);
      expect(after[0].startAt.getTime() - first.startAt.getTime()).toBe(2 * 60 * 60_000);
      expect(after[1]).toMatchObject({ startAt: second.startAt, detached: false });

      // Une autre séance de la classe à 10:30 le même jour : conflit.
      await post('admin', '/api/timetable/sessions', single({ teacherId: id.reprographie, date: addDays(today, 14), startTime: '10:30', endTime: '11:30' }));
      const conflict = await patch('admin', `/api/timetable/sessions/${second.id}`, { startTime: '10:00', endTime: '11:00' });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.details.conflicts).toEqual([expect.objectContaining({ kind: 'CLASS' })]);
    });

    it('changer l’enseignant d’une séance : le nouvel enseignant est vérifié et ses conflits aussi', async () => {
      const seriesId = await createSeries();
      const [first] = await sessionsOf(seriesId);
      expect((await patch('admin', `/api/timetable/sessions/${first.id}`, { teacherId: id.autre })).status).toBe(400);
      await post('admin', '/api/timetable/sessions', single({ teacherId: id.reprographie, classId: cls.bleu, startTime: '08:30', endTime: '09:30' }));
      const busy = await patch('admin', `/api/timetable/sessions/${first.id}`, { teacherId: id.reprographie });
      expect(busy.status).toBe(409);
      expect(busy.body.error.details.conflicts).toEqual([expect.objectContaining({ kind: 'TEACHER' })]);
      const [, second] = await sessionsOf(seriesId);
      const ok = await patch('admin', `/api/timetable/sessions/${second.id}`, { teacherId: id.reprographie });
      expect(ok.status).toBe(200);
      expect(ok.body.teacher.id).toBe(id.reprographie);
    });

    it('une séance commencée ne change plus (enseignant, classe, date, heures) ; une séance annulée non plus', async () => {
      const sessionId = await started();
      for (const body of [{ teacherId: id.reprographie }, { classId: cls.bleu }, { date: addDays(today, 1) }, { startTime: '09:30' }]) {
        const res = await patch('admin', `/api/timetable/sessions/${sessionId}`, body);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('SESSION_LOCKED');
      }
      expect((await post('admin', `/api/timetable/sessions/${sessionId}/cancel`, { reason: 'Sortie' })).status).toBe(200);
      expect((await patch('admin', `/api/timetable/sessions/${sessionId}`, { room: 'Salle 2' })).body.error.code).toBe('SESSION_LOCKED');
      expect((await post('admin', `/api/timetable/sessions/${sessionId}/cancel`, { reason: 'Encore' })).body.error.code).toBe('SESSION_LOCKED');
    });

    it('annuler : motif obligatoire, auteur et heure posés, créneau libéré, jamais supprimée', async () => {
      const seriesId = await createSeries();
      const [first] = await sessionsOf(seriesId);
      expect((await post('admin', `/api/timetable/sessions/${first.id}/cancel`, {})).status).toBe(400);
      expect((await post('admin', `/api/timetable/sessions/${first.id}/cancel`, { reason: '   ' })).status).toBe(400);
      const res = await post('admin', `/api/timetable/sessions/${first.id}/cancel`, { reason: 'Sortie scolaire' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Sortie scolaire' });
      expect(await prisma.teachingSession.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ cancelledById: id.admin, cancelledAt: expect.any(Date) });
      // Le créneau est libre : une autre séance peut le prendre.
      expect((await post('admin', '/api/timetable/sessions', single())).status).toBe(201);
      const [audit] = await audits('SESSION_CANCELLED');
      expect(audit.details).toMatchObject({ reason: 'Sortie scolaire', before: { status: 'SCHEDULED' }, after: { status: 'CANCELLED' } });
    });

    it('annuler une séance passée : jusqu’à 7 jours en arrière, pas au-delà', async () => {
      const past = async (daysAgo: number) =>
        prisma.teachingSession.create({
          data: {
            teacherId: id.enseignante,
            classId: cls.violet,
            localDate: new Date(`${addDays(today, -daysAgo)}T00:00:00.000Z`),
            startAt: new Date(Date.now() - daysAgo * 86_400_000 - 3_600_000),
            endAt: new Date(Date.now() - daysAgo * 86_400_000),
            createdById: id.admin,
          },
        });
      expect((await post('admin', `/api/timetable/sessions/${(await past(7)).id}/cancel`, { reason: 'Erreur de saisie' })).status).toBe(200);
      const tooOld = await post('admin', `/api/timetable/sessions/${(await past(8)).id}/cancel`, { reason: 'Erreur de saisie' });
      expect(tooOld.status).toBe(409);
      expect(tooOld.body.error.code).toBe('SESSION_LOCKED');
    });

    it('changer une série à partir d’une date : séances à venir non détachées seulement, tout ou rien', async () => {
      const seriesId = await createSeries();
      const [first, second, third, fourth] = await sessionsOf(seriesId);
      await patch('admin', `/api/timetable/sessions/${third.id}`, { room: 'Labo' });
      const res = await patch('admin', `/api/timetable/series/${seriesId}`, { from: addDays(today, 14), startTime: '13:00', endTime: '14:00' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ updated: 2, created: 0, cancelled: 0, series: { startTime: '13:00', endTime: '14:00' } });
      const after = await sessionsOf(seriesId);
      const byId = new Map(after.map((s) => [s.id, s]));
      expect(byId.get(first.id)!.startAt).toEqual(first.startAt);
      expect(byId.get(third.id)!.startAt).toEqual(third.startAt);
      expect(byId.get(second.id)!.startAt.getTime() - second.startAt.getTime()).toBe(5 * 60 * 60_000);
      expect(byId.get(fourth.id)!.startAt.getTime() - fourth.startAt.getTime()).toBe(5 * 60 * 60_000);

      // Conflit sur une seule date : rien ne change.
      await post('admin', '/api/timetable/sessions', single({ teacherId: id.reprographie, date: addDays(today, 28), startTime: '15:00', endTime: '16:00' }));
      const refused = await patch('admin', `/api/timetable/series/${seriesId}`, { from: addDays(today, 14), startTime: '15:30', endTime: '16:30' });
      expect(refused.status).toBe(409);
      expect((await prisma.teachingSession.findUniqueOrThrow({ where: { id: fourth.id } })).startAt).toEqual(byId.get(fourth.id)!.startAt);
    });

    it('le jour de la semaine d’une série ne se change pas', async () => {
      const seriesId = await createSeries();
      expect((await patch('admin', `/api/timetable/series/${seriesId}`, { from: today, weekday: 2 })).status).toBe(400);
    });

    it('allonger une série crée les séances manquantes ; la raccourcir annule celles d’après', async () => {
      const seriesId = await createSeries();
      const longer = await patch('admin', `/api/timetable/series/${seriesId}`, { from: today, endDate: addDays(today, 42) });
      expect(longer.body).toMatchObject({ created: 2, cancelled: 0 });
      expect((await sessionsOf(seriesId)).filter((s) => s.status === 'SCHEDULED')).toHaveLength(6);
      const shorter = await patch('admin', `/api/timetable/series/${seriesId}`, { from: today, endDate: addDays(today, 20) });
      expect(shorter.body).toMatchObject({ cancelled: 4 });
      const all = await sessionsOf(seriesId);
      expect(all.filter((s) => s.status === 'SCHEDULED')).toHaveLength(2);
      expect(all.filter((s) => s.status === 'CANCELLED').every((s) => s.cancelReason === 'Fin de série avancée')).toBe(true);
    });

    it('annuler les séances d’une série entre deux dates (vacances)', async () => {
      const seriesId = await createSeries();
      const res = await post('admin', `/api/timetable/series/${seriesId}/cancel`, { from: addDays(today, 10), to: addDays(today, 22), reason: 'Vacances' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ cancelled: 2 });
      expect((await sessionsOf(seriesId)).map((s) => s.status)).toEqual(['SCHEDULED', 'CANCELLED', 'CANCELLED', 'SCHEDULED']);
      const [audit] = await audits('SERIES_CANCELLED_RANGE');
      expect(audit.details).toMatchObject({ reason: 'Vacances', sessionCount: 2, from: addDays(today, 10), to: addDays(today, 22) });
    });

    it('chaque changement est journalisé avec avant et après', async () => {
      const seriesId = await createSeries();
      const [first] = await sessionsOf(seriesId);
      await patch('admin', `/api/timetable/sessions/${first.id}`, { subject: 'Sciences' });
      await patch('admin', `/api/timetable/series/${seriesId}`, { from: today, room: 'Salle 9' });
      const [updated] = await audits('SESSION_UPDATED');
      expect(updated.details).toMatchObject({ before: { subject: 'Mathématiques' }, after: { subject: 'Sciences' } });
      const [seriesUpdated] = await audits('SERIES_UPDATED');
      expect(seriesUpdated.details).toMatchObject({ before: { room: 'Salle 3' }, after: { room: 'Salle 9' }, sessionCount: 3 });
    });

    it('identifiants inconnus ou mal formés : 404', async () => {
      expect((await patch('admin', '/api/timetable/sessions/abc', { room: 'x' })).status).toBe(404);
      expect((await post('admin', '/api/timetable/sessions/00000000-0000-4000-8000-000000000999/cancel', { reason: 'x' })).status).toBe(404);
      expect((await patch('admin', '/api/timetable/series/abc', { from: today })).status).toBe(404);
    });
  });
  // ---------------------------------------------------------------------------
  // US4 — emploi du temps de l'enseignant
  // ---------------------------------------------------------------------------

  describe('US4 — mon emploi du temps', () => {
    const mine = (who: string, from: string, to: string, extra = '') => get(who, `/api/timetable/mine?from=${from}&to=${to}${extra}`);

    it('l’enseignant ne voit que ses séances, annulées comprises mais sans le motif', async () => {
      await post('admin', '/api/timetable/series', series());
      await post('admin', '/api/timetable/sessions', single({ teacherId: id.reprographie, classId: cls.bleu }));
      const own = (await get('admin', `/api/timetable/sessions?from=${today}&to=${addDays(today, 8)}&teacherId=${id.enseignante}`)).body[0];
      await post('admin', `/api/timetable/sessions/${own.id}/cancel`, { reason: 'Conseil de classe' });

      const res = await mine('enseignante', today, addDays(today, 13));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ from: today, to: addDays(today, 13) });
      const sessions = res.body.sessions as Array<Record<string, unknown>>;
      // Une seule séance de la série tombe dans ces 14 jours (J+7) ; celle de l'autre enseignant n'apparaît pas.
      expect(sessions.map((s) => (s.teacher as { id: string }).id)).toEqual([id.enseignante]);
      expect(sessions[0]).toMatchObject({ status: 'CANCELLED', class: { name: '1ère année Violet' }, subject: 'Mathématiques', announcedAbsence: false, replaces: null });
      expect(sessions[0]).not.toHaveProperty('cancelReason');
    });

    it('séance prise comme remplaçant désigné : affichée, avec le titulaire remplacé ; le titulaire voit son absence annoncée', async () => {
      const created = await post('admin', '/api/timetable/sessions', single());
      const requestId = await createCoverage(prisma, {
        status: 'PENDING',
        type: 'ABSENCE',
        startAt: new Date(created.body.startAt),
        plannedEndAt: new Date(created.body.endAt),
      });
      await send('patch', 'admin', `/api/attendance/substitutes/${requestId}`, { teacherId: id.reprographie });
      const substitute = (await mine('reprographie', today, addDays(today, 13))).body.sessions as Array<Record<string, unknown>>;
      expect(substitute).toEqual([expect.objectContaining({ id: created.body.id, replaces: { displayName: expect.any(String) } })]);
      const titular = (await mine('enseignante', today, addDays(today, 13))).body.sessions as Array<Record<string, unknown>>;
      expect(titular).toEqual([expect.objectContaining({ id: created.body.id, announcedAbsence: true })]);
    });

    it('période de 14 jours au plus ; aucun autre enseignant ne peut être demandé', async () => {
      expect((await mine('enseignante', today, addDays(today, 14))).status).toBe(400);
      expect((await mine('enseignante', addDays(today, 3), today)).status).toBe(400);
      expect((await mine('enseignante', today, today, `&teacherId=${id.reprographie}`)).status).toBe(400);
    });

    it.each(['surveillant', 'autre', 'admin'])('%s (hors groupe Enseignants) : 404 et refus journalisé', async (who) => {
      const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } });
      expect((await mine(who, today, today)).status).toBe(404);
      expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } })).toBe(before + 1);
    });
  });
});

