import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

/**
 * CAPTCHA Cloudflare Turnstile — déploiement : les deux clés arrivent à l'API, la clé publique seule à Caddy, et la
 * politique de sécurité du contenu n'admet Cloudflare que si le CAPTCHA est activé.
 */

const ROOT = resolve(__dirname, '../../..');
/** Fins de ligne normalisées (copie de travail Windows en CRLF). */
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');

/** Bloc d'un service de docker-compose.yml (jusqu'au service suivant). */
function service(name: string): string {
  const compose = read('deploy/docker-compose.yml');
  const start = compose.indexOf(`\n  ${name}:\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n|\n[a-z]/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe('docker-compose.yml', () => {
  it('transmet les deux clés à l’API, vides par défaut (CAPTCHA désactivé)', () => {
    expect(service('api')).toMatch(/^\s+TURNSTILE_SITE_KEY: \$\{TURNSTILE_SITE_KEY:-\}$/m);
    expect(service('api')).toMatch(/^\s+TURNSTILE_SECRET_KEY: \$\{TURNSTILE_SECRET_KEY:-\}$/m);
  });

  it('Caddy ne reçoit que la clé publique ; la clé secrète ne va qu’à l’API', () => {
    expect(service('caddy')).toMatch(/^\s+TURNSTILE_SITE_KEY: \$\{TURNSTILE_SITE_KEY:-\}$/m);
    expect(read('deploy/docker-compose.yml').match(/^\s+TURNSTILE_SECRET_KEY:/gm)).toHaveLength(1);
    expect(read('deploy/docker-compose.school.yml')).not.toContain('TURNSTILE_SECRET_KEY');
    expect(read('deploy/web.Dockerfile')).not.toContain('TURNSTILE');
  });
});

describe('caddy-entrypoint.sh : origine Turnstile', () => {
  const origin = (env: Record<string, string>) =>
    new Promise<string>((done, fail) =>
      execFile(
        'sh',
        [resolve(ROOT, 'deploy/caddy-entrypoint.sh'), 'sh', '-c', 'printf "[%s]" "$TURNSTILE_ORIGIN"'],
        { timeout: 20_000, env: { ...process.env, CADDY_CA_SOURCE: '/inexistant', CADDY_CA_DIR: tmpdir(), CADDY_CA_INTERVAL: '1', ...env } },
        (error, stdout) => (error ? fail(error) : done(stdout)),
      ),
    );

  it('vide si le CAPTCHA est désactivé, même si une valeur traîne dans l’environnement', async () => {
    expect(await origin({ TURNSTILE_SITE_KEY: '' })).toBe('[]');
    expect(await origin({ TURNSTILE_SITE_KEY: '', TURNSTILE_ORIGIN: 'https://pirate.example' })).toBe('[]');
  }, 30_000);

  it('la seule origine de Cloudflare si le CAPTCHA est activé', async () => {
    expect(await origin({ TURNSTILE_SITE_KEY: '0x4AAAAAAAsite-fictive' })).toBe('[https://challenges.cloudflare.com]');
  }, 30_000);
});

describe('Caddyfile : politique de sécurité du contenu', () => {
  const csp = (value: string) =>
    /Content-Security-Policy "([^"]+)"/
      .exec(read('deploy/Caddyfile'))![1]!
      .replaceAll('{$TURNSTILE_ORIGIN}', value)
      .split(';')
      .map((directive) => directive.trim());

  it('désactivé : aucune origine externe, comme avant', () => {
    expect(csp('')).toEqual(expect.arrayContaining(["script-src 'self'", "frame-src 'self'"]));
    expect(csp('').join(';')).not.toContain('https://');
  });

  it('activé : Cloudflare seulement pour le script et le cadre, jamais « unsafe » ni joker', () => {
    const active = csp('https://challenges.cloudflare.com');
    expect(active).toEqual(expect.arrayContaining(["script-src 'self' https://challenges.cloudflare.com", "frame-src 'self' https://challenges.cloudflare.com"]));
    expect(active.filter((d) => d.includes('cloudflare'))).toHaveLength(2);
    expect(active).toEqual(expect.arrayContaining(["default-src 'self'", "connect-src 'self' wss:", "frame-ancestors 'none'"]));
    expect(active.find((d) => d.startsWith('script-src'))).not.toMatch(/unsafe|\*/);
  });
});

describe('.env.example : les variables sont documentées, sans vraie clé', () => {
  it.each(['backend/.env.example', 'deploy/.env.example'])('%s', (path) => {
    const lines = read(path).split('\n').filter((line) => /TURNSTILE_(SITE|SECRET)_KEY=/.test(line));
    expect(lines).toHaveLength(2);
    // Clés de test publiées par Cloudflare, ou valeur à remplacer ; commentées : désactivé par défaut.
    for (const line of lines) expect(line).toMatch(/^# TURNSTILE_(SITE|SECRET)_KEY=(1x0{20,}AA|remplacer-par-[a-z-]+)$/);
  });
});
