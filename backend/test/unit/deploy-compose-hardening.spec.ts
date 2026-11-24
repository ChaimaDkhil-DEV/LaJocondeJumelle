import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Réglages de production de Docker Compose : journaux bornés, clé de sauvegarde exigée, ports de développement locaux. */

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');

/** Blocs « service » d'un fichier Compose, par nom. */
function services(path: string): Map<string, string> {
  const text = read(path);
  const body = text.slice(text.indexOf('\nservices:\n') + '\nservices:\n'.length);
  const section = body.split(/^[a-z]/m)[0];
  const parts = section.split(/^ {2}([a-z][\w-]*):\n/m);
  const found = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) found.set(parts[i], parts[i + 1]);
  return found;
}

describe.each([
  ['deploy/docker-compose.yml', ['caddy', 'api', 'migrate', 'whisper', 'n8n', 'n8n-db', 'n8n-backup', 'db', 'backup']],
  ['deploy/docker-compose.school.yml', ['cloudflared']],
])('%s : journaux', (path, names) => {
  it.each(names)('%s : taille des journaux bornée', (name) => {
    expect(services(path).get(name)).toMatch(/^ {4}logging: \*logging$/m);
  });

  it('cinq fichiers de 10 Mo au plus par conteneur', () => {
    expect(read(path)).toMatch(/^x-logging: &logging\n {2}driver: json-file\n {2}options:\n {4}max-size: 10m\n {4}max-file: '5'$/m);
  });
});

describe('docker-compose.yml', () => {
  it.each(['backup', 'n8n-backup'])('%s : clé publique de chiffrement exigée', (name) => {
    expect(services('deploy/docker-compose.yml').get(name)).toMatch(/BACKUP_AGE_RECIPIENT: \$\{BACKUP_AGE_RECIPIENT:\?[^}]+\}/);
  });

  it('le secret des QR codes est transmis à l’API', () => {
    expect(services('deploy/docker-compose.yml').get('api')).toMatch(/QR_SIGNING_SECRET: \$\{QR_SIGNING_SECRET:-\}/);
  });
});

describe('n8n derrière Caddy', () => {
  it('domaine et adresses autorisées transmis à Caddy, fermés par défaut', () => {
    // Le défaut du Caddyfile ne vaut que si la variable est absente : une valeur vide casserait sa configuration.
    const caddy = services('deploy/docker-compose.yml').get('caddy');
    expect(caddy).toMatch(/N8N_DOMAIN: \$\{N8N_DOMAIN:-n8n\.localhost\}/);
    expect(caddy).toMatch(/N8N_ALLOWED_IPS: \$\{N8N_ALLOWED_IPS:-127\.0\.0\.1\/32\}/);
  });

  it('les routes d’intégration de l’API ne sont pas joignables depuis Internet (n8n les appelle en interne)', () => {
    const caddyfile = read('deploy/Caddyfile');
    expect(caddyfile).toMatch(/^\thandle \/api\/integrations\/\* \{\n\t\trespond 404\n\t\}$/m);
  });
});

describe('docker-compose.dev.yml', () => {
  it('PostgreSQL de développement (mot de passe connu) : ce poste seulement', () => {
    const db = services('deploy/docker-compose.dev.yml').get('db')!;
    expect(db).toContain("- '127.0.0.1:5433:5432'");
    expect(db.match(/:5432'/g)).toHaveLength(1);
  });
});

describe('.env.example', () => {
  it('propose un secret distinct pour les QR codes, sans valeur', () => {
    expect(read('deploy/.env.example')).toMatch(/^QR_SIGNING_SECRET=$/m);
  });
});
