import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Migrations 0008_supervision_schema et 0009_supervision_data (contracts/migration.md,
 * « Vérification ») : base arrêtée à 0007 avec un jeu de gardes dans chaque statut, montée,
 * contrôles, puis retour arrière par les down.sql, garde-fous compris.
 *
 * Chaque scénario utilise sa propre base sur le PostgreSQL embarqué des tests ; la base `app_test`
 * (déjà migrée) sert seulement à créer et supprimer ces bases.
 */

const BACKEND_DIR = resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = join(BACKEND_DIR, 'prisma', 'migrations');
const PRISMA_CLI = require.resolve('prisma/build/index.js', { paths: [BACKEND_DIR] });
const BEFORE = [
  '0001_init',
  '0002_coverage',
  '0003_request_event_seq',
  '0004_superadmin_notifications',
  '0005_routing_mode',
  '0006_request_event_dashboard_indexes',
  '0007_audit_request_actions',
];
const COVERAGE_SETTING_KEYS = [
  'coverageCloseEscalationMinutes',
  'coverageCloseReminderMinutes',
  'coverageEscalationMinutes',
  'coverageMorningReminderTime',
  'coverageRetentionMonths',
  'coverageSupportReminderMax',
  'coverageSupportReminderMinutes',
  'coverageUrgencyThresholdMinutes',
];

interface MigrationDb {
  url: string;
  prisma: PrismaClient;
  /** Applique les migrations listées (en plus de celles déjà appliquées). */
  migrate: (...names: string[]) => void;
  /** Exécute un down.sql ; renvoie la sortie d'erreur si le script échoue, null sinon. */
  down: (name: string) => string | null;
  sql: (text: string) => Promise<number>;
  query: <T = Record<string, unknown>>(text: string) => Promise<T[]>;
  dispose: () => Promise<void>;
}

const admin = new PrismaClient();
const opened: MigrationDb[] = [];

function prisma(args: string[], url: string): void {
  execFileSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

async function openDatabase(name: string): Promise<MigrationDb> {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const url = process.env.DATABASE_URL!.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);

  // Copie du dossier de migrations limitée à l'état voulu : `migrate deploy` n'applique que celles-ci.
  const workDir = mkdtempSync(join(tmpdir(), 'ljj-migration-'));
  mkdirSync(join(workDir, 'migrations'));
  cpSync(join(BACKEND_DIR, 'prisma', 'schema.prisma'), join(workDir, 'schema.prisma'));
  cpSync(
    join(MIGRATIONS_DIR, 'migration_lock.toml'),
    join(workDir, 'migrations', 'migration_lock.toml'),
  );
  const schema = join(workDir, 'schema.prisma');

  const client = new PrismaClient({ datasources: { db: { url } } });
  const db: MigrationDb = {
    url,
    prisma: client,
    migrate: (...names) => {
      for (const n of names)
        cpSync(join(MIGRATIONS_DIR, n), join(workDir, 'migrations', n), { recursive: true });
      prisma(['migrate', 'deploy', '--schema', schema], url);
    },
    down: (n) => {
      try {
        prisma(['db', 'execute', '--file', join(MIGRATIONS_DIR, n, 'down.sql'), '--url', url], url);
        return null;
      } catch (error) {
        const e = error as { stderr?: Buffer; message: string };
        return e.stderr?.toString() || e.message;
      }
    },
    sql: (text) => client.$executeRawUnsafe(text),
    query: (text) => client.$queryRawUnsafe(text),
    dispose: async () => {
      await client.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      rmSync(workDir, { recursive: true, force: true });
    },
  };
  opened.push(db);
  db.migrate(...BEFORE);
  return db;
}

afterAll(async () => {
  for (const db of opened) await db.dispose();
  await admin.$disconnect();
});

// ---------------------------------------------------------------------------
// Jeu de données à l'état 0007 (SQL brut : le client Prisma suit le nouveau schéma).
// ---------------------------------------------------------------------------

