# Research — 004 Teacher lateness and absences, supervisor assignment

**Date**: 2026-10-16 · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Each decision states: the decision, the reason, the alternatives rejected. "Validated" means
settled by the user on 2026-10-16 (technical questions asked during `/speckit-plan`).
Code references point to the `003-corrections-audit-technique` branch.

## Starting findings (read in the code)

- A guard duty is a `Request` (`kind = COVERAGE`) + a 1-1 `CoverageDetail`. The pure state machine
  is `backend/src/coverage/domain/coverage-state-machine.ts` (`TRANSITIONS`, l. 188-232); the
  effects (conditional update `{id, status, version}`, events, audit, notifications)
  are in `coverage-actions.service.ts` (`commit`, l. 265-535).
- Broadcast: `BROADCAST` set at creation (`coverage.service.ts:161`), by `createRelief` and
  by `RELEASE`; `broadcastInTx` notifies the available members of the targeted groups; `ACCEPT`
  (actor `CANDIDATE`) takes the guard duty.
- Availability: `coverage-availability.ts` — reasons `INACTIVE`, `ABSENT`, `UNAVAILABLE`,
  `ON_GUARD` (overlapping active guard duties, `plannedEndAt` null = +∞); `pg_advisory_xact_lock`
  per employee.
- Due dates: `Request.currentStage/currentDueAt/overdueStage`; `CoverageDeadlinesJob`
  (15 s, advisory lock) runs `EXPIRE` (BROADCAST→UNFILLED, ACCEPTED/EN_ROUTE→LATE).
  No generic reminder mechanism; `warnAt` is computed but read by no job.
- `RequestEvent` and `AuditLog`: `forbid_modification()` triggers on UPDATE/DELETE/TRUNCATE
  (`0001_init`). INSERT and DDL stay allowed.
- Notifications: `notifyInTx(tx, userIds, actorId, {type, requestId, priority})`, published after
  commit (Socket.IO, per-user room). `priority = URGENT` already triggers in
  `NotificationCenter.tsx` a visual highlight, an `aria-live="assertive"` region and
  a persistent `role="alert"` Snackbar. **No sound.** No email, SMS, push or PWA.
