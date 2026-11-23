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
 * Emplois du temps, vue d'administration : chaque séance porte la présence de l'enseignant, calculée par la même
 * logique que « Enseignants attendus » (pointage, retard, absence annoncée, remplaçant). Rien n'est écrit ni
 * recalculé autrement : la liste des séances se contente de l'afficher.
 */
describe('Emplois du temps : présence des séances (administration)', () => {
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
  const scan = async (who: string, className = VIOLET) => send('post', who, '/api/attendance/arrive', { token: await tokenOf(className) });

  /** Séance du jour qui commence `startOffset` minutes après maintenant (négatif : déjà commencée). */
  async function sessionAt(teacher: string, startOffset: number, minutes = 60, over: { classId?: string; status?: 'CANCELLED' } = {}) {
    const startAt = minutesFrom(new Date(), startOffset);
    return prisma.teachingSession.create({
      data: {
        teacherId: id[teacher],
        classId: over.classId ?? cls.violet,
        localDate: new Date(`${today}T00:00:00.000Z`),
        startAt,
        endAt: minutesFrom(startAt, minutes),
        createdById: id.admin,
        ...(over.status ? { status: over.status, cancelReason: 'Sortie' } : {}),
      },
    });
  }

  interface Presence {
    status: string;
    arrivedAt: string | null;
    lateMinutes: number | null;
    replacedBy: { id: string; displayName: string } | null;
    substitute: { teacher: { id: string; displayName: string }; status: string; arrivedAt: string | null; lateMinutes: number | null } | null;
  }
  interface SessionRow {
    id: string;
    status: string;
    teacher: { id: string };
    presence: Presence | null;
  }
  const sessions = async (query = `from=${today}&to=${today}&includeCancelled=true`, who = 'admin') => {
    const res = await get(who, `/api/timetable/sessions?${query}`);
    expect(res.status).toBe(200);
    return res.body as SessionRow[];
  };
  const presenceOf = (rows: SessionRow[], sessionId: string) => rows.find((r) => r.id === sessionId)!.presence!;

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

  it('les champs d’une séance restent ceux d’avant : la présence s’y ajoute', async () => {
    const s = await sessionAt('enseignante', 30);
    const [row] = await sessions();
    expect(row).toMatchObject({ id: s.id, status: 'SCHEDULED', teacher: { id: id.enseignante } });
    expect(row.presence).toEqual(expect.objectContaining({ status: 'UPCOMING' }));
  });

  it('à venir, attendu pendant la tolérance, puis « Non arrivé » sans pointage : aucun pointage n’est créé', async () => {
    const later = await sessionAt('enseignante', 30);
    const justStarted = await sessionAt('reprographie', -2, 60, { classId: cls.bleu });
    const missed = await sessionAt('enseignante', -15, 10);
    const rows = await sessions();
    expect(presenceOf(rows, later.id).status).toBe('UPCOMING');
    expect(presenceOf(rows, justStarted.id).status).toBe('EXPECTED');
    expect(presenceOf(rows, missed.id)).toMatchObject({ status: 'NOT_ARRIVED', arrivedAt: null, lateMinutes: null, replacedBy: null, substitute: null });
    expect(await prisma.teacherAttendance.count()).toBe(0);
  });

  it('enseignant arrivé avant le début : « Présent » avec l’heure de son pointage', async () => {
    const s = await sessionAt('enseignante', -2);
    expect((await scan('enseignante')).status).toBe(201);
    const presence = presenceOf(await sessions(), s.id);
    expect(presence.status).toBe('PRESENT');
    expect(presence.arrivedAt).toEqual(expect.any(String));
    expect(presence.lateMinutes).toBeNull();
  });

  it('enseignant arrivé après la tolérance : « En retard » avec la durée du retard et l’heure réelle', async () => {
    const s = await sessionAt('enseignante', -15);
    expect((await scan('enseignante')).status).toBe(201);
    const presence = presenceOf(await sessions(), s.id);
    expect(presence.status).toBe('LATE');
    expect(presence.lateMinutes).toBeGreaterThanOrEqual(14);
    expect(presence.lateMinutes).toBeLessThanOrEqual(16);
    expect(presence.arrivedAt).toEqual(expect.any(String));
  });

  it('absence annoncée : « Absence justifiée », sans remplaçant tant qu’aucun n’est désigné', async () => {
    const s = await sessionAt('enseignante', -30);
    await createCoverage(prisma, { status: 'PENDING', type: 'ABSENCE', startAt: minutesFrom(new Date(), -60), plannedEndAt: minutesFrom(new Date(), 120) });
    expect(presenceOf(await sessions(), s.id)).toMatchObject({ status: 'EXCUSED', replacedBy: null, substitute: null });
  });

  it('remplaçant désigné : le titulaire reste affiché, avec son remplaçant et le statut de ce dernier', async () => {
    const s = await sessionAt('enseignante', -30);
    const requestId = await createCoverage(prisma, { status: 'PENDING', type: 'ABSENCE', startAt: minutesFrom(new Date(), -60), plannedEndAt: minutesFrom(new Date(), 120) });
    expect((await send('patch', 'admin', `/api/attendance/substitutes/${requestId}`, { teacherId: id.reprographie })).status).toBe(200);

    // Avant son arrivée : le remplaçant est attendu ou non arrivé, le titulaire est justifié.
    const before = presenceOf(await sessions(), s.id);
    expect(before).toMatchObject({ status: 'EXCUSED', replacedBy: { id: id.reprographie } });
    expect(before.substitute).toMatchObject({ teacher: { id: id.reprographie }, status: 'NOT_ARRIVED', arrivedAt: null });

    // Le remplaçant pointe : son arrivée et son retard sont ceux de sa propre ligne ; le titulaire ne change pas.
    expect((await scan('reprographie')).status).toBe(201);
    const after = presenceOf(await sessions(), s.id);
    expect(after).toMatchObject({ status: 'EXCUSED', replacedBy: { id: id.reprographie, displayName: expect.any(String) } });
    expect(after.substitute?.status).toBe('LATE');
    expect(after.substitute?.lateMinutes).toBeGreaterThanOrEqual(29);
    expect(after.substitute?.arrivedAt).toEqual(expect.any(String));
  });

  it('même résultat que « Enseignants attendus » pour la même séance (même logique, rien de recalculé)', async () => {
    const s = await sessionAt('enseignante', -15);
    expect((await scan('enseignante')).status).toBe(201);
    const presence = presenceOf(await sessions(), s.id);
    const day = (await get('admin', '/api/attendance/expected')).body as { lines: Array<{ sessionId: string; status: string; lateMinutes: number | null; arrivedAt: string | null }> };
    const line = day.lines.find((l) => l.sessionId === s.id)!;
    expect(presence).toMatchObject({ status: line.status, lateMinutes: line.lateMinutes, arrivedAt: line.arrivedAt });
  });

  it('séance annulée : pas de présence', async () => {
    const s = await sessionAt('enseignante', -15, 60, { status: 'CANCELLED' });
    const rows = await sessions();
    expect(rows.find((r) => r.id === s.id)).toMatchObject({ status: 'CANCELLED', presence: null });
  });

  it('au-delà d’une semaine, la liste ne calcule pas la présence', async () => {
    await sessionAt('enseignante', 30);
    const rows = await sessions(`from=${today}&to=${addDays(today, 10)}&includeCancelled=true`);
    expect(rows).toHaveLength(1);
    expect(rows[0].presence).toBeNull();
  });

  /**
   * Une absence ne se lit que sur une séance qui existe : l'emploi du temps n'invente jamais de séance. Déclarer ou
   * saisir une absence (règles inchangées) ne crée aucune séance ; une fois la séance posée, elle en tient compte.
   */
  describe('une absence ne concerne que les séances qui existent', () => {
    const absence = (startOffset: number, endOffset: number | null, teacher = 'enseignante') =>
      createCoverage(prisma, {
        status: 'PENDING',
        type: 'ABSENCE',
        teacher,
        startAt: minutesFrom(new Date(), startOffset),
        plannedEndAt: endOffset === null ? null : minutesFrom(new Date(), endOffset),
      });

    it('absence annoncée sans aucune séance : aucune séance ni présence n’apparaît, rien n’est créé', async () => {
      await absence(-60, 120);
      expect(await sessions()).toEqual([]);
      const day = (await get('admin', '/api/attendance/expected')).body as { lines: unknown[] };
      expect(day.lines).toEqual([]);
      expect(await prisma.teachingSession.count()).toBe(0);
    });

    it('la séance posée ensuite en tient compte : « Absence justifiée »', async () => {
      await absence(-60, 120);
      expect(await sessions()).toEqual([]);
      const s = await sessionAt('enseignante', -30);
      expect(presenceOf(await sessions(), s.id)).toMatchObject({ status: 'EXCUSED', replacedBy: null });
    });

    it('absence saisie par l’administration sans séance : acceptée comme avant, mais aucune séance n’apparaît', async () => {
      const saisie = await send('post', 'admin', '/api/attendance/manual', { teacherId: id.enseignante, classId: cls.violet, status: 'ABSENT', comment: 'Maladie' });
      expect(saisie.status).toBeLessThan(300);
      expect(await sessions()).toEqual([]);
      expect(await prisma.teachingSession.count()).toBe(0);
      // La séance ajoutée ce jour-là est justifiée par cette absence.
      const s = await sessionAt('enseignante', -30);
      expect(presenceOf(await sessions(), s.id).status).toBe('EXCUSED');
    });

    it('une absence terminée avant la séance ne la justifie pas', async () => {
      await absence(-240, -120);
      const s = await sessionAt('enseignante', -15);
      expect(presenceOf(await sessions(), s.id)).toMatchObject({ status: 'NOT_ARRIVED', replacedBy: null, substitute: null });
    });

    it('l’absence d’un autre enseignant ne touche pas la séance', async () => {
      await absence(-60, 120, 'reprographie');
      const mine = await sessionAt('enseignante', -15);
      const theirs = await sessionAt('reprographie', -30, 60, { classId: cls.bleu });
      const rows = await sessions();
      expect(presenceOf(rows, mine.id).status).toBe('NOT_ARRIVED');
      expect(presenceOf(rows, theirs.id).status).toBe('EXCUSED');
    });

    it('un remplaçant désigné sur une absence sans séance n’en crée pas non plus', async () => {
      const requestId = await absence(-60, 120);
      expect((await send('patch', 'admin', `/api/attendance/substitutes/${requestId}`, { teacherId: id.reprographie })).status).toBe(200);
      expect(await sessions()).toEqual([]);
      expect(await prisma.teachingSession.count()).toBe(0);
    });
  });

  it('un enseignant ou un surveillant n’y a pas accès : 404, comme avant', async () => {
    await sessionAt('enseignante', 30);
    for (const who of ['enseignante', 'surveillant']) {
      expect((await get(who, `/api/timetable/sessions?from=${today}&to=${today}`)).status).toBe(404);
    }
  });
});
