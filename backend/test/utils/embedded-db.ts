import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface TestDatabase {
  url: string;
  stop: () => Promise<void>;
}

const BACKEND_DIR = resolve(__dirname, '..', '..');

/**
 * Démarre un PostgreSQL 17 jetable (embedded-postgres), crée la base `app_test`
 * et y applique les migrations Prisma versionnées.
 */
export async function startTestDatabase(port: number): Promise<TestDatabase> {
  const dataDir = mkdtempSync(join(tmpdir(), 'ljj-pg-test-'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('app_test');

  const url = `postgresql://postgres:postgres@localhost:${port}/app_test`;
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [BACKEND_DIR] });
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  return {
    url,
    stop: async () => {
      await pg.stop();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