- Time zone: the API runs in UTC; only the `backup` service receives `TZ` (default `Europe/Paris`).
- Migrations: `0001_init`, `0002_coverage` (+ `down.sql`), `0003_request_event_seq`, then in `master` after the specification: `0004_superadmin_notifications`, `0005_routing_mode` (+ `down.sql`), `0006_request_event_dashboard_indexes` (PR #13) and `0007_audit_request_actions` (PR #17). The migrations of this feature are therefore `0008` and `0009`.
  `deploy/api-entrypoint.sh` requires a recent backup before any pending migration.

## R1 — Main statuses and sub-states: derived from `Request.status` (validated)

- **Decision**: `Request.status` stays the single source of truth. The value
  `PENDING` ("en attente", pending) is added to `RequestStatus`. The main status and the sub-state
  are computed by a pure function `coverageMainStatus(status)`:

  | `Request.status` | Main status | Sub-state (badge) |
  |---|---|---|
  | `PENDING` | en attente (pending) | — |
  | `ACCEPTED` | assignée (assigned) | — |
  | `EN_ROUTE` | assignée | En route (on the way) |
  | `LATE` | assignée | En retard (late) |
  | `ON_DUTY` | en cours (in progress) | — |
  | `RELIEF_PENDING` | en cours | Relève demandée (handover requested) |
  | `DONE` | terminée (done) | — |
  | `CLOSED` | terminée | Clôturée après validation (closed after validation) |
  | `CANCELLED` | annulée (cancelled) | — |
  | `UNFILLED` | non pourvue (unfilled) | — |
  | `BROADCAST` | *(obsolete: never set again; migrated to `PENDING`)* | — |

- **Reason**: a single source of truth, no history rewrite, minimal data migration (FR-008c,
  FR-008d), filters and statistics on the main status by a simple set of values.
- **Alternatives rejected**: `mainStatus`/`subState` columns on `CoverageDetail` (two sources
  to keep in sync, migration of every row).
- **Consequence**: `UNFILLED` changes meaning — it no longer means "pick-up deadline
  exceeded" but "time slot passed with no assignment" (FR-008a). The `BROADCAST` value stays in
  the enum (removing it would require recreating the type and rewriting the history).

## R2 — Reminders, deadlines and escalations: a single due-date table (validated)

- **Decision**: `CoverageReminder` table (assignment, type, target, due date, attempts,
  cap, interval, resolution). A single job `CoverageRemindersJob` (15 s, advisory
  lock, `FOR UPDATE SKIP LOCKED`) processes the due rows. Types: `TAKEOVER`,
  `TAKEOVER_ESCALATION`, `MORNING`, `END_OF_SLOT`, `END_OF_SLOT_ADMIN`, `SUPPORT_DECISION`,
  `SUPPORT_ESCALATION`.
- **Reason**: seven heterogeneous timers (one of them repeated with a cap); a table makes each
  send idempotent, traceable and testable without an extra migration per type.
- **Alternatives rejected**: timestamped columns on `CoverageDetail` (8-10 columns, backup
  repetition poorly represented); reusing `currentStage/currentDueAt` (only one due date at a
  time, whereas pick-up deadline, morning reminder and escalation coexist).
- **Kept**: `currentStage = ARRIVAL` and `EXPIRE` to `LATE` (arrival deadline, FR-011b).
  Removed: the `TAKEOVER` stage on `currentStage` (replaced by `CoverageReminder.TAKEOVER`).

## R3 — Due date computation

- **Pick-up deadline** (FR-011d): when a `PENDING` request is created (except empty class), a
  `TAKEOVER` row with `dueAt = max(now, startAt − threshold) + deadline`. Threshold = setting
  `coverageUrgencyThresholdMinutes` (60); deadline = `DeadlineRule.takeoverMinutes` of the guard
  category (2, already adjustable by the super administrator). At the due date: URGENT
  notification to the admins, then a `TAKEOVER_ESCALATION` row at `+ coverageEscalationMinutes`
  (5) to the super administrators. All open rows are resolved on assignment or cancellation.
- **Edit by the teacher** (FR-008g): the open rows are recomputed.
- **Morning reminder** (FR-011f): if the local date of `startAt` is after the local date of
  creation, a `MORNING` row at `coverageMorningReminderTime` ("07:00") on the day of `startAt`;
  sent to the admins only if the assignment is still `PENDING`.
- **Time slot end** (FR-016a): at assignment (or at "en cours" creation), an
  `END_OF_SLOT` row at `plannedEndAt + coverageCloseReminderMinutes` (10) to the supervisor;
  without closure, an `END_OF_SLOT_ADMIN` row at `+ coverageCloseEscalationMinutes` (10) to the
  admins. Recomputed at each extension (`EXTEND`).
- **Backup** (FR-015i): a `SUPPORT_DECISION` row every `coverageSupportReminderMinutes`
  (10), at most `coverageSupportReminderMax` (3) sends, then `SUPPORT_ESCALATION` to the super
  administrators.
- **Unfilled** (FR-008a): the same job moves to `UNFILLED` (system transition) any `PENDING`
  assignment whose time slot end has passed.
- **Unknown time slot end** (old "until arrival" guard duties, `plannedEndAt` null):
  deemed end = end of the local day of `startAt`. New requests always have an end
  (FR-012); direct assignment also requires an end.

## R4 — School time zone: `SCHOOL_TIMEZONE` (validated)

- **Decision**: new environment variable `SCHOOL_TIMEZONE`, validated at startup by
  `backend/src/config` (IANA identifier accepted by `Intl.DateTimeFormat`), default
  `Europe/Paris`, wired to `TZ` in `deploy/docker-compose.yml`. "Today / tomorrow",
  7:00 and end-of-day computations go through a pure module `school-time.ts` using `Intl` (no
  dependency).
- **Alternatives rejected**: hard-coded time zone (code change if the school moves); the Node
  process `TZ` (side effects on all timestamps and on the tests).

## R5 — Retention and anonymization (validated)

- **Decision**: rolling age. Setting `coverageRetentionMonths` (12). Daily job
  `CoverageAnonymizationJob` (hourly interval, lock, idempotent via `anonymizedAt`):
  for each final assignment (done, cancelled, unfilled) created more than N months ago,
  `CoverageDetail.teacherId = null`, `absentTeacher = null`, `reason = null`, `anonymizedAt = now`;
  if the assignment comes from a teacher request, `Request.requesterId` is replaced by the
  inactive technical account `enseignant-anonymise` and `Request.description` is emptied. An
  `ANONYMIZED` event (with no personal data) is added and a `COVERAGE_ANONYMIZED` audit entry
  (counts, no identity) is written.
- **Not touched**: `RequestEvent`, `AuditLog` (append-only, principle V) and `Notification`
  (reception history). They keep author **identifiers**, never a name or a reason
  (the new events write no reason nor teacher name); this residual link is
  documented and access to these histories stays restricted (FR-023).
- **Alternatives rejected**: events without `actorId` (weakens traceability); switch on a
  fixed start-of-school-year date (actual retention duration varies from 0 to 12 months).

## R6 — Duplicate merge (validated)

- **Decision**: on confirmation, the absorbed assignment (the supervisor's report) becomes
  `CANCELLED` with `mergedIntoId` pointing to the kept assignment; the reporter is carried over
  onto the kept assignment according to FR-015d/e/f (taken over if `PENDING`, backup otherwise).
  The statistics exclude any assignment with `mergedIntoId` (neither lateness nor cancellation).
  Proposals in `CoverageMergeProposal` (`PENDING`, `CONFIRMED`, `REJECTED`); "non
  tranché" (undecided) = `PENDING` after the last presentation (`finalPresentedAt`).

## R7 — Identifying teachers and supervisors: system-key groups

- **Decision**: column `EmployeeGroup.systemKey` (enum `GroupSystemKey`: `TEACHERS`,
  `SUPERVISORS`, unique, nullable). The "Surveillants/Remplaçants" group is renamed
  "Surveillants" and gets `SUPERVISORS`; an "Enseignants" group (`TEACHERS`) is created empty.
  The code identifies groups by key, never by name (the super administrator can rename).
- **Eligibility for an assignment**: active member of the `SUPERVISORS` group (replaces the
  current "role EMPLOYEE" check, `coverage-actions.service.ts:624-633`). A super administrator who
  is a member of the group is therefore assignable (FR-004b).
- **Alternative rejected**: identification by group name (fragile when renamed).

## R8 — Role rename

- **Decision**: `ALTER TYPE "Role" RENAME VALUE 'MANAGER' TO 'ADMIN'` (reversible by the
  inverse operation, automatically updates `User.role`, `Category.creatorRoles`,
  `RolePermission`). In the code, `Role.MANAGER` → `Role.ADMIN`. The other technical identifiers
  containing `MANAGER` (`ClosureMode.MANAGER`, the `MANAGER` actor of the policies,
  `RELEASE_BY_MANAGER`) do not designate the role and are kept; only their interface labels
  change ("Par un admin", by an admin). `/admin/*` area: label "Administrateur".
- **Demo account**: `responsable` → `admin` in `seed.ts`, `e2e/support/accounts.ts`,
  `test/utils/auth-helpers.ts`; the data migration also renames the account in the database if
  it exists, if the `admin` identifier is free and if it carries the seed's display name
  ("Responsable administratif", administrative manager), so as never to touch a real account.
- **Documentation**: note at the top of `specs/001…/spec.md` and `specs/003…/spec.md` (FR-004d),
  `README.md`, `docs/ARCHITECTURE.md`, `docs/coverage-migration.md` updated.

## R9 — Guard duty management: all admins

- **Decision**: `isCoverageManagerUser` becomes "role `ADMIN` or `SUPER_ADMIN`" (Q18); the
  rule "manager of a guard category" goes away. The `MANAGER` actor of
  `coverage-policy.ts` = admin or super administrator (the requester is no longer `MANAGER`: a
  requesting teacher gets a `REQUESTER` actor limited to editing/withdrawing while `PENDING`).
- **Category**: the "Garde de classe" (class guard duty) category stays the technical support
  (`Request.categoryId` required, `DeadlineRule`, `proofMode`, `finalValidation`); its managers
  and creator roles no longer serve for the module's rights.

## R10 — Empty-class report: presence

- **Decision**: the report creates the assignment directly `ON_DUTY` ("en cours",
  `presenceAt = now`, duration counted from the report, FR-021). A scanned QR code (existing
  `/gardes/presence` page) can be used to pick the class and is then recorded as a
  `CoveragePresence`; no proof is required to report, because the spec requires an
  immediate switch to "en cours" and no blocking.
- **Alternative rejected**: require proof (`proofMode`) before creation — contradicts FR-015.
- **Validated on 2026-10-16.** Possible evolution: if the school wants mandatory proof for
  reports, it is added to the guard without changing the model.

## R11 — Notifications and highlighted alerts

- **Decision**: existing mechanism only (`notifyInTx` + Socket.IO). Urgent cases
  (empty class, expired deadline, escalation, double assignment, backup reminders) are emitted
  with `priority = URGENT`, which activates the visual highlight, `aria-live="assertive"` and the
  persistent Snackbar already in place. Addition of an **optional sound signal** (Web Audio API, no
  file or dependency), can be turned off, triggered only after a user interaction
  (autoplay rules) and always accompanied by the visual signal (FR-024a, WCAG).
- **"Admin" recipients**: all active users with the `ADMIN` role; if no admin is
  active, the super administrators. Escalations go to the active super administrators.
- **New types** (`NotificationType`): `COVERAGE_REQUESTED`, `COVERAGE_EMPTY_CLASS`,
  `COVERAGE_TAKEOVER_EXPIRED`, `COVERAGE_ESCALATED`, `COVERAGE_MORNING_REMINDER`,
  `COVERAGE_CLOSE_REMINDER`, `COVERAGE_DUPLICATE`, `COVERAGE_SUPPORT_REMINDER`,
  `COVERAGE_DOUBLE_ASSIGNMENT`, `COVERAGE_LIFTED`, `COVERAGE_UPDATED`. The test
  `frontend/tests/api/enums-sync.test.ts` keeps the interface in sync.

## R12 — Multi-step, reversible migration

- **Decision**: two Prisma migrations + pre-check scripts (detail:
  [contracts/migration.md](./contracts/migration.md)).
  1. `0008_supervision_schema` — **additive**: enum values, tables, nullable columns, group
     key. Separate because a value added by `ALTER TYPE … ADD VALUE` cannot be
     used in the same transaction.
  2. `0009_supervision_data` — **data**: role `MANAGER`→`ADMIN`, groups, `BROADCAST`→`PENDING`,
     upcoming `UNFILLED`→`PENDING`, `source` of existing guard duties, demo account. Each
     status change adds a `RequestEvent` `STATUS_CHANGED` (actor SYSTEM, comment
     `migration-0009`): traceability (principle V) and a marker for the rollback.
  - Each migration has a `down.sql` (run manually, like `0002`): `0009/down.sql`
    restores the statuses from the `migration-0009` events (adding inverse events,
    deleting nothing) and renames `ADMIN`→`MANAGER`; `0008/down.sql` removes tables,
    columns and enum values by recreating the types, and refuses to run if data of the
    new module exists.
  - Deployment order: pre-checks → human validations → backup (enforced by the
    entrypoint) → `migrate deploy` → startup.
- **Alternatives rejected**: a single migration (impossible: `ADD VALUE` then use);
  `prisma migrate dev` in production (forbidden by the existing deployment).

## R13 — Pre-checks and human validations (FR-005a, FR-008d, FR-023a)

- **Decision**: script `backend/scripts/supervision-preflight.ts` (read-only, `npm run
  preflight:supervision -w backend`) producing a Markdown report:
  1. members of the "Surveillants/Remplaçants" group with job title and role, to be classified
     supervisor / non-supervisor by the school;
  2. count of guard duties by status, with the computed target, and **list of statuses with no
     obvious equivalent** (any status outside the R1 table, or a `COVERAGE` guard duty carrying a
     work-request status);
  3. proposed retention duration (12 months) and number of assignments that would be anonymized
     immediately.
  Going to production requires the three validations recorded in the report; migration
  `0009` refuses to run if a status with no equivalent is present (SQL guard).

## R14 — Interface

- Reuse of `features/coverage/`: removal of the "À prendre" tab, the "Je prends" (I take it)
  button and the widening; addition of the "Signaler un retard ou une absence" (Report a lateness
  or an absence) screens (teacher), "Déclarer une classe vide" (Report an empty class)
  (supervisor), prioritized "En attente" queue, attachment proposals, backups and statistics
  (admin); sub-state badges. Administration: floors (super administrator), floor on the class and
  on the supervisor's profile. Accessibility: existing MUI components, existing automated checks
  (Vitest + Playwright at 360/768/1280 px).

## R15 — Dependencies

- **Decision**: no new dependency. Time zone via `Intl`, sound via Web Audio API, jobs via
  `@nestjs/schedule` already present.
