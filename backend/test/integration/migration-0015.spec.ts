import { disposeMigrationDatabases, openDatabase, seedBefore, type MigrationDb } from '../utils/migration-db';

/**
 * Migration 0015_audit_level_changed : ajout de la valeur d'audit LEVEL_CHANGED. Le retour arrière recrée
 * l'énumération du journal d'audit (sans toucher à ses lignes) et refuse de s'exécuter si la valeur a
 * déjà servi : le journal est en ajout seul et ne se réécrit pas.
 */

const UP_TO_0014 = [
  '0008_supervision_schema',
  '0009_supervision_data',
  '0010_audit_coverage_stats_export',
  '0011_request_assist',
  '0012_user_avatar',
  '0013_school_students',
  '0014_teacher_attendance',
];

afterAll(disposeMigrationDatabases);

/**
 * Valeurs lues dans le catalogue PostgreSQL : une requête qui nomme le type resterait mémorisée par la
 * connexion avec l'ancien type, supprimé puis recréé par le retour arrière (comme les connexions ouvertes
 * de l'API, d'où le redémarrage demandé par down.sql).
 */
const auditValues = async (db: MigrationDb) =>
  (
    await db.query<{ v: string }>(
      `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AuditAction' ORDER BY e.enumsortorder`,
    )
  ).map((r) => r.v);

const addAudit = (db: MigrationDb, action: string) =>
  db.sql(`INSERT INTO "AuditLog" ("id", "action") VALUES (gen_random_uuid(), '${action}')`);

const countAudit = async (db: MigrationDb) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog"`))[0].n;

describe('Migration 0015_audit_level_changed', () => {
  describe('quand la valeur a déjà servi', () => {
    let db: MigrationDb;

    beforeAll(async () => {
      db = await openDatabase('mig_0015_used');
      await seedBefore(db);
      db.migrate(...UP_TO_0014, '0015_audit_level_changed');
    });

    it('ajoute LEVEL_CHANGED sans retirer aucune valeur existante', async () => {
      const values = await auditValues(db);
      expect(values).toContain('LEVEL_CHANGED');
      for (const existing of ['LOGIN_SUCCESS', 'CLASS_CHANGED', 'STUDENT_CHANGED', 'ATTENDANCE_CORRECTED']) {
        expect(values).toContain(existing);
      }
    });

    it('down.sql refuse tant qu’un niveau modifié est journalisé, et ne touche à rien', async () => {
      await addAudit(db, 'LEVEL_CHANGED');
      const before = await countAudit(db);
      expect(db.down('0015_audit_level_changed')).toMatch(/restaurez la sauvegarde/i);
      expect(await countAudit(db)).toBe(before);
      expect(await auditValues(db)).toContain('LEVEL_CHANGED');
      const tracked = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE "migration_name" = '0015_audit_level_changed'`);
      expect(tracked[0].n).toBe(1);
    });
  });

  describe('quand la valeur n’a pas servi', () => {
    let db: MigrationDb;
    let before: string[];

    beforeAll(async () => {
      db = await openDatabase('mig_0015_clean');
      await seedBefore(db);
      db.migrate(...UP_TO_0014, '0015_audit_level_changed');
      await addAudit(db, 'CLASS_CHANGED');
      await addAudit(db, 'ATTENDANCE_MANUAL');
      before = (await auditValues(db)).filter((v) => v !== 'LEVEL_CHANGED');
    });

    it('down.sql retire la valeur, garde toutes les autres et conserve les lignes du journal', async () => {
      const rows = await countAudit(db);
      expect(db.down('0015_audit_level_changed')).toBeNull();
      expect(await auditValues(db)).toEqual(before);
      expect(await countAudit(db)).toBe(rows);
      const tracked = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE "migration_name" = '0015_audit_level_changed'`);
      expect(tracked[0].n).toBe(0);
    });

    it('le journal reste en ajout seul après le retour arrière', async () => {
      await expect(db.sql(`DELETE FROM "AuditLog"`)).rejects.toThrow(/ajout seul/);
      await expect(db.sql(`UPDATE "AuditLog" SET "action" = 'LOGOUT'`)).rejects.toThrow(/ajout seul/);
    });

    it('la migration peut ensuite être réappliquée (l’énumération a été recréée sans la valeur)', async () => {
      db.migrate('0015_audit_level_changed');
      expect(await auditValues(db)).toContain('LEVEL_CHANGED');
    });
  });
});
