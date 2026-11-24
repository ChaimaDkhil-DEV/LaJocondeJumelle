import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bash, posix } from '../utils/bash';

/**
 * run-nightly.sh : une heure illisible relançait la sauvegarde en boucle, sans pause, jusqu'à remplir le disque.
 * `sleep` est remplacé : il consigne sa durée puis arrête le script (la boucle n'a pas de fin). Remplacement par des
 * fonctions (BASH_ENV) : le bash de Git for Windows remet /usr/bin en tête du PATH.
 */

const NIGHTLY = resolve(__dirname, '../../../deploy/backup/run-nightly.sh');

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function nightly(backupTime: string | undefined, fakeDate?: string) {
  dir = mkdtempSync(join(tmpdir(), 'ljj-nightly-'));
  const log = join(dir, 'sleep.log');
  const fakes = join(dir, 'fakes.sh');
  writeFileSync(
    fakes,
    `sleep() { echo "$*" >> "${posix(log)}"; exit 0; }
` + (fakeDate ? `date() {
${fakeDate}
command date "$@"
}
` : ''),
  );
  const env: NodeJS.ProcessEnv = { ...process.env, BASH_ENV: posix(fakes) };
  delete env.BACKUP_TIME;
  if (backupTime !== undefined) env.BACKUP_TIME = backupTime;
  const run = spawnSync(bash(), [posix(NIGHTLY)], { env, encoding: 'utf8', timeout: 20_000 });
  const sleeps = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, sleeps };
}

describe('run-nightly.sh : heure de la sauvegarde', () => {
  it.each(['25:99', '24:00', '02:60', '2h30', 'abc', '0230', '02:30:00'])('BACKUP_TIME=%s : refus au démarrage', (time) => {
    const { status, stderr, sleeps } = nightly(time);
    expect(status).toBe(1);
    expect(stderr).toContain('BACKUP_TIME invalide');
    expect(sleeps).toEqual([]);
  });

  it.each([
    ['absente', undefined, '02:30'],
    ['02:30', '02:30', '02:30'],
    ['7:05', '7:05', '07:05'],
    ['08:09', '08:09', '08:09'],
    ['23:59', '23:59', '23:59'],
  ])('BACKUP_TIME %s : attend la prochaine occurrence', (_label, time, shown) => {
    const { stdout, sleeps } = nightly(time);
    expect(stdout).toContain(` ${shown} `);
    expect(sleeps).toHaveLength(1);
    expect(Number(sleeps[0])).toBeGreaterThan(0);
    expect(Number(sleeps[0])).toBeLessThanOrEqual(25 * 3600);
  });

  it('heure inexistante (passage à l’heure d’été) : sauvegarde une heure plus tard', () => {
    const { stdout, sleeps } = nightly('02:30', 'case "$*" in *" 02:30"*) return 1 ;; esac');
    expect(stdout).toContain(' 03:30 ');
    expect(Number(sleeps[0])).toBeGreaterThan(0);
  });

  it('heure incalculable : pause d’une heure, jamais de boucle sans attente', () => {
    const { stderr, sleeps } = nightly('02:30', 'case "$*" in *today*|*tomorrow*) return 1 ;; esac');
    expect(stderr).toContain('ÉCHEC');
    expect(sleeps).toEqual(['3600']);
  });
});
