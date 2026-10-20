import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Bases de test arrêtées à une migration donnée (004) : chaque base est créée sur le PostgreSQL
 * embarqué des tests ; la base `app_test` (déjà migrée) sert seulement à les créer et les supprimer.
 * Utilisé par migration-0009.spec.ts et supervision-preflight.spec.ts.
 */

const BACKEND_DIR = resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = join(BACKEND_DIR, 'prisma', 'migrations');
const PRISMA_CLI = require.resolve('prisma/build/index.js', { paths: [BACKEND_DIR] });
export const BEFORE = [
  '0001_init',
  '0002_coverage',
  '0003_request_event_seq',
  '0004_superadmin_notifications',
  '0005_routing_mode',
  '0006_request_event_dashboard_indexes',
  '0007_audit_request_actions',
];

export interface MigrationDb {
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

/** Ferme et supprime les bases ouvertes par le fichier de test (à appeler dans afterAll). */
export async function disposeMigrationDatabases(): Promise<void> {
  for (const db of opened.splice(0)) await db.dispose();
  await admin.$disconnect();
}

function prisma(args: string[], url: string): void {
  execFileSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

export async function openDatabase(name: string): Promise<MigrationDb> {
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

// ---------------------------------------------------------------------------
// Jeu de données à l'état 0007 (SQL brut : le client Prisma suit le nouveau schéma).
// ---------------------------------------------------------------------------

export const ID = {
  superadmin: '00000000-0000-4000-8000-000000000001',
  responsable: '00000000-0000-4000-8000-000000000002',
  sv1: '00000000-0000-4000-8000-000000000003',
  sv2: '00000000-0000-4000-8000-000000000004',
  enseignante: '00000000-0000-4000-8000-000000000005',
  classA: '00000000-0000-4000-8000-0000000000c1',
};

/** Gardes : statut, début et fin relatifs à maintenant (minutes), preneur. */
export const COVERAGES: Array<{
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

export const reqId = (index: number) =>
  `00000000-0000-4000-9000-${String(index + 1).padStart(12, '0')}`;
export const idOf = (key: string) => reqId(COVERAGES.findIndex((c) => c.key === key));

export async function seedBefore(
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
