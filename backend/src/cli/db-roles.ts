import { PrismaClient } from '@prisma/client';
import { applyRuntimeRole } from '../database/runtime-role';

/**
 * `node dist/cli/db-roles.js` : crée ou met à jour le rôle PostgreSQL d'exécution de l'API et ses droits
 * (audit de sécurité R02). Lancé par le service migrate (deploy/migrate-entrypoint.sh), avec le compte
 * propriétaire dans DATABASE_URL, après `prisma migrate deploy`. Variables : APP_DB_USER (défaut
 * app_runtime), APP_DB_PASSWORD (obligatoire).
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const summary = await applyRuntimeRole(prisma, {
      role: process.env.APP_DB_USER?.trim() || 'app_runtime',
      password: process.env.APP_DB_PASSWORD?.trim() ?? '',
    });
    process.stdout.write(
      `[db-roles] rôle d'exécution « ${summary.role} » : lecture et écriture sur ${summary.tables} tables ; ` +
        `ajout seul : ${summary.appendOnly.join(' ; ') || 'aucune table'}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`[db-roles] ÉCHEC : ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
