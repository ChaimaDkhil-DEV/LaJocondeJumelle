import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

/**
 * Audit de sécurité R01 — l'API montait tout le volume de données de Caddy (clés privées des certificats
 * HTTPS et de son autorité interne). Seul le certificat racine de l'autorité interne (relais Whisper) lui
 * est utile : Caddy le publie, et lui seul, dans un volume dédié que l'API monte en lecture seule.
 */

const ROOT = resolve(__dirname, '../../..');
/** Fins de ligne normalisées (copie de travail Windows en CRLF). */
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const ENTRYPOINT = resolve(ROOT, 'deploy/caddy-entrypoint.sh');

/** Bloc d'un service de docker-compose.yml (jusqu'au service suivant). */
function service(compose: string, name: string): string {
  const start = compose.indexOf(`\n  ${name}:\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n|\n[a-z]/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe('docker-compose.yml : l’API ne voit plus les clés de Caddy (R01)', () => {
  const compose = read('deploy/docker-compose.yml');
  const api = service(compose, 'api');
  const caddy = service(compose, 'caddy');

  it('l’API ne monte pas le volume de données de Caddy', () => {
    expect(api).not.toMatch(/^\s+- caddy_(data|config):/m);
  });

  it('l’API monte le volume du certificat racine en lecture seule et le lit à cet endroit par défaut', () => {
    expect(api).toMatch(/^\s+- caddy_ca:\/caddy-ca:ro\s*$/m);
    expect(api).toMatch(/ASSIST_WHISPER_CA_FILE: \$\{ASSIST_WHISPER_CA_FILE:-\/caddy-ca\/root\.crt\}/);
  });

  it('Caddy écrit ce volume ; le volume est déclaré', () => {
    expect(caddy).toMatch(/^\s+- caddy_ca:\/ca\s*$/m);
    expect(compose).toMatch(/^volumes:[\s\S]*^\s{2}caddy_ca:\s*$/m);
  });

  it('aucun autre service ne monte le volume de données de Caddy', () => {
    const mounts = compose.match(/^\s+- caddy_data:.*$/gm) ?? [];
    expect(mounts).toEqual(['      - caddy_data:/data']);
  });

  it('.env.example documente le nouveau chemin', () => {
    expect(read('deploy/.env.example')).toMatch(/^# ASSIST_WHISPER_CA_FILE=\/caddy-ca\/root\.crt$/m);
  });
});

describe('web.Dockerfile : Caddy démarre par le script de publication', () => {
  const dockerfile = read('deploy/web.Dockerfile');

  it('installe le script et garde la commande de Caddy (ENTRYPOINT efface le CMD hérité)', () => {
    expect(dockerfile).toMatch(/COPY deploy\/caddy-entrypoint\.sh \/usr\/local\/bin\/caddy-entrypoint\.sh/);
    expect(dockerfile).toMatch(/ENTRYPOINT \["\/usr\/local\/bin\/caddy-entrypoint\.sh"\]/);
    expect(dockerfile).toMatch(
      /CMD \["caddy", "run", "--config", "\/etc\/caddy\/Caddyfile", "--adapter", "caddyfile"\]/,
    );
  });
});

describe('caddy-entrypoint.sh', () => {
  it('ne publie que le certificat racine, jamais une clé', () => {
    const script = read('deploy/caddy-entrypoint.sh');
    expect(script).toMatch(/pki\/authorities\/local\/root\.crt/);
    expect(script).not.toMatch(/\.key/);
    expect(script).toMatch(/^exec "\$@"$/m);
  });

  it('copie le certificat dès qu’il apparaît, le met à jour, et s’arrête avec Caddy', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ljj-caddy-ca-'));
    const pki = join(dir, 'data/caddy/pki/authorities/local');
    const ca = join(dir, 'ca');
    const bin = join(dir, 'bin');
    await Promise.all([mkdir(pki, { recursive: true }), mkdir(ca), mkdir(bin)]);
    // Faux Caddy : crée son autorité après le démarrage, la renouvelle, puis s'arrête.
    const fake = join(bin, 'caddy');
    await writeFile(
      fake,
      [
        '#!/bin/sh',
        `printf KEY > '${pki}/root.key'`,
        'sleep 1',
        `printf CERT-1 > '${pki}/root.crt'`,
        'sleep 2',
        `cp '${ca}/root.crt' '${dir}/seen-1'`,
        `printf CERT-2 > '${pki}/root.crt'`,
        'sleep 2',
        'echo "caddy $*"',
      ].join('\n') + '\n',
    );
    await chmod(fake, 0o755);

    const output = await new Promise<string>((done, fail) =>
      execFile(
        'sh',
        [ENTRYPOINT, 'caddy', 'run'],
        {
          timeout: 20_000,
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH}`,
            CADDY_CA_SOURCE: join(pki, 'root.crt'),
            CADDY_CA_DIR: ca,
            CADDY_CA_INTERVAL: '1',
          },
        },
        // La sortie n'est rendue qu'une fois la boucle de publication terminée (elle partage les tubes).
        (error, stdout) => (error ? fail(error) : done(stdout)),
      ),
    );

    expect(output).toBe('caddy run\n');
    expect(await readFile(join(dir, 'seen-1'), 'utf8')).toBe('CERT-1');
    expect(await readFile(join(ca, 'root.crt'), 'utf8')).toBe('CERT-2');
    expect(await readdir(ca)).toEqual(['root.crt']);
  }, 30_000);
});
