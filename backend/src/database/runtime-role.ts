import type { PrismaClient } from '@prisma/client';

/**
 * Rôle PostgreSQL d'exécution de l'API (audit de sécurité R02). Le compte propriétaire (superutilisateur de
 * l'image postgres) ne sert plus qu'aux migrations et aux sauvegardes : il pouvait désactiver les triggers
 * d'ajout seul, supprimer des tables ou lancer des commandes système (COPY … PROGRAM). Le rôle d'exécution
 * ne fait que lire et écrire des lignes ; sur les tables en ajout seul, il perd en plus les droits que leurs
 * triggers interdisent (UPDATE, DELETE).
 */

/** Nom de rôle PostgreSQL simple (aucun guillemet possible). */
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
/** Mot de passe généré (`openssl rand -hex 32`) : aucun caractère à échapper en SQL ni dans une URL. */
const PASSWORD = /^[A-Za-z0-9]{32,128}$/;
/** Fonctions des triggers d'ajout seul (migrations 0001, 0014, 0021, 0029, 0030, 0031). */
const APPEND_ONLY_FUNCTIONS = ['forbid_modification', 'forbid_deletion'];

export interface RuntimeRoleOptions {
  role: string;
  password: string;
}

export interface RuntimeRoleSummary {
  role: string;
  /** Tables accessibles en lecture et écriture. */
  tables: number;
  /** Droits retirés, comme les triggers : « Table : UPDATE, DELETE ». */
  appendOnly: string[];
}

const ident = (name: string) => `"${name}"`;

/**
 * Crée ou met à jour le rôle d'exécution et ses droits ; idempotent, à exécuter avec le compte propriétaire
 * après chaque `prisma migrate deploy` (deploy/migrate-entrypoint.sh) : les nouvelles tables sont couvertes.
 */
export async function applyRuntimeRole(prisma: PrismaClient, options: RuntimeRoleOptions): Promise<RuntimeRoleSummary> {
  const { role, password } = options;
  if (!ROLE_NAME.test(role)) throw new Error(`APP_DB_USER invalide : « ${role} » (lettres minuscules, chiffres, _).`);
  if (!PASSWORD.test(password)) {
    throw new Error('APP_DB_PASSWORD invalide : 32 à 128 lettres ou chiffres (générer : openssl rand -hex 32).');
  }

  return prisma.$transaction(async (tx) => {
    const [{ owner, database }] = await tx.$queryRaw<{ owner: string; database: string }[]>`
      SELECT current_user AS owner, current_database() AS database`;
    if (role === owner) throw new Error(`Le rôle d'exécution doit différer du compte propriétaire (« ${owner} »).`);

    const exists = await tx.$queryRaw<unknown[]>`SELECT 1 FROM pg_roles WHERE rolname = ${role}`;
    if (exists.length === 0) await tx.$executeRawUnsafe(`CREATE ROLE ${ident(role)} LOGIN`);
    await tx.$executeRawUnsafe(
      `ALTER ROLE ${ident(role)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
    );
    // Aucune appartenance à un autre rôle (le propriétaire en particulier).
    const memberships = await tx.$queryRaw<{ granted: string }[]>`
      SELECT g.rolname AS granted FROM pg_auth_members m
      JOIN pg_roles r ON r.oid = m.member JOIN pg_roles g ON g.oid = m.roleid
      WHERE r.rolname = ${role}`;
    for (const { granted } of memberships) await tx.$executeRawUnsafe(`REVOKE ${ident(granted)} FROM ${ident(role)}`);

    await tx.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${ident(database)} TO ${ident(role)}`);
    await tx.$executeRawUnsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${ident(role)}`);
    // Droits recalculés à chaque fois : rien ne subsiste d'un état précédent.
    await tx.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ident(role)}`);
    await tx.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${ident(role)}`);
    await tx.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ident(role)}`);
    await tx.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(role)}`);
    const migrations = await tx.$queryRaw<unknown[]>`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations'`;
    if (migrations.length > 0) await tx.$executeRawUnsafe(`REVOKE ALL ON TABLE "_prisma_migrations" FROM ${ident(role)}`);

    // Mêmes interdictions que les triggers d'ajout seul : bits UPDATE (16) et DELETE (8) de pg_trigger.tgtype.
    const guarded = await tx.$queryRaw<{ table: string; update: boolean; delete: boolean }[]>`
      SELECT c.relname AS table,
             bool_or((t.tgtype & 16) <> 0) AS update,
             bool_or((t.tgtype & 8) <> 0) AS delete
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = 'public' AND NOT t.tgisinternal AND p.proname = ANY(${APPEND_ONLY_FUNCTIONS})
      GROUP BY c.relname
      ORDER BY c.relname`;
    const appendOnly: string[] = [];
    for (const row of guarded) {
      const privileges = [row.update && 'UPDATE', row.delete && 'DELETE'].filter(Boolean).join(', ');
      if (!privileges) continue;
      await tx.$executeRawUnsafe(`REVOKE ${privileges} ON TABLE ${ident(row.table)} FROM ${ident(role)}`);
      appendOnly.push(`${row.table} : ${privileges}`);
    }

    const [{ tables }] = await tx.$queryRaw<{ tables: number }[]>`
      SELECT count(*)::int AS tables FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    return { role, tables, appendOnly };
  });
}

/**
 * Ce que le rôle connecté peut faire de trop : vide pour le rôle d'exécution. En production, l'API refuse de
 * démarrer sinon (main.ts) : une URL de base avec le compte propriétaire est une erreur de configuration.
 */
export async function leastPrivilegeProblems(prisma: PrismaClient): Promise<string[]> {
  const [row] = await prisma.$queryRaw<
    { user: string; superuser: boolean; createrole: boolean; createdb: boolean; bypassrls: boolean; replication: boolean; owns: boolean }[]
  >`
    SELECT r.rolname AS user, r.rolsuper AS superuser, r.rolcreaterole AS createrole, r.rolcreatedb AS createdb,
           r.rolbypassrls AS bypassrls, r.rolreplication AS replication,
           EXISTS (
             SELECT 1 FROM pg_tables t
             WHERE t.schemaname = 'public' AND pg_has_role(current_user, t.tableowner, 'MEMBER')
           ) AS owns
    FROM pg_roles r WHERE r.rolname = current_user`;
  const problems: string[] = [];
  if (row.superuser) problems.push('superutilisateur');
  if (row.owns) problems.push('propriétaire des tables (ou membre du propriétaire)');
  if (row.createrole) problems.push('peut créer des rôles');
  if (row.createdb) problems.push('peut créer des bases');
  if (row.bypassrls) problems.push('ignore la sécurité par ligne');
  if (row.replication) problems.push('rôle de réplication');
  return problems.map((problem) => `« ${row.user} » : ${problem}`);
}

export async function assertLeastPrivilege(prisma: PrismaClient): Promise<void> {
  const problems = await leastPrivilegeProblems(prisma);
  if (problems.length > 0) {
    throw new Error(
      `Rôle PostgreSQL trop puissant pour l'API (${problems.join(' ; ')}). DATABASE_URL doit utiliser le rôle ` +
        "d'exécution (APP_DB_USER), créé par le service migrate : voir deploy/docker-compose.yml.",
    );
  }
}
