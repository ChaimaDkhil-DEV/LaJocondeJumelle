import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { bash, fakeCommand, posix } from '../utils/bash';

/**
 * Serveur d'école : COMPOSE_OVERRIDE_FILE est lue dans deploy/.env par deploy.sh et par restore.sh. Oubliée (ou
 * ignorée), Compose recréerait Caddy sans le profil « school » : plus de certificat DNS-01 ni de tunnel, donc plus
 * d'accès des parents. Les vrais scripts tournent dans une copie ; `docker` et `git` consignent leurs appels.
 */

const ROOT = resolve(__dirname, '../../..');
const SCHOOL = 'deploy/docker-compose.school.yml';
const STAMP = '20261118T023000Z';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(
  script: 'deploy/deploy.sh' | 'deploy/backup/restore.sh',
  envFile: string,
  shellValue?: string,
  shell: Record<string, string> = {},
) {
  dir = mkdtempSync(join(tmpdir(), 'ljj-override-'));
  // Jamais le vrai deploy/.env ni les vraies sauvegardes d'un poste.
  cpSync(join(ROOT, 'deploy'), join(dir, 'deploy'), {
    recursive: true,
    filter: (source) => basename(source) !== '.env' && basename(source) !== 'backups',
  });
  mkdirSync(join(dir, 'deploy/backups'));
  writeFileSync(join(dir, `deploy/backups/db-${STAMP}.dump`), 'x');
  writeFileSync(join(dir, `deploy/backups/files-${STAMP}.tar.gz`), 'x');
  writeFileSync(join(dir, 'deploy/.env'), `POSTGRES_PASSWORD=${'a1'.repeat(32)}\n${envFile}`);
  writeFileSync(join(dir, 'deploy/autre.yml'), 'services: {}\n');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'calls.log');
  fakeCommand(join(bin, 'docker'), `echo "$*" >> "${posix(log)}"`);
  fakeCommand(join(bin, 'git'), 'echo abc1234');

  // Environnement maîtrisé : les tests unitaires chargent backend/.env, qui remplacerait deploy/.env.
  const env: NodeJS.ProcessEnv = { PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` };
  for (const name of ['SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'HOME']) env[name] = process.env[name];
  if (shellValue !== undefined) env.COMPOSE_OVERRIDE_FILE = shellValue;
  Object.assign(env, shell);
  const args = script === 'deploy/deploy.sh' ? ['--no-pull'] : [STAMP];
  const result = spawnSync(bash(), [script, ...args], { cwd: dir, env, encoding: 'utf8', input: 'RESTAURER\n', timeout: 30_000 });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return { status: result.status, stderr: result.stderr, calls };
}

describe.each(['deploy/deploy.sh', 'deploy/backup/restore.sh'] as const)('%s : fichier compose complémentaire', (script) => {
  it('lu dans deploy/.env, il accompagne chaque commande, redémarrage compris', () => {
    const { status, calls } = run(script, `DOMAIN=x.test\nCOMPOSE_OVERRIDE_FILE=${SCHOOL}\n`);
    expect(status).toBe(0);
    expect(calls.some((call) => / up -d( --build)?$/.test(call))).toBe(true);
    const expected = `compose -f deploy/docker-compose.yml -f ${SCHOOL} --env-file deploy/.env `;
    expect(calls.filter((call) => !call.startsWith(expected))).toEqual([]);
  });

  it('lu aussi dans un deploy/.env enregistré sous Windows (CRLF)', () => {
    const { status, calls } = run(script, `COMPOSE_OVERRIDE_FILE=${SCHOOL}\r\nDOMAIN=x.test\r\n`);
    expect(status).toBe(0);
    expect(calls.filter((call) => !call.includes(` -f ${SCHOOL} --env-file`))).toEqual([]);
  });

  it('lu aussi entre guillemets', () => {
    const { status, calls } = run(script, `COMPOSE_OVERRIDE_FILE="${SCHOOL}" # école\n`);
    expect(status).toBe(0);
    expect(calls.filter((call) => !call.includes(` -f ${SCHOOL} --env-file`))).toEqual([]);
  });

  it('absent ou commenté : seul docker-compose.yml est utilisé (VPS inchangé)', () => {
    const { status, calls } = run(script, `DOMAIN=x.test\n# COMPOSE_OVERRIDE_FILE=${SCHOOL}\n`);
    expect(status).toBe(0);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((call) => !call.startsWith('compose -f deploy/docker-compose.yml --env-file deploy/.env '))).toEqual([]);
  });

  it('la variable du shell l’emporte sur deploy/.env', () => {
    const { status, calls } = run(script, `COMPOSE_OVERRIDE_FILE=${SCHOOL}\n`, 'deploy/autre.yml');
    expect(status).toBe(0);
    expect(calls.filter((call) => !call.includes(' -f deploy/autre.yml --env-file'))).toEqual([]);
  });

  it('introuvable : refus avant toute commande Docker', () => {
    const { status, stderr, calls } = run(script, 'COMPOSE_OVERRIDE_FILE=deploy/absent.yml\n');
    expect(status).toBe(1);
    expect(stderr).toContain('COMPOSE_OVERRIDE_FILE introuvable : deploy/absent.yml');
    expect(calls).toEqual([]);
  });
});