const ID = {
  superadmin: '00000000-0000-4000-8000-000000000001',
  responsable: '00000000-0000-4000-8000-000000000002',
  sv1: '00000000-0000-4000-8000-000000000003',
  sv2: '00000000-0000-4000-8000-000000000004',
  enseignante: '00000000-0000-4000-8000-000000000005',
  classA: '00000000-0000-4000-8000-0000000000c1',
};

/** Gardes : statut, début et fin relatifs à maintenant (minutes), preneur. */
const COVERAGES: Array<{
  key: string;
  status: string;
  start: number;
  end: number | null;
  assignee?: string;
}> = [
  { key: 'broadcast', status: 'BROADCAST', start: 30, end: 90 },
  { key: 'unfilledFuture', status: 'UNFILLED', start: -10, end: 50 },
  { key: 'unfilledPast', status: 'UNFILLED', start: -180, end: -120 },
  { key: 'accepted', status: 'ACCEPTED', start: 20, end: 80, assignee: ID.sv1 },
  { key: 'enRoute', status: 'EN_ROUTE', start: 5, end: 65, assignee: ID.sv1 },
  { key: 'late', status: 'LATE', start: -5, end: 55, assignee: ID.sv2 },
  { key: 'onDuty', status: 'ON_DUTY', start: -30, end: null, assignee: ID.sv2 },
  { key: 'reliefPending', status: 'RELIEF_PENDING', start: -40, end: 20, assignee: ID.sv1 },
  { key: 'done', status: 'DONE', start: -300, end: -240, assignee: ID.sv1 },
  { key: 'closed', status: 'CLOSED', start: -500, end: -440, assignee: ID.sv2 },
  { key: 'cancelled', status: 'CANCELLED', start: -100, end: -40 },
];

const reqId = (index: number) => `00000000-0000-4000-9000-${String(index + 1).padStart(12, '0')}`;
const idOf = (key: string) => reqId(COVERAGES.findIndex((c) => c.key === key));

