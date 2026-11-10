import { disposeMigrationDatabases, openDatabase, type MigrationDb } from '../utils/migration-db';

/**
 * Migration 0024_two_priorities (016) : deux priorités métier, URGENT et NORMAL. Les demandes en
 * MEDIUM passent en NORMAL, celles en HIGH en URGENT ; chaque conversion ajoute un événement
 * PRIORITY_CHANGED (acteur système) à l'historique. Les délais des priorités retirées sont copiés au
 * journal d'audit avant suppression ; down.sql s'appuie sur ces deux traces pour tout rétablir.
 */

const UP_TO_0023 = [
  '0008_supervision_schema',
  '0009_supervision_data',
  '0010_audit_coverage_stats_export',
  '0011_request_assist',
  '0012_user_avatar',
  '0013_school_students',
  '0014_teacher_attendance',
  '0015_audit_level_changed',
  '0016_student_meal_history',
  '0017_drop_coverage_target',
  '0018_clean_stale_category_managers',
  '0019_push_notifications',
  '0020_parent_communications',
  '0021_parent_communications_integrity',
  '0022_admin_validates_parent_communications',
  '0023_parent_conversations',
];
const MIGRATION = '0024_two_priorities';

const ID = {
  teacher: '00000000-0000-4000-8000-000000000011',
  work: '00000000-0000-4000-8000-0000000000a1',
  later: '00000000-0000-4000-8000-0000000000a2',
  medium: '00000000-0000-4000-9000-000000000001',
  high: '00000000-0000-4000-9000-000000000002',
  normal: '00000000-0000-4000-9000-000000000003',
  urgent: '00000000-0000-4000-9000-000000000004',
  highDraft: '00000000-0000-4000-9000-000000000005',
};
const DUE = '2026-11-12T08:30:00.000Z';

/** Délais de la catégorie de travail avant la migration : valeurs distinctes, pour vérifier leur reprise. */
const WORK_RULES: Array<[string, number | null, number, number]> = [
  ['NORMAL', null, 1440, 4320],
  ['MEDIUM', null, 470, 2870],
  ['HIGH', null, 110, 1430],
  ['URGENT', null, 15, 120],
];

afterAll(disposeMigrationDatabases);

async function seed(db: MigrationDb): Promise<void> {
  await db.sql(`INSERT INTO "User" ("id", "username", "displayName", "role", "passwordHash", "updatedAt")
                VALUES ('${ID.teacher}', 'enseignante', 'Enseignante', 'EMPLOYEE', 'x', now())`);
  await db.sql(`INSERT INTO "Category" ("id", "name", "circuit", "routingMode", "creatorRoles", "closureMode", "kind", "updatedAt")
                VALUES ('${ID.work}', 'Photocopies', 'A_DIRECT', 'DIRECT', ARRAY['EMPLOYEE']::"Role"[], 'REQUESTER', 'WORK', now())`);
  for (const [priority, validation, takeover, completion] of WORK_RULES) {
    await db.sql(`INSERT INTO "DeadlineRule" ("id", "categoryId", "priority", "validationMinutes", "takeoverMinutes", "completionMinutes")
                  VALUES (gen_random_uuid(), '${ID.work}', '${priority}', ${validation ?? 'NULL'}, ${takeover}, ${completion})`);
  }
  const requests: Array<[string, string, string]> = [
    [ID.medium, 'MEDIUM', 'SENT'],
    [ID.high, 'HIGH', 'IN_PROGRESS'],
    [ID.normal, 'NORMAL', 'SENT'],
    [ID.urgent, 'URGENT', 'DONE'],
    [ID.highDraft, 'HIGH', 'DRAFT'],
  ];
  for (const [index, [id, priority, status]] of requests.entries()) {
    await db.sql(`INSERT INTO "Request" ("id", "kind", "reference", "clientId", "title", "categoryId", "priority",
                    "requesterId", "status", "version", "rulesSnapshot", "currentStage", "currentDueAt", "updatedAt")
                  VALUES ('${id}', 'WORK', 'D-${index + 1}', gen_random_uuid(), 'Demande ${priority}', '${ID.work}', '${priority}',
                    '${ID.teacher}', '${status}', 3, '{}'::jsonb, 'TAKEOVER', '${DUE}', now())`);
    await db.sql(`INSERT INTO "Notification" ("id", "userId", "type", "requestId", "priority")
                  VALUES (gen_random_uuid(), '${ID.teacher}', 'STATUS_CHANGED', '${id}', '${priority}')`);
  }
}