describe('deploy.sh : mot de passe PostgreSQL', () => {
  // Un caractère spécial casse l'adresse de la base donnée à « migrate » ; une valeur courte se devine.
  it.each([
    ['vide', ''],
    ['court', 'abc123'],
    ['caractère spécial', `${'a1'.repeat(20)}@`],
    ['trop long', 'a1'.repeat(65)],
  ])('%s : refus avant toute commande Docker, valeur non citée', (_label, password) => {
    const { status, stderr, calls } = run('deploy/deploy.sh', `POSTGRES_PASSWORD=${password}\n`);
    expect(status).toBe(1);
    expect(stderr).toContain('POSTGRES_PASSWORD invalide');
    if (password) expect(stderr).not.toContain(password);
    expect(calls).toEqual([]);
  });

  it('64 caractères hexadécimaux, même entre guillemets : accepté', () => {
    expect(run('deploy/deploy.sh', `POSTGRES_PASSWORD="${'0f'.repeat(32)}"\n`).status).toBe(0);
  });
});

describe('restore.sh : dossier des sauvegardes', () => {
  it('BACKUP_DIR entre guillemets : archives trouvées', () => {
    expect(run('deploy/backup/restore.sh', 'BACKUP_DIR="./backups" # disque local\n').status).toBe(0);
  });
});

describe.each(['deploy/deploy.sh', 'deploy/backup/restore.sh'] as const)('%s : variables du shell', (script) => {
  it('une variable du shell qui remplace celle de deploy/.env est signalée, sans sa valeur', () => {
    const { status, stderr } = run(script, 'DOMAIN=ecole.test\n', undefined, { DOMAIN: 'autre.test' });
    expect(status).toBe(0);
    expect(stderr).toContain('DOMAIN');
    expect(stderr).toContain('remplace');
    expect(stderr).not.toMatch(/autre\.test|ecole\.test/);
  });

  it('valeur identique : rien à signaler', () => {
    const { stderr } = run(script, 'DOMAIN=ecole.test\n', undefined, { DOMAIN: 'ecole.test' });
    expect(stderr).not.toContain('remplace');
  });
});

describe('deploy.sh : transcription Whisper', () => {
  const whisper = 'ASSIST_TRANSCRIPTION_PROVIDER=whisper\n';

  it('sans le profil « whisper » : refus avant toute commande Docker', () => {
    const { status, stderr, calls } = run('deploy/deploy.sh', whisper);
    expect(status).toBe(1);
    expect(stderr).toContain('COMPOSE_PROFILES');
    expect(calls).toEqual([]);
  });

  it.each(['COMPOSE_PROFILES=whisper\n', 'COMPOSE_PROFILES=n8n,whisper\n'])('avec %j : accepté', (profiles) => {
    expect(run('deploy/deploy.sh', whisper + profiles).status).toBe(0);
  });

  it('un autre profil dont le nom contient « whisper » ne suffit pas', () => {
    expect(run('deploy/deploy.sh', `${whisper}COMPOSE_PROFILES=whisper2\n`).status).toBe(1);
  });

  it('serveur Whisper externe (ASSIST_WHISPER_URL) : aucun profil exigé', () => {
    expect(run('deploy/deploy.sh', `${whisper}ASSIST_WHISPER_URL=https://whisper.ecole.test\n`).status).toBe(0);
  });
});
