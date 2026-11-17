import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BEFORE, disposeMigrationDatabases, openDatabase, type MigrationDb } from '../utils/migration-db';

/**
 * T003 — Migration 0029_request_admin_owner_transfers (018, data-model.md) : responsable administratif
 * d'une demande, historique en ajout seul, propositions de transfert. Migration additive : aucune ligne
 * existante n'est réécrite ; down.sql retire tout ce qu'elle a créé.
 */

const MIGRATION = '0029_request_admin_owner_transfers';
const MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'prisma', 'migrations');
/** Toutes les migrations entre l'état ouvert par openDatabase (0007) et 0029. */
const UP_TO_0028 = readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d{4}_/.test(name) && !BEFORE.includes(name) && name < MIGRATION)
  .sort();

const ID = {
  teacher: '00000000-0000-4000-8000-000000000011',
  adminA: '00000000-0000-4000-8000-000000000021',
  adminB: '00000000-0000-4000-8000-000000000022',
  category: '00000000-0000-4000-8000-0000000000a1',
  pending: '00000000-0000-4000-9000-000000000001',
  sent: '00000000-0000-4000-9000-000000000002',
};

afterAll(disposeMigrationDatabases);

async function seed(db: MigrationDb): Promise<void> {
  const users: Array<[string, string, string]> = [
    [ID.teacher, 'enseignante', 'EMPLOYEE'],
    [ID.adminA, 'admin', 'ADMIN'],
    [ID.adminB, 'admin2', 'ADMIN'],
  ];
  for (const [id, username, role] of users) {
    await db.sql(`INSERT INTO "User" ("id", "username", "displayName", "role", "passwordHash", "updatedAt")
                  VALUES ('${id}', '${username}', '${username}', '${role}', 'x', now())`);
  }
  await db.sql(`INSERT INTO "Category" ("id", "name", "circuit", "routingMode", "creatorRoles", "closureMode", "kind", "updatedAt")
                VALUES ('${ID.category}', 'Intervention', 'B_ADMIN_VALIDATION', 'VIA_ADMIN', ARRAY['EMPLOYEE']::"Role"[], 'MANAGER', 'WORK', now())`);
  const requests: Array<[string, string]> = [
    [ID.pending, 'PENDING_ADMIN_VALIDATION'],
    [ID.sent, 'SENT'],
  ];
  for (const [index, [id, status]] of requests.entries()) {
    await db.sql(`INSERT INTO "Request" ("id", "kind", "reference", "clientId", "title", "categoryId", "priority",
                    "requesterId", "status", "version", "rulesSnapshot", "updatedAt")
                  VALUES ('${id}', 'WORK', 'D-${index + 1}', gen_random_uuid(), 'Demande ${status}', '${ID.category}', 'NORMAL',
                    '${ID.teacher}', '${status}', 3, '{}'::jsonb, now())`);
  }
}

const transfer = (
  db: MigrationDb,
  over: Partial<{ id: string; requestId: string; initiatorId: string; recipientId: string; currentOwnerId: string; type: string; status: string }> = {},
) => {
  const row = {
    id: 'gen_random_uuid()',
    requestId: ID.pending,
    initiatorId: ID.adminA,
    recipientId: ID.adminB,
    currentOwnerId: ID.adminA,
    type: 'DELEGATION_REQUEST',
    status: 'PENDING',
    ...over,
  };
  return db.sql(`INSERT INTO "RequestTransfer" ("id", "requestId", "initiatorId", "recipientId", "currentOwnerId", "type", "status", "reason", "expiresAt")
                 VALUES (${row.id === 'gen_random_uuid()' ? row.id : `'${row.id}'`}, '${row.requestId}', '${row.initiatorId}', '${row.recipientId}',
                         '${row.currentOwnerId}', '${row.type}', '${row.status}', 'Surcharge', now() + interval '2 hours')`);
};

const assignment = (db: MigrationDb) =>
  db.sql(`INSERT INTO "RequestAssignment" ("id", "requestId", "adminId", "actorId", "operation")
          VALUES (gen_random_uuid(), '${ID.pending}', '${ID.adminA}', '${ID.adminA}', 'CLAIMED')`);

