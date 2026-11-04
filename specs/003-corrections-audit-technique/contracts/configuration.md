# Configuration contract (API environment variables)

All variables are read **only** by `loadConfig` at startup (FR-004). An invalid value prevents
startup with a `ConfigError` message in French.

| Variable | Required | Default | Accepted values | Change |
|---|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL URL | unchanged |
| `SESSION_SECRET` | yes | — | ≥ 32 characters | unchanged |
| `FILES_DIR` | yes | — | path | unchanged |
| `APP_ORIGIN` | yes | — | valid URL | unchanged |
| `PORT` | no | `3002` | integer 1–65535 | is no longer re-read by `main.ts` |
| `TRUST_PROXY` | no | `loopback` | `true`, `false`, integer ≥ 0, or a comma-separated list of: `loopback`, `linklocal`, `uniquelocal`, IPv4/IPv6 address, CIDR range | **now validated** |
| `NODE_ENV`, `COOKIE_SECURE`, `LOGIN_RATE_LIMIT`, `JOBS_ENABLED`, `FFMPEG_PATH`, `FFPROBE_PATH` | no | unchanged | unchanged | `NODE_ENV` is no longer re-read by `app.setup.ts` |

Expected error message for `TRUST_PROXY=n'importe quoi` ("anything"):
`TRUST_PROXY invalide : utilisez true, false, un nombre de proxys, ou une liste parmi loopback, linklocal, uniquelocal, adresses IP ou plages CIDR` (TRUST_PROXY invalid: use true, false, a number of proxies, or a list from loopback, linklocal, uniquelocal, IP addresses or CIDR ranges).

## Ports per environment

| Environment | API port | Source |
|---|---|---|
| Development (workstation) | 3002 | default of `loadConfig`, `backend/.env.example`, Vite proxy, `deploy/Caddyfile.dev`, `start.bat` |
| Production (container) | 3000, internal to the Docker network | `deploy/api.Dockerfile` (`ENV PORT=3000`), `docker-compose.yml` |
| End-to-end tests | `API_PORT` of `e2e/playwright.config.ts` | unchanged |

## New deployment variables

| Variable | Where | Default | Role |
|---|---|---|---|
| `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` | `api` container | `60` | Maximum age of the latest `db-*.dump` archive required before applying a migration (research R12) |
| `PRE_MIGRATION_BACKUP_DIR` | `api` container | `/backups` | Folder where to look for this archive; configurable for the automated entrypoint test (research R12) |
