import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

/**
 * Audit de sécurité R03 — sauvegardes chiffrées. Le serveur ne détient que la clé publique age
 * (BACKUP_AGE_RECIPIENT) : aucune sauvegarde n'est écrite en clair, ni localement ni hors du serveur, et
 * la sauvegarde est refusée sans clé valide. `pg_dump`, `pg_restore` et `age` sont remplacés par des
 * scripts qui consignent leurs appels ; `tar` est le vrai.
 */

const ROOT = resolve(__dirname, '../../..');
const BACKUP = resolve(ROOT, 'deploy/backup/backup.sh');
const CHECK = resolve(ROOT, 'deploy/backup/check-backup.sh');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const posix = (path: string) => path.replace(/\\/g, '/');
const HEADER = 'age-encryption.org/v1';
const KEY_1 = `age1${'q'.repeat(58)}`;
const KEY_2 = `age1${'z'.repeat(58)}`;

/** bash : celui du système sous Linux, celui de Git for Windows sous Windows. */
function bash(): string {
  if (process.platform !== 'win32') return 'bash';
  const gitCore = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  const path = posix(gitCore).replace(/\/mingw64\/libexec\/git-core$/, '/bin/bash.exe');
  if (!existsSync(path)) throw new Error(`bash introuvable (attendu : ${path}) : installez Git for Windows.`);
  return path;
}

interface Workspace {
  dir: string;
  backups: string;
  offsite: string;
  tmp: string;
  calls: () => string[];
}

