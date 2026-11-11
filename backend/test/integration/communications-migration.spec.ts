import { disposeMigrationDatabases, openDatabase, type MigrationDb } from '../utils/migration-db';

/**
 * Migrations 0025_communications_enums et 0026_communications_conversations (017) : chaque échange 015
 * enseignant ↔ représentant devient une archive en lecture seule (conversation LEGACY_TEACHER_PARENT
 * clôturée). Aucun message, version, événement, livraison ni notification n'est modifié ; seuls
 * conversationId et authorId sont ajoutés. La base refuse ensuite d'écrire dans une archive.
 */

const UP_TO_0024 = [
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
  '0024_two_priorities',
];
const ENUMS = '0025_communications_enums';
const CONVERSATIONS = '0026_communications_conversations';

const ID = {
  teacher: '00000000-0000-4000-8000-000000000011',
  parentUser: '00000000-0000-4000-8000-000000000012',
  admin: '00000000-0000-4000-8000-000000000013',
  klass: '00000000-0000-4000-8000-0000000000c1',
  s1: '00000000-0000-4000-8000-0000000000e1',
  s2: '00000000-0000-4000-8000-0000000000e2',
  g1: '00000000-0000-4000-8000-0000000000f1',
  g2: '00000000-0000-4000-8000-0000000000f2',
  voice: '00000000-0000-4000-8000-0000000000b1',
};
const msg = (n: number) => `00000000-0000-4000-9000-00000000000${n}`;

/** [id, trio, author, status, currentRevision, approvedRevision, createdAt] */
const MESSAGES: Array<[string, 'A' | 'B', 'TEACHER' | 'PARENT', string, number, number | null, string]> = [
  [msg(1), 'A', 'TEACHER', 'APPROVED', 1, 1, '2026-10-01T08:00:00.000Z'],
  [msg(2), 'A', 'PARENT', 'APPROVED', 1, 1, '2026-10-02T08:00:00.000Z'],
  [msg(3), 'A', 'TEACHER', 'PENDING_ADMIN_VALIDATION', 1, null, '2026-10-03T08:00:00.000Z'],
  [msg(4), 'A', 'TEACHER', 'DRAFT', 0, null, '2026-10-04T08:00:00.000Z'],
  [msg(5), 'B', 'TEACHER', 'RETURNED_FOR_CORRECTION', 1, null, '2026-10-05T08:00:00.000Z'],
  [msg(6), 'B', 'TEACHER', 'REJECTED', 1, null, '2026-10-06T08:00:00.000Z'],
  [msg(7), 'B', 'TEACHER', 'CANCELLED', 0, null, '2026-10-07T08:00:00.000Z'],
];
const TRIO = { A: { student: ID.s1, guardian: ID.g1 }, B: { student: ID.s2, guardian: ID.g2 } };

afterAll(disposeMigrationDatabases);

