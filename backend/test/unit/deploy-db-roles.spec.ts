import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Audit de sécurité R02 — l'API n'utilise plus le superutilisateur PostgreSQL. Le service « migrate », exécuté
 * une fois avant l'API, détient seul le compte propriétaire : il applique les migrations puis les droits du
 * rôle d'exécution, avec lequel l'API se connecte. Comportement des droits : test/integration/db-runtime-role.
 */

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const compose = read('deploy/docker-compose.yml');

/** Bloc d'un service de docker-compose.yml (jusqu'au service suivant). */
function service(name: string): string {
  const start = compose.indexOf(`\n  ${name}:\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n|\n[a-z]/);
  return rest.slice(0, end + 1);
}

describe('docker-compose.yml : rôles PostgreSQL séparés (R02)', () => {
  it('l’API se connecte avec le rôle d’exécution, jamais avec le compte propriétaire', () => {
    const api = service('api');
    expect(api).toMatch(
      /DATABASE_URL: postgresql:\/\/\$\{APP_DB_USER:-app_runtime\}:\$\{APP_DB_PASSWORD:\?[^}]+\}@db:5432\/\$\{POSTGRES_DB:-app\}/,
    );
    expect(api).not.toMatch(/POSTGRES_PASSWORD|POSTGRES_USER/);
    // Le contrôle de sauvegarde avant migration a quitté l'API avec les migrations.
    expect(api).not.toMatch(/\/backups/);
    expect(api).not.toMatch(/PRE_MIGRATION_BACKUP/);
  });

  it('l’API ne démarre qu’après la réussite du service migrate', () => {
    expect(service('api')).toMatch(/depends_on:[\s\S]*migrate:\s*\n\s+condition: service_completed_successfully/);
  });

  it('migrate : compte propriétaire, mot de passe du rôle d’exécution, sauvegardes en lecture seule, une seule exécution', () => {
    const migrate = service('migrate');
    expect(migrate).toMatch(
      /DATABASE_URL: postgresql:\/\/\$\{POSTGRES_USER:-app\}:\$\{POSTGRES_PASSWORD:\?[^}]+\}@db:5432\/\$\{POSTGRES_DB:-app\}/,
    );
    expect(migrate).toMatch(/APP_DB_PASSWORD: \$\{APP_DB_PASSWORD:\?[^}]+\}/);
    expect(migrate).toMatch(/APP_DB_USER: \$\{APP_DB_USER:-app_runtime\}/);
    expect(migrate).toMatch(/PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES/);
    expect(migrate).toMatch(/^\s+- \$\{BACKUP_DIR:-\.\/backups\}:\/backups:ro\s*$/m);
    expect(migrate).toMatch(/entrypoint: \['\/usr\/local\/bin\/migrate-entrypoint\.sh'\]/);
    expect(migrate).toMatch(/restart: 'no'/);
    expect(migrate).toMatch(/dockerfile: deploy\/api\.Dockerfile/);
  });
});

describe('scripts et image', () => {
  it('api.Dockerfile : script de migration installé, l’API démarre directement', () => {
    const dockerfile = read('deploy/api.Dockerfile');
    expect(dockerfile).toMatch(/COPY deploy\/migrate-entrypoint\.sh \/usr\/local\/bin\/migrate-entrypoint\.sh/);
    expect(dockerfile).not.toMatch(/api-entrypoint/);
    expect(dockerfile).toMatch(/^CMD \["node", "dist\/main\.js"\]$/m);
  });

  it('migrate-entrypoint.sh : droits appliqués après les migrations, sans lancer l’API', () => {
    const script = read('deploy/migrate-entrypoint.sh');
    expect(script.indexOf('node dist/cli/db-roles.js')).toBeGreaterThan(script.indexOf('prisma migrate deploy'));
    expect(script).not.toMatch(/dist\/main\.js/);
  });

  it('restore.sh : droits de la sauvegarde ignorés (réappliqués par migrate au redémarrage)', () => {
    // Commande sur plusieurs lignes (continuation « \ »).
    expect(read('deploy/backup/restore.sh')).toMatch(/pg_restore[^"]{0,200}--no-privileges/);
  });

  it('main.ts : en production, refus de démarrer avec un rôle trop puissant', () => {
    const main = read('backend/src/main.ts');
    expect(main).toMatch(/if \(config\.isProduction\) await assertLeastPrivilege\(app\.get\(PrismaService\)\)/);
    expect(main.indexOf('assertLeastPrivilege(')).toBeLessThan(main.indexOf('app.listen('));
  });

  it('.env.example documente APP_DB_PASSWORD', () => {
    expect(read('deploy/.env.example')).toMatch(/^APP_DB_PASSWORD=$/m);
  });
});