const columns = async (db: MigrationDb, table: string) =>
  (await db.query<{ c: string }>(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = '${table}'`)).map((r) => r.c);

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

describe('Migration 0029_request_admin_owner_transfers', () => {
  let db: MigrationDb;

  beforeAll(async () => {
    db = await openDatabase('mig_0029');
    db.migrate(...UP_TO_0028);
    await seed(db);
    db.migrate(MIGRATION);
  }, 120_000);

  it('les demandes existantes sont intactes et libres (aucun responsable, version inchangée)', async () => {
    const rows = await db.query<{ id: string; owner: string | null; at: string | null; version: number; status: string }>(
      `SELECT "id"::text AS id, "adminOwnerId"::text AS owner, "adminOwnedAt"::text AS at, "version", "status"::text AS status
       FROM "Request" ORDER BY "id"`,
    );
    expect(rows).toEqual([
      { id: ID.pending, owner: null, at: null, version: 3, status: 'PENDING_ADMIN_VALIDATION' },
      { id: ID.sent, owner: null, at: null, version: 3, status: 'SENT' },
    ]);
  });

  it('responsable et date vont ensemble (CHECK)', async () => {
    await expect(db.sql(`UPDATE "Request" SET "adminOwnerId" = '${ID.adminA}' WHERE "id" = '${ID.pending}'`)).rejects.toThrow(/Request_admin_owner_pair/);
    await expect(db.sql(`UPDATE "Request" SET "adminOwnedAt" = now() WHERE "id" = '${ID.pending}'`)).rejects.toThrow(/Request_admin_owner_pair/);
    await expect(db.sql(`UPDATE "Request" SET "adminOwnerId" = '${ID.adminA}', "adminOwnedAt" = now() WHERE "id" = '${ID.sent}'`)).resolves.toBe(1);
  });

  it('le responsable doit être un compte existant, et un compte responsable ne peut pas être supprimé', async () => {
    await expect(
      db.sql(`UPDATE "Request" SET "adminOwnerId" = gen_random_uuid(), "adminOwnedAt" = now() WHERE "id" = '${ID.pending}'`),
    ).rejects.toThrow(/Request_adminOwnerId_fkey/);
    await expect(db.sql(`DELETE FROM "User" WHERE "id" = '${ID.adminA}'`)).rejects.toThrow();
  });

  it('l’historique des responsables est en ajout seul : UPDATE, DELETE et TRUNCATE refusés', async () => {
    await expect(assignment(db)).resolves.toBe(1);
    await expect(db.sql(`UPDATE "RequestAssignment" SET "reason" = 'réécrit'`)).rejects.toThrow(/ajout seul/);
    await expect(db.sql(`DELETE FROM "RequestAssignment"`)).rejects.toThrow(/ajout seul/);
    await expect(db.sql(`TRUNCATE "RequestAssignment"`)).rejects.toThrow(/ajout seul/);
    expect(await enumLabels(db, 'RequestAssignmentOperation')).toEqual(['CLAIMED', 'REASSIGNED', 'RELEASED', 'TRANSFERRED']);
  });

  it('une seule proposition PENDING par demande ; les propositions closes ne comptent pas', async () => {
    await expect(transfer(db)).resolves.toBe(1);
    // Violation d'unicité (23505) : seul l'index partiel porte sur "requestId".
    await expect(transfer(db)).rejects.toThrow(/23505[\s\S]*requestId/);
    await expect(
      db.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'RequestTransfer_one_pending'`),
    ).resolves.toEqual([{ indexdef: expect.stringMatching(/UNIQUE INDEX.*"requestId".*WHERE.*PENDING/) }]);
    await expect(transfer(db, { status: 'REJECTED' })).resolves.toBe(1);
    await expect(transfer(db, { status: 'EXPIRED' })).resolves.toBe(1);
    // Une autre demande peut avoir sa propre proposition en attente.
    await expect(transfer(db, { requestId: ID.sent })).resolves.toBe(1);
    await db.sql(`UPDATE "RequestTransfer" SET "status" = 'CANCELLED', "cancelCause" = 'INITIATOR', "cancelledAt" = now() WHERE "status" = 'PENDING'`);
    await expect(transfer(db)).resolves.toBe(1);
    await db.sql(`UPDATE "RequestTransfer" SET "status" = 'ACCEPTED', "respondedAt" = now() WHERE "status" = 'PENDING'`);
  });

  it('jamais de proposition à soi-même', async () => {
    await expect(transfer(db, { recipientId: ID.adminA })).rejects.toThrow(/RequestTransfer_not_self/);
  });

  it('cohérence type ↔ responsable : la délégation vient du responsable, la reprise lui est adressée', async () => {
    await expect(transfer(db, { type: 'DELEGATION_REQUEST', initiatorId: ID.adminB, recipientId: ID.adminA, currentOwnerId: ID.adminA })).rejects.toThrow(
      /RequestTransfer_type_owner/,
    );
    await expect(transfer(db, { type: 'TAKEOVER_REQUEST', initiatorId: ID.adminA, recipientId: ID.adminB, currentOwnerId: ID.adminA })).rejects.toThrow(
      /RequestTransfer_type_owner/,
    );
    await expect(transfer(db, { type: 'TAKEOVER_REQUEST', initiatorId: ID.adminB, recipientId: ID.adminA, currentOwnerId: ID.adminA })).resolves.toBe(1);
    await db.sql(`UPDATE "RequestTransfer" SET "status" = 'REJECTED', "respondedAt" = now() WHERE "status" = 'PENDING'`);
  });

  it('énumérations des propositions et nouvelles notifications', async () => {
    expect(await enumLabels(db, 'RequestTransferType')).toEqual(['TAKEOVER_REQUEST', 'DELEGATION_REQUEST']);
    expect(await enumLabels(db, 'RequestTransferStatus')).toEqual(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED']);
    expect(await enumLabels(db, 'RequestTransferCancelCause')).toEqual([
      'INITIATOR',
      'REQUEST_FINISHED',
      'OWNER_CHANGED',
      'REASSIGNED_BY_SUPER_ADMIN',
      'PARTICIPANT_UNAVAILABLE',
    ]);
    expect(await enumLabels(db, 'NotificationType')).toEqual(
      expect.arrayContaining([
        'TRANSFER_TAKEOVER_REQUESTED',
        'TRANSFER_DELEGATION_REQUESTED',
        'TRANSFER_ACCEPTED',
        'TRANSFER_REJECTED',
        'TRANSFER_CANCELLED',
        'TRANSFER_EXPIRED',
        'ADMIN_OWNER_REASSIGNED',
      ]),
    );
  });

  it('down.sql retire tables, colonnes et types ; les demandes restent, la migration peut être réappliquée', async () => {
    await db.sql(`INSERT INTO "Notification" ("id", "userId", "type", "requestId", "priority")
                  VALUES (gen_random_uuid(), '${ID.adminA}', 'TRANSFER_ACCEPTED', '${ID.pending}', 'NORMAL'),
                         (gen_random_uuid(), '${ID.adminA}', 'STATUS_CHANGED', '${ID.pending}', 'NORMAL')`);
    expect(db.down(MIGRATION)).toBeNull();

    expect(await tables(db)).not.toEqual(expect.arrayContaining(['RequestAssignment']));
    expect(await tables(db)).not.toEqual(expect.arrayContaining(['RequestTransfer']));
    const requestColumns = await columns(db, 'Request');
    expect(requestColumns).not.toContain('adminOwnerId');
    expect(requestColumns).not.toContain('adminOwnedAt');
    for (const type of ['RequestAssignmentOperation', 'RequestTransferType', 'RequestTransferStatus', 'RequestTransferCancelCause']) {
      expect(await enumLabels(db, type)).toEqual([]);
    }
    await expect(db.query(`SELECT count(*)::int AS n FROM "Request"`)).resolves.toEqual([{ n: 2 }]);
    // Les notifications des nouveaux types sont retirées, les autres conservées.
    await expect(db.query(`SELECT "type"::text AS type FROM "Notification"`)).resolves.toEqual([{ type: 'STATUS_CHANGED' }]);
    // Le type des notifications retrouve ses 43 valeurs d'avant la migration.
    const types = await enumLabels(db, 'NotificationType');
    expect(types).toHaveLength(43);
    expect(types.filter((t) => t.startsWith('TRANSFER_') || t === 'ADMIN_OWNER_REASSIGNED')).toEqual([]);
    expect(await tracked(db)).toBe(0);

    db.migrate(MIGRATION);
    expect(await tracked(db)).toBe(1);
    expect(await columns(db, 'Request')).toContain('adminOwnerId');
  }, 120_000);
});

// Garde-fou : la liste des migrations intermédiaires ne doit pas se vider sans prévenir.
it('applique bien les migrations 0008 à 0028 avant 0029', () => {
  expect(UP_TO_0028[0]).toBe('0008_supervision_schema');
  expect(UP_TO_0028).toHaveLength(21);
  expect(readdirSync(join(MIGRATIONS_DIR, MIGRATION))).toEqual(expect.arrayContaining(['migration.sql', 'down.sql']));
});
