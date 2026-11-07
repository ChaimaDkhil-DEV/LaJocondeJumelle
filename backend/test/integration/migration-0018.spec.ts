import { disposeMigrationDatabases, openDatabase, seedBefore, type MigrationDb } from '../utils/migration-db';

/** Migration 0018 : retire les responsables de catégorie restés sur des comptes rétrogradés en employés. */

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
const MIGRATION = '0018_clean_stale_category_managers';

afterAll(disposeMigrationDatabases);

const countByRole = async (db: MigrationDb, role: string) =>
  (
    await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "CategoryManager" m JOIN "User" u ON u."id" = m."userId" WHERE u."role" = '${role}'`,
    )
  )[0].n;

describe('Migration 0018_clean_stale_category_managers', () => {
  let db: MigrationDb;

  beforeAll(async () => {
    db = await openDatabase('mig_0018');
    await seedBefore(db);
    db.migrate(...UP_TO_0016);
    await db.sql(`DELETE FROM "CoverageTarget"`);
    db.migrate('0017_drop_coverage_target');
    await db.sql(`INSERT INTO "CategoryManager" ("categoryId", "userId")
                  SELECT c."id", u."id" FROM "Category" c CROSS JOIN "User" u WHERE u."role" = 'EMPLOYEE'
                  ON CONFLICT DO NOTHING`);
    await db.sql(`INSERT INTO "CategoryManager" ("categoryId", "userId")
                  SELECT c."id", u."id" FROM "Category" c CROSS JOIN "User" u WHERE u."role" = 'ADMIN'
                  ON CONFLICT DO NOTHING`);
  });

  it('retire les lignes des employés et garde celles des admins', async () => {
    expect(await countByRole(db, 'EMPLOYEE')).toBeGreaterThan(0);
    const admins = await countByRole(db, 'ADMIN');
    expect(admins).toBeGreaterThan(0);

    db.migrate(MIGRATION);

    expect(await countByRole(db, 'EMPLOYEE')).toBe(0);
    expect(await countByRole(db, 'ADMIN')).toBe(admins);
  });

  it('down.sql retire seulement la ligne de suivi, et la migration se réapplique', async () => {
    expect(db.down(MIGRATION)).toBeNull();
    db.migrate(MIGRATION);
    expect(await countByRole(db, 'EMPLOYEE')).toBe(0);
  });
});
