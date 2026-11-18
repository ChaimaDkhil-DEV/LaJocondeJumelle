import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, localDate } from '../../src/common/school-time';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, createCoverage, minutesFrom } from '../utils/coverage-fixtures';
import { useMiddayTimezone } from '../utils/school-timezone';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Enseignants attendus (020, US3 et US5) : statut de chaque séance du jour, calculé à partir des pointages
 * existants (scan, saisie, départ, retard ou absence annoncés, remplaçant, classe déclarée vide). La liste ne crée
 * jamais de pointage ; « Non arrivé » n'apparaît qu'après le délai de tolérance.
 */
describe('Enseignants attendus', () => {
  let restoreTz = () => undefined as void;
  let tz = 'Etc/GMT';
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  const cls: Record<'violet' | 'bleu', string> = { violet: '', bleu: '' };
  let today = '';
  const VIOLET = '1ère année Violet';

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const send = (method: 'post' | 'put' | 'patch', who: string, path: string, body: Record<string, unknown> = {}) =>
    api()[method](path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  async function tokenOf(className: string): Promise<string> {
    const schoolClass = await prisma.schoolClass.findUniqueOrThrow({ where: { name: className } });
    const res = await get('superadmin', `/api/admin/coverage/classes/${schoolClass.id}/qr`);
    return new URL((res.body as { url: string }).url).searchParams.get('c')!;
  }
  const scan = async (action: 'arrive' | 'depart' | 'return', who: string, className = VIOLET) =>
    send('post', who, `/api/attendance/${action}`, { token: await tokenOf(className) });

  /** Séance du jour qui commence `startOffset` minutes après maintenant (négatif : déjà commencée). */
  async function sessionAt(teacher: string, startOffset: number, minutes = 60, over: { classId?: string; date?: string; status?: 'CANCELLED' } = {}) {
    const startAt = minutesFrom(new Date(), startOffset);
    return prisma.teachingSession.create({
      data: {
        teacherId: id[teacher],
        classId: over.classId ?? cls.violet,
        localDate: new Date(`${over.date ?? today}T00:00:00.000Z`),
        startAt,
        endAt: minutesFrom(startAt, minutes),
        createdById: id.admin,
        ...(over.status ? { status: over.status, cancelReason: 'Sortie' } : {}),
      },
    });
  }

  interface Line {
    sessionId: string;
    role: string;
    teacher: { id: string };
    replaces?: { id: string } | null;
    replacedBy?: { id: string } | null;
    class: { id: string; name: string };
    level: unknown;
    status: string;
    arrivedAt: string | null;
    lateMinutes: number | null;
    lateReason: string | null;
    requestId: string | null;
    startTime: string;
  }
  interface Day {
    date: string;
    serverNow: string;
    settings: { lateThresholdMinutes: number; toleranceMinutes: number };
    counts: { expected: number; present: number; late: number; notArrived: number };
    lines: Line[];
  }
  const expected = async (query = '', who = 'admin') => {
    const res = await get(who, `/api/attendance/expected${query}`);
    expect(res.status).toBe(200);
    return res.body as Day;
  };
  const lineOf = (day: Day, sessionId: string, role?: string) => day.lines.find((l) => l.sessionId === sessionId && (!role || l.role === role))!;

  async function clearAll() {
    await prisma.$transaction([
      prisma.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
      prisma.$executeRawUnsafe('DELETE FROM "TeachingSession"'),
      prisma.$executeRawUnsafe('DELETE FROM "TeacherDeparture"'),
      prisma.$executeRawUnsafe('DELETE FROM "TeacherAttendance"'),
    ]);
    await clearCoverages(prisma);
  }

  beforeAll(async () => {
    ({ restore: restoreTz, tz } = useMiddayTimezone());
    today = localDate(new Date(), tz);
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const who of ['enseignante', 'reprographie', 'admin', 'superadmin', 'surveillant']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
    const teachers = await prisma.employeeGroup.findFirstOrThrow({ where: { systemKey: 'TEACHERS' } });
    await prisma.employeeGroupMember.create({ data: { groupId: teachers.id, userId: id.reprographie } });
    cls.violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: VIOLET } })).id;
    cls.bleu = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '2e année Bleu' } })).id;
  });

  beforeEach(async () => {
    await clearAll();
    await send('put', 'superadmin', '/api/admin/settings', { attendanceLateThresholdMinutes: 5, attendanceToleranceMinutes: 10 });
  });

  afterAll(async () => {
    restoreTz();
    await app.close();
    await prisma.$disconnect();
  });

  describe('US3 — statuts', () => {
    it('sans scan : « À venir », « Attendu » avant la tolérance, « Non arrivé » après ; aucun pointage créé', async () => {
      const later = await sessionAt('enseignante', 30);
      const justStarted = await sessionAt('reprographie', -2, 60, { classId: cls.bleu });
      const missed = await sessionAt('enseignante', -15, 10);
      const day = await expected();
      expect(day).toMatchObject({ date: today, settings: { lateThresholdMinutes: 5, toleranceMinutes: 10 }, serverNow: expect.any(String) });
      expect(lineOf(day, later.id).status).toBe('UPCOMING');
      expect(lineOf(day, justStarted.id).status).toBe('EXPECTED');
      expect(lineOf(day, missed.id)).toMatchObject({ status: 'NOT_ARRIVED', role: 'TEACHER', class: { id: cls.violet }, arrivedAt: null });
      expect(await prisma.teacherAttendance.count()).toBe(0);
    });

    it('scan après la tolérance : « En retard » avec les minutes ; scan avant le début : « Présent » une fois commencée', async () => {
      const late = await sessionAt('enseignante', -15);
      expect((await scan('arrive', 'enseignante')).status).toBe(201);
      const line = lineOf(await expected(), late.id);
      expect(line).toMatchObject({ status: 'LATE', lateReason: 'ARRIVAL' });
      expect(line.lateMinutes).toBeGreaterThanOrEqual(14);
      expect(line.lateMinutes).toBeLessThanOrEqual(16);

      const ok = await sessionAt('reprographie', -1, 60, { classId: cls.bleu });
      await prisma.teacherAttendance.create({
        data: { teacherId: id.reprographie, classId: cls.bleu, localDate: new Date(`${today}T00:00:00.000Z`), method: 'QR', status: 'ARRIVED', arrivedAt: minutesFrom(new Date(), -5), recordedById: id.reprographie },
      });
      expect(lineOf(await expected(), ok.id)).toMatchObject({ status: 'PRESENT' });
    });

    it('oubli de scan : la saisie « à l’heure » de l’administration rend la séance « Présent »', async () => {
      const s = await sessionAt('enseignante', -20);
      expect(lineOf(await expected(), s.id).status).toBe('NOT_ARRIVED');
      const res = await send('post', 'admin', '/api/attendance/manual', { teacherId: id.enseignante, classId: cls.violet, status: 'ON_TIME' });
      expect(res.status).toBe(201);
      expect(lineOf(await expected(), s.id).status).toBe('PRESENT');
    });

    it('absence saisie par l’administration avec motif : « Absence justifiée »', async () => {
      const s = await sessionAt('enseignante', -20);
      await send('post', 'admin', '/api/attendance/manual', { teacherId: id.enseignante, classId: cls.bleu, status: 'ABSENT', comment: 'Malade' });
      expect(lineOf(await expected(), s.id).status).toBe('EXCUSED');
    });

    it('parti sans retour avant la séance : « Non arrivé » ; revenu : « En retard »', async () => {
      await prisma.teacherAttendance.create({
        data: { teacherId: id.enseignante, classId: cls.bleu, localDate: new Date(`${today}T00:00:00.000Z`), method: 'QR', status: 'ARRIVED', arrivedAt: minutesFrom(new Date(), -120), recordedById: id.enseignante },
      });
      await prisma.teacherDeparture.create({
        data: { teacherId: id.enseignante, localDate: new Date(`${today}T00:00:00.000Z`), departedAt: minutesFrom(new Date(), -60), method: 'QR', recordedById: id.enseignante },
      });
      const morning = await sessionAt('enseignante', -110, 30, { classId: cls.bleu });
      const now = await sessionAt('enseignante', -20, 60);
      let day = await expected();
      expect(lineOf(day, morning.id).status).toBe('PRESENT');
      expect(lineOf(day, now.id).status).toBe('NOT_ARRIVED');
      expect((await scan('return', 'enseignante')).status).toBe(200);
      day = await expected();
      expect(lineOf(day, now.id)).toMatchObject({ status: 'LATE', lateReason: 'ARRIVAL' });
    });

    it('absence annoncée avec remplaçant : le titulaire « Absence justifiée », le remplaçant attendu', async () => {
      const s = await sessionAt('enseignante', -15);
      const requestId = await createCoverage(prisma, { status: 'PENDING', type: 'ABSENCE', startAt: minutesFrom(new Date(), -60), plannedEndAt: minutesFrom(new Date(), 120) });
      expect((await send('patch', 'admin', `/api/attendance/substitutes/${requestId}`, { teacherId: id.reprographie })).status).toBe(200);
      const day = await expected();
      expect(lineOf(day, s.id, 'TITULAR')).toMatchObject({ status: 'EXCUSED', teacher: { id: id.enseignante }, replacedBy: { id: id.reprographie }, requestId });
      expect(lineOf(day, s.id, 'SUBSTITUTE')).toMatchObject({ status: 'NOT_ARRIVED', teacher: { id: id.reprographie }, replaces: { id: id.enseignante } });
      expect((await scan('arrive', 'reprographie')).status).toBe(201);
      expect(lineOf(await expected(), s.id, 'SUBSTITUTE').status).toBe('LATE');
    });

    it('retard annoncé : « En retard » sans « Non arrivé » tant que la séance dure', async () => {
      const s = await sessionAt('enseignante', -20, 60);
      const requestId = await createCoverage(prisma, { status: 'PENDING', type: 'LATENESS', startAt: minutesFrom(new Date(), -20), plannedEndAt: minutesFrom(new Date(), 10) });
      expect(lineOf(await expected(), s.id)).toMatchObject({ status: 'LATE', lateReason: 'ANNOUNCED', requestId });
    });

    it('classe déclarée vide par un surveillant avant l’arrivée : « En retard » avant la tolérance', async () => {
      const s = await sessionAt('enseignante', -4, 60);
      await createCoverage(prisma, {
        status: 'ON_DUTY',
        source: 'SUPERVISOR_REPORT',
        type: 'EMPTY_CLASS',
        teacher: null,
        assignee: 'surveillant',
        startAt: minutesFrom(new Date(), -2),
        plannedEndAt: minutesFrom(new Date(), 40),
      });
      expect(lineOf(await expected(), s.id)).toMatchObject({ status: 'LATE', lateReason: 'EMPTY_CLASS', arrivedAt: null });
    });

    it('séance annulée : « Séance annulée », jamais « Non arrivé »', async () => {
      const s = await sessionAt('enseignante', -30, 60, { status: 'CANCELLED' });
      expect(lineOf(await expected(), s.id).status).toBe('CANCELLED');
    });

    it('les réglages s’appliquent : tolérance portée à 30 minutes, la séance redevient « Attendu »', async () => {
      const s = await sessionAt('enseignante', -15);
      expect(lineOf(await expected(), s.id).status).toBe('NOT_ARRIVED');
      await send('put', 'superadmin', '/api/admin/settings', { attendanceToleranceMinutes: 30 });
      const day = await expected();
      expect(day.settings.toleranceMinutes).toBe(30);
      expect(lineOf(day, s.id).status).toBe('EXPECTED');
    });

    it('un jour passé ne garde ni « À venir » ni « Attendu »', async () => {
      const yesterday = addDays(today, -1);
      await sessionAt('enseignante', -24 * 60 + 30, 60, { date: yesterday });
      const day = await expected(`?date=${yesterday}`);
      expect(day.lines.map((l) => l.status)).toEqual(['NOT_ARRIVED']);
    });

    it.each(['enseignante', 'surveillant', 'reprographie'])('%s : 404 et refus journalisé', async (who) => {
      const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } });
      expect((await get(who, '/api/attendance/expected')).status).toBe(404);
      expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } })).toBe(before + 1);
    });

    it('paramètres invalides : 400', async () => {
      expect((await get('admin', '/api/attendance/expected?status=ABSENT')).status).toBe(400);
      expect((await get('admin', '/api/attendance/expected?teacherId=abc')).status).toBe(400);
      expect((await get('admin', '/api/attendance/expected?date=18-11-2026')).status).toBe(400);
    });
  });

  describe('US5 — indicateurs et filtres', () => {
    it('compteurs du jour ; le filtre de statut ne réduit que la liste, enseignant et classe réduisent aussi les compteurs', async () => {
      await sessionAt('enseignante', -15, 10); // non arrivé
      await sessionAt('enseignante', 30); // à venir (compté attendu)
      await sessionAt('reprographie', -15, 60, { classId: cls.bleu }); // en retard après scan
      await sessionAt('reprographie', -120, 30, { classId: cls.bleu, status: 'CANCELLED' }); // annulée : non comptée
      await scan('arrive', 'reprographie', '2e année Bleu');

      const all = await expected();
      expect(all.counts).toEqual({ expected: 3, present: 0, late: 1, notArrived: 1 });

      const onlyLate = await expected('?status=LATE');
      expect(onlyLate.lines.map((l) => l.status)).toEqual(['LATE']);
      expect(onlyLate.counts).toEqual(all.counts);

      const mine = await expected(`?teacherId=${id.enseignante}`);
      expect(mine.counts).toEqual({ expected: 2, present: 0, late: 0, notArrived: 1 });
      expect(mine.lines.every((l) => l.teacher.id === id.enseignante)).toBe(true);

      const bleu = await expected(`?classId=${cls.bleu}`);
      expect(bleu.counts).toEqual({ expected: 1, present: 0, late: 1, notArrived: 0 });
      expect(bleu.lines).toHaveLength(2);
    });

    it('lignes triées par heure de début, avec le niveau de la classe', async () => {
      const b = await sessionAt('enseignante', 60);
      const a = await sessionAt('reprographie', 10, 30, { classId: cls.bleu });
      const day = await expected();
      expect(day.lines.map((l) => l.sessionId)).toEqual([a.id, b.id]);
      expect(day.lines[0]).toHaveProperty('level');
      expect(day.lines[0].startTime).toMatch(/^\d{2}:\d{2}$/);
    });
  });
});