async function seed(db: MigrationDb): Promise<void> {
  await db.sql(`INSERT INTO "User" ("id", "username", "displayName", "role", "passwordHash", "updatedAt") VALUES
    ('${ID.teacher}', 'enseignante', 'Enseignante', 'EMPLOYEE', 'x', now()),
    ('${ID.parentUser}', 'parent', 'Parent', 'PARENT', 'x', now()),
    ('${ID.admin}', 'admin', 'Admin', 'ADMIN', 'x', now())`);
  await db.sql(`INSERT INTO "SchoolClass" ("id", "name", "updatedAt") VALUES ('${ID.klass}', '3A', now())`);
  await db.sql(`INSERT INTO "Student" ("id", "firstName", "lastName", "classId", "parentPhone", "mealService", "updatedAt") VALUES
    ('${ID.s1}', 'Lina', 'A', '${ID.klass}', '0600000000', 'CANTINE', now()),
    ('${ID.s2}', 'Omar', 'B', '${ID.klass}', '0600000001', 'PANIER', now())`);
  // g1 a un compte parent ; g2 n'en a pas (les messages du trio B sont tous de l'enseignante).
  await db.sql(`INSERT INTO "Guardian" ("id", "firstName", "lastName", "userId", "updatedAt") VALUES
    ('${ID.g1}', 'Mère', 'A', '${ID.parentUser}', now()),
    ('${ID.g2}', 'Père', 'B', NULL, now())`);
  await db.sql(`INSERT INTO "GuardianStudent" ("guardianId", "studentId") VALUES ('${ID.g1}', '${ID.s1}'), ('${ID.g2}', '${ID.s2}')`);
  await db.sql(`INSERT INTO "TeacherClass" ("teacherId", "classId") VALUES ('${ID.teacher}', '${ID.klass}')`);
  await db.sql(`INSERT INTO "File" ("id", "uploaderId", "kind", "mimeType", "originalName", "sizeBytes", "storagePath")
                VALUES ('${ID.voice}', '${ID.teacher}', 'VOICE', 'audio/webm', 'vocal.webm', 1000, 'voice/v1.webm')`);
  for (const [id, trio, author, status, current, approved, createdAt] of MESSAGES) {
    const { student, guardian } = TRIO[trio];
    await db.sql(`INSERT INTO "ParentCommunication" ("id", "teacherId", "studentId", "guardianId", "author", "status",
                    "draftText", "currentRevision", "approvedRevision", "version", "createdAt", "updatedAt")
                  VALUES ('${id}', '${ID.teacher}', '${student}', '${guardian}', '${author}', '${status}',
                    'brouillon ${id}', ${current}, ${approved ?? 'NULL'}, 2, '${createdAt}', '${createdAt}')`);
    if (current > 0) {
      await db.sql(`INSERT INTO "ParentCommunicationRevision" ("id", "communicationId", "number", "text", "voiceFileId")
                    VALUES (gen_random_uuid(), '${id}', 1, 'version ${id}', ${id === msg(1) ? `'${ID.voice}'` : 'NULL'})`);
    }
    await db.sql(`INSERT INTO "ParentCommunicationEvent" ("id", "communicationId", "type", "actorId", "revision")
                  VALUES (gen_random_uuid(), '${id}', 'CREATED', '${ID.teacher}', NULL)`);
  }
  await db.sql(`INSERT INTO "ParentCommunicationDelivery" ("id", "communicationId", "channel", "status", "updatedAt")
                VALUES (gen_random_uuid(), '${msg(1)}', 'EMAIL', 'SENT', now())`);
  await db.sql(`INSERT INTO "Notification" ("id", "userId", "type", "communicationId", "priority")
                VALUES (gen_random_uuid(), '${ID.parentUser}', 'PARENT_MESSAGE_NEW', '${msg(1)}', 'NORMAL')`);
}

/** Lignes 015 sous forme comparable (sans les colonnes ajoutées par 017). */
const snapshot = async (db: MigrationDb) => ({
  messages: await db.query(
    `SELECT "id"::text, "teacherId"::text, "studentId"::text, "guardianId"::text, "author"::text, "status"::text,
            "draftText", "draftVoiceFileId"::text, "currentRevision", "approvedRevision", "version", "readAt",
            "createdAt", "updatedAt"
     FROM "ParentCommunication" ORDER BY "id"`,
  ),
  revisions: await db.query(
    `SELECT "id"::text, "communicationId"::text, "number", "text", "voiceFileId"::text, "createdAt" FROM "ParentCommunicationRevision" ORDER BY "id"`,
  ),
  events: await db.query(
    `SELECT "id"::text, "communicationId"::text, "type"::text, "actorId"::text, "createdAt" FROM "ParentCommunicationEvent" ORDER BY "id"`,
  ),
  deliveries: await db.query(
    `SELECT "id"::text, "communicationId"::text, "channel"::text, "status"::text FROM "ParentCommunicationDelivery" ORDER BY "id"`,
  ),
  notifications: await db.query(
    `SELECT "id"::text, "userId"::text, "type"::text, "communicationId"::text FROM "Notification" ORDER BY "id"`,
  ),
});

