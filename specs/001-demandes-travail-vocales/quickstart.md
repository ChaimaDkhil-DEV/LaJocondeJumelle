# Quickstart & validation – Phase 1

Guide to start the project and prove, scenario by scenario, that the feature meets
the [spec](./spec.md). Details of the routes and the data are in
[contracts/](./contracts/) and [data-model.md](./data-model.md).

## Prerequisites

- Node.js 24 LTS and npm. Docker is required only for deployment: locally, PostgreSQL
  is provided by embedded-postgres (development database and disposable test databases).
- ffmpeg installed locally if the API is started outside Docker.
- To test on a real phone: phone on the same network and HTTPS (the microphone only
  works in a secure context, except on `localhost`).

## Getting started (development)

```bash
npm install                                  # installs backend/ and frontend/ (workspaces)
cp backend/.env.example backend/.env         # fill in DATABASE_URL, SESSION_SECRET, FILES_DIR
npm run -w backend db:dev                    # embedded PostgreSQL 17 (port 5433), in a dedicated terminal
# (or, with Docker: docker compose -f deploy/docker-compose.dev.yml up -d db)
npm run -w backend prisma:migrate            # applies the migrations (including the append-only triggers)
npm run -w backend prisma:seed               # default settings, category « Photocopies », demo accounts
npm run -w backend start:dev                 # API on http://localhost:3000
npm run -w frontend dev                      # SPA on http://localhost:5173 (proxies /api and /socket.io)
```

The seed creates demo accounts (passwords in the seed output, to be changed at
first login): `superadmin`, `responsable`, `enseignante`, `reprographie`.

**Testing on a phone**: `docker compose -f deploy/docker-compose.dev.yml up caddy` serves
the application over HTTPS at `https://<machine-ip>:8443` with a Caddy internal certificate;
accept the certificate on the phone.

## Running the tests

```bash
npm run -w backend test            # unit: state machine, access policy, deadlines, files
npm run -w backend test:integration  # API + test PostgreSQL
npm run -w frontend test           # components (Vitest)
npm run test:e2e                   # end to end + axe: Chromium, Firefox, WebKit, iPhone 13, Pixel 7, 320 px
npm audit --audit-level=high       # fails on a high or critical vulnerability
```

Expected result: everything green, no axe violation at level A or AA.

## Validation scenarios

| # | Scenario (spec) | Steps | Expected result |
|---|-----------------|-------|-----------------|
| V1 | US1 – voice request | On a smartphone (Playwright iPhone and Pixel profile), `enseignante` creates a « Photocopies » request, records 5 s, listens back, redoes it, picks `reprographie`, priority Urgente (Urgent), sends | Status « Envoyée » (Sent), timestamped; `reprographie` plays the voice message (`audio/mp4` format) on Chromium, WebKit and Firefox |
| V2 | US1 – recipient outside the category | Direct call to `POST /api/requests` with a `recipientId` that is not a recipient of the category | `422 RECIPIENT_NOT_ALLOWED`, nothing is created |
| V3 | US1 – send failure | Cut the network (Playwright `offline`) at the moment of sending, then restore it and click « Réessayer » (Retry) | Failure message; request visible in the outbox; only one request created after the retry |
| V4 | US1 – microphone refused | Refuse the microphone permission | Explanation displayed; sending possible with a written description |
| V5 | US2 – direct workflow | `reprographie`: Accepter (Accept) → En cours (In progress) → Terminée (Completed); `enseignante`: À corriger (To correct) without a comment, then with one | Timestamps present; correction refused without a comment; accepted with one; assignee notified |
| V6 | US2 – photo required | Category with a required photo: move to « Terminée » without a photo, then with a photo taken | `422 PHOTO_REQUIRED`, then success; photo without EXIF metadata |
| V7 | US2 – rejection by the assignee | `reprographie` rejects a « Envoyée » request without a reason, then with one | Rejection blocked, then status « Refusée » (Rejected), requester notified with the reason |
| V8 | Cancellation | `enseignante` cancels a « Envoyée » request, then tries to cancel an « Acceptée » (Accepted) request | « Annulée » (Cancelled); second case: action absent from `allowedActions` and `409` if forced |
| V9 | Concurrent transitions | Two sessions accept the same request at the same time | One succeeds, the other receives `409 STATE_CHANGED` and sees the up-to-date state |
| V10 | US3 – thread and confidentiality | Exchange of text + voice message + photo; then a non-participant user opens `/api/requests/:id` and `/api/files/:id` | Messages with author and time, visible without reloading; non-participant: `404` and an `ACCESS_DENIED` entry in the audit |
| V11 | US3 – forbidden file | Attach an `.exe` renamed to `.jpg`, then a 20 MB PDF | `415 FILE_TYPE_NOT_ALLOWED`; `413 FILE_TOO_LARGE` |
| V12 | US4 – notifications | Two browsers open; send an urgent request | Notification in < 5 s, without reloading, « Urgente » style (icon + text); after reconnection, the unread ones are present |
| V13 | US5 – workflow B | Workflow B category with final validation: submit, reject without a reason, reject with a reason; new request: approve + assign, carry out, validate | Invisible to the employee before approval; reason required; « Refusée »; then « En attente de validation finale » (Awaiting final validation) → « Clôturée » (Closed) |
| V14 | US6 – delays | « Urgente » rule with a 1 min takeover; send without accepting; wait | Countdown displayed; flagged as close to the due date; « En retard (prise en charge) » (Overdue (takeover)) in < 30 s after the due date; manager notified; request still visible |
| V15 | US7 – search | Set of 10,000 requests (bulk seed script); combined filters status + priority + period | Correct results and only authorized ones, in < 2 s |
| V16 | US8 – administration | `superadmin` creates an account, changes a deadline and a category; a `responsable` tries to open `/admin` | Changes applied to new requests only; audit entries; manager: `403` and audit |
| V17 | Non-modifiable audit | In the database: `UPDATE "AuditLog" …` and `DELETE FROM "RequestEvent" …` | Error raised by the trigger, no row modified |
| V18 | Accessibility and responsive | Journeys V1, V5, V10 at 320 px, keyboard only, with axe | No horizontal scrolling; all actions reachable by keyboard; no axe violation |


