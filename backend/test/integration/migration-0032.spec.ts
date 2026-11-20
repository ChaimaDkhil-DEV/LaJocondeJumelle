import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { disposeMigrationDatabases, ID, openDatabase, seedBefore, type MigrationDb } from '../utils/migration-db';

/**
 * Migration 0032_student_class_history (021) : historique des classes d'un élève, en ajout seul. Les élèves déjà
 * inscrits reçoivent une ligne « reconstituée » ; la valeur d'audit et l'index de lecture par cible sont créés ;
 * le retour arrière par down.sql a un garde-fou.
 */

const MIGRATIONS = resolve(__dirname, '..', '..', 'prisma', 'migrations');
/** Toutes les migrations après le point de départ des bases de test (0007) et avant 0032. */
const UP_TO_0031 = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{4}_/.test(name) && name > '0007_audit_request_actions' && name < '0032')
  .sort();

const STUDENT = '00000000-0000-4000-a000-0000000000a1';
const STUDENT_LATER = '00000000-0000-4000-a000-0000000000a2';

const insertStudent = (db: MigrationDb, id: string, createdAt: string) =>
  db.sql(`INSERT INTO "Student" ("id", "firstName", "lastName", "classId", "parentPhone", "createdAt", "updatedAt")
          VALUES ('${id}', 'Amine', 'Ben Salah', '${ID.classA}', '+216 20 123 456', '${createdAt}', now())`);

const rows = (db: MigrationDb) =>
  db.query<{ studentId: string; classId: string; startedAt: Date; changedById: string | null; reconstructed: boolean; createdAt: Date }>(
    `SELECT "studentId", "classId", "startedAt", "changedById", "reconstructed", "createdAt" FROM "StudentClassHistory" ORDER BY "studentId"`,
  );

const tableExists = async (db: MigrationDb) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'StudentClassHistory'`))[0].n === 1;

afterAll(disposeMigrationDatabases);

describe('Migration 0032_student_class_history', () => {
  describe('sur une base qui contient déjà des élèves', () => {
    let db: MigrationDb;

    beforeAll(async () => {
      db = await openDatabase('mig_0032_main');
      await seedBefore(db);
      db.migrate(...UP_TO_0031);
      await insertStudent(db, STUDENT, '2026-09-01T07:00:00Z');
      await insertStudent(db, STUDENT_LATER, '2026-10-15T07:00:00Z');
      db.migrate('0032_student_class_history');
    });

    it('reprend chaque élève existant : une ligne reconstituée, à sa date de création, sans auteur', async () => {
      const history = await rows(db);
      expect(history).toHaveLength(2);
      for (const row of history) {
        expect(row.reconstructed).toBe(true);
        expect(row.changedById).toBeNull();
        expect(row.classId).toBe(ID.classA);
      }
      expect(history.find((r) => r.studentId === STUDENT)!.startedAt.toISOString()).toBe('2026-09-01T07:00:00.000Z');
      expect(history.find((r) => r.studentId === STUDENT_LATER)!.startedAt.toISOString()).toBe('2026-10-15T07:00:00.000Z');
    });

    it('date la mise en service dans `createdAt` : postérieur à la création des élèves', async () => {
      for (const row of await rows(db)) expect(row.createdAt.getTime()).toBeGreaterThan(row.startedAt.getTime());
    });

    it('ne touche aucun élève existant', async () => {
      const students = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "Student"`);
      expect(students[0].n).toBe(2);
    });

    it('l’historique est en ajout seul : ni modification, ni suppression, ni vidage', async () => {
      await expect(db.sql(`UPDATE "StudentClassHistory" SET "classId" = "classId"`)).rejects.toThrow(/ajout seul/);
      await expect(db.sql(`DELETE FROM "StudentClassHistory"`)).rejects.toThrow(/ajout seul/);
      await expect(db.sql(`TRUNCATE TABLE "StudentClassHistory"`)).rejects.toThrow(/ajout seul/);
      expect(await rows(db)).toHaveLength(2);
    });

    it('accepte une nouvelle ligne avec auteur et ordre d’écriture croissant', async () => {
      await db.sql(`INSERT INTO "StudentClassHistory" ("id", "studentId", "classId", "startedAt", "changedById")
                    VALUES (gen_random_uuid(), '${STUDENT}', '${ID.classA}', now(), '${ID.superadmin}')`);
      const seq = await db.query<{ seq: bigint }>(`SELECT "seq" FROM "StudentClassHistory" ORDER BY "seq"`);
      expect(seq).toHaveLength(3);
      expect(Number(seq[2].seq)).toBeGreaterThan(Number(seq[0].seq));
    });

    it('crée l’index de lecture du journal par cible et la valeur d’audit de consultation', async () => {
      const index = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_indexes WHERE tablename = 'AuditLog' AND indexdef ILIKE '%"targetType"%"targetId"%"createdAt"%'`,
      );
      expect(index[0].n).toBe(1);
      const value = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AuditAction' AND e.enumlabel = 'STUDENT_SITUATION_VIEWED'`,
      );
      expect(value[0].n).toBe(1);
    });

    it('down.sql refuse tant qu’une ligne saisie après la mise en service existe, et ne supprime rien', async () => {
      expect(db.down('0032_student_class_history')).toMatch(/restaurez la sauvegarde/);
      expect(await tableExists(db)).toBe(true);
      expect(await rows(db)).toHaveLength(3);
    });
  });

  describe('sur une base où seules les lignes reconstituées existent', () => {
    let db: MigrationDb;

    beforeAll(async () => {
      db = await openDatabase('mig_0032_clean');
      await seedBefore(db);
      db.migrate(...UP_TO_0031);
      await insertStudent(db, STUDENT, '2026-09-01T07:00:00Z');
      db.migrate('0032_student_class_history');
    });

    it('down.sql retire la table et l’index ; les élèves restent intacts', async () => {
      expect(db.down('0032_student_class_history')).toBeNull();
      expect(await tableExists(db)).toBe(false);
      const index = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_indexes WHERE tablename = 'AuditLog' AND indexdef ILIKE '%"targetType"%"targetId"%"createdAt"%'`,
      );
      expect(index[0].n).toBe(0);
      expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "Student"`))[0].n).toBe(1);
      const tracked = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE "migration_name" = '0032_student_class_history'`);
      expect(tracked[0].n).toBe(0);
    });
  });
});
