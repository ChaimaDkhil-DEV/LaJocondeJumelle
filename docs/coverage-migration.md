# Migration 0002_coverage: class coverage

> **Dated document, predating feature 004**: the "Responsable" (manager) role (`MANAGER`) became
> "Admin" (`ADMIN`) there, and the broadcasting of duties was replaced by assignment by the admin.
> See `specs/004-retards-affectation-surveillants/` (migration: `contracts/migration.md`).

## Migration 004 (`0008_supervision_schema`, `0009_supervision_data`)

Reference: `specs/004-retards-affectation-surveillants/contracts/migration.md`. Summary of the
procedure:

1. **Pre-check** (read-only, on the target database):
   `npm run preflight:supervision -w backend` produces `supervision-preflight-<date>.md`.
   Three human validations are recorded there before any deployment:
   - V1: current members of the supervisors group (non-supervisors remain members,
     with possible removal afterwards in the administration);
   - V2: decision for each duty with no obvious target status (`0009` refuses to run if
     any remain);
   - V3: retention period (`coverageRetentionMonths`, 12 months proposed).
2. **Deployment**: `deploy/deploy.sh` (backup, then additive `0008` and data migration `0009`;
   the API entrypoint refuses to migrate without a backup less than 60 min old).
3. **Right afterwards**: enter the validated period (V3), attach the classes and the supervisors to
   their floor in the administration.
4. **Checks**: broadcast duties that became "en attente" (pending) for the admin; no history
   event gone missing (`RequestEvent` count before / after: only additions, marked
   `migration-0009`).

**Rollback**: redeploy the previous code, then `0009/down.sql`, then
`0008/down.sql`. If the safeguards refuse (new data already entered), restore the
backup taken at deployment (`deploy/backup/restore.sh`).

The rest of this document describes the `0002_coverage` migration (phase 2), unchanged.

This migration adds the class coverage module (duty or substitution).

## Contents

It is **additive**: no existing table or column is dropped or renamed.

- **Existing enumerations**: new values are added.
  - `RequestStatus`: `BROADCAST`, `UNFILLED`, `EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING`.
  - `DeadlineStage`: `ARRIVAL`.
  - `RequestEventType`, `AuditAction` and `NotificationType`: values specific to the module.
- **New columns**, with a default value for existing data:
  - `Request.kind` (`WORK` by default);
  - `Category.kind` (`WORK`) and `Category.proofMode` (`PHOTO`);
  - `DeadlineRule.arrivalMinutes` (empty);
  - `User.availability` (`AVAILABLE`).
- **New tables**: `SchoolClass`, `EmployeeGroup`, `EmployeeGroupMember`, `CoverageDetail`, `CoverageTarget`, `CoveragePresence`.
- **Default data**, all editable afterwards from the administration:
  - category "Garde de classe" (class duty):
    - required proof: QR code and photo;
    - deadlines: acceptance 2 min, arrival in class 5 min;
    - no final validation;
    - created by the managers;
    - managers: the MANAGER accounts active at the time of the migration;
  - group "Surveillants/Remplaçants" (Supervisors/Substitutes), empty.

No existing work request is modified: all take `kind = WORK`.

## Backup and execution

In production, run the update from the repository root:

```bash
deploy/deploy.sh
```

The script backs up the database **and** the files, then rebuilds and restarts the containers; at startup, the API applies `prisma migrate deploy` (`deploy/api-entrypoint.sh`). If the backup fails, nothing is updated.

Note the timestamp displayed by the backup (for example `[backup] terminé : db-20261013T173000Z.dump files-20261013T173000Z.tar.gz`, where "terminé" means "done"), then check that both files are present in the backups folder: this is the backup to restore in case of a problem.

The API refuses to apply a migration without a backup less than `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes old (60 by default): a `docker compose … up` run without the script stops with "Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh." (pending migration without a recent backup: run deploy/deploy.sh), without touching the database.

In development, or to apply explicitly:

```bash
npm run -w backend prisma:deploy     # = prisma migrate deploy
npm run -w backend prisma:generate   # up-to-date Prisma client
```

To check that the database matches the schema exactly:

```bash
cd backend && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

The command must answer "No difference detected".

Special case of a new database: the migration runs before the accounts exist, so the "Garde de classe" category has no manager. Add them in Administration › Catégories (categories). The super administrator always has all rights.

## Rollback

### General case: restore the backup

This is the recommended method as soon as the module has been used:

```bash
deploy/backup/restore.sh <timestamp of the backup taken before the migration>
```

Then redeploy the previous version of the application.

### Database where the module was never used: reverse script

Use `prisma/migrations/0002_coverage/down.sql`:

```bash
cd backend
npx prisma db execute --file prisma/migrations/0002_coverage/down.sql --schema prisma/schema.prisma
```

Then redeploy the previous version of the application. The script:

- **stops without changing anything** if any data of the module exists, whether a coverage request, a history, a notification or an audit log entry. The history and the log are append-only and must never be rewritten: in that case, restore the backup;
- otherwise:
  - drops the added tables and columns;
  - recreates the enumerations with their original values;
  - removes the `0002_coverage` row from `_prisma_migrations`, which allows the migration to be applied again later with `prisma migrate deploy`.

The up → down → up sequence was verified on a disposable database: after each step, `prisma migrate diff` detects no difference with the expected schema.

## QR code key

The classes' QR codes are signed with a key derived from `SESSION_SECRET`. Changing `SESSION_SECRET` invalidates all printed QR codes: they must then be reprinted from Administration › Classes.
