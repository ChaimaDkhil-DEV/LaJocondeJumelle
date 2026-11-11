# La Joconde Jumelle — work requests and voice messaging (phase 1)

Web application for a private school: staff send work requests to colleagues or to the
administration by **speaking rather than typing**, from a smartphone, a tablet or a computer. Each
request has its own discussion thread (text, voice messages, photos, PDFs), a tracked status,
deadlines and a full history. Notifications arrive in real time, inside the application only.

- **Roles**: employee, admin, super administrator (the "Administrateur" area; admins see its
  reference data — floors, levels, classes, students — and a read-only staff list).
- **Workflows**: A (direct) and B (prior administrative approval), chosen per category.
- **Confidentiality**: private files served only by the API, permissions checked on the server,
  tamper-proof audit log.

## Documentation

| Document | Content |
|----------|---------|
| [Specification](specs/001-demandes-travail-vocales/spec.md) | Requirements, scenarios, success criteria, personal data, open points |
| [Technical plan](specs/001-demandes-travail-vocales/plan.md) | Stack, architecture, justified deviations |
| [Quickstart and validation](specs/001-demandes-travail-vocales/quickstart.md) | Getting started, tests, scenarios V1–V18, deployment |
| [Contracts](specs/001-demandes-travail-vocales/contracts/) | REST API, real-time events |
| [Data model](specs/001-demandes-travail-vocales/data-model.md) | Entities, statuses, default values |
| [Constitution](.specify/memory/constitution.md) | Project principles (TDD, simplicity, accessibility, security, integrity) |

Most of these documents are written in French.

## Stack

React, TypeScript, Vite, React Router, TanStack Query and MUI for the interface; NestJS, Prisma and
PostgreSQL 17 for the API; Socket.IO for real-time features; Docker and Caddy for deployment.

## Main commands

Prerequisites: Node.js 24 and ffmpeg (voice message conversion). In development, PostgreSQL is
provided by embedded-postgres: Docker is only needed for deployment.

If your `backend/.env` predates the move to port 3002, replace `PORT=3000` with `PORT=3002`.

```bash
npm install
cp backend/.env.example backend/.env       # then set SESSION_SECRET
npm run -w backend db:dev                  # embedded PostgreSQL (dedicated terminal)
npm run -w backend prisma:migrate
npm run -w backend prisma:seed             # settings, categories and demo accounts
npm run -w backend start:dev               # API: http://localhost:3002
npm run -w frontend dev                    # interface: http://localhost:5173

npm run verify                             # lint + unit and integration tests + npm audit
npm run test:e2e                           # end-to-end: 7 browser profiles, axe checks
```

Before merging into `master`: see the [pre-merge verification](docs/procedure-fusion.md). It is
manual: GitHub CI reports failures but does not prevent the merge.

## Online demo (free, no account)

To show the application on a phone or tablet without a server, run `demo-en-ligne.bat` (or
`npm run -w backend demo:en-ligne`). It builds the API and the interface, opens a Cloudflare Quick
Tunnel and displays a `https://xxxx.trycloudflare.com` address with its QR code. Because the
address uses HTTPS, the microphone works on iPhone. Prerequisite:
`winget install --id Cloudflare.cloudflared -e`.

On this computer, `http://127.0.0.1:4173` works too: the API accepts the tunnel's origin and the
local interface (`APP_LOCAL_ORIGINS`, refused in production). If a `cloudflared` process is already
running (an old tunnel, for example), the demo warns and gives the command to stop it: an old tunnel
address still leads to the demo, but logging in there fails with 403.

If `ASSIST_TRANSCRIPTION_PROVIDER=whisper` is set in `backend/.env`, the demo also starts the
Whisper container. If Docker Desktop is not running, the demo starts it with `docker desktop start`
(Docker Desktop 4.37 or later; allow up to 3 minutes). If Docker or Whisper cannot start, the demo
carries on with a warning and only voice transcription is missing. Docker Desktop and Whisper keep
running after the demo stops.

The computer must stay on, the address changes on each run, and anyone who knows it reaches the
login screen (local development database): share it only with the people concerned. Ctrl+C stops
everything except Docker Desktop and Whisper. This mode does not replace the deployment described below.

## Deployment

