import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BEFORE, disposeMigrationDatabases, openDatabase, type MigrationDb } from '../utils/migration-db';

/**
 * T003 — Migration 0031_timetable (020, data-model.md) : séries hebdomadaires et séances datées. Les
 * chevauchements d'un même enseignant ou d'une même classe sont refusés par la base (contraintes
 * d'exclusion btree_gist), y compris pour deux écritures simultanées ; les séances ne se suppriment pas.
 */

const MIGRATION = '0031_timetable';
const MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'prisma', 'migrations');
const UP_TO_0030 = readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d{4}_/.test(name) && !BEFORE.includes(name) && name < MIGRATION)
  .sort();

const ID = {
  teacherA: '00000000-0000-4000-8000-000000000011',
  teacherB: '00000000-0000-4000-8000-000000000012',
  admin: '00000000-0000-4000-8000-000000000021',
  classA: '00000000-0000-4000-8000-0000000000c1',
  classB: '00000000-0000-4000-8000-0000000000c2',
};

afterAll(disposeMigrationDatabases);

async function seed(db: MigrationDb): Promise<void> {
  const users: Array<[string, string, string]> = [
    [ID.teacherA, 'ens_a', 'EMPLOYEE'],
    [ID.teacherB, 'ens_b', 'EMPLOYEE'],
    [ID.admin, 'admin', 'ADMIN'],
  ];
  for (const [id, username, role] of users) {
    await db.sql(`INSERT INTO "User" ("id", "username", "displayName", "role", "passwordHash", "updatedAt")
                  VALUES ('${id}', '${username}', '${username}', '${role}', 'x', now())`);
  }
  for (const [id, name] of [
    [ID.classA, '3A'],
    [ID.classB, '3B'],
  ]) {
    await db.sql(`INSERT INTO "SchoolClass" ("id", "name", "updatedAt") VALUES ('${id}', '${name}', now())`);
  }
}

interface SessionRow {
  teacherId?: string;
  classId?: string;
  start?: string;
  end?: string;
  status?: 'SCHEDULED' | 'CANCELLED';
  reason?: string | null;
}

/** Séance du 2026-09-07 ; heures locales sans fuseau, interprétées en UTC (sans importance ici). */
const session = (db: MigrationDb, over: SessionRow = {}) => {
  const row = { teacherId: ID.teacherA, classId: ID.classA, start: '08:00', end: '09:00', status: 'SCHEDULED', reason: null, ...over };
  const reason = row.reason === null ? 'NULL' : `'${row.reason}'`;
  return db.sql(`INSERT INTO "TeachingSession" ("id", "teacherId", "classId", "localDate", "startAt", "endAt", "status",
                   "cancelReason", "createdById", "updatedAt")
                 VALUES (gen_random_uuid(), '${row.teacherId}', '${row.classId}', '2026-09-07',
                   '2026-09-07 ${row.start}+00', '2026-09-07 ${row.end}+00', '${row.status}', ${reason}, '${ID.admin}', now())`);
};

