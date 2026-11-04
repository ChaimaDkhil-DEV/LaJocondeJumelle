# Contracts for the operations tools, deployment and CI

## Initialization tool — `backend/src/cli/bootstrap.ts`

Compiled to `dist/cli/bootstrap.js` (available in the production image).

| Call | Effect | Output | Code |
|---|---|---|---|
| `bootstrap.js [identifiant] ["nom affiché"]` | **Unchanged**: settings, permissions, first super administrator if none exists | temporary password shown once, or "existe déjà" (already exists) | 0 |
| `bootstrap.js --reset-password` | **New**: resets the oldest active super administrator | `Mot de passe provisoire de « <identifiant> » (affiché une seule fois, à changer à la première connexion) : <mot de passe>` (Temporary password of "<identifier>" (shown only once, to be changed at first login): <password>) | 0 |
| `bootstrap.js --reset-password <identifiant>` | **New**: resets that account if it is a super administrator | same | 0 |
| `--reset-password` on a missing account or one that is not a super administrator | no write | `Compte « <identifiant> » introuvable ou non super administrateur : aucune modification.` (Account "<identifier>" not found or not a super administrator: no change.) (stderr) | 1 |
| database unreachable | no write (single transaction) | error message (stderr) | 1 |

Effects of `--reset-password`: see [data-model.md](../data-model.md) §AuditLog.

Examples:

```bash
# Development
npm run -w backend build && node backend/dist/cli/bootstrap.js --reset-password superadmin
# Production
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api   node dist/cli/bootstrap.js --reset-password
```

`backend/scripts/reset-superadmin-password.ts` is **deleted**.

## Deployment — `deploy/deploy.sh` (run on the host, from the repository root)

| Call | Effect |
|---|---|
| `deploy/deploy.sh` | Updates the code, then deploys |
| `deploy/deploy.sh --no-pull` | Deploys the code already present (specific commit, rollback) |
| any other argument | Prints the usage message and exits with code 1 |

1. `git pull --ff-only`, skipped with `--no-pull`; stops (code ≠ 0) if it fails, without touching
   the containers. After a successful pull, the script runs itself again with `--no-pull` so that
   the updated version executes the following steps.
2. `docker compose … run --rm --entrypoint /bin/bash backup /scripts/backup.sh`; stops
   (code ≠ 0) if the backup fails.
3. `docker compose … up -d --build`.


## API startup — `deploy/api-entrypoint.sh` (modified)

```text
if `prisma migrate status` fails for another reason (database unreachable):
    print its output; exit 1
if `prisma migrate status` reports pending migrations:
    if no archive ${PRE_MIGRATION_BACKUP_DIR:-/backups}/db-*.dump newer than PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES:
        print « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. » ; exit 1
    prisma migrate deploy
exec node dist/main.js
```

(The message means: pending migration without a recent backup: run deploy/deploy.sh.)

`docker-compose.yml` mounts `${BACKUP_DIR:-./backups}:/backups:ro` in the `api` service.

Automated test: `backend/test/unit/api-entrypoint.spec.ts` (research R12), five cases:
schema up to date, pending migration with no archive, with an archive that is too old, with a
recent archive, database unreachable.

## Continuous integration — `.github/workflows/ci.yml` (new)

| Trigger | `push`, `pull_request` |
| Job | identifier `verify`, name « Contrôles qualité » (quality checks) (stable name, cited by the pre-merge check; to be made mandatory if branch protection becomes available, D10) |
|---|---|
| Environment | `ubuntu-latest`, Node 24, `ffmpeg` |
| Steps (all blocking) | `npm ci` → `npm run lint` → backend and frontend typecheck → backend unit tests (including `architecture-layers.spec.ts`) → backend integration tests → frontend tests (including `enums-sync.test.ts`) → `npm audit --audit-level=high` |
| Outside CI (manual, reported in `docs/validation/`) | `npm run test:e2e`, including the creation timing test `e2e/sc001-create-timing.spec.ts` |

The search performance test (`backend/test/integration/search-performance.spec.ts`) is part of the integration suite, and therefore of CI. If it proves unstable on GitHub machines, it will be excluded from CI and replayed manually (decision to be recorded in the report).

## Check before merging into `master` — manual procedure (D10, new)

The GitHub repository stays private, on the free plan: branch protection rules are not
available there ([VERIFIED] on 2026-10-15, the API returns `403 Upgrade to GitHub Pro or make
this repository public`). **This procedure is manual and is not a technical protection**:
GitHub prevents neither the merge of a pull request whose CI fails, nor a direct push to
`master`. The constitution's rule ("Aucune modification ne peut être fusionnée si la
suite de tests échoue", i.e. no change may be merged if the test suite fails) relies on the person who merges.

Files (created by T006): `docs/procedure-fusion.md` (reference procedure) and
`.github/pull_request_template.md` (the four checks as checkboxes, link to the
procedure; GitHub only applies it once it is on `master`).

Rules:
- every change to `master` goes through a pull request; no direct push;
- just before merging, the person who merges verifies the four checks on the pull request's
  **latest commit** and ticks them in its description; a check that is not ticked or not
  satisfied forbids the merge.

| # | Check | How to verify it | Merge forbidden if |
|---|---|---|---|
| 1 | CI result | `gh pr checks <n°>` or "Checks" tab: job « Contrôles qualité » run on the latest commit | missing, in progress, failed or cancelled |
| 2 | Required tests | the job ran all its steps (lint, backend and frontend typecheck, unit, integration and frontend tests, `npm audit --audit-level=high`); for a delivery, in addition, `npm run test:e2e` run by hand and recorded in `docs/validation/` (FR-019) | a step is missing or was skipped; end-to-end report missing for a delivery |
| 3 | No unresolved failure | no test disabled or ignored (`.skip`, `.only`, `--testPathIgnorePatterns`) without a reason recorded in `docs/validation/`; branch up to date with `master` (otherwise merge `master` into it and wait for a new green CI); no open review discussion | one of these conditions is not met |
| 4 | Diff review | full read of `gh pr diff <n°>` ("Files changed" tab) following the constitution's code review: tests written first and green, expectations of existing tests unchanged except for a documented exception (SC-007), no secret, no unexpected file | a point of the review is not satisfied |

Merge done despite a failure: fix it immediately with a new pull request (fix
or `git revert`) and record it in `docs/validation/`.

If the repository moves to a plan that allows branch protection, create the rule described in
research R11; checks 2 to 4 still have to be verified by hand.