On a VPS with Docker (details and checks in the
[quickstart](specs/001-demandes-travail-vocales/quickstart.md#deployment-vps)):

```bash
cp deploy/.env.example deploy/.env         # domain, secrets, backups
deploy/deploy.sh                           # update code, back up, build and start
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api node dist/cli/bootstrap.js admin "Direction"
```

The last command creates the first super administrator and displays their temporary password once
only. The server needs read access to the private GitHub repository (a deploy key, for example).

Every update goes through `deploy/deploy.sh`, run from the repository root. It updates the code
with `git pull --ff-only`, backs up the database and files, then rebuilds and restarts the
containers. It stops without touching the containers if the pull or the backup fails.

To deploy the code already on the server, such as a specific commit, skip the pull:

```bash
git checkout <commit>
deploy/deploy.sh --no-pull
```

`--no-pull` does not undo migrations: to go back before an applied migration, run its `down.sql`
by hand or restore a backup.

The API refuses to apply a migration without a backup less than
`PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes old (60 by default). A `docker compose … up` run
without the script therefore stops with "Migration en attente sans sauvegarde récente : lancez
deploy/deploy.sh." (pending migration without a recent backup), leaving the database untouched.

Days and times in the assignments module ("today", "tomorrow", the 7 a.m. reminder, end of day)
follow the school time zone `SCHOOL_TIMEZONE` (IANA identifier, defaulting to `TZ`, otherwise
`Europe/Paris`); an invalid value prevents the API from starting.

Push notifications (spec 014) are off by default: they are enabled only by setting the three
`PUSH_VAPID_*` variables, after the school's decision and its entry in the processing register. See
[docs/notifications-push.md](docs/notifications-push.md) (keys, time zone, iPhone, register entry).

Communications (specs 015 and 017): the administration is the only bridge between teachers and
parents. Teachers report to the administration about a student of their classes, by voice and/or text
(« Communications »); the administration answers them and exchanges with guardians, directly or after
approval by another validator, depending on its permissions; parents (role `PARENT`, accounts created
by the administration) write to and read « L’école » in « Messages de l’école ». External notifications (email, WhatsApp Business Platform) are optional and go through
a self-hosted n8n (profile `n8n` of `deploy/docker-compose.yml`), off by default. See
[docs/parent-communications.md](docs/parent-communications.md) (rights, n8n installation, rollback,
register entry).

Lost super administrator password: the reset is recorded in the audit log, closes all their
sessions and forces a new password at the next login.

```bash
# Development
npm run -w backend build && node backend/dist/cli/bootstrap.js --reset-password superadmin
# Production (without a username: the oldest active super administrator)
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api \
  node dist/cli/bootstrap.js --reset-password
```

Backups run daily (database and files, kept 14 days); the restore procedure
(`deploy/backup/restore.sh`) must be tested before going live. To change server or go back to the
previous one, see [docs/migration-hebergeur.md](docs/migration-hebergeur.md).

## Loading real data (CSV import)

Accounts and students can be loaded from a CSV file instead of one at a time: **Administration > Comptes** or
**Administration > Élèves**, then **Importer un fichier** (super administrator only). Both dialogs offer a template to
download.

- The file is **checked in full first** (a preview that creates nothing). Creation is **all or nothing**: while a line is
  in error, nothing is created, and the errors are listed by line number.
- Excel in French works as is (`;` separator, UTF-8 or Windows-1252); `,` and tab are detected too. A column title not
  in the list below is refused rather than silently ignored.
- Rules are those of the forms (the lines go through the same validation classes). Re-importing the same file creates
  nothing: existing usernames and already enrolled students are reported.
- Limits: 500 accounts and 2000 students per file, 1 MB.

| Accounts | | Students | |
|---|---|---|---|
| `identifiant`, `nom_affiche` | required | `prenom`, `nom`, `classe`, `telephone_parent`, `restauration` | all required |
| `fonction`, `role` (`employé` by default, or `admin`) | optional | `classe` | name of a class **attached to a school level** |
| `groupes`, `categories` (names separated by `\|`), `etage` | optional | `restauration` | `cantine` or `panier` |

A super administrator account is never created by import. After creating accounts, the dialog gives the **temporary
passwords once** as a downloadable CSV (they are stored hashed, never in clear): hand each person their own, delete the
file, and each person must change it at first sign-in. Closing the dialog without downloading asks for confirmation.
Every account and student created is recorded in the audit log with `source: import`. Order of loading: floors,
school levels, classes (with their level), then accounts, then students.

### Demo data never reaches a real database

`prisma:seed`, `db:seed:demo` and `seed:volume` create fictional accounts (including a super administrator) and
requests. They **refuse to run** unless `DATABASE_URL` points to a database on the same machine (`localhost`,
`127.0.0.1`, `::1`) and `NODE_ENV` is not `production`; `db:seed:demo` is stricter still (`localhost:5433/app` only).
The refusal happens before any connection. On a real server, create the first account with
`node dist/cli/bootstrap.js` and load the data with the CSV import. A tunnel that makes a remote database look like
`localhost` defeats this check: never open one towards production to run these scripts.

## To decide before going live

The following values are **provisional** and can be changed in the administration area; they must
be validated with the school (see the "Open points" section of the specification):

- **Personal data retention periods**: voice messages, photos and attachments 12 months after
  closure; request history and audit log 5 years. Automatic deletion at expiry is not implemented
  in this phase.
- Detailed permissions per role, and categories using workflow B or final approval.
- Deadlines per category and priority, "close to deadline" threshold, escalation rules.
- Recipients of each category (including "Photocopies"), mandatory proof photo, closure mode.
- Maximum duration and size of voice messages, attachment formats and size.
- Read or listen receipts.
- Teacher–parent communication: retention period of communications and voice messages, which
  admins get the validation permission, and whether external channels (email, WhatsApp) are used.

Still to be done: the manual check on a real iPhone
([docs/validation/iphone-manuel.md](docs/validation/iphone-manuel.md)) and the usability test with
five employees
([docs/validation/test-utilisabilite-lot1.md](docs/validation/test-utilisabilite-lot1.md)).