const tables = async (db: MigrationDb) =>
  (await db.query<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'`)).map((r) => r.t);

const enumLabels = async (db: MigrationDb, type: string) =>
  (
    await db.query<{ v: string }>(
      `SELECT e."enumlabel" AS v FROM pg_enum e JOIN pg_type t ON t."oid" = e."enumtypid" WHERE t."typname" = '${type}' ORDER BY e."enumsortorder"`,
    )
  ).map((r) => r.v);

const tracked = async (db: MigrationDb) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE "migration_name" = '${MIGRATION}'`))[0].n;

describe('Migration 0031_timetable', () => {
  let db: MigrationDb;

  beforeAll(async () => {
    db = await openDatabase('mig_0031');
    db.migrate(...UP_TO_0030);
    await seed(db);
    db.migrate(MIGRATION);
  }, 180_000);

  afterEach(async () => {
    // Les séances ne se suppriment pas : on annule celles du test pour libérer les créneaux.
    await db.sql(`UPDATE "TeachingSession" SET "status" = 'CANCELLED', "cancelReason" = 'nettoyage' WHERE "status" = 'SCHEDULED'`);
  });

  it('crée les tables, l’énumération des séances et l’action d’audit', async () => {
    expect(await tables(db)).toEqual(expect.arrayContaining(['TimetableSeries', 'TeachingSession']));
    expect(await enumLabels(db, 'TeachingSessionStatus')).toEqual(['SCHEDULED', 'CANCELLED']);
    expect(await enumLabels(db, 'AuditAction')).toContain('TIMETABLE_CHANGED');
  });

  it('une séance finit après avoir commencé', async () => {
    await expect(session(db, { start: '09:00', end: '09:00' })).rejects.toThrow(/TeachingSession_range/);
    await expect(session(db, { start: '10:00', end: '09:00' })).rejects.toThrow(/TeachingSession_range/);
  });

  it('une séance annulée a toujours un motif', async () => {
    await expect(session(db, { status: 'CANCELLED', reason: null })).rejects.toThrow(/TeachingSession_cancel_reason/);
    await expect(session(db, { status: 'CANCELLED', reason: 'Sortie scolaire' })).resolves.toBe(1);
  });

  it('un enseignant ne peut pas avoir deux séances qui se chevauchent (23P01) ; bout à bout, c’est permis', async () => {
    await expect(session(db)).resolves.toBe(1);
    await expect(session(db, { classId: ID.classB, start: '08:30', end: '09:30' })).rejects.toThrow(/TeachingSession_teacher_no_overlap/);
    await expect(session(db, { classId: ID.classB, start: '09:00', end: '10:00' })).resolves.toBe(1);
    await expect(session(db, { classId: ID.classB, start: '07:00', end: '08:00' })).resolves.toBe(1);
  });

  it('une classe ne peut pas avoir deux séances qui se chevauchent ; bout à bout, c’est permis', async () => {
    await expect(session(db)).resolves.toBe(1);
    await expect(session(db, { teacherId: ID.teacherB, start: '08:59', end: '09:30' })).rejects.toThrow(/TeachingSession_class_no_overlap/);
    await expect(session(db, { teacherId: ID.teacherB, start: '09:00', end: '09:30' })).resolves.toBe(1);
  });

  it('une séance annulée ne bloque pas le créneau', async () => {
    await expect(session(db, { status: 'CANCELLED', reason: 'Absence de la classe' })).resolves.toBe(1);
    await expect(session(db)).resolves.toBe(1);
    await expect(session(db, { teacherId: ID.teacherB, classId: ID.classA, status: 'CANCELLED', reason: 'Erreur' })).resolves.toBe(1);
  });

  it('séances et séries ne se suppriment pas (DELETE et TRUNCATE refusés)', async () => {
    await expect(session(db)).resolves.toBe(1);
    await expect(db.sql(`DELETE FROM "TeachingSession"`)).rejects.toThrow();
    await expect(db.sql(`TRUNCATE "TeachingSession"`)).rejects.toThrow();
    await db.sql(`INSERT INTO "TimetableSeries" ("id", "teacherId", "classId", "weekday", "startTime", "endTime", "startDate", "endDate",
                    "createdById", "updatedAt")
                  VALUES (gen_random_uuid(), '${ID.teacherA}', '${ID.classA}', 1, '08:00', '09:00', '2026-09-07', '2026-12-18', '${ID.admin}', now())`);
    await expect(db.sql(`DELETE FROM "TimetableSeries"`)).rejects.toThrow();
    await expect(db.sql(`TRUNCATE "TimetableSeries" CASCADE`)).rejects.toThrow();
  });

  it('down.sql refuse de retirer des emplois du temps déjà saisis', async () => {
    expect(db.down(MIGRATION)).toMatch(/emplois du temps/);
    expect(await tracked(db)).toBe(1);
  });
});

describe('Migration 0031_timetable — retour arrière sur une base sans emploi du temps', () => {
  let db: MigrationDb;

  beforeAll(async () => {
    db = await openDatabase('mig_0031_down');
    db.migrate(...UP_TO_0030);
    db.migrate(MIGRATION);
  }, 180_000);

  it('down.sql retire tables et types, l’action d’audit, puis la migration se réapplique', async () => {
    const before = (await enumLabels(db, 'AuditAction')).filter((a) => a !== 'TIMETABLE_CHANGED');
    expect(db.down(MIGRATION)).toBeNull();
    expect(await tables(db)).not.toEqual(expect.arrayContaining(['TeachingSession']));
    expect(await tables(db)).not.toEqual(expect.arrayContaining(['TimetableSeries']));
    expect(await enumLabels(db, 'TeachingSessionStatus')).toEqual([]);
    expect(await enumLabels(db, 'AuditAction')).toEqual(before);
    expect(await tracked(db)).toBe(0);

    db.migrate(MIGRATION);
    expect(await tracked(db)).toBe(1);
  }, 120_000);
});

// Garde-fou : la liste des migrations intermédiaires ne doit pas se vider sans prévenir.
it('applique bien les migrations 0008 à 0030 avant 0031', () => {
  expect(UP_TO_0030[0]).toBe('0008_supervision_schema');
  expect(UP_TO_0030).toHaveLength(23);
  expect(readdirSync(join(MIGRATIONS_DIR, MIGRATION))).toEqual(expect.arrayContaining(['migration.sql', 'down.sql']));
});