async function seedBefore(
  db: MigrationDb,
  extra: { coverages?: typeof COVERAGES } = {},
): Promise<void> {
  const users: Array<[string, string, string, string]> = [
    [ID.superadmin, 'superadmin', 'Super administrateur', 'SUPER_ADMIN'],
    [ID.responsable, 'responsable', 'Responsable administratif', 'MANAGER'],
    [ID.sv1, 'surveillant', 'Surveillant', 'EMPLOYEE'],
    [ID.sv2, 'remplacant', 'Remplaçante', 'EMPLOYEE'],
    [ID.enseignante, 'enseignante', 'Enseignante', 'EMPLOYEE'],
  ];
  for (const [id, username, displayName, role] of users) {
    await db.sql(`INSERT INTO "User" ("id", "username", "displayName", "role", "passwordHash", "updatedAt")
                  VALUES ('${id}', '${username}', '${displayName}', '${role}', 'x', now())`);
  }
  await db.sql(
    `INSERT INTO "RolePermission" ("role", "permission") VALUES ('MANAGER', 'REQUEST_REASSIGN')`,
  );
  await db.sql(`INSERT INTO "CategoryManager" ("categoryId", "userId")
                SELECT "id", '${ID.responsable}' FROM "Category" WHERE "kind" = 'COVERAGE'`);
  await db.sql(`INSERT INTO "EmployeeGroupMember" ("groupId", "userId")
                SELECT g."id", u."id" FROM "EmployeeGroup" g, "User" u
                WHERE g."name" = 'Surveillants/Remplaçants' AND u."id" IN ('${ID.sv1}', '${ID.sv2}')`);
  await db.sql(
    `INSERT INTO "SchoolClass" ("id", "name", "updatedAt") VALUES ('${ID.classA}', 'CM1 A', now())`,
  );

  const coverages = extra.coverages ?? COVERAGES;
  for (const [index, c] of coverages.entries()) {
    const id = reqId(index);
    const stage = c.status === 'BROADCAST' || c.status === 'UNFILLED' ? `'TAKEOVER'` : 'NULL';
    const overdue = c.status === 'UNFILLED' ? `'TAKEOVER'` : 'NULL';
    await db.sql(`INSERT INTO "Request" ("id", "kind", "reference", "clientId", "title", "categoryId", "priority",
                    "requesterId", "assigneeId", "status", "rulesSnapshot", "currentStage", "currentDueAt", "overdueStage", "updatedAt")
                  SELECT '${id}', 'COVERAGE', 'G-${index + 1}', gen_random_uuid(), 'Garde ${c.key}', "id", 'NORMAL',
                    '${ID.responsable}', ${c.assignee ? `'${c.assignee}'` : 'NULL'}, '${c.status}', '{}'::jsonb,
                    ${stage}, ${stage === 'NULL' ? 'NULL' : `now() + interval '2 minutes'`}, ${overdue}, now()
                  FROM "Category" WHERE "kind" = 'COVERAGE'`);
    await db.sql(`INSERT INTO "CoverageDetail" ("requestId", "classId", "absentTeacher", "startAt", "plannedEndAt")
                  VALUES ('${id}', '${ID.classA}', 'Mme Martin', now() + interval '${c.start} minutes',
                          ${c.end === null ? 'NULL' : `now() + interval '${c.end} minutes'`})`);
    await db.sql(`INSERT INTO "RequestEvent" ("id", "requestId", "actorId", "type", "toValue")
                  VALUES (gen_random_uuid(), '${id}', '${ID.responsable}', 'CREATED', '{"status":"${c.status}"}')`);
  }
  // Une demande de travail : intacte.
  await db.sql(`INSERT INTO "Request" ("id", "kind", "reference", "clientId", "title", "categoryId", "priority",
                  "requesterId", "status", "rulesSnapshot", "updatedAt")
                SELECT '00000000-0000-4000-9999-000000000001', 'WORK', 'D-1', gen_random_uuid(), 'Photocopies', "id", 'NORMAL',
                  '${ID.enseignante}', 'SENT', '{}'::jsonb, now()
                FROM "Category" WHERE "kind" = 'COVERAGE'`);
  await db.sql(`INSERT INTO "AuditLog" ("id", "actorId", "action", "targetType", "targetId")
                VALUES (gen_random_uuid(), '${ID.responsable}', 'COVERAGE_MANAGED', 'Request', '${reqId(0)}')`);
}

interface Snapshot {
  statuses: Record<string, string>;
  deadlines: Record<string, string>;
  role: string;
  creatorRoles: string;
  rolePermissions: string;
  groups: string;
  usernames: string;
  eventIds: string[];
  auditIds: string[];
  settings: number;
}

async function snapshot(db: MigrationDb): Promise<Snapshot> {
  const requests = await db.query<{ id: string; status: string; deadline: string }>(
    `SELECT "id", "status"::text AS status,
            concat_ws('|', "currentStage"::text, "overdueStage"::text, "currentDueAt" IS NOT NULL) AS deadline
     FROM "Request" ORDER BY "id"`,
  );
  const one = async (text: string) => Object.values((await db.query(text))[0])[0] as string;
  return {
    statuses: Object.fromEntries(requests.map((r) => [r.id, r.status])),
    deadlines: Object.fromEntries(requests.map((r) => [r.id, r.deadline])),
    role: await one(`SELECT "role"::text FROM "User" WHERE "id" = '${ID.responsable}'`),
    creatorRoles: await one(
      `SELECT "creatorRoles"::text FROM "Category" WHERE "kind" = 'COVERAGE'`,
    ),
    rolePermissions: await one(
      `SELECT string_agg("role"::text || ':' || "permission"::text, ',' ORDER BY 1) FROM "RolePermission"`,
    ),
    groups: await one(`SELECT string_agg("name", ',' ORDER BY "name") FROM "EmployeeGroup"`),
    usernames: await one(`SELECT string_agg("username", ',' ORDER BY "username") FROM "User"`),
    eventIds: (await db.query<{ id: string }>(`SELECT "id" FROM "RequestEvent"`)).map((r) => r.id),
    auditIds: (await db.query<{ id: string }>(`SELECT "id" FROM "AuditLog"`)).map((r) => r.id),
    settings: Number(await one(`SELECT count(*) FROM "Setting" WHERE "key" LIKE 'coverage%'`)),
  };
}