## Deployment (VPS)

Prerequisites on the VPS: Docker and Docker Compose installed, the domain's DNS pointing to the VPS,
ports 80 and 443 open, and read access to the private GitHub repository (a deploy key, for example),
needed for cloning and for every update.

### First deployment

From the root of the cloned repository:

```bash
cp deploy/.env.example deploy/.env     # domain, ACME e-mail, secrets, backups
deploy/deploy.sh                       # update code, back up, build and start
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f api   # migrations applied at startup
# First super administrator (temporary password displayed once only):
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api node dist/cli/bootstrap.js admin "Direction"
```

Use `deploy/deploy.sh` even the first time: on a new database, a `docker compose … up` run on its
own stops with "Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh." (pending
migration without a recent backup), because no backup exists yet.

`bootstrap.js` is idempotent: it creates the default settings and permissions without overwriting
existing values, and creates the super administrator only if none exists. No demo data is created
in production.

Keep a copy of `deploy/.env` in a secrets manager, off the server: no backup contains it, and
changing `SESSION_SECRET` invalidates every printed class QR code. Set `BACKUP_OFFSITE_DIR`, then add
the backup check to the host's crontab (it alerts `BACKUP_ALERT_URL` if the latest backup is missing
or too old):

```text
0 8 * * * cd /path/to/repository && deploy/backup/check-backup.sh
```

To move to another server, or to go back to the previous one, follow
[docs/migration-hebergeur.md](../../docs/migration-hebergeur.md).

### Update

```bash
deploy/deploy.sh
```

The script updates the code (`git pull --ff-only`), backs up the database and files, then rebuilds
and restarts the containers. It stops without restarting anything if the pull or the backup fails,
for example if the local history has diverged or the server is not on a branch.

### Deploying a specific commit

```bash
git checkout <commit>
deploy/deploy.sh --no-pull
```

`--no-pull` keeps the code already on the server. It does not undo any migration: to go back before
an applied migration, run its `down.sql` by hand or restore a backup (see the restore test below).

### Checks

Valid HTTPS certificate; `Strict-Transport-Security`, `Content-Security-Policy` and
`Permissions-Policy` headers present (`curl -I https://<domain>`);
`https://<domain>/api/files/<id>` without a cookie returns `401`; no PostgreSQL or API port exposed
(`docker compose ps`); API logs in JSON format with no secrets (`docker compose logs api`); daily
backup present in `BACKUP_DIR` (`db-<timestamp>.dump` and `files-<timestamp>.tar.gz`).

**Restore test** (mandatory before going live, on a test machine):

1. Deploy, create a few requests with a voice message and a photo, then run an immediate backup:
   `docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec backup bash /scripts/backup.sh`.
2. Change some data (new request, message).
3. Restore: `deploy/backup/restore.sh <timestamp>` (confirmation required: type `RESTAURER`).
4. Check: login works, the requests from step 1 are present with a playable voice message and their
   photo, the data from step 2 is gone, the audit log can be viewed.
5. Record the date, the duration of the restore and the result.
