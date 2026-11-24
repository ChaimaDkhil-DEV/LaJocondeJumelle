import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertNoEnvFileInProduction } from '../../src/config/load-env-file';

/**
 * @prisma/client charge lui-même backend/.env à l'import, même avec NODE_ENV=production : une variable oubliée serait
 * remplacée en silence par sa valeur de développement (SESSION_SECRET, APP_ORIGIN…). D'où un refus.
 */
describe('assertNoEnvFileInProduction', () => {
  let dir: string;
  const previous = process.env.NODE_ENV;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ljj-env-'));
  });
  afterEach(() => {
    process.env.NODE_ENV = previous;
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuse en production un dossier qui contient .env, sans citer son contenu', () => {
    writeFileSync(join(dir, '.env'), 'SESSION_SECRET=valeur-a-ne-pas-citer\n');
    process.env.NODE_ENV = 'production';
    let message = '';
    try {
      assertNoEnvFileInProduction(dir);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(join(dir, '.env'));
    expect(message).not.toContain('valeur-a-ne-pas-citer');
  });

  it('accepte en production un dossier sans .env (image Docker)', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertNoEnvFileInProduction(dir)).not.toThrow();
  });

  it('accepte .env hors production', () => {
    writeFileSync(join(dir, '.env'), 'PORT=3002\n');
    process.env.NODE_ENV = 'development';
    expect(() => assertNoEnvFileInProduction(dir)).not.toThrow();
  });

  it.each([
    ['main.ts', 'NestFactory.create('],
    ['cli/bootstrap.ts', 'new PrismaClient('],
    ['cli/db-roles.ts', 'new PrismaClient('],
  ])('%s fait ce contrôle avant de démarrer', (file, start) => {
    const source = readFileSync(resolve(__dirname, '../../src', file), 'utf8');
    const check = source.indexOf('assertNoEnvFileInProduction();');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(source.indexOf(start));
  });
});