// ---------------------------------------------------------------------------

describe('Migrations 0008 et 0009 — affectations des surveillants', () => {
  jest.setTimeout(120_000);

  describe('montée puis retour arrière', () => {
    let db: MigrationDb;
    let before: Snapshot;

    beforeAll(async () => {
      db = await openDatabase('mig_0009_main');
      await seedBefore(db);
      before = await snapshot(db);
      db.migrate('0008_supervision_schema');
    });

    it('0008 est purement additive : aucune donnée modifiée', async () => {
      expect(await snapshot(db)).toEqual(before);
      const columns = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'CoverageDetail' ORDER BY 1`,
      );
      expect(columns.map((c) => c.column_name)).toEqual(
        expect.arrayContaining([
          'source',
          'type',
          'teacherId',
          'reason',
          'floorId',
          'mergedIntoId',
          'anonymizedAt',
        ]),
      );
      for (const table of [
        'Floor',
        'CoverageSupport',
        'CoverageMergeProposal',
        'CoverageReminder',
      ]) {
        expect(await db.query(`SELECT 1 FROM "${table}"`)).toEqual([]);
      }
    });

    it('0009 : gardes ouvertes « en attente », autres statuts inchangés (R1, FR-011c)', async () => {
      db.migrate('0009_supervision_data');
      const after = await snapshot(db);
      const expected = {
        ...before.statuses,
        [idOf('broadcast')]: 'PENDING',
        [idOf('unfilledFuture')]: 'PENDING',
      };
      expect(after.statuses).toEqual(expected);
      // L'étape TAKEOVER disparaît des gardes migrées ; les autres délais sont intacts.
      expect(after.deadlines[idOf('broadcast')]).toBe('f');
      expect(after.deadlines[idOf('unfilledFuture')]).toBe('f');
      expect(after.deadlines[idOf('unfilledPast')]).toBe(before.deadlines[idOf('unfilledPast')]);
    });

    it('0009 : un événement STATUS_CHANGED « migration-0009 » par garde modifiée, rien de supprimé', async () => {
      const events = await db.query<{
        requestId: string;
        actorId: string | null;
        fromValue: { status: string };
        toValue: { status: string };
      }>(
        `SELECT "requestId", "actorId", "fromValue", "toValue" FROM "RequestEvent"
         WHERE "type" = 'STATUS_CHANGED' AND "comment" = 'migration-0009' ORDER BY "requestId"`,
      );
      expect(
        events.map((e) => [e.requestId, e.actorId, e.fromValue.status, e.toValue.status]),
      ).toEqual([
        [idOf('broadcast'), null, 'BROADCAST', 'PENDING'],
        [idOf('unfilledFuture'), null, 'UNFILLED', 'PENDING'],
      ]);
      const after = await snapshot(db);
      expect(after.eventIds).toEqual(expect.arrayContaining(before.eventIds));
      expect(after.eventIds).toHaveLength(before.eventIds.length + 2);
      expect(after.auditIds).toEqual(expect.arrayContaining(before.auditIds));
    });

    it('0009 : échéance TAKEOVER pour chaque garde passée « en attente » (R3)', async () => {
      const reminders = await db.query<{ requestId: string; kind: string; late: boolean }>(
        `SELECT r."requestId", r."kind"::text AS kind,
                r."dueAt" >= GREATEST(now() - interval '1 minute', d."startAt" - interval '60 minutes') AS late
         FROM "CoverageReminder" r JOIN "CoverageDetail" d ON d."requestId" = r."requestId"
         ORDER BY r."requestId"`,
      );
      expect(reminders).toEqual([
        { requestId: idOf('broadcast'), kind: 'TAKEOVER', late: true },
        { requestId: idOf('unfilledFuture'), kind: 'TAKEOVER', late: true },
      ]);
    });

    it('0009 : source « affectation directe » sur toutes les gardes existantes, type inconnu, enseignant conservé', async () => {
      const rows = await db.query<{ source: string; type: string | null; absentTeacher: string }>(
        `SELECT "source"::text AS source, "type"::text AS type, "absentTeacher" FROM "CoverageDetail"`,
      );
      expect(rows).toHaveLength(COVERAGES.length);
      for (const row of rows)
        expect(row).toEqual({ source: 'ADMIN_DIRECT', type: null, absentTeacher: 'Mme Martin' });
    });

    it('0009 : rôle Admin, droits conservés (R8, FR-002)', async () => {
      const after = await snapshot(db);
      expect(after.role).toBe('ADMIN');
      expect(after.creatorRoles).toBe('{ADMIN}');
      expect(after.rolePermissions).toBe('ADMIN:REQUEST_REASSIGN');
      const managers = await db.query(
        `SELECT 1 FROM "CategoryManager" WHERE "userId" = '${ID.responsable}'`,
      );
      expect(managers).toHaveLength(1);
    });

    it('0009 : groupes à clé système, membres conservés (R7)', async () => {
      const groups = await db.query<{ name: string; systemKey: string; members: string | null }>(
        `SELECT g."name", g."systemKey"::text AS "systemKey",
                (SELECT string_agg(u."username", ',' ORDER BY u."username") FROM "EmployeeGroupMember" m
                 JOIN "User" u ON u."id" = m."userId" WHERE m."groupId" = g."id") AS members
         FROM "EmployeeGroup" g ORDER BY g."name"`,
      );
      expect(groups).toEqual([
        { name: 'Enseignants', systemKey: 'TEACHERS', members: null },
        { name: 'Surveillants', systemKey: 'SUPERVISORS', members: 'remplacant,surveillant' },
      ]);
    });

    it('0009 : compte de démonstration renommé, compte technique d’anonymisation, réglages', async () => {
      const users = await db.query<{ username: string; role: string; active: boolean }>(
        `SELECT "username", "role"::text AS role, "active" FROM "User" WHERE "username" IN ('admin', 'responsable', 'enseignant-anonymise') ORDER BY 1`,
      );
      expect(users).toEqual([
        { username: 'admin', role: 'ADMIN', active: true },
        { username: 'enseignant-anonymise', role: 'EMPLOYEE', active: false },
      ]);
      const settings = await db.query<{ key: string; value: unknown }>(
        `SELECT "key", "value" FROM "Setting" WHERE "key" LIKE 'coverage%' ORDER BY 1`,
      );
      expect(settings.map((s) => s.key)).toEqual(COVERAGE_SETTING_KEYS);
      expect(settings.find((s) => s.key === 'coverageRetentionMonths')?.value).toBe(12);
      expect(settings.find((s) => s.key === 'coverageMorningReminderTime')?.value).toBe('07:00');
    });

    it('0009/down.sql refuse tant qu’une affectation nouvelle existe', async () => {
      await db.sql(
        `UPDATE "CoverageDetail" SET "source" = 'TEACHER_REQUEST' WHERE "requestId" = '${idOf('accepted')}'`,
      );
      expect(db.down('0009_supervision_data')).toMatch(/affectations créées après la migration/);
      expect((await snapshot(db)).role).toBe('ADMIN');
      await db.sql(
        `UPDATE "CoverageDetail" SET "source" = 'ADMIN_DIRECT' WHERE "requestId" = '${idOf('accepted')}'`,
      );
    });

    it('0009/down.sql rétablit l’état initial en ajoutant des événements inverses', async () => {
      const beforeDown = await snapshot(db);
      expect(db.down('0009_supervision_data')).toBeNull();
      const restored = await snapshot(db);
      expect(restored.statuses).toEqual(before.statuses);
      expect(restored.deadlines).toEqual(before.deadlines);
      expect(restored.role).toBe('MANAGER');
      expect(restored.creatorRoles).toBe(before.creatorRoles);
      expect(restored.rolePermissions).toBe(before.rolePermissions);
      expect(restored.groups).toBe(before.groups);
      expect(restored.usernames).toBe(before.usernames);
      expect(restored.settings).toBe(0);
      expect(restored.eventIds).toEqual(expect.arrayContaining(beforeDown.eventIds));
      const inverse = await db.query(
        `SELECT 1 FROM "RequestEvent" WHERE "comment" = 'migration-0009-down'`,
      );
      expect(inverse).toHaveLength(2);
      expect(await db.query(`SELECT 1 FROM "CoverageReminder"`)).toEqual([]);
      expect(
        await db.query(
          `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '0009_supervision_data'`,
        ),
      ).toEqual([]);
    });

    it('0008/down.sql refuse si les nouvelles tables contiennent des données', async () => {
      await db.sql(
        `INSERT INTO "Floor" ("id", "name", "position", "updatedAt") VALUES (gen_random_uuid(), '1er étage', 1, now())`,
      );
      expect(db.down('0008_supervision_schema')).toMatch(/restaurez la sauvegarde/);
      await db.sql(`DELETE FROM "Floor"`);
    });

    it('0008/down.sql retire tables, colonnes et valeurs ; aucun événement supprimé', async () => {
      const beforeDown = await snapshot(db);
      expect(db.down('0008_supervision_schema')).toBeNull();
      const restored = await snapshot(db);
      expect(restored.statuses).toEqual(before.statuses);
      expect(restored.eventIds.sort()).toEqual(beforeDown.eventIds.sort());
      expect(restored.auditIds.sort()).toEqual(before.auditIds.sort());
      const tables = await db.query(
        `SELECT 1 FROM pg_tables WHERE tablename IN ('Floor', 'CoverageSupport', 'CoverageMergeProposal', 'CoverageReminder')`,
      );
      expect(tables).toEqual([]);
      const pending = await db.query(`SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                                      WHERE t.typname = 'RequestStatus' AND e.enumlabel = 'PENDING'`);
      expect(pending).toEqual([]);
      // Remonter à nouveau fonctionne (lignes _prisma_migrations retirées).
      db.migrate('0008_supervision_schema', '0009_supervision_data');
      expect((await snapshot(db)).role).toBe('ADMIN');
    });
  });

  describe('garde-fous de 0009', () => {
    it('refuse si une garde sans équivalent subsiste (V2) ; rien n’est modifié', async () => {
      const db = await openDatabase('mig_0009_guard');
      await seedBefore(db, {
        coverages: [
          { key: 'workStatus', status: 'SENT', start: 10, end: 70 },
          { key: 'unfilledOpenToday', status: 'UNFILLED', start: -10, end: null },
        ],
      });
      db.migrate('0008_supervision_schema');
      const before = await snapshot(db);
      expect(() => db.migrate('0009_supervision_data')).toThrow(/sans équivalent/);
      expect(await snapshot(db)).toEqual(before);
    });

    it('refuse si un groupe porte déjà un nom cible', async () => {
      const db = await openDatabase('mig_0009_groups');
      await seedBefore(db, { coverages: [] });
      await db.sql(
        `INSERT INTO "EmployeeGroup" ("id", "name", "updatedAt") VALUES (gen_random_uuid(), 'Enseignants', now())`,
      );
      db.migrate('0008_supervision_schema');
      expect(() => db.migrate('0009_supervision_data')).toThrow(/porte déjà le nom/);
      expect((await snapshot(db)).role).toBe('MANAGER');
    });

    it('ne renomme pas un compte « responsable » réel ni un identifiant « admin » déjà pris', async () => {
      const db = await openDatabase('mig_0009_accounts');
      await seedBefore(db, { coverages: [] });
      await db.sql(
        `UPDATE "User" SET "displayName" = 'Mme Dupont' WHERE "username" = 'responsable'`,
      );
      db.migrate('0008_supervision_schema', '0009_supervision_data');
      const users = await db.query<{ username: string }>(
        `SELECT "username" FROM "User" WHERE "id" = '${ID.responsable}'`,
      );
      expect(users).toEqual([{ username: 'responsable' }]);
    });
  });
});