const enumValues = async (db: MigrationDb) =>
  (
    await db.query<{ v: string }>(
      `SELECT e."enumlabel" AS v FROM pg_enum e JOIN pg_type t ON t."oid" = e."enumtypid"
       WHERE t."typname" = 'Priority' ORDER BY e."enumsortorder"`,
    )
  ).map((r) => r.v);

const requestRow = async (db: MigrationDb, id: string) =>
  (
    await db.query<{ priority: string; version: number; due: string }>(
      `SELECT "priority"::text AS priority, "version", to_char("currentDueAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS due
       FROM "Request" WHERE "id" = '${id}'`,
    )
  )[0];

const migrationEvents = async (db: MigrationDb) =>
  db.query<{ requestId: string; actorId: string | null; from: string; to: string; fromDue: string | null }>(
    `SELECT "requestId"::text AS "requestId", "actorId"::text AS "actorId", "fromValue"->>'priority' AS "from",
            "toValue"->>'priority' AS "to", "fromValue"->>'dueAt' AS "fromDue"
     FROM "RequestEvent" WHERE "type" = 'PRIORITY_CHANGED' AND "comment" = 'migration-0024' ORDER BY "requestId"`,
  );

const rules = async (db: MigrationDb, categoryId: string) =>
  db.query<{ priority: string; validation: number | null; takeover: number | null; completion: number | null; arrival: number | null }>(
    `SELECT "priority"::text AS priority, "validationMinutes" AS validation, "takeoverMinutes" AS takeover,
            "completionMinutes" AS completion, "arrivalMinutes" AS arrival
     FROM "DeadlineRule" WHERE "categoryId" = '${categoryId}' ORDER BY "DeadlineRule"."priority"`,
  );

const coverageCategory = async (db: MigrationDb) =>
  (await db.query<{ id: string }>(`SELECT "id"::text AS id FROM "Category" WHERE "kind" = 'COVERAGE' LIMIT 1`))[0].id;

