import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../../src/config/config';

/** T007 — US1 : toutes les sources de développement désignent le port 3002 de l'API (A01, A02). */

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('Port de développement de l’API', () => {
  it('l’exemple de configuration fixe PORT=3002', () => {
    expect(read('backend/.env.example')).toMatch(/^PORT=3002\r?$/m);
  });

  it('le proxy HTTPS de développement relaie /api et /socket.io vers 3002', () => {
    const caddy = read('deploy/Caddyfile.dev');
    const targets = [...caddy.matchAll(/handle \/(api|socket\.io)\/\* \{\s*reverse_proxy host\.docker\.internal:(\d+)/g)];
    expect(targets.map(([, path, port]) => `${path}:${port}`)).toEqual(['api:3002', 'socket.io:3002']);
  });

  it('le proxy de l’interface vise http://localhost:3002', () => {
    expect(read('frontend/vite.config.ts')).toContain("'http://localhost:3002'");
  });

  it.each(['backend/.env.example', 'deploy/Caddyfile.dev', 'frontend/vite.config.ts', 'README.md'])(
    '%s ne mentionne plus le port 3000 de développement',
    (path) => {
      expect(read(path)).not.toMatch(/localhost:3000|host\.docker\.internal:3000|^PORT=3000/m);
    },
  );

  it('la valeur par défaut, sans PORT, est 3002', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/app',
      SESSION_SECRET: 'x'.repeat(32),
      FILES_DIR: './data/files',
      APP_ORIGIN: 'http://localhost:5173',
    });
    expect(config.port).toBe(3002);
  });

  it('le lanceur de développement démarre l’API avec rechargement (A02)', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['dev:backend']).toBe('npm run -w backend start:dev');
  });
});
