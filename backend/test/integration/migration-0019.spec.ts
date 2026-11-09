import { disposeMigrationDatabases, ID, openDatabase, seedBefore, type MigrationDb } from '../utils/migration-db';

/**
 * Migration 0019 (014, T006) : abonnements push des appareils et préférences de notification.
 * Deux tables ajoutées, aucune donnée existante touchée ; down.sql les retire et la migration se réapplique.
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
const MIGRATION = '0019_push_notifications';
const TABLES = ['NotificationPreference', 'PushSubscription'];

afterAll(disposeMigrationDatabases);

const count = async (db: MigrationDb, table: string) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}"`))[0].n;

const existingTables = async (db: MigrationDb) =>
  (
    await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('PushSubscription', 'NotificationPreference')
       ORDER BY table_name`,
    )
  ).map((r) => r.table_name);

const tracked = async (db: MigrationDb) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE "migration_name" = '${MIGRATION}'`))[0].n;

const subscription = (id: string, userId: string, endpoint: string) =>
  `INSERT INTO "PushSubscription" ("id", "userId", "endpoint", "p256dh", "auth", "deviceLabel")
   VALUES ('${id}', '${userId}', '${endpoint}', 'BKey', 'auth', 'Android · Chrome')`;

describe('Migration 0019_push_notifications', () => {
  let db: MigrationDb;
  const before: Record<string, number> = {};

  beforeAll(async () => {
    db = await openDatabase('mig_0019');
    await seedBefore(db);
    db.migrate(...UP_TO_0016);
    await db.sql(`DELETE FROM "CoverageTarget"`);
    db.migrate('0017_drop_coverage_target', '0018_clean_stale_category_managers');
    for (const table of ['User', 'Request', 'CoverageDetail', 'RequestEvent', 'AuditLog', 'Notification']) {
      before[table] = await count(db, table);
    }
  });

  it('crée les deux tables sans toucher aux données existantes', async () => {
    expect(await existingTables(db)).toEqual([]);

    db.migrate(MIGRATION);

    expect(await existingTables(db)).toEqual(TABLES);
    for (const [table, n] of Object.entries(before)) expect(await count(db, table)).toBe(n);
    expect(await count(db, 'PushSubscription')).toBe(0);
    expect(await count(db, 'NotificationPreference')).toBe(0);
  });

  it('applique l’unicité de l’adresse d’envoi et les valeurs par défaut', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/mig-0019';
    await db.sql(subscription('00000000-0000-4000-a000-000000000001', ID.sv1, endpoint));
    await expect(db.sql(subscription('00000000-0000-4000-a000-000000000002', ID.sv2, endpoint))).rejects.toThrow();

    const [row] = await db.query<{ sessionId: string | null; lastSuccessAt: Date | null; createdAt: Date; lastUsedAt: Date }>(
      `SELECT "sessionId", "lastSuccessAt", "createdAt", "lastUsedAt" FROM "PushSubscription" WHERE "endpoint" = '${endpoint}'`,
    );
    expect(row.sessionId).toBeNull();
    expect(row.lastSuccessAt).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.lastUsedAt).toBeInstanceOf(Date);

    await db.sql(`INSERT INTO "NotificationPreference" ("userId", "updatedAt") VALUES ('${ID.sv1}', now())`);
    const [prefs] = await db.query<Record<string, boolean | null>>(
      `SELECT "urgent", "coverage", "unfilled", "attendance", "urgentSound" FROM "NotificationPreference" WHERE "userId" = '${ID.sv1}'`,
    );
    expect(prefs).toEqual({ urgent: true, coverage: true, unfilled: true, attendance: true, urgentSound: null });
  });

  it('supprime abonnements et préférences avec leur utilisateur', async () => {
    const userId = '00000000-0000-4000-8000-0000000000aa';
    await db.sql(`INSERT INTO "User" ("id", "username", "displayName", "role", "passwordHash", "updatedAt")
                  VALUES ('${userId}', 'sans-lien', 'Sans lien', 'EMPLOYEE', 'x', now())`);
    await db.sql(subscription('00000000-0000-4000-a000-0000000000aa', userId, 'https://fcm.googleapis.com/fcm/send/cascade'));
    await db.sql(`INSERT INTO "NotificationPreference" ("userId", "coverage", "updatedAt") VALUES ('${userId}', false, now())`);

    await db.sql(`DELETE FROM "User" WHERE "id" = '${userId}'`);

    expect(await count(db, 'PushSubscription')).toBe(1);
    expect((await db.query(`SELECT 1 FROM "NotificationPreference" WHERE "userId" = '${userId}'`)).length).toBe(0);
  });

  it('down.sql retire les deux tables et la ligne de suivi, et la migration se réapplique', async () => {
    expect(db.down(MIGRATION)).toBeNull();

    expect(await existingTables(db)).toEqual([]);
    expect(await tracked(db)).toBe(0);
    for (const [table, n] of Object.entries(before)) expect(await count(db, table)).toBe(n);

    db.migrate(MIGRATION);
    expect(await existingTables(db)).toEqual(TABLES);
    expect(await tracked(db)).toBe(1);
  });
});
