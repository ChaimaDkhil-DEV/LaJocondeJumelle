import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

/**
 * T050 — FR-018 (research R12) : l'entrypoint de l'API n'applique une migration qu'après une
 * sauvegarde récente. `npx` et `node` sont remplacés par des scripts qui consignent leurs appels ;
 * les sorties de `prisma migrate status` sont celles relevées en T049 (Prisma 6.19.3).
 */

const ENTRYPOINT = resolve(__dirname, '../../../deploy/api-entrypoint.sh');
const REFUSAL = 'Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh.';

/** Chemin lisible par les deux shells (Git for Windows accepte C:/… avec des barres obliques). */
const posix = (path: string) => path.replace(/\\/g, '/');

/** Shell POSIX : /bin/sh sous Linux, bash de Git for Windows sous Windows. Jamais de saut silencieux. */
function posixShell(): string {
  if (process.platform !== 'win32') return '/bin/sh';
  const gitCore = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  const bash = posix(gitCore).replace(/\/mingw64\/libexec\/git-core$/, '/bin/bash.exe');
  if (!existsSync(bash))
    throw new Error(`Aucun shell POSIX trouvé (attendu : ${bash}) : installez Git for Windows.`);
  return bash;
}

const STATUS: Record<string, { code: number; stdout: string; stderr: string }> = {
  uptodate: {
    code: 0,
    stdout: '3 migrations found in prisma/migrations\n\nDatabase schema is up to date!\n',
    stderr: '',
  },
  pending: {
    code: 1,
    stdout:
      '4 migrations found in prisma/migrations\nFollowing migration have not yet been applied:\n0004_test\n\n' +
      'To apply migrations in production run prisma migrate deploy.\n',
    stderr: '',
  },
  unreachable: {
    code: 1,
    stdout: 'Datasource "db": PostgreSQL database "app", schema "public" at "db:5432"\n',
    stderr: "Error: P1001: Can't reach database server at `db:5432`\n",
  },
};

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Appels consignés par les faux `npx` et `node`, dans l'ordre. */
  calls: string[];
}

/** Lance l'entrypoint réel avec de faux `npx` et `node`. `backupAgeMinutes` : âge d'une archive db-*.dump. */
function runEntrypoint(state: keyof typeof STATUS, backupAgeMinutes?: number): Run {
  const work = mkdtempSync(join(tmpdir(), 'ljj-entrypoint-'));
  try {
    const bin = join(work, 'bin');
    const backups = join(work, 'backups');
    const log = join(work, 'calls.log');
    mkdirSync(bin);
    mkdirSync(backups);
    writeFileSync(log, '');
    const status = STATUS[state];
    writeFileSync(join(work, 'status.out'), status.stdout);
    writeFileSync(join(work, 'status.err'), status.stderr);

    const fake = (name: string, body: string) => {
      writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${posix(log)}"\n${body}`);
      chmodSync(join(bin, name), 0o755);
    };
    fake(
      'npx',
      `case "$*" in\n` +
        `  *"migrate status"*) cat "${posix(join(work, 'status.out'))}"; cat "${posix(join(work, 'status.err'))}" >&2; exit ${status.code} ;;\n` +
        `esac\nexit 0\n`,
    );
    fake('node', 'exit 0\n');

    if (backupAgeMinutes !== undefined) {
      const archive = join(backups, 'db-20260101T000000Z.dump');
      writeFileSync(archive, 'archive');
      const time = new Date(Date.now() - backupAgeMinutes * 60_000);
      utimesSync(archive, time, time);
    }

    const result = spawnSync(posixShell(), [posix(ENTRYPOINT)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
        PRE_MIGRATION_BACKUP_DIR: posix(backups),
        PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES: '60',
      },
    });
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const deployed = (run: Run) => run.calls.some((c) => c.includes('migrate deploy'));
const started = (run: Run) => run.calls.includes('node dist/main.js');

describe('deploy/api-entrypoint.sh', () => {
  it('(1) schéma à jour : démarre sans appliquer de migration', () => {
    const run = runEntrypoint('uptodate');
    expect(run.status).toBe(0);
    expect(deployed(run)).toBe(false);
    expect(started(run)).toBe(true);
  });

  it('(2) migration en attente sans aucune sauvegarde : refus, rien n’est appliqué ni démarré', () => {
    const run = runEntrypoint('pending');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(REFUSAL);
    expect(deployed(run)).toBe(false);
    expect(started(run)).toBe(false);
  });

  it('(3) migration en attente, sauvegarde de plus de 60 minutes : même refus', () => {
    const run = runEntrypoint('pending', 120);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(REFUSAL);
    expect(deployed(run)).toBe(false);
    expect(started(run)).toBe(false);
  });

  it('(4) migration en attente, sauvegarde récente : migre puis démarre, dans cet ordre', () => {
    const run = runEntrypoint('pending', 5);
    expect(run.status).toBe(0);
    const deployAt = run.calls.findIndex((c) => c.includes('migrate deploy'));
    const startAt = run.calls.indexOf('node dist/main.js');
    expect(deployAt).toBeGreaterThanOrEqual(0);
    expect(startAt).toBeGreaterThan(deployAt);
  });

  it('(5) base inaccessible : erreur de Prisma recopiée, rien n’est appliqué ni démarré', () => {
    const run = runEntrypoint('unreachable');
    expect(run.status).toBe(1);
    expect(`${run.stdout}${run.stderr}`).toContain('P1001');
    expect(deployed(run)).toBe(false);
    expect(started(run)).toBe(false);
  });
});