const conversations = (db: MigrationDb) =>
  db.query<{
    id: string;
    type: string;
    status: string;
    teacherId: string | null;
    studentId: string;
    guardianId: string | null;
    closed: boolean;
    closedById: string | null;
    createdAt: Date;
  }>(
    `SELECT "id"::text, "type"::text, "status"::text, "teacherId"::text, "studentId"::text, "guardianId"::text,
            "closedAt" IS NOT NULL AS closed, "closedById"::text, "createdAt"
     FROM "Conversation" ORDER BY "studentId"`,
  );

const enumValues = async (db: MigrationDb, type: string) =>
  (
    await db.query<{ v: string }>(
      `SELECT e."enumlabel" AS v FROM pg_enum e JOIN pg_type t ON t."oid" = e."enumtypid"
       WHERE t."typname" = '${type}' ORDER BY e."enumsortorder"`,
    )
  ).map((r) => r.v);

const tableExists = async (db: MigrationDb, table: string) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_tables WHERE tablename = '${table}'`))[0].n === 1;

const tracked = async (db: MigrationDb, name: string) =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE "migration_name" = '${name}'`))[0].n;

/** Résultat d'une instruction : null si elle passe, le message d'erreur sinon. */
async function attempt(db: MigrationDb, text: string): Promise<string | null> {
  try {
    await db.sql(text);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

const NEW_INTERNAL = '00000000-0000-4000-a000-000000000001';

describe('Migrations 0025_communications_enums et 0026_communications_conversations', () => {
  let db: MigrationDb;
  let before: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    db = await openDatabase('mig_0026');
    db.migrate(...UP_TO_0024);
    await seed(db);
    before = await snapshot(db);
    db.migrate(ENUMS, CONVERSATIONS);
  });

  it('ajoute les valeurs d’énumération de 017', async () => {
    expect(await enumValues(db, 'ConversationType')).toEqual(['INTERNAL', 'PARENT', 'LEGACY_TEACHER_PARENT']);
    expect(await enumValues(db, 'ConversationStatus')).toEqual(['OPEN', 'CLOSED']);
    expect(await enumValues(db, 'ParentCommunicationAuthor')).toEqual(['TEACHER', 'PARENT', 'ADMIN']);
    expect(await enumValues(db, 'ParentCommunicationStatus')).toContain('SENT');
    expect(await enumValues(db, 'ParentCommunicationEventType')).toContain('SENT');
    expect(await enumValues(db, 'Permission')).toEqual(
      expect.arrayContaining(['PARENT_COMMUNICATION_VALIDATE', 'PARENT_COMM_SEND_DIRECT', 'PARENT_COMM_SUBMIT_FOR_APPROVAL']),
    );
    expect(await enumValues(db, 'NotificationType')).toEqual(
      expect.arrayContaining(['COMM_INTERNAL_NEW', 'COMM_ADMIN_REPLY', 'COMM_PARENT_NEW']),
    );
    expect(await enumValues(db, 'AuditAction')).toContain('COMMUNICATION_CONVERSATION_CHANGED');
  });

  it('accorde la soumission pour validation au rôle ADMIN, sans l’envoi direct', async () => {
    const rows = await db.query<{ permission: string }>(
      `SELECT "permission"::text AS permission FROM "RolePermission" WHERE "role" = 'ADMIN'`,
    );
    const permissions = rows.map((r) => r.permission);
    expect(permissions).toContain('PARENT_COMM_SUBMIT_FOR_APPROVAL');
    expect(permissions).toContain('PARENT_COMMUNICATION_VALIDATE');
    expect(permissions).not.toContain('PARENT_COMM_SEND_DIRECT');
  });

  it('une archive clôturée par trio (enseignant, élève, représentant)', async () => {
    const rows = await conversations(db);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.type, r.status, r.teacherId, r.studentId, r.guardianId, r.closed, r.closedById])).toEqual([
      ['LEGACY_TEACHER_PARENT', 'CLOSED', ID.teacher, ID.s1, ID.g1, true, null],
      ['LEGACY_TEACHER_PARENT', 'CLOSED', ID.teacher, ID.s2, ID.g2, true, null],
    ]);
    // Date de création = premier message du trio.
    expect(rows[0].createdAt.toISOString()).toBe('2026-10-01T08:00:00.000Z');
    expect(rows[1].createdAt.toISOString()).toBe('2026-10-05T08:00:00.000Z');
  });

  it('chaque message est rattaché à l’archive de son trio, auteur renseigné', async () => {
    const rows = await db.query<{ id: string; studentId: string; convStudent: string; authorId: string | null }>(
      `SELECT m."id"::text, m."studentId"::text AS "studentId", c."studentId"::text AS "convStudent", m."authorId"::text AS "authorId"
       FROM "ParentCommunication" m JOIN "Conversation" c ON c."id" = m."conversationId" ORDER BY m."id"`,
    );
    expect(rows).toHaveLength(MESSAGES.length);
    for (const row of rows) expect(row.convStudent).toBe(row.studentId);
    const author = Object.fromEntries(rows.map((r) => [r.id, r.authorId]));
    expect(author[msg(1)]).toBe(ID.teacher);
    expect(author[msg(2)]).toBe(ID.parentUser);
    expect(author[msg(5)]).toBe(ID.teacher);
  });

  it('les données 015 sont identiques (messages, versions, événements, livraisons, notifications)', async () => {
    expect(await snapshot(db)).toEqual(before);
  });

  it('conversationId est obligatoire', async () => {
    expect(
      await attempt(db, `UPDATE "ParentCommunication" SET "conversationId" = NULL WHERE "id" = '${msg(1)}'`),
    ).toMatch(/null/i);
  });

  it('la base refuse d’écrire dans une archive et de la modifier', async () => {
    const archive = (await conversations(db))[0].id;
    expect(
      await attempt(
        db,
        `INSERT INTO "ParentCommunication" ("id", "conversationId", "author", "status", "currentRevision", "version", "updatedAt")
         VALUES (gen_random_uuid(), '${archive}', 'ADMIN', 'SENT', 1, 0, now())`,
      ),
    ).not.toBeNull();
    expect(await attempt(db, `UPDATE "Conversation" SET "status" = 'OPEN', "closedAt" = NULL WHERE "id" = '${archive}'`)).not.toBeNull();
    expect(await attempt(db, `UPDATE "Conversation" SET "responsibleAdminId" = '${ID.admin}' WHERE "id" = '${archive}'`)).not.toBeNull();
  });

  it('impose les participants selon le type', async () => {
    const insert = (type: string, teacher: string | null, guardian: string | null) =>
      attempt(
        db,
        `INSERT INTO "Conversation" ("id", "type", "studentId", "teacherId", "guardianId", "updatedAt")
         VALUES (gen_random_uuid(), '${type}', '${ID.s1}', ${teacher ? `'${teacher}'` : 'NULL'}, ${guardian ? `'${guardian}'` : 'NULL'}, now())`,
      );
    expect(await insert('INTERNAL', ID.teacher, ID.g1)).toMatch(/Conversation_participants_check/);
    expect(await insert('INTERNAL', null, null)).toMatch(/Conversation_participants_check/);
    expect(await insert('PARENT', ID.teacher, ID.g1)).toMatch(/Conversation_participants_check/);
    expect(await insert('PARENT', null, null)).toMatch(/Conversation_participants_check/);
    expect(await insert('INTERNAL', ID.teacher, null)).toBeNull();
    expect(await insert('PARENT', null, ID.g1)).toBeNull();
  });

  it('une conversation clôturée a une date de clôture, et inversement', async () => {
    expect(
      await attempt(
        db,
        `INSERT INTO "Conversation" ("id", "type", "studentId", "teacherId", "status", "updatedAt")
         VALUES (gen_random_uuid(), 'INTERNAL', '${ID.s1}', '${ID.teacher}', 'CLOSED', now())`,
      ),
    ).toMatch(/Conversation_closed_check/);
  });

  it('le lien vers une conversation interne : seulement depuis une conversation parent, même élève, cible interne', async () => {
    await db.sql(`INSERT INTO "Conversation" ("id", "type", "studentId", "teacherId", "updatedAt")
                  VALUES ('${NEW_INTERNAL}', 'INTERNAL', '${ID.s1}', '${ID.teacher}', now())`);
    const parent = (target: string, student: string, type = 'PARENT') =>
      attempt(
        db,
        `INSERT INTO "Conversation" ("id", "type", "studentId", "teacherId", "guardianId", "linkedInternalId", "updatedAt")
         VALUES (gen_random_uuid(), '${type}', '${student}', ${type === 'INTERNAL' ? `'${ID.teacher}'` : 'NULL'},
                 ${type === 'PARENT' ? `'${ID.g1}'` : 'NULL'}, '${target}', now())`,
      );
    expect(await parent(NEW_INTERNAL, ID.s1, 'INTERNAL')).toMatch(/Conversation_link_check/);
    expect(await parent(NEW_INTERNAL, ID.s2)).not.toBeNull();
    const archive = (await conversations(db))[0].id;
    expect(await parent(archive, ID.s1)).not.toBeNull();
    expect(await parent(NEW_INTERNAL, ID.s1)).toBeNull();
  });

  it('un message SENT a au moins une version ; une conversation clôturée refuse les messages', async () => {
    expect(
      await attempt(
        db,
        `INSERT INTO "ParentCommunication" ("id", "conversationId", "author", "authorId", "status", "currentRevision", "version", "updatedAt")
         VALUES (gen_random_uuid(), '${NEW_INTERNAL}', 'TEACHER', '${ID.teacher}', 'SENT', 0, 0, now())`,
      ),
    ).toMatch(/ParentCommunication_sent_check/);
    expect(
      await attempt(
        db,
        `INSERT INTO "ParentCommunication" ("id", "conversationId", "author", "authorId", "status", "currentRevision", "version", "updatedAt")
         VALUES (gen_random_uuid(), '${NEW_INTERNAL}', 'TEACHER', '${ID.teacher}', 'SENT', 1, 0, now())`,
      ),
    ).toBeNull();
    await db.sql(`UPDATE "Conversation" SET "status" = 'CLOSED', "closedAt" = now() WHERE "id" = '${NEW_INTERNAL}'`);
    expect(
      await attempt(
        db,
        `INSERT INTO "ParentCommunication" ("id", "conversationId", "author", "authorId", "status", "currentRevision", "version", "updatedAt")
         VALUES (gen_random_uuid(), '${NEW_INTERNAL}', 'ADMIN', '${ID.admin}', 'SENT', 1, 0, now())`,
      ),
    ).not.toBeNull();
  });

  it('le type, l’élève et les participants d’une conversation ne changent jamais', async () => {
    expect(await attempt(db, `UPDATE "Conversation" SET "type" = 'PARENT' WHERE "id" = '${NEW_INTERNAL}'`)).not.toBeNull();
    expect(await attempt(db, `UPDATE "Conversation" SET "studentId" = '${ID.s2}' WHERE "id" = '${NEW_INTERNAL}'`)).not.toBeNull();
    expect(await attempt(db, `UPDATE "Conversation" SET "teacherId" = '${ID.admin}' WHERE "id" = '${NEW_INTERNAL}'`)).not.toBeNull();
    // Réouverture et prise en charge restent possibles hors archive.
    expect(
      await attempt(db, `UPDATE "Conversation" SET "status" = 'OPEN', "closedAt" = NULL, "responsibleAdminId" = '${ID.admin}' WHERE "id" = '${NEW_INTERNAL}'`),
    ).toBeNull();
  });

  describe('down.sql', () => {
    it('refuse le retour arrière tant qu’une conversation 017 existe (restaurer la sauvegarde)', async () => {
      expect(db.down(CONVERSATIONS)).toMatch(/017/);
      expect(await tableExists(db, 'Conversation')).toBe(true);
    });

    it('sans conversation 017, rétablit exactement l’état 015, puis la migration se réapplique', async () => {
      await db.sql(`DELETE FROM "ParentCommunication" WHERE "conversationId" IN
                      (SELECT "id" FROM "Conversation" WHERE "type" <> 'LEGACY_TEACHER_PARENT')`);
      await db.sql(`DELETE FROM "Conversation" WHERE "type" <> 'LEGACY_TEACHER_PARENT'`);
      expect(db.down(CONVERSATIONS)).toBeNull();
      expect(db.down(ENUMS)).toBeNull();

      expect(await tableExists(db, 'Conversation')).toBe(false);
      expect(await snapshot(db)).toEqual(before);
      expect(await tracked(db, CONVERSATIONS)).toBe(0);
      expect(await tracked(db, ENUMS)).toBe(0);
      const admin = await db.query<{ permission: string }>(
        `SELECT "permission"::text AS permission FROM "RolePermission" WHERE "role" = 'ADMIN'`,
      );
      expect(admin.map((r) => r.permission)).not.toContain('PARENT_COMM_SUBMIT_FOR_APPROVAL');
      // 015 refuse à nouveau un message sans enseignant.
      expect(
        await attempt(db, `UPDATE "ParentCommunication" SET "teacherId" = NULL WHERE "id" = '${msg(1)}'`),
      ).toMatch(/null/i);

      db.migrate(ENUMS, CONVERSATIONS);
      expect(await conversations(db)).toHaveLength(2);
      expect(await snapshot(db)).toEqual(before);
    });
  });
});

