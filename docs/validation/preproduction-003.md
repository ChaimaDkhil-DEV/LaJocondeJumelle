# Pre-production — checklist (feature 003, T055 to T058 and T061)

> Prepared on 2026-10-21 on `master` (`72c7d81`). Tasks: `specs/003-corrections-audit-technique/tasks.md`
> (T055 to T058, T061); scenario 6 of `specs/003-corrections-audit-technique/quickstart.md`.
> Findings closed once the list has been worked through: A22, A23 (T055), A24 (T056), A25 (T057),
> A20 and A26 (T058).

Recommended order: **A** locally (no server), then **B** and **C** on pre-production, then **D**
on a blank server. Each section says where to record the result.

## Prerequisites

- [ ] Pre-production: Docker host with the repository cloned on `master` (`72c7d81` or later),
      `deploy/.env` filled in from `deploy/.env.example` (`DOMAIN` pointing to the host,
      `ACME_EMAIL`, `POSTGRES_PASSWORD`, `SESSION_SECRET`), ports 80 and 443 open.
- [ ] Pre-production deployed once with `deploy/deploy.sh`;
      `docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps`: all services
      `running`, `api` `healthy`.
- [ ] A test account on pre-production (known username and password).
- [ ] Blank server for D: Docker and Docker Compose installed, nothing else.

Below, `DC` stands for `docker compose -f deploy/docker-compose.yml --env-file deploy/.env`,
run from the repository root.

## A. Locally — end-to-end tests and final verification (T058, T061)

- [ ] `npm run test:e2e` (all profiles, including `e2e/sc001-create-timing.spec.ts`).
      Expected: all green. The assignment flows (`coverage-class.spec.ts`) skip
      themselves after 22:00 school time: run during the day so that they run.
- [ ] `npm run verify`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`.
- [ ] CI green on the latest commit of `master`:
      `gh run list --branch master --limit 1`.

Record (test counts, creation time measured by `sc001-create-timing`) in
`docs/validation/verification-003.md`, section "Vérification finale" (Final verification), on the model of
`verification-finale.md`.

## B. Pre-production — mandatory backup before migration (T055)

The test migration is created **on the pre-production host only**, never in the local
repository: locally, the project hook would immediately apply any new `migration.sql` to the development
database (see `CLAUDE.md`).

1. [ ] Create an empty migration, sorted after the last one (`0009_supervision_data`):

   ```text
   mkdir backend/prisma/migrations/9999_test_sauvegarde_imposee
   echo "-- Migration de test (T055), sans effet." > backend/prisma/migrations/9999_test_sauvegarde_imposee/migration.sql
   ```

2. [ ] Make sure no backup is less than an hour old (otherwise the refusal will not happen):
       `find deploy/backups -name 'db-*.dump' -mmin -60` must display nothing (adjust the path
       if `BACKUP_DIR` is changed). If needed, wait or temporarily move these files.
3. [ ] Run **without** the script: `DC up -d --build`, then `DC logs api --tail 20`.
       Expected: "Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh." (Pending migration without a recent backup: run deploy/deploy.sh.);
       `DC ps` shows `api` stopped or restarting.
4. [ ] Run `deploy/deploy.sh`.
       Expected: "[deploy] 1/2 : sauvegarde avant mise à jour" ([deploy] 1/2: backup before update), an archive
       `db-<horodatage>.dump` (and `files-<horodatage>.tar.gz`) in the backups folder,
       then the migration `9999_test_sauvegarde_imposee` applied (`DC logs api`).
5. [ ] `DC ps`: `api` `healthy` (healthcheck on `http://127.0.0.1:3000/api/health`).
6. [ ] **Cleanup, in this order**:
   - delete the folder `backend/prisma/migrations/9999_test_sauvegarde_imposee` on the host;
   - remove the migration from Prisma's history, otherwise `migrate status` reports it as
     "applied but missing" and the API may refuse to start at the next deployment:

     ```text
     DC exec db psql -U app -d app -c "DELETE FROM _prisma_migrations WHERE migration_name = '9999_test_sauvegarde_imposee';"
     ```

     (adjust `-U` and `-d` to `POSTGRES_USER` and `POSTGRES_DB`);
   - `DC exec api npx --no-install prisma migrate status`: "Database schema is up to date!";
   - `git status` on the host: clean.

