# Migration contract — 004

Goal: move from broadcasting guard duties to the assignments module **without losing data**, in
**reversible** steps, with history and audit log intact (principle V). Decisions:
[research.md](../research.md) R1, R7, R8, R12, R13.

## Step 0 — Pre-check (read-only)

`npm run preflight:supervision -w backend` (script `backend/scripts/supervision-preflight.ts`,
`DATABASE_URL` of the target database) produces `supervision-preflight-<date>.md`:

| Section | Content | Human validation required |
| --- | --- | --- |
| A. Group members | Members of "Surveillants/Remplaçants" (Supervisors/Substitutes): name, identifier, job title, role | **V1** — the school names the non-supervisors (FR-005a). They stay members (no automatic removal); any removal is done afterwards in the administration, audited. |
| B. Statuses | Count of guard duties by status and target status (R1); named list of guard duties **with no obvious equivalent** | **V2** — decision for each listed guard duty (FR-008d). Migration 0009 refuses to run if any remain. |
| C. Retention | Proposed duration (12 rolling months), number of assignments anonymized on the first run | **V3** — validation by the school management (FR-023a); the validated value is entered in the `coverageRetentionMonths` setting right after the migration, before the jobs are enabled. |

The three validations are recorded (name, date) in the report, attached to the production release
request. Without them, no deployment.

Status "with no obvious equivalent": a guard-duty status missing from the R1 table, a `COVERAGE`
guard duty carrying a work-request status, or an `UNFILLED` one whose time-slot end is unknown and
whose day is not over.

## Step 1 — `0008_supervision_schema` (additive)

- `ALTER TYPE … ADD VALUE`: `RequestStatus.PENDING`, new `RequestEventType`,
  `NotificationType`, `AuditAction`.
- `CREATE TYPE`: `CoverageSource`, `CoverageType`, `GroupSystemKey`, `CoverageReminderKind`,
  `MergeProposalStatus`.
- `CREATE TABLE`: `Floor`, `CoverageSupport`, `CoverageMergeProposal`, `CoverageReminder`.
- `ADD COLUMN` (nullable): `CoverageDetail.source|type|teacherId|reason|floorId|mergedIntoId|anonymizedAt`,
  `SchoolClass.floorId`, `User.floorId`, `EmployeeGroup.systemKey` (+ unique indexes).
- No data modified. `down.sql`: refuses if the new tables contain rows or the new columns are
  filled in; otherwise removes tables and columns and recreates the types without the added
  values (same method as `0002_coverage/down.sql`).

## Step 2 — `0009_supervision_data` (data, one transaction)

1. **Guard**: `DO $$ … RAISE EXCEPTION` if a guard duty with no equivalent (V2) remains.
2. **Role**: `ALTER TYPE "Role" RENAME VALUE 'MANAGER' TO 'ADMIN'`.
3. **Groups**: "Surveillants/Remplaçants" → name "Surveillants", `systemKey = SUPERVISORS`
   (members kept); creation of "Enseignants" (`TEACHERS`), empty. If a group already has the
   target name, the migration stops (human decision).
4. **Open guard duties**: `BROADCAST` → `PENDING`; `UNFILLED` whose time-slot end has not passed
   → `PENDING`; `UNFILLED` already past: unchanged (FR-011c). For each modified row:
   `RequestEvent STATUS_CHANGED` (actor SYSTEM, `fromValue`/`toValue`, comment
   `migration-0009`); `currentStage/currentDueAt` reset to null (the `TAKEOVER` stage goes away);
   a `CoverageReminder TAKEOVER` row is created according to R3.
5. **Source**: `CoverageDetail.source = ADMIN_DIRECT` for all existing guard duties;
   `type` left null (unknown), `absentTeacher` kept.
6. **Demo account**: `responsable` → `admin` only if `admin` is free and the display name is the
   seed's; otherwise nothing.
7. **Technical account** `enseignant-anonymise` (inactive, role `EMPLOYEE`, unusable password)
   created for anonymization.
8. **Settings**: `coverage*` keys inserted with their default values.

The other statuses do not change in the database: their main status and sub-state are computed
(R1). No `RequestEvent` or `AuditLog` row is modified or deleted.

`down.sql` (manual, `npx prisma db execute --file …`):

- refuses if assignments exist that were created after the migration (source `TEACHER_REQUEST` or
  `SUPERVISOR_REPORT`, or `PENDING` without a `migration-0009` event);
- puts `PENDING` back to the original status based on the `migration-0009` events, **adding**
  inverse `migration-0009-down` events;
- `ADMIN` → `MANAGER`, groups renamed back identically, `systemKey` to null, "Enseignants" group
  deleted if empty, demo account renamed back identically, technical account deleted if no
  request references it, `coverage*` settings deleted, `CoverageReminder` rows deleted;
- removes the `0009_supervision_data` row from `_prisma_migrations`.

## Step 3 — Deployment

1. Pre-check report and validations V1–V3 attached.
2. `deploy/deploy.sh`: backup (`backup.sh`, existing), image rebuild.
3. `deploy/api-entrypoint.sh` (existing): refuses without a backup less than 60 min old; applies
   `0008` then `0009` (`migrate deploy`); starts the API.
4. Right after: enter the validated `coverageRetentionMonths` (V3); link classes to a floor and
   supervisors to their floor in the administration.

## Rollback

Redeploy the previous code, then `0009/down.sql`, then `0008/down.sql`. If the guards refuse
(new data already entered): restore the backup taken at step 3
(`deploy/backup/restore.sh`, existing).

## Migration verification (tests)

Integration test `migration-0009.spec.ts` on embedded PostgreSQL: database in state `0003` +
a set of guard duties in each status → `0008` + `0009` → check statuses, `migration-0009`
events, groups, role, demo account; then `down.sql` → initial state restored, no event deleted,
guards triggered on new data.
