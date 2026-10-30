import { PrismaClient } from '@prisma/client';
import { rm } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute } from 'node:path';

/**
 * Remise à zéro de la base LOCALE de développement avant le jeu de démonstration : contrôle de la
 * cible, sauvegarde complète (copie de la base sur le même serveur), puis purge des données métier
 * en une transaction. Schéma, historique des migrations, réglages et permissions par rôle sont
 * conservés. Jamais `prisma migrate reset`.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const LOCAL_PORT = '5433';
const LOCAL_DATABASE = 'app';

export interface DatabaseTarget {
  host: string;
  port: string;
  database: string;
}

/** Refuse toute base qui n'est pas la base locale de développement (localhost:5433/app, hors production). */
export function assertLocalDevelopmentDatabase(url: string | undefined, env: NodeJS.ProcessEnv = process.env): DatabaseTarget {
  if (env.NODE_ENV === 'production') throw new Error('Refusé : NODE_ENV=production.');
  if (!url) throw new Error('Refusé : DATABASE_URL absente.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Refusé : DATABASE_URL illisible.');
  }
  const target = { host: parsed.hostname, port: parsed.port || '5432', database: parsed.pathname.replace(/^\//, '') };
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !LOCAL_HOSTS.has(target.host) || target.port !== LOCAL_PORT || target.database !== LOCAL_DATABASE) {
    throw new Error(
      `Refusé : la cible ${target.host}:${target.port}/${target.database} n'est pas la base locale de développement (localhost:${LOCAL_PORT}/${LOCAL_DATABASE}).`,
    );
  }
  return target;
}

/** « app_backup_20261030_0215 » (heure locale de la machine). */
export function backupName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${LOCAL_DATABASE}_backup_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
}

/**
 * Copie complète de la base (données, séquences, triggers) dans une nouvelle base du même serveur.
 * PostgreSQL exige qu'aucune session ne soit ouverte sur la base copiée : les sessions du serveur
 * de développement sont fermées (elles se reconnectent seules). Restauration : renommer la copie
 * en `app` (voir le rapport affiché).
 */
export async function backupDatabase(url: string, now = new Date(), log: (message: string) => void = console.log): Promise<string> {
  assertLocalDevelopmentDatabase(url);
  const name = backupName(now);
  const admin = new PrismaClient({ datasources: { db: { url: url.replace(/\/app(\?|$)/, '/postgres$1') } } });
  try {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await admin.$executeRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${LOCAL_DATABASE}' AND pid <> pg_backend_pid()`);
      try {
        await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${LOCAL_DATABASE}"`);
        log(`Sauvegarde créée : base « ${name} » (serveur localhost:${LOCAL_PORT}).`);
        return name;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === 5 || !/being accessed by other users/i.test(message)) throw error;
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
    throw new Error('Sauvegarde impossible.');
  } finally {
    await admin.$disconnect();
  }
}

/** Requêtes de purge, dans l'ordre des dépendances (clés étrangères). */
export const PURGE_STATEMENTS: readonly string[] = [
  'UPDATE "Request" SET "voiceFileId" = NULL',
  'UPDATE "Message" SET "voiceFileId" = NULL',
  'DELETE FROM "Notification"',
  'DELETE FROM "CoverageReminder"',
  'DELETE FROM "CoverageMergeProposal"',
  'DELETE FROM "CoverageSupport"',
  'DELETE FROM "CoveragePresence"',
  'DELETE FROM "CoverageTarget"',
  'DELETE FROM "CoverageDetail"',
  'DELETE FROM "RequestEvent"',
  'DELETE FROM "File"',
  'DELETE FROM "Message"',
  'DELETE FROM "Request"',
  'DELETE FROM "AuditLog"',
  'DELETE FROM "Session"',
  'DELETE FROM "Guideline"',
  'DELETE FROM "CategoryRecipient"',
  'DELETE FROM "CategoryManager"',
  'DELETE FROM "DeadlineRule"',
  'DELETE FROM "Category"',
  'DELETE FROM "EmployeeGroupMember"',
  'DELETE FROM "EmployeeGroup" WHERE "systemKey" IS NULL',
  'DELETE FROM "Student"',
  'DELETE FROM "SchoolClass"',
  'DELETE FROM "GradeLevel"',
  'UPDATE "User" SET "floorId" = NULL',
  'DELETE FROM "Floor"',
  'UPDATE "Setting" SET "updatedById" = NULL',
  'DELETE FROM "User"',
  // Numérotation des demandes et ordre de l'historique repartent de 1.
  `SELECT setval(pg_get_serial_sequence('"Request"', 'number'), 1, false)`,
  `SELECT setval(pg_get_serial_sequence('"RequestEvent"', 'seq'), 1, false)`,
];

const APPEND_ONLY_TRIGGERS = [
  ['RequestEvent', 'RequestEvent_append_only'],
  ['RequestEvent', 'RequestEvent_no_truncate'],
  ['AuditLog', 'AuditLog_append_only'],
  ['AuditLog', 'AuditLog_no_truncate'],
] as const;

export interface PurgeReport {
  counts: Record<string, number>;
  removedFiles: number;
}

/**
 * Supprime les anciennes données métier (comptes, demandes, historique, notifications, audit,
 * référentiels). Les triggers « ajout seul » sont désactivés le temps de la transaction puis
 * réactivés ; en cas d'erreur, rien n'est supprimé. Les fichiers des lignes supprimées (vocaux,
 * photos, avatars) sont ensuite retirés de FILES_DIR.
 */
export async function purgeLocalData(prisma: PrismaClient, url: string, filesDir: string | undefined): Promise<PurgeReport> {
  assertLocalDevelopmentDatabase(url);
  const counts: Record<string, number> = {
    utilisateurs: await prisma.user.count(),
    demandes: await prisma.request.count(),
    evenements: await prisma.requestEvent.count(),
    notifications: await prisma.notification.count(),
    messages: await prisma.message.count(),
    fichiers: await prisma.file.count(),
    audit: await prisma.auditLog.count(),
    categories: await prisma.category.count(),
    classes: await prisma.schoolClass.count(),
    etages: await prisma.floor.count(),
    eleves: await prisma.student.count(),
  };
  const files = await prisma.file.findMany({ select: { storagePath: true } });
  const avatars = await prisma.user.findMany({ where: { avatarUrl: { not: null } }, select: { id: true, avatarUrl: true } });

  await prisma.$transaction(
    async (tx) => {
      for (const [table, trigger] of APPEND_ONLY_TRIGGERS) await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
      for (const statement of PURGE_STATEMENTS) await tx.$executeRawUnsafe(statement);
      for (const [table, trigger] of APPEND_ONLY_TRIGGERS) await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
    },
    { timeout: 120_000 },
  );

  let removedFiles = 0;
  if (filesDir) {
    const root = resolve(filesDir);
    const inside = (path: string) => {
      const rel = relative(root, path);
      return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
    };
    const paths = [
      ...files.map((f) => resolve(root, f.storagePath)),
      ...avatars.flatMap((a) => {
        const version = /[?&]v=([0-9a-f]{16})$/.exec(a.avatarUrl ?? '')?.[1];
        return version ? [join(root, 'avatars', `${a.id}-${version}.webp`)] : [];
      }),
    ];
    for (const path of paths.filter(inside)) {
      await rm(path, { force: true });
      removedFiles += 1;
    }
  }
  return { counts, removedFiles };
}
