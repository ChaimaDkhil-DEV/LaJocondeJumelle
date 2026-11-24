import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Chaque variable lue doit être documentée, et chaque variable documentée doit servir : les exemples ne dérivent plus. */

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const withoutComments = (text: string) => text.replace(/^\s*#.*$/gm, '');
const names = (text: string, pattern: RegExp) => [...new Set([...text.matchAll(pattern)].map((m) => m[1]))].sort();

const declared = (path: string) => names(read(path), /^#? ?([A-Z][A-Z0-9_]+)=/gm);

/** Lues par loadConfig : env.X, env['X'] et listes de noms. */
const config = read('backend/src/config/config.ts');
const readByApi = names(config, /\benv\.([A-Z][A-Z0-9_]+)/g).concat(
  names(config, /'((?:DATABASE_URL|SESSION_SECRET|FILES_DIR|APP_ORIGIN|PUSH_VAPID_[A-Z_]+|TURNSTILE_[A-Z_]+))'/g),
);
const interpolated = names(
  withoutComments(read('deploy/docker-compose.yml') + read('deploy/docker-compose.school.yml')),
  /(?<!\$)\$\{([A-Z][A-Z0-9_]+)/g,
);
const readByScripts = ['BACKUP_ALERT_URL', 'BACKUP_MAX_AGE_HOURS', 'COMPOSE_OVERRIDE_FILE', 'COMPOSE_PROFILES'];

describe('backend/.env.example', () => {
  it('documente toutes les variables lues par l’API', () => {
    const documented = declared('backend/.env.example');
    expect(readByApi.length).toBeGreaterThan(30);
    expect(readByApi.filter((name) => !documented.includes(name))).toEqual([]);
  });

  it('ne documente que des variables lues par l’API', () => {
    expect(declared('backend/.env.example').filter((name) => !readByApi.includes(name))).toEqual([]);
  });
});

describe('deploy/.env.example', () => {
  it('documente toutes les variables utilisées par Docker Compose', () => {
    const documented = declared('deploy/.env.example');
    expect(interpolated.length).toBeGreaterThan(50);
    expect(interpolated.filter((name) => !documented.includes(name))).toEqual([]);
  });

  it('ne documente que des variables utilisées par Docker Compose ou par les scripts', () => {
    const used = [...interpolated, ...readByScripts];
    expect(declared('deploy/.env.example').filter((name) => !used.includes(name))).toEqual([]);
  });
});

it('Caddy reçoit toutes les variables que lit sa configuration', () => {
  const caddyfiles = ['deploy/Caddyfile', 'deploy/profiles/school/global.caddy', 'deploy/profiles/school/tls.caddy'].map(read).join('\n');
  const wanted = names(withoutComments(caddyfiles), /\{(?:\$|env\.)([A-Z][A-Z0-9_]+)/g);
  const block = (path: string) => {
    const text = read(path);
    return text.slice(text.indexOf('\n  caddy:\n')).split(/\n {2}[a-z][\w-]*:\n/)[1];
  };
  const given = names(block('deploy/docker-compose.yml') + block('deploy/docker-compose.school.yml'), /^ {6}([A-Z][A-Z0-9_]+):/gm);
  // Fixée par caddy-entrypoint.sh ; les autres ne servent qu'aux tests locaux du Caddyfile (valeurs par défaut).
  const internal = ['TURNSTILE_ORIGIN', 'API_UPSTREAM', 'SITE_ROOT', 'N8N_UPSTREAM', 'WHISPER_UPSTREAM'];
  expect(wanted.filter((name) => !given.includes(name) && !internal.includes(name))).toEqual([]);
});
