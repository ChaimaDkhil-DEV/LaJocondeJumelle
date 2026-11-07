import { disposeMigrationDatabases, openDatabase, seedBefore, type MigrationDb } from '../utils/migration-db';

/**
 * Migration 0017_drop_coverage_target : suppression d'une table que l'application n'écrit ni ne lit plus.
 * Ses anciennes lignes, si elles existent, sont de l'historique : la migration refuse alors de s'exécuter
 * plutôt que de les perdre en silence.
 */

const UP_TO_0016 = [
  '0008_supervision_schema',
  '0009_supervision_data',
  '0010_audit_coverage_stats_export',
  '0011_request_assist',
  '0012_user_avatar',
  '0013_school_students',
  '0014_teacher_attendance',
  '0015_audit_level_changed',
  '0016_student_meal_history',
];
const MIGRATION = '0017_drop_coverage_target';

afterAll(disposeMigrationDatabases);

const tableExists = async (db: MigrationDb) =>
  (await db.query<{ present: boolean }>(`SELECT to_regclass('public."CoverageTarget"') IS NOT NULL AS present`))[0].present;

const countTargets = async (db: MigrationDb) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "CoverageTarget"`))[0].n;

const insertTarget = (db: MigrationDb) =>
  db.sql(`INSERT INTO "CoverageTarget" ("requestId", "groupId")
          SELECT d."requestId", g."id" FROM "CoverageDetail" d CROSS JOIN "EmployeeGroup" g
          ON CONFLICT DO NOTHING`);

describe('Migration 0017_drop_coverage_target', () => {
  describe('quand la table contient des lignes', () => {
    let db: MigrationDb;

    beforeAll(async () => {
      db = await openDatabase('mig_0017_used');
      await seedBefore(db);
      db.migrate(...UP_TO_0016);
      await insertTarget(db);
    });

    it('refuse de s’exécuter et garde les lignes', async () => {
      const before = await countTargets(db);
      expect(before).toBeGreaterThan(0);
      expect(() => db.migrate(MIGRATION)).toThrow(/CoverageTarget contient/);
      expect(await tableExists(db)).toBe(true);
      expect(await countTargets(db)).toBe(before);
    });
  });

  describe('quand la table est vide', () => {
    let db: MigrationDb;

    beforeAll(async () => {
      db = await openDatabase('mig_0017_empty');
      await seedBefore(db);
      db.migrate(...UP_TO_0016);
      await db.sql(`DELETE FROM "CoverageTarget"`);
      db.migrate(MIGRATION);
    });

    it('supprime la table', async () => {
      expect(await tableExists(db)).toBe(false);
    });

    it('down.sql la recrée avec ses contraintes, et la migration peut être réappliquée', async () => {
      expect(db.down(MIGRATION)).toBeNull();
      expect(await tableExists(db)).toBe(true);

      await insertTarget(db);
      expect(await countTargets(db)).toBeGreaterThan(0);
      await expect(db.sql(`INSERT INTO "CoverageTarget" ("requestId", "groupId") VALUES (gen_random_uuid(), gen_random_uuid())`)).rejects.toThrow();

      await db.sql(`DELETE FROM "CoverageTarget"`);
      db.migrate(MIGRATION);
      expect(await tableExists(db)).toBe(false);
    });
  });
});
