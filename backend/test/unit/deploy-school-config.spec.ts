import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Déploiement sur un serveur local d'école : HTTPS par défi DNS-01 (Cloudflare) et accès des parents
 * par Cloudflare Tunnel, sans port ouvert. Le déploiement VPS existant doit rester inchangé.
 */

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('Caddyfile : profils sélectionnés par CADDY_PROFILE', () => {
  const caddyfile = read('deploy/Caddyfile');

  it('importe le bloc global et le bloc TLS du profil, « public » par défaut (VPS inchangé)', () => {
    expect(caddyfile).toMatch(
      /^\s*import profiles\/\{\$CADDY_PROFILE:public\}\/global\.caddy\s*$/m,
    );
    expect(caddyfile).toMatch(/^\s*import profiles\/\{\$CADDY_PROFILE:public\}\/tls\.caddy\s*$/m);
  });

  it('le profil public n’ajoute aucune directive (Let’s Encrypt par HTTP, comme avant)', () => {
    const directives = (path: string) =>
      read(path)
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
    expect(directives('deploy/profiles/public/global.caddy')).toEqual([]);
    expect(directives('deploy/profiles/public/tls.caddy')).toEqual([]);
  });

  it('le profil école obtient son certificat par défi DNS Cloudflare, jeton lu dans l’environnement', () => {
    const tls = read('deploy/profiles/school/tls.caddy');
    expect(tls).toMatch(/dns cloudflare \{env\.CF_API_TOKEN\}/);
    expect(tls).toMatch(/resolvers 1\.1\.1\.1/);
    expect(tls).not.toMatch(/dns cloudflare [A-Za-z0-9_-]{30,}/);
  });

  it('le profil école fait confiance aux réseaux privés (cloudflared) pour l’adresse IP cliente', () => {
    expect(read('deploy/profiles/school/global.caddy')).toMatch(
      /trusted_proxies static private_ranges/,
    );
  });
});

describe('web.Dockerfile', () => {
  const dockerfile = read('deploy/web.Dockerfile');

  it('compile Caddy avec le module DNS Cloudflare', () => {
    expect(dockerfile).toMatch(/xcaddy build[^\n]*--with github\.com\/caddy-dns\/cloudflare/);
  });

  it('embarque les profils dans l’image', () => {
    expect(dockerfile).toMatch(/COPY deploy\/profiles \/etc\/caddy\/profiles/);
  });
});

describe('docker-compose.school.yml', () => {
  const compose = read('deploy/docker-compose.school.yml');

  it('active le profil école de Caddy avec le jeton DNS obligatoire', () => {
    expect(compose).toMatch(/CADDY_PROFILE:\s*school/);
    expect(compose).toMatch(/CF_API_TOKEN:\s*\$\{CF_API_TOKEN:\?[^}]+\}/);
  });

  it('lance cloudflared avec un jeton de tunnel obligatoire, après Caddy', () => {
    expect(compose).toMatch(/cloudflared:/);
    expect(compose).toMatch(/TUNNEL_TOKEN:\s*\$\{CF_TUNNEL_TOKEN:\?[^}]+\}/);
    expect(compose).toMatch(/depends_on:\s*\n\s+caddy:/);
  });

  it('cloudflared n’ouvre aucun port et utilise une image épinglée', () => {
    const block = compose.slice(compose.indexOf('cloudflared:'));
    expect(block).not.toMatch(/^\s+ports:/m);
    expect(block).toMatch(
      /image:\s*cloudflare\/cloudflared:\d{4}\.\d+\.\d+(@sha256:[0-9a-f]{64})?\s*$/m,
    );
  });
});

describe('.env.example', () => {
  const env = read('deploy/.env.example');

  it.each(['CF_API_TOKEN', 'CF_TUNNEL_TOKEN'])('documente %s sans valeur', (name) => {
    expect(env).toMatch(new RegExp(`^#?\\s*${name}=\\s*$`, 'm'));
  });
});

describe('deploy.sh', () => {
  it('accepte un fichier compose complémentaire via COMPOSE_OVERRIDE_FILE', () => {
    const script = read('deploy/deploy.sh');
    expect(script).toMatch(/COMPOSE_OVERRIDE_FILE/);
    expect(script).toMatch(/-f "\$COMPOSE_OVERRIDE_FILE"/);
  });
});
