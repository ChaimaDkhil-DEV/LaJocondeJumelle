/**
 * Pile de tests de bout en bout (lancée par e2e/playwright.config.ts) :
 * PostgreSQL embarqué jetable → migrations → seed e2e → API Nest.
 * Variables : PORT (API), APP_ORIGIN (SPA de test), E2E_DB_PORT (défaut 55434),
 * E2E_FILES_DIR (défaut backend/.e2e-files).
 */
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { startTestDatabase } from '../test/utils/embedded-db';
import { runSeed } from '../prisma/seed';

const E2E_PASSWORD = 'MotDePasse-E2E-2026!';
const BACKEND_DIR = join(__dirname, '..');

/** Assistance (spec 009) : une consigne active pour « Photocopies », citée par les propositions de démonstration. */
async function seedAssistGuideline(prisma: PrismaClient): Promise<void> {
  const category = await prisma.category.findUniqueOrThrow({ where: { name: 'Photocopies' } });
  const superadmin = await prisma.user.findUniqueOrThrow({ where: { username: 'superadmin' } });
  await prisma.guideline.create({
    data: {
      title: 'Pannes de reprographie',
      body: 'Une photocopieuse en panne bloque les cours : Priorité : Haute.',
      categoryId: category.id,
      updatedById: superadmin.id,
    },
  });
}

async function main(): Promise<void> {
  const db = await startTestDatabase(Number(process.env.E2E_DB_PORT ?? 55434));
  process.env.DATABASE_URL = db.url;

  const prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await runSeed(prisma, { e2ePassword: E2E_PASSWORD, log: () => undefined });
  await seedAssistGuideline(prisma);
  await prisma.$disconnect();

  const nestCli = require.resolve('@nestjs/cli/bin/nest.js', { paths: [BACKEND_DIR] });
  const api = spawn(process.execPath, [nestCli, 'start'], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: db.url,
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-session-secret-0123456789abcdef0123456789',
      // Pas FILES_DIR : l'import de @prisma/client charge backend/.env, dont FILES_DIR (fichiers de développement).
      FILES_DIR: process.env.E2E_FILES_DIR ?? join(BACKEND_DIR, '.e2e-files'),
      APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:5174',
      // Cookie non Secure : la SPA de test est servie en HTTP (WebKit refuse les cookies Secure sur http://localhost).
      COOKIE_SECURE: 'false',
      // Tous les navigateurs de test se connectent avec les mêmes comptes depuis la même machine.
      LOGIN_RATE_LIMIT: '1000',
      // Assistance (spec 009) : fournisseurs locaux de démonstration, aucun appel externe.
      ASSIST_SUGGESTION_PROVIDER: 'demo',
      ASSIST_TRANSCRIPTION_PROVIDER: 'demo',
      ASSIST_RATE_LIMIT: '1000',
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
