import { PrismaClient } from '@prisma/client';

/**
 * Vide toutes les tables applicatives entre deux tests.
 * Les triggers d'ajout seul (AuditLog, RequestEvent) bloquent aussi TRUNCATE :
 * on les neutralise pour la durée de la transaction de nettoyage uniquement
 * (session_replication_role = replica, réservé au superutilisateur de test).
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$transaction([
    prisma.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
    prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`),
  ]);
}
