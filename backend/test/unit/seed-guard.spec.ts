import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertLocalDatabase, LOCAL_HOSTS } from '../../prisma/demo/local-database';

/**
 * Les scripts de données fictives (prisma:seed, seed:volume) créent des comptes aux mots de passe provisoires,
 * dont un super administrateur : ils ne doivent jamais viser une base de production ou distante.
 */

describe('assertLocalDatabase', () => {
  it.each([
    ['localhost, base de développement', 'postgresql://postgres:postgres@localhost:5433/app'],
    ['127.0.0.1', 'postgresql://u:p@127.0.0.1:5432/app'],
    ['IPv6 locale', 'postgresql://u:p@[::1]:5433/app'],
    ['base embarquée de test (autre port, autre nom)', 'postgresql://postgres:postgres@localhost:55433/test_db_42'],
    ['schéma postgres://', 'postgres://u:p@localhost/app?schema=public'],
  ])('accepte une base de cette machine : %s', (_label, url) => {
    expect(() => assertLocalDatabase(url, 'prisma:seed', {})).not.toThrow();
  });

  it.each([
    ['nom de domaine', 'postgresql://u:p@db.ecole.tn:5432/app'],
    ['adresse IP distante', 'postgresql://u:p@203.0.113.7:5432/app'],
    ['service Docker de production', 'postgresql://u:p@db:5432/app'],
    ['hôte qui commence par localhost', 'postgresql://u:p@localhost.evil.example:5432/app'],
    ['localhost en identifiant, hôte distant', 'postgresql://localhost:5432@db.ecole.tn/app'],
    ['socket Unix (hôte vide)', 'postgresql://u:p@/app?host=/var/run/postgresql'],
  ])('refuse une base qui n’est pas sur cette machine : %s', (_label, url) => {
    expect(() => assertLocalDatabase(url, 'prisma:seed', {})).toThrow(/prisma:seed refusé/);
  });

  it('refuse en production même si la base est locale', () => {
    expect(() => assertLocalDatabase('postgresql://u:p@localhost:5433/app', 'seed:volume', { NODE_ENV: 'production' })).toThrow(/seed:volume refusé : NODE_ENV=production/);
  });

  it.each([
    ['absente', undefined, /absente/],
    ['vide', '', /absente/],
    ['illisible', 'pas une url', /illisible/],
    ['pas PostgreSQL', 'mysql://u:p@localhost:3306/app', /PostgreSQL/],
  ])('refuse quand DATABASE_URL est %s : dans le doute, rien n’est écrit', (_label, url, message) => {
    expect(() => assertLocalDatabase(url, 'prisma:seed', {})).toThrow(message);
  });

  it('le message dit quoi faire en production, sans afficher les identifiants de la base', () => {
    let message = '';
    try {
      assertLocalDatabase('postgresql://admin:S3cret-pass@db.ecole.tn:5432/app', 'prisma:seed', {});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('bootstrap');
    expect(message).toContain('import CSV');
    expect(message).not.toContain('S3cret-pass');
    expect(message).not.toContain('admin:');
  });

  it('la liste des hôtes locaux est unique : la remise à zéro de la démonstration utilise la même', () => {
    expect([...LOCAL_HOSTS].sort()).toEqual(['127.0.0.1', '::1', 'localhost', '[::1]'].sort());
  });
});

describe('lignes de commande réelles', () => {
  const BACKEND = resolve(__dirname, '..', '..');
  const TSX = require.resolve('tsx/cli', { paths: [BACKEND] });
  /** Lance la commande comme en exploitation (tsx appelé par node, sans shell), avec un environnement maîtrisé. */
  const run = (script: string, env: Record<string, string>) =>
    spawnSync(process.execPath, [TSX, script, ...(script.includes('volume') ? ['5'] : [])], {
      cwd: BACKEND,
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', ...env },
      encoding: 'utf8',
      timeout: 60_000,
    });

  it.each(['prisma/seed.ts', 'prisma/seed-volume.ts'])('%s s’arrête avant toute connexion quand la base est distante', (script) => {
    const result = run(script, { DATABASE_URL: 'postgresql://admin:motdepasse@db.ecole.tn:5432/app' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/refusé : la base ciblée \(« db\.ecole\.tn »\) n’est pas sur cette machine/);
    expect(result.stderr).not.toContain('motdepasse');
    expect(result.stdout).not.toMatch(/Seed terminé|Compte créé|demandes générées/);
  });

  it.each(['prisma/seed.ts', 'prisma/seed-volume.ts'])('%s s’arrête en production même sur une base locale', (script) => {
    const result = run(script, { NODE_ENV: 'production', DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/app' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/refusé : NODE_ENV=production/);
    expect(result.stdout).not.toMatch(/Seed terminé|Compte créé|demandes générées/);
  });
});