const tracked = async (db: MigrationDb) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE "migration_name" = '${MIGRATION}'`))[0].n;

describe('Migration 0024_two_priorities', () => {
  let db: MigrationDb;

  beforeAll(async () => {
    db = await openDatabase('mig_0024');
    db.migrate(...UP_TO_0023);
    await seed(db);
    db.migrate(MIGRATION);
  });

  it('l’énumération ne garde que NORMAL et URGENT', async () => {
    expect(await enumValues(db)).toEqual(['NORMAL', 'URGENT']);
  });

  it('MEDIUM devient NORMAL, HIGH devient URGENT (brouillons compris), version incrémentée, échéance conservée', async () => {
    expect(await requestRow(db, ID.medium)).toEqual({ priority: 'NORMAL', version: 4, due: DUE });
    expect(await requestRow(db, ID.high)).toEqual({ priority: 'URGENT', version: 4, due: DUE });
    expect(await requestRow(db, ID.highDraft)).toEqual({ priority: 'URGENT', version: 4, due: DUE });
  });

  it('les demandes déjà en NORMAL ou URGENT sont intactes', async () => {
    expect(await requestRow(db, ID.normal)).toEqual({ priority: 'NORMAL', version: 3, due: DUE });
    expect(await requestRow(db, ID.urgent)).toEqual({ priority: 'URGENT', version: 3, due: DUE });
  });

  it('chaque conversion est tracée dans l’historique de la demande (acteur système)', async () => {
    expect(await migrationEvents(db)).toEqual(
      [
        { requestId: ID.medium, actorId: null, from: 'MEDIUM', to: 'NORMAL', fromDue: DUE },
        { requestId: ID.high, actorId: null, from: 'HIGH', to: 'URGENT', fromDue: DUE },
        { requestId: ID.highDraft, actorId: null, from: 'HIGH', to: 'URGENT', fromDue: DUE },
      ].sort((a, b) => a.requestId.localeCompare(b.requestId)),
    );
  });

  it('les notifications suivent la même correspondance', async () => {
    const rows = await db.query<{ requestId: string; priority: string }>(
      `SELECT "requestId"::text AS "requestId", "priority"::text AS priority FROM "Notification" ORDER BY "requestId"`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.requestId, r.priority]))).toEqual({
      [ID.medium]: 'NORMAL',
      [ID.high]: 'URGENT',
      [ID.normal]: 'NORMAL',
      [ID.urgent]: 'URGENT',
      [ID.highDraft]: 'URGENT',
    });
  });

  it('délais : seules les règles NORMAL et URGENT restent, inchangées', async () => {
    expect(await rules(db, ID.work)).toEqual([
      { priority: 'NORMAL', validation: null, takeover: 1440, completion: 4320, arrival: null },
      { priority: 'URGENT', validation: null, takeover: 15, completion: 120, arrival: null },
    ]);
    expect((await rules(db, await coverageCategory(db))).map((r) => r.priority)).toEqual(['NORMAL', 'URGENT']);
  });

  it('les délais retirés sont copiés au journal d’audit, une entrée par catégorie', async () => {
    const audit = await db.query<{ targetId: string; actorId: string | null; details: { migration: string; before: Array<{ priority: string }>; after: Array<{ priority: string }> } }>(
      `SELECT "targetId", "actorId"::text AS "actorId", "details" FROM "AuditLog" WHERE "action" = 'DEADLINE_RULE_CHANGED' ORDER BY "targetId"`,
    );
    const coverage = await coverageCategory(db);
    const work = audit.find((a) => a.targetId === ID.work)!;
    expect(work.actorId).toBeNull();
    expect(work.details.migration).toBe(MIGRATION);
    expect(work.details.before).toEqual([
      { priority: 'NORMAL', validationMinutes: null, takeoverMinutes: 1440, completionMinutes: 4320, arrivalMinutes: null },
      { priority: 'MEDIUM', validationMinutes: null, takeoverMinutes: 470, completionMinutes: 2870, arrivalMinutes: null },
      { priority: 'HIGH', validationMinutes: null, takeoverMinutes: 110, completionMinutes: 1430, arrivalMinutes: null },
      { priority: 'URGENT', validationMinutes: null, takeoverMinutes: 15, completionMinutes: 120, arrivalMinutes: null },
    ]);
    expect(work.details.after.map((r) => r.priority)).toEqual(['NORMAL', 'URGENT']);
    expect(audit.some((a) => a.targetId === ID.later)).toBe(false);
    // Une entrée par catégorie ayant des délais retirés, dont celles de couverture.
    expect(audit.some((a) => a.targetId === coverage)).toBe(true);
    expect(new Set(audit.map((a) => a.targetId)).size).toBe(audit.length);
  });

  describe('down.sql', () => {
    beforeAll(async () => {
      // Après la migration : l'enseignante repasse la demande « HIGH » en NORMAL, et une catégorie est créée.
      await db.sql(`UPDATE "Request" SET "priority" = 'NORMAL', "version" = "version" + 1 WHERE "id" = '${ID.high}'`);
      await db.sql(`INSERT INTO "RequestEvent" ("id", "requestId", "actorId", "type", "fromValue", "toValue")
                    VALUES (gen_random_uuid(), '${ID.high}', '${ID.teacher}', 'PRIORITY_CHANGED', '{"priority":"URGENT"}', '{"priority":"NORMAL"}')`);
      await db.sql(`INSERT INTO "Category" ("id", "name", "circuit", "routingMode", "creatorRoles", "closureMode", "kind", "updatedAt")
                    VALUES ('${ID.later}', 'Petits travaux', 'B_ADMIN_VALIDATION', 'VIA_ADMIN', ARRAY['EMPLOYEE']::"Role"[], 'REQUESTER', 'WORK', now())`);
      await db.sql(`INSERT INTO "DeadlineRule" ("id", "categoryId", "priority", "validationMinutes", "takeoverMinutes", "completionMinutes")
                    VALUES (gen_random_uuid(), '${ID.later}', 'NORMAL', 1440, 1440, 4320), (gen_random_uuid(), '${ID.later}', 'URGENT', 30, 15, 120)`);
      expect(db.down(MIGRATION)).toBeNull();
    });

    it('rétablit les quatre priorités et retire la ligne de suivi Prisma', async () => {
      expect(await enumValues(db)).toEqual(['NORMAL', 'MEDIUM', 'HIGH', 'URGENT']);
      expect(await tracked(db)).toBe(0);
    });

    it('rend leur priorité d’origine aux demandes converties, sauf celles changées depuis', async () => {
      expect((await requestRow(db, ID.medium)).priority).toBe('MEDIUM');
      expect((await requestRow(db, ID.highDraft)).priority).toBe('HIGH');
      // Choix fait après la migration : conservé.
      expect((await requestRow(db, ID.high)).priority).toBe('NORMAL');
      expect((await requestRow(db, ID.normal)).priority).toBe('NORMAL');
      expect((await requestRow(db, ID.urgent)).priority).toBe('URGENT');
    });

    it('le retour arrière est lui aussi tracé dans l’historique', async () => {
      const rows = await db.query<{ requestId: string; from: string; to: string }>(
        `SELECT "requestId"::text AS "requestId", "fromValue"->>'priority' AS "from", "toValue"->>'priority' AS "to"
         FROM "RequestEvent" WHERE "comment" = 'migration-0024-down' ORDER BY "requestId"`,
      );
      expect(rows).toEqual([
        { requestId: ID.medium, from: 'NORMAL', to: 'MEDIUM' },
        { requestId: ID.highDraft, from: 'URGENT', to: 'HIGH' },
      ]);
    });

    it('rétablit les délais retirés depuis le journal d’audit, et les délais par défaut d’une catégorie créée depuis', async () => {
      expect(await rules(db, ID.work)).toEqual([
        { priority: 'NORMAL', validation: null, takeover: 1440, completion: 4320, arrival: null },
        { priority: 'MEDIUM', validation: null, takeover: 470, completion: 2870, arrival: null },
        { priority: 'HIGH', validation: null, takeover: 110, completion: 1430, arrival: null },
        { priority: 'URGENT', validation: null, takeover: 15, completion: 120, arrival: null },
      ]);
      expect(await rules(db, ID.later)).toEqual([
        { priority: 'NORMAL', validation: 1440, takeover: 1440, completion: 4320, arrival: null },
        { priority: 'MEDIUM', validation: 480, takeover: 480, completion: 2880, arrival: null },
        { priority: 'HIGH', validation: 120, takeover: 120, completion: 1440, arrival: null },
        { priority: 'URGENT', validation: 30, takeover: 15, completion: 120, arrival: null },
      ]);
      expect((await rules(db, await coverageCategory(db))).map((r) => [r.priority, r.takeover, r.arrival])).toEqual([
        ['NORMAL', 2, 5],
        ['MEDIUM', 2, 5],
        ['HIGH', 2, 5],
        ['URGENT', 2, 5],
      ]);
    });

    it('la migration se réapplique ensuite', async () => {
      db.migrate(MIGRATION);
      expect(await enumValues(db)).toEqual(['NORMAL', 'URGENT']);
      expect((await requestRow(db, ID.medium)).priority).toBe('NORMAL');
      expect(await tracked(db)).toBe(1);
    });
  });
});
