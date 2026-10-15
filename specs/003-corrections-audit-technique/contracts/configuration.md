# Contrat de configuration (variables d'environnement de l'API)

Toutes les variables sont lues **uniquement** par `loadConfig` au démarrage (FR-004). Une valeur
invalide empêche le démarrage avec un message `ConfigError` en français.

| Variable | Obligatoire | Défaut | Valeurs acceptées | Changement |
|---|---|---|---|---|
| `DATABASE_URL` | oui | — | URL PostgreSQL | inchangé |
| `SESSION_SECRET` | oui | — | ≥ 32 caractères | inchangé |
| `FILES_DIR` | oui | — | chemin | inchangé |
| `APP_ORIGIN` | oui | — | URL valide | inchangé |
| `PORT` | non | `3002` | entier 1–65535 | n'est plus relu par `main.ts` |
| `TRUST_PROXY` | non | `loopback` | `true`, `false`, entier ≥ 0, ou liste séparée par des virgules de : `loopback`, `linklocal`, `uniquelocal`, adresse IPv4/IPv6, plage CIDR | **désormais validée** |
| `NODE_ENV`, `COOKIE_SECURE`, `LOGIN_RATE_LIMIT`, `JOBS_ENABLED`, `FFMPEG_PATH`, `FFPROBE_PATH` | non | inchangés | inchangés | `NODE_ENV` n'est plus relu par `app.setup.ts` |

Message d'erreur attendu pour `TRUST_PROXY=n'importe quoi` :
`TRUST_PROXY invalide : utilisez true, false, un nombre de proxys, ou une liste parmi loopback, linklocal, uniquelocal, adresses IP ou plages CIDR`.

## Ports par environnement

| Environnement | Port de l'API | Source |
|---|---|---|
| Développement (poste) | 3002 | défaut de `loadConfig`, `backend/.env.example`, proxy Vite, `deploy/Caddyfile.dev`, `start.bat` |
| Production (conteneur) | 3000, interne au réseau Docker | `deploy/api.Dockerfile` (`ENV PORT=3000`), `docker-compose.yml` |
| Tests de bout en bout | `API_PORT` de `e2e/playwright.config.ts` | inchangé |

## Nouvelle variable de déploiement

| Variable | Où | Défaut | Rôle |
|---|---|---|---|
| `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` | conteneur `api` | `60` | Âge maximal de la dernière archive `db-*.dump` exigée avant d'appliquer une migration (research R12) |