function workspace(options: { ageFails?: boolean } = {}): Workspace {
  const dir = mkdtempSync(join(tmpdir(), 'ljj-backup-'));
  const [bin, backups, offsite, tmp, files] = ['bin', 'backups', 'offsite', 'tmp', 'data/files'].map(
    (name) => join(dir, name),
  );
  for (const d of [bin, backups, offsite, tmp, files]) mkdirSync(d, { recursive: true });
  writeFileSync(join(files, 'vocal.webm'), 'données personnelles');
  const log = posix(join(dir, 'calls.log'));
  writeFileSync(log, '');
  const fake = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/bash\necho "${name} $*" >> "${log}"\n${body}`);
    chmodSync(join(bin, name), 0o755);
  };
  fake('pg_dump', 'for a in "$@"; do case "$a" in --file=*) printf PGDMP-base > "${a#--file=}" ;; esac; done\n');
  fake('pg_restore', 'exit 0\n');
  // Faux age : en-tête age suivi du contenu reçu (fichier en dernier argument ou entrée standard).
  fake(
    'age',
    options.ageFails
      ? 'exit 1\n'
      : [
          'out=; in=-',
          'while [ $# -gt 0 ]; do case "$1" in -r) shift ;; -o) out="$2"; shift ;; *) in="$1" ;; esac; shift; done',
          `{ printf '${HEADER}\\n'; cat "$in"; } > "$out"`,
        ].join('\n') + '\n',
  );
  return {
    dir,
    backups,
    offsite,
    tmp,
    calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
}

function runBackup(ws: Workspace, env: Record<string, string>) {
  return spawnSync(bash(), [posix(BACKUP)], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(ws.dir, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
      BACKUP_DIR_IN_CONTAINER: posix(ws.backups),
      OFFSITE_DIR_IN_CONTAINER: posix(ws.offsite),
      FILES_ROOT: posix(join(ws.dir, 'data')),
      TMPDIR: posix(ws.tmp),
      ...env,
    },
  });
}

describe('backup.sh : sauvegardes chiffrées (R03)', () => {
  let ws: Workspace;
  afterEach(() => rmSync(ws.dir, { recursive: true, force: true }));

  it.each([
    ['absente', ''],
    ['invalide', 'ma-cle'],
  ])('clé publique %s : refus, rien n’est sauvegardé en clair', (_label, recipient) => {
    ws = workspace();
    const run = runBackup(ws, { BACKUP_AGE_RECIPIENT: recipient });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('BACKUP_AGE_RECIPIENT');
    expect(ws.calls().filter((c) => c.startsWith('pg_dump'))).toEqual([]);
    expect(readdirSync(ws.backups)).toEqual([]);
  });

  it('base et fichiers chiffrés pour la clé publique, copie hors du serveur chiffrée, aucun fichier en clair', () => {
    ws = workspace();
    const run = runBackup(ws, { BACKUP_AGE_RECIPIENT: KEY_1, OFFSITE_ENABLED: '1' });
    expect(run.status).toBe(0);

    const names = readdirSync(ws.backups).sort();
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^db-\d{8}T\d{6}Z\.dump\.age$/);
    expect(names[1]).toMatch(/^files-\d{8}T\d{6}Z\.tar\.gz\.age$/);
    expect(readdirSync(ws.offsite).sort()).toEqual(names);

    // La base passe par age (contenu de pg_dump derrière l'en-tête) ; l'archive des fichiers aussi.
    const db = readFileSync(join(ws.backups, names[0]), 'utf8');
    expect(db).toBe(`${HEADER}\nPGDMP-base`);
    const files = readFileSync(join(ws.backups, names[1]));
    expect(files.subarray(0, HEADER.length).toString()).toBe(HEADER);
    expect(files.includes(Buffer.from('données personnelles'))).toBe(false);
    const archive = join(ws.dir, 'files.tar.gz');
    writeFileSync(archive, files.subarray(HEADER.length + 1));
    // Chemin relatif : GNU tar prendrait « C: » (Windows) pour un hôte distant.
    expect(execFileSync('tar', ['-tzf', 'files.tar.gz'], { cwd: ws.dir, encoding: 'utf8' })).toContain(
      'files/vocal.webm',
    );

    const ages = ws.calls().filter((c) => c.startsWith('age '));
    expect(ages).toHaveLength(2);
    for (const call of ages) expect(call).toContain(`-r ${KEY_1}`);
    // Contrôle de l'archive de la base avant chiffrement, puis copie de travail effacée.
    expect(ws.calls().some((c) => c.startsWith('pg_restore --list'))).toBe(true);
    expect(readdirSync(ws.tmp)).toEqual([]);
  });

  it('plusieurs clés publiques séparées par des virgules : chacune peut déchiffrer', () => {
    ws = workspace();
    const run = runBackup(ws, { BACKUP_AGE_RECIPIENT: `${KEY_1}, ${KEY_2}` });
    expect(run.status).toBe(0);
    for (const call of ws.calls().filter((c) => c.startsWith('age ')))
      expect(call).toContain(`-r ${KEY_1} -r ${KEY_2}`);
  });

  it('échec du chiffrement : échec de la sauvegarde, aucune archive gardée, copie de travail effacée', () => {
    ws = workspace({ ageFails: true });
    const run = runBackup(ws, { BACKUP_AGE_RECIPIENT: KEY_1 });
    expect(run.status).not.toBe(0);
    expect(readdirSync(ws.backups).filter((n) => !n.endsWith('.tmp'))).toEqual([]);
    expect(readdirSync(ws.tmp)).toEqual([]);
  });

  it('rotation : anciennes sauvegardes chiffrées et anciennes sauvegardes en clair supprimées', () => {
    ws = workspace();
    const old = new Date(Date.now() - 20 * 86_400_000);
    const stale = ['db-20260101T000000Z.dump', 'files-20260101T000000Z.tar.gz', 'db-20260102T000000Z.dump.age', 'files-20260102T000000Z.tar.gz.age'];
    for (const name of stale) {
      writeFileSync(join(ws.backups, name), 'ancienne');
      utimesSync(join(ws.backups, name), old, old);
    }
    const run = runBackup(ws, { BACKUP_AGE_RECIPIENT: KEY_1 });
    expect(run.status).toBe(0);
    expect(readdirSync(ws.backups).filter((n) => stale.includes(n))).toEqual([]);
    expect(readdirSync(ws.backups)).toHaveLength(2);
  });
});

describe('check-backup.sh : seules les sauvegardes chiffrées comptent (R03)', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function check(names: string[]) {
    dir = mkdtempSync(join(tmpdir(), 'ljj-check-'));
    const backups = join(dir, 'backups');
    mkdirSync(backups);
    for (const name of names) writeFileSync(join(backups, name), 'x');
    // Relatif au dossier du fichier .env, comme deploy/.env (BACKUP_DIR=./backups).
    writeFileSync(join(dir, '.env'), 'BACKUP_DIR=./backups\n');
    return spawnSync(bash(), [posix(CHECK)], {
      encoding: 'utf8',
      env: { ...process.env, ENV_FILE: posix(join(dir, '.env')) },
    });
  }

  it('sauvegardes chiffrées récentes : à jour', () => {
    expect(check(['db-20261118T023000Z.dump.age', 'files-20261118T023000Z.tar.gz.age']).status).toBe(0);
  });

  it('seulement des sauvegardes en clair : alerte', () => {
    const run = check(['db-20261118T023000Z.dump', 'files-20261118T023000Z.tar.gz']);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('db-*.dump.age');
  });
});

describe('configuration des sauvegardes chiffrées (R03)', () => {
  const compose = read('deploy/docker-compose.yml');
  const block = (name: string) => {
    const start = compose.indexOf(`\n  ${name}:\n`);
    const rest = compose.slice(start + 1);
    const end = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n|\n[a-z]/);
    return rest.slice(0, end + 1);
  };

  it.each(['backup', 'n8n-backup'])('%s : image avec age, clé publique transmise, santé sur les archives chiffrées', (name) => {
    const service = block(name);
    expect(service).toMatch(/dockerfile: deploy\/backup\.Dockerfile/);
    expect(service).not.toMatch(/^\s+image:/m);
    expect(service).toMatch(/BACKUP_AGE_RECIPIENT: \$\{BACKUP_AGE_RECIPIENT:-\}/);
    expect(service).toMatch(/-name "db-\*\.dump\.age"/);
  });

  it('backup.Dockerfile : postgres:17 et age', () => {
    const dockerfile = read('deploy/backup.Dockerfile');
    expect(dockerfile).toMatch(/^FROM postgres:17$/m);
    expect(dockerfile).toMatch(/apt-get install -y --no-install-recommends age/);
  });

  it('deploy.sh construit l’image de sauvegarde avant la sauvegarde préalable', () => {
    const script = read('deploy/deploy.sh');
    const build = script.indexOf('build backup');
    expect(build).toBeGreaterThan(0);
    expect(build).toBeLessThan(script.indexOf('run --rm --entrypoint /bin/bash backup'));
  });

  it('migrate-entrypoint.sh : la sauvegarde avant migration est une archive chiffrée', () => {
    expect(read('deploy/migrate-entrypoint.sh')).toMatch(/-name 'db-\*\.dump\.age'/);
  });

  it('restore.sh : clé privée demandée, archives déchiffrées et vérifiées avant d’arrêter l’application', () => {
    const script = read('deploy/backup/restore.sh');
    expect(script).toMatch(/Usage : deploy\/backup\/restore\.sh <horodatage[^>]*> <fichier de clé privée age>/);
    const verify = script.indexOf('age -d -i /run/age-key -o /dev/null');
    expect(verify).toBeGreaterThan(0);
    expect(verify).toBeLessThan(script.indexOf('stop caddy api backup'));
    expect(script).toMatch(/pg_restore --list/);
  });

  it('.env.example documente BACKUP_AGE_RECIPIENT', () => {
    expect(read('deploy/.env.example')).toMatch(/^BACKUP_AGE_RECIPIENT=$/m);
  });
});
