import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bash, posix } from '../utils/bash';

/**
 * deploy/.env est lu par Docker Compose et par les scripts : une valeur entre guillemets ou suivie d'un commentaire
 * doit y avoir le même sens, sinon le contrôle des sauvegardes cherche dans un dossier qui n'existe pas. Valeurs
 * attendues relevées avec `docker compose config` (Compose 5.6).
 */

const ROOT = resolve(__dirname, '../../..');
const LIB = join(ROOT, 'deploy/env-file.sh');
const CHECK = join(ROOT, 'deploy/backup/check-backup.sh');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ljj-env-file-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('env_value : même lecture que Docker Compose', () => {
  it.each([
    ['K=/a', '/a'],
    ['K="/a b"', '/a b'],
    ["K='/a b'", '/a b'],
    ['K=/a # commentaire', '/a'],
    ['K=/a#c', '/a#c'],
    ['K=#c', '#c'],
    ['K = /a', '/a'],
    ['export K=/a', '/a'],
    ['  K=/a  ', '/a'],
    ['K=/a\r', '/a'],
    ['K="/a"\r', '/a'],
    ['K="/a" # commentaire', '/a'],
    ['K="/a#b"', '/a#b'],
    ['K=/a b', '/a b'],
    ['K=/a\nK=/b', '/b'],
    ['K=', ''],
    ['# K=/a', ''],
    ['AUTRE_K=/a', ''],
    ['', ''],
  ])('%j donne %j', (line, expected) => {
    const file = join(dir, '.env');
    writeFileSync(file, `${line}\n`);
    const run = spawnSync(bash(), ['-euo', 'pipefail', '-c', `source "${posix(LIB)}"; env_value K "${posix(file)}"`], {
      encoding: 'utf8',
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(expected);
  });

  it('n’exécute jamais le contenu du fichier', () => {
    const file = join(dir, '.env');
    writeFileSync(file, `K=$(touch "${posix(join(dir, 'execute'))}")\n`);
    const run = spawnSync(bash(), ['-c', `source "${posix(LIB)}"; env_value K "${posix(file)}"`], { encoding: 'utf8' });
    expect(run.stdout).toContain('$(touch');
    expect(spawnSync(bash(), ['-c', `[ -e "${posix(join(dir, 'execute'))}" ]`]).status).toBe(1);
  });
});

describe('check-backup.sh : réglages de deploy/.env', () => {
  function check(env: string, options: { local?: string; offsite?: string; sameDisk?: boolean } = {}) {
    for (const folder of [options.local ?? 'backups', options.offsite].filter((f): f is string => f !== undefined)) {
      mkdirSync(join(dir, folder), { recursive: true });
      for (const name of ['db-1.dump.age', 'files-1.tar.gz.age']) writeFileSync(join(dir, folder, name), 'x');
    }
    writeFileSync(join(dir, '.env'), env);
    // Fonction stat : le bash de Git for Windows remet /usr/bin en tête du PATH.
    const fakes = join(dir, 'fakes.sh');
    writeFileSync(fakes, `stat() { case "$*" in *distant*) echo ${options.sameDisk ? 1 : 2} ;; *) echo 1 ;; esac; }\n`);
    return spawnSync(bash(), [posix(CHECK)], {
      encoding: 'utf8',
      env: { ...process.env, ENV_FILE: posix(join(dir, '.env')), BASH_ENV: posix(fakes) },
    });
  }

  it.each(['BACKUP_DIR="./sauvegardes"\n', "BACKUP_DIR='./sauvegardes'\n", 'BACKUP_DIR=./sauvegardes # disque 2\r\n'])(
    'dossier écrit %j : sauvegardes trouvées',
    (line) => {
      expect(check(line, { local: 'sauvegardes' }).status).toBe(0);
    },
  );

  it('âge maximal suivi d’un commentaire : accepté', () => {
    expect(check('BACKUP_MAX_AGE_HOURS=26 # heures\n').status).toBe(0);
  });

  it('copie hors serveur sur un autre disque (chemin relatif à deploy/, comme Compose) : à jour', () => {
    expect(check('BACKUP_OFFSITE_DIR=./distant\n', { offsite: 'distant' }).status).toBe(0);
  });

  it('copie « hors serveur » sur le même disque (support non monté) : alerte', () => {
    const run = check('BACKUP_OFFSITE_DIR=./distant\n', { offsite: 'distant', sameDisk: true });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('même disque');
  });
});