Record (outputs of steps 3 to 6, archive timestamp) in
`docs/validation/verification-003.md`.

## C. Pre-production — security headers and upload size (T057)

1. [ ] `curl -sI https://<domaine>/` and `curl -sI https://<domaine>/api/health`.
       Expected on both: `strict-transport-security: max-age=31536000; includeSubDomains`,
       `content-security-policy: default-src 'self'; …`, `x-content-type-options: nosniff`,
       `referrer-policy`, `permissions-policy`; no `server` header.
2. [ ] Upload of 27 MB (beyond Caddy's limit, 26 MB):

   ```text
   head -c 28311552 /dev/urandom > /tmp/envoi-27mo.bin
   curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://<domaine>" \
     -F kind=DOCUMENT -F file=@/tmp/envoi-27mo.bin https://<domaine>/api/files
   ```

   Expected: `413`, even before the API (no need to be logged in).
3. [ ] Optional, API limit (25 MB): log in then upload 25.5 MB.

   ```text
   curl -s -c /tmp/sid.txt -H "Origin: https://<domaine>" -H "Content-Type: application/json" \
     -d '{"username":"<compte>","password":"<mot de passe>"}' https://<domaine>/api/auth/login
   head -c 26738688 /dev/urandom > /tmp/envoi-25-5mo.bin
   curl -s -w "\n%{http_code}\n" -b /tmp/sid.txt -H "Origin: https://<domaine>" \
     -F kind=DOCUMENT -F file=@/tmp/envoi-25-5mo.bin https://<domaine>/api/files
   ```

   Expected: refusal by the API (4xx code and error message), no file saved.
4. [ ] Delete the test files: `rm /tmp/envoi-*.bin /tmp/sid.txt`.

Record the outputs in a new `docs/validation/en-tetes-securite.md` (date, domain,
headers observed, return codes).

## D. Blank server — restoring a real backup (T056)

Use a **real** backup (production, or populated pre-production), never pre-production
itself as the target: the restore replaces all data.

1. [ ] Clone the repository on the blank server, at the **same commit** as the one that was running at the
       time of the backup (otherwise the API will find a pending migration and require a recent
       backup at startup).
2. [ ] Create `deploy/.env` (same `POSTGRES_USER`, `POSTGRES_DB`; `DOMAIN` of the test server).
3. [ ] Copy `db-<horodatage>.dump` and `files-<horodatage>.tar.gz` into the backups
       folder (`deploy/backups` by default).
4. [ ] **Start the database before the restore**: `DC up -d db`, then wait for `healthy`
       (`DC ps`). `restore.sh` runs `pg_restore` with `--no-deps`: on a blank server, the database
       would not be started without this step.
5. [ ] Note the start time, then `deploy/backup/restore.sh <horodatage>` and type `RESTAURER` (RESTORE).
       Note the end time (the first `up -d` builds the images: count it separately).
6. [ ] `DC ps`: all services `running`, `api` `healthy`.
7. [ ] Checks in the application:
   - [ ] login with an existing account;
   - [ ] a request with a voice message: playback of the voice message;
   - [ ] a photo (attachment or proof of attendance): display;
   - [ ] audit log (super administrator): events prior to the backup present.

Record in a new `docs/validation/restauration.md`: date, server, timestamp and
origin of the backup, duration (restore alone, and image build), result of
each check, deviations.

## Closing

- [ ] Tick T055 to T058 and T061 in `specs/003-corrections-audit-technique/tasks.md`.
- [ ] Update the table in §12 of `docs/ARCHITECTURE.md`: A20, A22, A23, A24, A25, A26
      (status and proof).
- [ ] Tick the SC criteria met in `specs/003-corrections-audit-technique/spec.md`.
