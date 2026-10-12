/**
 * Pile de tests de bout en bout (lancée par e2e/playwright.config.ts) :
 * PostgreSQL embarqué jetable → migrations → seed e2e → API Nest.
 * Variables : PORT (API), APP_ORIGIN (SPA de test), E2E_DB_PORT (défaut 55434).
 */
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { startTestDatabase } from '../test/utils/embedded-db';
import { runSeed } from '../prisma/seed';

const E2E_PASSWORD = 'MotDePasse-E2E-2026!';
const BACKEND_DIR = join(__dirname, '..');

async function main(): Promise<void> {
  const db = await startTestDatabase(Number(process.env.E2E_DB_PORT ?? 55434));
  process.env.DATABASE_URL = db.url;

  const prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await runSeed(prisma, { e2ePassword: E2E_PASSWORD, log: () => undefined });
  await prisma.$disconnect();

  const nestCli = require.resolve('@nestjs/cli/bin/nest.js', { paths: [BACKEND_DIR] });
  const api = spawn(process.execPath, [nestCli, 'start'], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: db.url,
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-session-secret-0123456789abcdef0123456789',
      FILES_DIR: process.env.FILES_DIR ?? join(BACKEND_DIR, '.e2e-files'),
      APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:5174',
      // Cookie non Secure : la SPA de test est servie en HTTP (WebKit refuse les cookies Secure sur http://localhost).
      COOKIE_SECURE: 'false',
      NODE_ENV: 'test',
    },
  });

  const shutdown = async (code: number): Promise<void> => {
    api.kill();
    await db.stop();
    process.exit(code);
  };
  api.on('exit', (code) => void shutdown(code ?? 0));
  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
