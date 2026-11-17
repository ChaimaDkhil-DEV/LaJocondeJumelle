import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { localTime } from '../../src/common/school-time';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, minutesFrom } from '../utils/coverage-fixtures';
import { useMiddayTimezone } from '../utils/school-timezone';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Enseignants présents dans l'établissement (019) : une liste par personne, déduite des pointages du jour ;
 * le départ s'enregistre par un second scan du QR d'une classe ; l'administration voit la liste, peut saisir
 * un départ ou un retour, et est prévenue en direct.
 */
describe('Enseignants présents dans l’établissement', () => {
  let restoreTz = () => undefined as void;
  let schoolTz = 'Etc/GMT';
  const prisma = new PrismaClient();
  let app: INestApplication;
  let emit: jest.SpyInstance;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  const VIOLET = '1ère année Violet';
  const BLEU = '2e année Bleu';

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const post = (who: string, path: string, body: Record<string, unknown> = {}) =>
    api().post(path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  async function tokenOf(className: string): Promise<string> {
    const schoolClass = await prisma.schoolClass.findUniqueOrThrow({ where: { name: className } });
    const res = await get('superadmin', `/api/admin/coverage/classes/${schoolClass.id}/qr`);
    expect(res.status).toBe(200);
    return new URL((res.body as { url: string }).url).searchParams.get('c')!;
  }
  const scan = async (action: 'arrive' | 'depart' | 'return' | 'resolve', who: string, className = VIOLET) =>
    post(who, `/api/attendance/${action}`, { token: await tokenOf(className) });
  const hhmm = (minutesAgo: number) => localTime(minutesFrom(new Date(), -minutesAgo), schoolTz);

  interface PresentBody {
    date: string;
    present: Array<{ teacher: { id: string; displayName: string }; firstArrivalAt: string | null; lastClass: { name: string }; lastSeenAt: string }>;
    departed: Array<{
      teacher: { id: string };
      firstArrivalAt: string | null;
      departure: { id: string; departedAt: string; method: string; class: { name: string } | null; recordedBy: { id: string } };
    }>;
  }
  const present = async (who = 'admin') => {
    const res = await get(who, '/api/attendance/present');
    expect(res.status).toBe(200);
    return res.body as PresentBody;
  };
  const departures = (who: string) => prisma.teacherDeparture.findMany({ where: { teacherId: id[who] }, orderBy: { departedAt: 'asc' } });
  const emitted = () => emit.mock.calls.filter(([, event]) => event === 'attendance:updated');

  async function clearAll() {
    await prisma.$transaction([
      prisma.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
      prisma.$executeRawUnsafe('DELETE FROM "TeacherDeparture"'),
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
    const teachers = await prisma.employeeGroup.findFirstOrThrow({ where: { systemKey: 'TEACHERS' } });
    await prisma.employeeGroupMember.create({ data: { groupId: teachers.id, userId: id.reprographie } });
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

  describe('Liste des présents (administration)', () => {
    it('personne n’a scanné : listes vides, à la date du jour', async () => {
      const body = await present();
      expect(body.present).toEqual([]);
      expect(body.departed).toEqual([]);
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('un enseignant qui scanne deux classes n’apparaît qu’une fois, avec sa première heure et sa dernière classe', async () => {
      const first = await scan('arrive', 'enseignante', VIOLET);
      await scan('arrive', 'enseignante', BLEU);
      await scan('arrive', 'reprographie', VIOLET);
      const body = await present();
      expect(body.present).toHaveLength(2);
      const row = body.present.find((p) => p.teacher.id === id.enseignante)!;
      expect(row.firstArrivalAt).toBe((first.body as { attendance: { arrivedAt: string } }).attendance.arrivedAt);
      expect(row.lastClass.name).toBe(BLEU);
      expect(row.teacher.displayName).toBeTruthy();
    });

    it('un pointage « absent » saisi par l’administration ne met pas l’enseignant dans la liste', async () => {
      const klass = await prisma.schoolClass.findUniqueOrThrow({ where: { name: VIOLET } });
      const res = await post('admin', '/api/attendance/manual', { teacherId: id.enseignante, classId: klass.id, status: 'ABSENT', comment: 'Malade' });
      expect(res.status).toBe(201);
      expect((await present()).present).toEqual([]);
    });

    it('le super administrateur la voit aussi ; un enseignant ou un surveillant reçoit 404', async () => {
      await scan('arrive', 'enseignante');
      expect((await present('superadmin')).present).toHaveLength(1);
      expect((await get('enseignante', '/api/attendance/present')).status).toBe(404);
      expect((await get('surveillant', '/api/attendance/present')).status).toBe(404);
    });

    it('sans session : 401', async () => {
      expect((await api().get('/api/attendance/present')).status).toBe(401);
    });
  });

  describe('Départ par second scan du QR', () => {
    it('la page du QR dit où en est l’enseignant : pas arrivé, présent, parti', async () => {
      const state = async () => ((await scan('resolve', 'enseignante')).body as { presence: { state: string } }).presence.state;
      expect(await state()).toBe('NOT_ARRIVED');
      await scan('arrive', 'enseignante');
      expect(await state()).toBe('PRESENT');
      await scan('depart', 'enseignante');
      expect(await state()).toBe('DEPARTED');
    });

    it('enregistre le départ à l’heure du serveur ; l’enseignant passe des présents aux partis', async () => {
      await scan('arrive', 'enseignante', VIOLET);
      const before = Date.now();
      const res = await scan('depart', 'enseignante', BLEU);
      expect(res.status).toBe(201);
      const body = res.body as { created: boolean; presence: { state: string; departedAt: string } };
      expect(body).toMatchObject({ created: true, presence: { state: 'DEPARTED' } });
      expect(new Date(body.presence.departedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(new Date(body.presence.departedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);

      const list = await present();
      expect(list.present).toEqual([]);
      expect(list.departed).toHaveLength(1);
      expect(list.departed[0].teacher.id).toBe(id.enseignante);
      // Le QR scanné pour partir n'a pas à être celui de l'arrivée.
      expect(list.departed[0].departure).toMatchObject({ method: 'QR', class: { name: BLEU }, recordedBy: { id: id.enseignante } });
    });

    it('sans arrivée ce jour : départ refusé, rien n’est enregistré', async () => {
      const res = await scan('depart', 'enseignante');
      expect(res.status).toBe(409);
      expect((res.body as { error: { code: string } }).error.code).toBe('ATTENDANCE_NOT_PRESENT');
      expect(await departures('enseignante')).toHaveLength(0);
    });

    it('double scan de départ : le départ existant est rappelé, sans doublon', async () => {
      await scan('arrive', 'enseignante');
      expect((await scan('depart', 'enseignante')).status).toBe(201);
      const again = await scan('depart', 'enseignante');
      expect(again.status).toBe(200);
      expect((again.body as { created: boolean }).created).toBe(false);
      expect(await departures('enseignante')).toHaveLength(1);
    });

    it('scans de départ simultanés : un seul départ (unicité en base)', async () => {
      await scan('arrive', 'enseignante');
      const token = await tokenOf(VIOLET);
      const results = await Promise.all(Array.from({ length: 6 }, () => post('enseignante', '/api/attendance/depart', { token })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 200)).toHaveLength(5);
      expect(await departures('enseignante')).toHaveLength(1);
    });

    it('QR invalide, ou compte qui n’est pas enseignant : refusé', async () => {
      await scan('arrive', 'enseignante');
      expect((await post('enseignante', '/api/attendance/depart', { token: 'faux' })).status).toBe(422);
      expect((await scan('depart', 'surveillant')).status).toBe(404);
      expect(await departures('enseignante')).toHaveLength(0);
    });

    it('retour dans la même classe : le départ est clos, l’enseignant est de nouveau présent, l’historique reste', async () => {
      await scan('arrive', 'enseignante');
      await scan('depart', 'enseignante');
      const res = await scan('return', 'enseignante');
      expect(res.status).toBe(200);
      expect((res.body as { presence: { state: string } }).presence.state).toBe('PRESENT');
      const rows = await departures('enseignante');
      expect(rows).toHaveLength(1);
      expect(rows[0].returnedAt).not.toBeNull();
      expect(rows[0].returnedById).toBe(id.enseignante);
      expect((await present()).present).toHaveLength(1);
    });

    it('arrivée dans une autre classe après un départ : vaut retour', async () => {
      await scan('arrive', 'enseignante', VIOLET);
      await scan('depart', 'enseignante', VIOLET);
      expect((await scan('arrive', 'enseignante', BLEU)).status).toBe(201);
      const list = await present();
      expect(list.present.map((p) => p.teacher.id)).toEqual([id.enseignante]);
      expect(list.departed).toEqual([]);
      // Un second départ dans la journée reste possible.
      expect((await scan('depart', 'enseignante', BLEU)).status).toBe(201);
      expect(await departures('enseignante')).toHaveLength(2);
    });

    it('retour sans départ en cours : rien ne change', async () => {
      await scan('arrive', 'enseignante');
      const res = await scan('return', 'enseignante');
      expect(res.status).toBe(200);
      expect((res.body as { presence: { state: string } }).presence.state).toBe('PRESENT');
      expect(await departures('enseignante')).toHaveLength(0);
    });
  });

  describe('Départ et retour saisis par l’administration', () => {
    it('saisit le départ d’un enseignant présent, avec son heure réelle, et le trace', async () => {
      await scan('arrive', 'enseignante');
      const res = await post('admin', '/api/attendance/departures', { teacherId: id.enseignante, comment: 'Parti sans scanner' });
      expect(res.status).toBe(201);
      const list = await present();
      expect(list.departed).toHaveLength(1);
      expect(list.departed[0].departure).toMatchObject({ method: 'MANUAL', class: null, recordedBy: { id: id.admin } });
      const log = await prisma.auditLog.findFirst({ where: { action: 'ATTENDANCE_MANUAL', targetType: 'TeacherDeparture' }, orderBy: { createdAt: 'desc' } });
      expect(log?.actorId).toBe(id.admin);
      expect(log?.details).toMatchObject({ action: 'DEPARTURE', teacherId: id.enseignante });
    });

    it('refuse : enseignant qui n’est pas présent, heure future, heure avant l’arrivée, déjà parti', async () => {
      const absent = await post('admin', '/api/attendance/departures', { teacherId: id.enseignante });
      expect(absent.status).toBe(409);
      expect((absent.body as { error: { code: string } }).error.code).toBe('ATTENDANCE_NOT_PRESENT');

      await scan('arrive', 'enseignante');
      expect((await post('admin', '/api/attendance/departures', { teacherId: id.enseignante, departedTime: hhmm(-30) })).status).toBe(400);
      expect((await post('admin', '/api/attendance/departures', { teacherId: id.enseignante, departedTime: hhmm(90) })).status).toBe(400);
      expect((await post('admin', '/api/attendance/departures', { teacherId: id.enseignante })).status).toBe(201);
      const twice = await post('admin', '/api/attendance/departures', { teacherId: id.enseignante });
      expect(twice.status).toBe(409);
      expect(await departures('enseignante')).toHaveLength(1);
    });

    it('marque le retour d’un enseignant parti, et le trace', async () => {
      await scan('arrive', 'enseignante');
      await scan('depart', 'enseignante');
      const departureId = (await present()).departed[0].departure.id;
      const res = await post('admin', `/api/attendance/departures/${departureId}/return`);
      expect(res.status).toBe(200);
      expect((await present()).present).toHaveLength(1);
      const row = (await departures('enseignante'))[0];
      expect(row.returnedById).toBe(id.admin);
      const log = await prisma.auditLog.findFirst({ where: { action: 'ATTENDANCE_CORRECTED', targetType: 'TeacherDeparture' }, orderBy: { createdAt: 'desc' } });
      expect(log?.details).toMatchObject({ action: 'RETURN', teacherId: id.enseignante });
      // Déjà clos : la seconde demande ne change rien.
      expect((await post('admin', `/api/attendance/departures/${departureId}/return`)).status).toBe(409);
    });

    it('réservé à l’administration : un enseignant reçoit 404 ; identifiant inconnu : 404', async () => {
      await scan('arrive', 'enseignante');
      expect((await post('enseignante', '/api/attendance/departures', { teacherId: id.enseignante })).status).toBe(404);
      expect((await post('admin', '/api/attendance/departures/pas-un-uuid/return')).status).toBe(404);
      expect((await post('admin', '/api/attendance/departures/7b0c3a9e-1d2f-4a5b-8c6d-0e1f2a3b4c5d/return')).status).toBe(404);
    });
  });

  describe('Mise à jour en direct', () => {
    it('une arrivée, un départ et un retour préviennent l’administration et l’enseignant', async () => {
      await scan('arrive', 'enseignante');
      expect(emitted()).toHaveLength(1);
      const [recipients, , payload] = emitted()[0] as [string[], string, { teacherId: string; date: string }];
      expect([...recipients]).toEqual(expect.arrayContaining([id.admin, id.superadmin, id.enseignante]));
      expect([...recipients]).not.toContain(id.surveillant);
      expect(payload.teacherId).toBe(id.enseignante);

      await scan('depart', 'enseignante');
      await scan('return', 'enseignante');
      expect(emitted()).toHaveLength(3);
    });

    it('un scan répété, qui ne change rien, ne prévient personne', async () => {
      await scan('arrive', 'enseignante');
      emit.mockClear();
      await scan('arrive', 'enseignante');
      await scan('return', 'enseignante');
      expect(emitted()).toHaveLength(0);
    });

    it('une saisie et une correction de l’administration préviennent aussi', async () => {
      const klass = await prisma.schoolClass.findUniqueOrThrow({ where: { name: VIOLET } });
      const created = await post('admin', '/api/attendance/manual', { teacherId: id.enseignante, classId: klass.id, status: 'ON_TIME' });
      expect(created.status).toBe(201);
      expect(emitted()).toHaveLength(1);
      await post('admin', '/api/attendance/departures', { teacherId: id.enseignante });
      expect(emitted()).toHaveLength(2);
    });
  });

  describe('Base de données', () => {
    it('un seul départ en cours par enseignant et par jour ; les départs ne se suppriment pas', async () => {
      await scan('arrive', 'enseignante');
      await scan('depart', 'enseignante');
      const [row] = await departures('enseignante');
      await expect(
        prisma.teacherDeparture.create({
          data: { teacherId: row.teacherId, localDate: row.localDate, departedAt: new Date(), method: 'MANUAL', recordedById: id.admin },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(prisma.teacherDeparture.delete({ where: { id: row.id } })).rejects.toThrow();
    });
  });
});
