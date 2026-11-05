import { COVERAGES, disposeMigrationDatabases, ID, openDatabase, seedBefore, type MigrationDb } from '../utils/migration-db';

/**
 * Migration 0014_teacher_attendance : additive (aucune donnée existante modifiée), historique des
 * pointages non supprimable, retour arrière par down.sql avec garde-fou.
 */

const UP_TO_0013 = [
  '0008_supervision_schema',
  '0009_supervision_data',
  '0010_audit_coverage_stats_export',
  '0011_request_assist',
  '0012_user_avatar',
  '0013_school_students',
];

afterAll(disposeMigrationDatabases);

const insertAttendance = (db: MigrationDb) =>
  db.sql(`INSERT INTO "TeacherAttendance" ("id", "teacherId", "classId", "localDate", "method", "status", "arrivedAt", "recordedById", "updatedAt")
          VALUES ('00000000-0000-4000-a000-000000000001', '${ID.enseignante}', '${ID.classA}', CURRENT_DATE, 'QR', 'ARRIVED', now(), '${ID.enseignante}', now())`);

const tableExists = async (db: MigrationDb) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'TeacherAttendance'`))[0].n === 1;

describe('Migration 0014_teacher_attendance', () => {
  describe('sur une base qui contient déjà des gardes', () => {
    let db: MigrationDb;
    let before: { requests: number; details: number; events: number };

    const counts = async () => ({
      requests: (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "Request"`))[0].n,
      details: (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "CoverageDetail"`))[0].n,
      events: (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "RequestEvent"`))[0].n,
    });

    beforeAll(async () => {
      db = await openDatabase('mig_0014_main');
      await seedBefore(db);
      db.migrate(...UP_TO_0013);
      before = await counts();
      db.migrate('0014_teacher_attendance');
    });

    it('est additive : aucune garde, aucun détail ni événement existant n’est touché', async () => {
      expect(before.requests).toBeGreaterThanOrEqual(COVERAGES.length);
      expect(await counts()).toEqual(before);
      const set = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "CoverageDetail" WHERE "substituteTeacherId" IS NOT NULL`);
      expect(set[0].n).toBe(0);
    });

    it('crée la table de pointage vide, avec l’unicité enseignant + classe + jour', async () => {
      expect(await tableExists(db)).toBe(true);
      expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "TeacherAttendance"`))[0].n).toBe(0);
      await insertAttendance(db);
      await expect(db.sql(`INSERT INTO "TeacherAttendance" ("id", "teacherId", "classId", "localDate", "method", "status", "recordedById", "updatedAt")
        VALUES (gen_random_uuid(), '${ID.enseignante}', '${ID.classA}', CURRENT_DATE, 'MANUAL', 'ON_TIME', '${ID.enseignante}', now())`)).rejects.toThrow(/23505|already exists/);
    });

    it('l’historique ne se supprime pas ni ne se vide, mais se corrige', async () => {
      await expect(db.sql(`DELETE FROM "TeacherAttendance"`)).rejects.toThrow(/ne peut pas être vidée ni ses lignes supprimées/);
      await expect(db.sql(`TRUNCATE TABLE "TeacherAttendance"`)).rejects.toThrow(/ne peut pas être vidée ni ses lignes supprimées/);
      await db.sql(`UPDATE "TeacherAttendance" SET "status" = 'LATE', "updatedAt" = now()`);
      expect((await db.query<{ status: string }>(`SELECT "status"::text AS status FROM "TeacherAttendance"`))[0].status).toBe('LATE');
    });

    it('down.sql refuse tant que des pointages existent et ne supprime rien', async () => {
      expect(db.down('0014_teacher_attendance')).toMatch(/restaurez la sauvegarde/);
      expect(await tableExists(db)).toBe(true);
      expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "TeacherAttendance"`))[0].n).toBe(1);
    });
  });

  describe('sur une base où le pointage n’a pas servi', () => {
    let db: MigrationDb;

    beforeAll(async () => {
      db = await openDatabase('mig_0014_clean');
      await seedBefore(db);
      db.migrate(...UP_TO_0013, '0014_teacher_attendance');
    });

    it('down.sql retire la table, la colonne et les types ; les gardes restent intactes', async () => {
      const requests = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "Request"`))[0].n;
      expect(db.down('0014_teacher_attendance')).toBeNull();
      expect(await tableExists(db)).toBe(false);
      const column = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'CoverageDetail' AND column_name = 'substituteTeacherId'`);
      expect(column[0].n).toBe(0);
      const types = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_type WHERE typname IN ('AttendanceMethod', 'AttendanceStatus')`);
      expect(types[0].n).toBe(0);
      expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "Request"`))[0].n).toBe(requests);
      // La ligne de suivi Prisma est retirée avec le retour arrière.
      const tracked = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE "migration_name" = '0014_teacher_attendance'`);
      expect(tracked[0].n).toBe(0);
    });
  });
});
