/**
 * Base PostgreSQL 17 de développement sans Docker (embedded-postgres).
 * Données persistées dans backend/.pgdata ; écoute sur le port 5433 (base `app`).
 * Usage : npm run -w backend db:dev   (Ctrl+C pour arrêter)
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = join(__dirname, '..', '.pgdata');
const port = Number(process.env.DEV_DB_PORT ?? 5433);

async function main(): Promise<void> {
  const firstRun = !existsSync(join(dataDir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: true,
  });
  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) await pg.createDatabase('app');

  console.log(`PostgreSQL de développement prêt : postgresql://postgres:postgres@localhost:${port}/app`);

  const stop = async (): Promise<void> => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
