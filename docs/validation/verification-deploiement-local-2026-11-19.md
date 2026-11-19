# Verification — production deployment rehearsed locally after the security audit (19/11/2026)

Rehearsal on Docker Desktop (Windows), on `master` at `8080719` (security audit fixes #134 to #148).

- Two throwaway copies of the repository and two separate Compose projects (`ljjprodtest`, `ljjprodvide`).
- A test `deploy/.env` outside the repository: random secrets (`openssl rand`), `DOMAIN=localhost` with Caddy's
  internal certificate, and a test age key pair generated in the backup container.
- Everything was deleted afterwards: containers, volumes, built images, copies of the repository and test key.
- No configuration file was changed. This report contains no secret.

The previous rehearsal, from before the audit, is `verification-deploiement-local.md` (06/11/2026).

## 1. Production stack (`deploy/deploy.sh --no-pull`)

| Check | Result |
|-------|--------|
| `deploy.sh` on a blank stack | Passed in 141 s, including the pre-update backup (`db-*.dump.age`, `files-*.tar.gz.age`, offsite copy) |
| Services | `api`, `db`, `backup` healthy; `caddy` running; `migrate` `Exited (0)` |
| Migrations | 31 applied by `migrate`; `[db-roles] rôle d'exécution « app_runtime »` in its log |
| Runtime role (R02) | `rolsuper` false; `ALTER TABLE "AuditLog" DISABLE TRIGGER ALL` refused (`must be owner`); every API connection uses `app_runtime` |
| Published ports | Only Caddy, on 80 and 443 (TCP, and UDP 443). `api` (3000) and `db`, `backup` (5432) are exposed inside Docker but not published: `docker port` returns nothing |
| Logs | No error in `caddy`, `api`, `migrate`, `backup` |
| HTTP | `/api/health` 200; `/api/docs` 404; `http://` → `https://` (308); HSTS, CSP, `nosniff`, `Referrer-Policy` present |
| First super administrator | Created by `bootstrap`; the temporary password must be changed at first login |

`db` logged one error, `relation "_prisma_migrations" does not exist`. It comes from the very first
`prisma migrate status`, run on the empty database before migrating. It is expected on a first start only.

## 2. Backup, then restore on a blank database

The procedure of `docs/sauvegardes-chiffrees.md`, section 6, was followed:

- test data was created: the super administrator with a chosen password, a profile photo and a voice message;
- a backup was made;
- the archives were taken from the **offsite copy** and restored with the real `restore.sh` and the private key;
- the target was a new project: new volumes, other database and runtime role passwords, same `SESSION_SECRET`;
- the `app_runtime` role did not exist in the blank database before the restore.

| Check | Before backup | After restore |
|-------|---------------|---------------|
| Accounts, files, audit rows | 2, 1, 15 | 2, 1, 15 |
| Profile photo, SHA-256 | `3b63e839…` | identical |
| Voice message, SHA-256 | `581f7686…` | identical |
| Login with the password chosen before the backup | | 200 |
| Runtime role | absent | recreated by `migrate`; every API connection uses `app_runtime` |
| Plain-text files among the backups | | none |

The restore took **23 s**: check of the archives, stop, database, files and restart. That figure is for a very
small database and will grow with real data. The two accounts are the super administrator and the technical
« enseignant anonymisé » account, created by a migration.

## 3. Rollback to the previous version

Rollback from `8080719` to `935d9fb`, the `master` before #148, with the README procedure: `git checkout <commit>`,
then `deploy/deploy.sh --no-pull`. No migration, backend file or deployment file differs between the two commits.

| Check | Result |
|-------|--------|
| Duration | 58 s, including the pre-update backup |
| Frontend served | The old hint color `#FEE2E2` is served instead of `#3B1702`: the previous version is the one served |
| Data | Unchanged: 2 accounts, 1 file, 16 audit rows |
| Services | Only `caddy` was recreated. The `api` container kept running, since its image was unchanged. `migrate` reapplied the runtime role. |
| `/api/health`, logs | 200; no error |

A rollback before a migration needs that migration's `down.sql`, or a restore. It was not exercised here.

## 4. Client IP address and session cookie

| Check | Result |
|-------|--------|
| 6 failed logins, each with a different forged `X-Forwarded-For`, `CF-Connecting-IP` and `X-Real-IP` | 5 × 401, then 429: the login limiter is not fooled by forged headers |
| Address in the audit log | `LOGIN_FAILURE` ×5 and `ACCESS_DENIED` ×1, all with the real peer address seen by Docker (`172.20.0.1`); no forged address |
| Session cookie | `HttpOnly; Secure; SameSite=Strict`, 12 h |
| School profile, behind cloudflared | Not rerun: its certificate needs a real Cloudflare token. Verified in #141 with the real Caddy: a forged `X-Forwarded-For` is ignored and only cloudflared (`172.30.255.2`) is trusted. |

The application does not read `CF-Connecting-IP`.

- It takes the client address from `X-Forwarded-For` (`TRUST_PROXY=uniquelocal`).
- Caddy keeps that header only from cloudflared, and only its rightmost address (`trusted_proxies_strict`).
- Cloudflare appends the visitor's real address to the right of that header, so the result is the same.
- A `CF-Connecting-IP` forged by a client has no effect.
- The login limiter and the audit log both use the same address (`clientIp`).

## To check on the real server

- **Visitors who connect directly** (school Wi-Fi, public profile): two different devices must show two
  different addresses in the audit log. Under Docker Desktop all host traffic appears as `172.20.0.1`.
  On Linux, the userland proxy of Docker would hide the real address.
- **Through the tunnel**: the address in the audit log must be the visitor's.
- `ss -tlnp` on the host, the TLS test (SSL Labs) on the real domain, `chmod 600 deploy/.env`.
- A restore on a real blank machine, and the crontab entry of `check-backup.sh` with a real alert.