describe('Migration 0027_communications_voice_only', () => {
  const VOICE_ONLY = '0027_communications_voice_only';
  let db: MigrationDb;
  let conversation: string;
  const message = '00000000-0000-4000-a000-0000000000a1';

  beforeAll(async () => {
    db = await openDatabase('mig_0027');
    db.migrate(...UP_TO_0024);
    await seed(db);
    db.migrate(ENUMS, CONVERSATIONS);
    conversation = '00000000-0000-4000-a000-0000000000c1';
    await db.sql(`INSERT INTO "Conversation" ("id", "type", "studentId", "teacherId", "updatedAt")
                  VALUES ('${conversation}', 'INTERNAL', '${ID.s1}', '${ID.teacher}', now())`);
    await db.sql(`INSERT INTO "ParentCommunication" ("id", "conversationId", "author", "authorId", "status", "currentRevision", "version", "updatedAt")
                  VALUES ('${message}', '${conversation}', 'TEACHER', '${ID.teacher}', 'SENT', 1, 0, now())`);
    db.migrate(VOICE_ONLY);
  });

  const revision = (text: string | null, voice: string | null, number: number) =>
    attempt(
      db,
      `INSERT INTO "ParentCommunicationRevision" ("id", "communicationId", "number", "text", "voiceFileId")
       VALUES (gen_random_uuid(), '${message}', ${number}, ${text === null ? 'NULL' : `'${text}'`}, ${voice ? `'${voice}'` : 'NULL'})`,
    );

  it('une version peut être un vocal seul (FR-007)', async () => {
    expect(await revision(null, ID.voice, 1)).toBeNull();
  });

  it('une version sans texte ni vocal est refusée par la base', async () => {
    expect(await revision(null, null, 2)).toMatch(/ParentCommunicationRevision_content_check/);
    expect(await revision('   ', null, 2)).toMatch(/ParentCommunicationRevision_content_check/);
    expect(await revision('Bonjour', null, 2)).toBeNull();
  });

  it('down.sql est refusé tant qu’une version sans texte existe', async () => {
    expect(db.down(VOICE_ONLY)).toMatch(/0027/);
  });
});
