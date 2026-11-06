# Verification — production stack rehearsed locally

Branch `feat-preparation-deploiement`, created from `master` (`46ea6c9`, merge of #74).

## Results of 06/11/2026 (executed)

Rehearsal on Docker Desktop (Windows), with `DOMAIN=localhost`, a throwaway `deploy/.env`, Caddy's
internal certificate and a separate Compose project (`ljj-test`), deleted afterwards. The scripts and
Compose file are those of this branch, in a Linux line-ending copy.

| Check | Result |
|-------|--------|
| `deploy/deploy.sh --no-pull` on a blank stack | Failed, then passed after fixing `.dockerignore` (see below) |
| Services | `api`, `db`, `backup` healthy, `caddy` running |
| Migrations | 15 applied at startup |
| Headers | HSTS, CSP, `Permissions-Policy`, `X-Content-Type-Options`, `Referrer-Policy` present |
| Redirect, access | HTTP returns `308`; a file without a cookie returns `401` |
| Exposure | Only Caddy publishes ports; no database or API port |
| Voice message in the image | Upload and conversion by ffmpeg accepted; file read back |
| Offsite rotation | Files past 14 days deleted; newer files and unrelated files kept |
| Backup health check | Passes with a recent backup, fails without one |
| `deploy/backup/check-backup.sh` | 9 scenarios under Linux, 3 alerts received out of 3 expected |
| `0006/down.sql` | Indexes and `_prisma_migrations` row removed; migration applied again at restart |

### Simulated change of server

Final backup, a write after that backup, deletion of all the test project's volumes, then
`DC up -d db` and `deploy/backup/restore.sh`, as in `docs/migration-hebergeur.md`. The restore took
23 s, with images already built and very little data.

| Check after the restore | Result |
|-------------------------|--------|
| Login with an existing account | OK |
| Request present | OK |
| Voice message, photo | OK, identical SHA-256 |
| Data written after the backup | Absent, as expected |
| Printed class QR code | OK, same token with the same `SESSION_SECRET` |
| Audit log | OK |
| Writing after the restore | OK |

## Defects found

- **`.dockerignore` blocked every image build.** `**/coverage`, meant for test coverage reports, also
  excluded `frontend/src/features/coverage` and `backend/src/coverage`. CI builds no image, so nothing
  had shown it. The pattern now names the report folders only.
- **Older code starts on a newer database.** With a migration unknown to the code in
  `_prisma_migrations`, the API started and stayed healthy. This is documented in
  `docs/migration-hebergeur.md`; the behaviour is unchanged.

## Not verified

A real server and domain, a real Let's Encrypt certificate, two distinct hosts, DNS changes, a data
volume close to production, the application in a browser on this stack, and `check-backup.sh` run by
cron. T055, T056 and T057 stay open until they run on pre-production.
