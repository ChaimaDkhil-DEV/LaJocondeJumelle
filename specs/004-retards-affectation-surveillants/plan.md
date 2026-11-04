# Implementation Plan: Teacher lateness and absences, supervisor assignment

**Branch**: `004-retards-affectation-surveillants` | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-retards-affectation-surveillants/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Evolve the "Gardes" (guard duties, phase 2) feature into an assignments module, without creating
a parallel module:

- **Allocation**: the "first volunteer" broadcast goes away; only the admin assigns and
  reassigns. Exception: a supervisor who reports an empty class receives the assignment for it,
  already "en cours" (in progress). The existing mechanisms are kept: QR/photo presence, arrival
  deadline, extension, handover, validation.
- **Three sources**: teacher request (today/tomorrow, free time range), empty-class report,
  direct assignment. **Three types**: lateness, absence, empty class.
- **Statuses**: six main statuses and sub-states, **computed** from the existing
  `Request.status`, plus a single new value `PENDING` (R1).
- **Due dates**: a `CoverageReminder` table and a single job cover the pick-up deadline,
  escalation, the 7:00 reminder, closing reminders and backup reminders (R2, R3).
  The switch to "non pourvue" (unfilled) and the anonymization at 12 rolling months are dedicated
  jobs.
- **Structural additions**:
  - floors (super administrator);
  - "Enseignants" and "Surveillants" groups identified by a system key;
  - backups;
  - merge proposals for duplicates;
  - statistics computed on demand.
- **Role**: `MANAGER` is renamed `ADMIN` (PostgreSQL enum) and the super administrator area is labeled "Administrateur".
  Only the value of the **role** `Role.MANAGER` changes: the closure mode `ClosureMode.MANAGER` and
  the `'MANAGER'` actor of the state machines (requests and guard duties) are other notions and
  stay as they are.
- **Migration**: two steps, additive `0008` then data `0009`, each with a `down.sql`.
  It is preceded by a pre-check and three human validations. Each status change is traced by an
  added event; no history is rewritten.

No new dependency. Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js 24 — unchanged

**Primary Dependencies**: NestJS 11 (`@nestjs/schedule`, `@nestjs/websockets` + Socket.IO), Prisma 6,
React 19, Vite, TanStack Query 5, MUI — unchanged. **No addition** (time zone via `Intl`, sound
signal via Web Audio API).

**Storage**: PostgreSQL 17. Two migrations: `0008_supervision_schema` (additive) and
`0009_supervision_data` (data), each with `down.sql` ([contracts/migration.md](./contracts/migration.md)).
Four tables (`Floor`, `CoverageSupport`, `CoverageMergeProposal`, `CoverageReminder`), columns
on `CoverageDetail`, `SchoolClass`, `User`, `EmployeeGroup` ([data-model.md](./data-model.md)).

**Testing**: Jest (unit; integration on embedded PostgreSQL, `--runInBand`), Vitest + RTL,
Playwright (360/768/1280 px). Tests written before the code (principle I).

**Target Platform**: a single responsive web application (smartphone, tablet, computer);
production on a Linux VPS, Docker Compose, Caddy. No native mobile app, no push, no external
channel (none exists).

**Project Type**: web application (`backend/` API + `frontend/` SPA, npm workspaces) + `e2e/`.

**Performance Goals**: notification of a report or declaration in under 5 s
(SC-003), with a 15 s job for the due dates, as today. Candidate list and
month statistics in under 1 s at the scale of one school.

**Constraints**:

- no regression: existing tests green, adapted only for the role rename and the removed
  broadcast (FR-002);
- `RequestEvent` and `AuditLog` stay append-only;
- a single API instance (unchanged); advisory locks for the jobs;
- school time zone `SCHOOL_TIMEZONE` (R4).

**Scale/Scope**:

- one school: on the order of 100 accounts, 50 classes, a few floors and a few dozen
  assignments per day;
- about 15 screens touched or added;
- 415 occurrences of "responsable" in 82 files to handle (including tests and documentation),
  count of 2026-10-16 on `master` after PR #11, excluding specifications.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check before design | After design (Phase 1) |
| --- | --- | --- |
| **I. TDD** | Every FR and acceptance scenario gets a test that fails first. Status rules, transitions and rights: unit tests. Journeys: integration and e2e tests. | ✅ Strategy detailed below. The state machine, main status, due dates and time zone are **pure** modules, unit-testable. |
| **II. Simplicity / YAGNI** | Reuse guard duties, groups, notifications, availability, presence, handover. No dependency. | ✅ Derived statuses (no 2nd source); computed statistics (no aggregates); no timetable or absences module. Four tables justified (Complexity Tracking). |
| **III. Accessibility / UX** | WCAG 2.2 AA, 320 px, consistent states, actionable messages. | ✅ Existing MUI components. Urgent alerts never rely on sound alone: existing `aria-live="assertive"` and Snackbar `role="alert"`, sound optional. axe checks and e2e at 360/768/1280 px. |
| **IV. Security / data** | Server validation, GDPR minimization, purpose and retention documented. | ✅ Validated DTOs (dates bounded to the school time zone). Detailed reason visible to the admin and the super administrator only. Anonymization at N rolling months. `SCHOOL_TIMEZONE` validated at startup. No secret added. |
| **V. Workflow integrity** | Finite statuses, defined transitions, non-modifiable audit, server RBAC, refusals logged without disclosure. | ✅ Complete transition table (data-model §4). Each change, including by the migration and the anonymization, **adds** a `RequestEvent`. Audit for admin actions. `404` and `ACCESS_DENIED` outside the scope. The audit log and the history are excluded from anonymization. |

Technical constraints: stack unchanged ✅; `data-model.md` written before implementation ✅;
authentication and sessions unchanged ✅. **No unjustified violation.**

## Validated decisions (questions asked during the plan)

| # | Topic | Choice |
| --- | --- | --- |
| D1 | Status storage | Derived from `Request.status` + `PENDING` value (R1) |
| D2 | Due dates | `CoverageReminder` table + one job (R2) |
| D3 | Anonymization | Module data only; history and audit intact (R5) |
| D4 | Merge | Absorbed assignment "cancelled" + `mergedIntoId`, excluded from statistics (R6) |
| D5 | Time zone | `SCHOOL_TIMEZONE` variable, default `Europe/Paris` (R4) |
| D6 | Retention | Rolling age, 12 adjustable months (R5) |

Choices that follow from the spec, **validated on 2026-10-16** (carried into the spec:
Clarifications, FR-016a, FR-017a):

- **R10**: the empty-class report does not require proof of presence. A scanned QR code is
  recorded if provided.
- **R11**: with no active admin, the "admin" notifications for **guard duties and assignments** go
  to the super administrators (spec Q23). On work requests, the super administrator filter
  (`notifications/super-admin-policy.ts`, PR #7) stays the rule: only urgent ones, with no
  assigned or delayed employee. The teacher author is notified of the assignment.
- **R3**: the unknown time-slot end of old guard duties is deemed to be the end of the day.

## Permissions by role

Checks are made server side in `coverage-policy.ts` (pure). The role comes from `User.role`, the
functions from membership in the system-key groups.

| Capability | Super admin | Admin | Supervisor | Teacher | Other employees |
| --- | --- | --- | --- | --- | --- |
| See the module | ✅ | ✅ | their assignments and backups | their requests | ❌ (`404`) |
| Report lateness/absence, edit or withdraw while pending | ✅ | if member of Enseignants | if member of Enseignants | ✅ (their own) | ❌ |
| Report an empty class | ✅ | if member of Surveillants | ✅ | if member of Surveillants | ❌ |
| Assign, reassign, cancel, create directly | ✅ | ✅ | ❌ | ❌ | ❌ |
| Decide merge and backup, correct the teacher | ✅ | ✅ | ❌ | ❌ | ❌ |
| Depart, presence, handover, finish, extend | if assigned | if assigned (extend: always) | if assigned | ❌ | ❌ |
| See the detailed reason | ✅ | ✅ | ❌ | their own | ❌ |
| Statistics and history by teacher | ✅ | ✅ | ❌ | ❌ | ❌ |
| Floors, linking classes, a supervisor's floor, settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Be assigned | if member of Surveillants | if member of Surveillants | ✅ | if member of Surveillants | ❌ |

The rest of the application (work requests and their routing modes, read-only view of finished
requests, super administrator notifications, administration) behaves as in `master` after PR #9
(spec Q22, Q24). `ADMIN` takes over the rights of the former `MANAGER`
(`RolePermission`, `creatorRoles`, `CategoryManager`), including those it holds from the routing
mode. Code places where the role value is tested and must become `ADMIN`:

- `requests/domain/access-policy.ts`: `isAdministration` (read-only view of direct and
  peer-to-peer modes) and `canCreateInCategory` (creation in any category);
- `requests/domain/visibility.ts`: visibility of `DIRECT` and `PEER` requests for any admin;
- `coverage/coverage.service.ts` (guard duty management) and the other role tests found during
  the rename.

## Scheduled tasks (`backend/src/scheduler/`)

| Job | Frequency | Role | Idempotence |
| --- | --- | --- | --- |
| `CoverageRemindersJob` (new) | 15 s | Processes due `CoverageReminder` rows: `TAKEOVER` (alerts admins then creates `TAKEOVER_ESCALATION`), `TAKEOVER_ESCALATION` (SA), `MORNING` (admins, if still `PENDING`), `END_OF_SLOT` (supervisor then `END_OF_SLOT_ADMIN`), `SUPPORT_DECISION` (repeated, capped, then `SUPPORT_ESCALATION`) | advisory lock, `FOR UPDATE SKIP LOCKED`, `attempts`/`resolvedAt`; condition rechecked before sending |
| `CoverageUnfilledJob` (new, same file or neighboring) | 15 s | `PENDING` whose time slot end has passed → `UNFILLED` (`EXPIRE_UNFILLED`) | conditional update on `{status, version}` |
| `CoverageDeadlinesJob` (modified) | 15 s | Guards `ARRIVAL` only (`ACCEPTED`/`EN_ROUTE` → `LATE`); removes `BROADCAST → UNFILLED` | unchanged (`overdueStage`) |
| `CoverageAnonymizationJob` (new) | every hour | Anonymizes final assignments older than `coverageRetentionMonths` | `anonymizedAt`; batches of 200 |

**Constraint to carry over as is into `tasks.md`** (FR-016a, R3): for a guard duty "until
arrival" (`plannedEndAt` null, earlier guard duties), the `END_OF_SLOT` due date is the end of
the local day + `coverageCloseReminderMinutes`; **no closing reminder is sent before the end of
the day**. A unit test (`coverage-reminders.spec.ts`) and a job test check it.

All local times go through `school-time.ts`. Tests call `runOnce(now)` with an injected clock,
like the existing jobs.

## Notifications and alerts

See [contracts/realtime-events.md](./contracts/realtime-events.md): eleven new types, `URGENT`
priority for urgent cases, existing visual and spoken highlighting (screen readers), and an
optional sound signal added to the `NotificationCenter`.

## Validations before migration

Read-only pre-check and validations **V1** (non-supervisor members), **V2** (statuses with no
equivalent, SQL guard in `0009`) and **V3** (retention duration):
[contracts/migration.md](./contracts/migration.md) step 0.

## Test strategy

TDD order: red test → code → refactoring, story by story (US4 role → US1 → US2 → US3 →
US5), migration first for the structure.

- **Unit (Jest, `backend/test/unit/`)**:
  - `coverage-state-machine.spec.ts` rewritten: data-model §4 table, removed actions refused,
    supervisor with no accept, refuse or cancel action;
  - `coverage-main-status.spec.ts`: complete R1 mapping;
  - `coverage-reminders.spec.ts`: 60 min threshold, 7:00, time slot end, capped backup,
    recomputation after modification and extension;
  - `school-time.spec.ts`: today/tomorrow, daylight saving change, midnight;
  - `coverage-availability.spec.ts`: busy backup, declared availability, sorting by floor;
  - `coverage-duplicates.spec.ts`: data-model §6 table;
  - `coverage-stats.spec.ts`: counts, merges, "non tranché" (undecided);
  - `coverage-policy.spec.ts`: complete permissions matrix;
  - `config.spec.ts`: `SCHOOL_TIMEZONE`;
  - `architecture-layers.spec.ts`: unchanged and green.
- **Integration (`backend/test/integration/`)**:
  - one file per story: `supervision-teacher-request`, `supervision-empty-class`,
    `supervision-direct`, `supervision-stats`, `role-admin-rename`;
  - `supervision-jobs`: simulated clock, escalations, unfilled, anonymization without touching
    `RequestEvent` or `AuditLog`;
  - `supervision-permissions`: each refusal is logged and answers `404` outside the scope;
  - `migration-0009`: upgrade, checks, `down.sql`, guards;
  - `append-only.spec.ts`: unchanged.
- **Adapting the guard duty tests**:
  - `coverage.spec.ts`: the broadcast and acceptance cases (1, 2, 2 bis, 3, 5, 5 bis, 6,
    live "taken", empty group) are replaced by their admin-assignment equivalents or removed
    when the behavior no longer exists;
  - the presence, handover, extension, lateness, cancellation, QR and photo cases are kept,
    set up through `ASSIGN`;
  - `coverage-work-isolation.spec.ts`, `reassign.spec.ts` and `notifications.spec.ts`: adjusted
    to the `ADMIN` role; likewise for the tests added since the specification, which use the
    `responsable` role and account: `routing-modes.spec.ts`, `superadmin-notifications.spec.ts`,
    `categories-form-list.spec.ts`, `admin-dashboard.spec.ts` (integration), the frontend tests
    for routing and the dashboard, and the e2e `us6-deadlines`, `us8-admin`, `admin-dashboard`;
  - each test removal is listed in the PR with its reason (requirement removed by the
    spec).
- **Frontend (Vitest + RTL + axe)**:
  - teacher and supervisor forms, prioritized admin queue, sub-state badges,
    proposals and backups, statistics, floors;
  - urgent alert: `alert` role, no dependence on sound;
  - `enums-sync.test.ts`: new enums;
  - `coverage.test.tsx`: removal of the "À prendre" (To take) and "Je prends" (I take it) cases.
- **E2E (Playwright)**: `coverage-class.spec.ts` rewritten with three journeys (request →
  assignment → done; empty class → duplicate → backup; direct assignment) at the three
  widths; `us8-admin`, `auth`, `us5`, `us6` adapted to the `admin` account.
- **Non-regression**: full backend, frontend and e2e suites green before merge, like the
  existing CI.

## Project Structure

### Documentation (this feature)

```text
specs/004-retards-affectation-surveillants/
├── plan.md              # this file
├── research.md          # decisions R1–R15
├── data-model.md        # model, transitions, availability, statistics
├── quickstart.md        # end-to-end validation
├── contracts/
│   ├── rest-api.md
│   ├── realtime-events.md
│   └── migration.md     # steps, validations V1–V3, rollback
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                         # enums, Floor, CoverageSupport, CoverageMergeProposal, CoverageReminder, columns
│   ├── migrations/0008_supervision_schema/   # migration.sql + down.sql
│   ├── migrations/0009_supervision_data/     # migration.sql + down.sql
│   └── seed.ts                               # admin, enseignante, supervisors, floors
├── scripts/supervision-preflight.ts          # pre-check (read-only)
└── src/
    ├── config/                               # SCHOOL_TIMEZONE
    ├── common/school-time.ts                 # local day/time (pure)
    ├── settings/                             # coverage* keys
    ├── coverage/
    │   ├── domain/coverage-state-machine.ts  # transitions (modified)
    │   ├── domain/coverage-status.ts         # main status + sub-state (new, pure)
    │   ├── domain/coverage-reminders.ts      # due date computation (new, pure)
    │   ├── domain/coverage-duplicates.ts     # attachment rules (new, pure)
    │   ├── domain/coverage-policy.ts         # actors and permissions (modified)
    │   ├── coverage-availability.ts          # backup, sorting by floor (modified)
    │   ├── coverage-actions.service.ts       # no broadcast; backup, merge (modified)
    │   ├── coverage.service.ts / .controller.ts / .dto.ts / .mapper.ts   # new routes
    │   ├── coverage-stats.service.ts         # statistics (new)
    │   ├── coverage-anonymization.service.ts # (new)
    │   └── coverage-admin.*                  # floors, floorId of classes
    ├── users/                                # floorId
    └── scheduler/
        ├── coverage-reminders.job.ts         # (new)
        ├── coverage-anonymization.job.ts     # (new)
        └── coverage-deadlines.job.ts         # ARRIVAL only (modified)
    test/unit/…, test/integration/…           # see test strategy

frontend/
├── src/
│   ├── api/types.ts                          # Role ADMIN, new enums
│   ├── app/AppLayout.tsx, features/admin/    # Admin / Administrateur labels, floors, floorId
│   ├── features/coverage/                    # teacher and supervisor forms, admin queue, badges, backups, merges, statistics; "À prendre" removed
│   └── features/notifications/NotificationCenter.tsx   # optional sound signal
└── tests/…

e2e/coverage-class.spec.ts, e2e/support/accounts.ts  # rewritten journeys, admin account
deploy/docker-compose.yml, deploy/.env.example       # SCHOOL_TIMEZONE for the API
docs/                                                # ARCHITECTURE, coverage-migration; notes in specs 001 and 003
```

**Structure Decision**: we keep the existing web application (`backend/`, `frontend/`, `e2e/`).
The "assignments" module is the enriched `coverage/` folder; no new Nest module and no new
top-level frontend feature. The layer order checked by
`architecture-layers.spec.ts` (`… → coverage → scheduler`) is still respected.

## Complexity Tracking

| Addition | Why necessary | Simpler alternative rejected |
| --- | --- | --- |
| `CoverageReminder` table | 7 timers, one of them repeated and capped, with traceable escalations (FR-011d/e/f, FR-015i, FR-016a) | Columns on `CoverageDetail`: 8 to 10 columns, and the backup repetition does not fit there. `currentDueAt`: only one due date at a time. |
| `CoverageSupport` table | Several supervisors on one assignment (backup), busy and releasable (FR-015f, FR-015i) | A single `assigneeId`: cannot represent the backup. |
| `CoverageMergeProposal` table | Proposal, decision, "non tranché" and after-the-fact decision traced (FR-015g, FR-015h) | Flag on the assignment: loses the pair, the decision and the last presentation. |
| `Floor` table | Floors managed by the super administrator, linked to classes and supervisors (FR-006) | Free text: no integrity, no reliable sorting or warning. |
| Two migrations | `ADD VALUE` of an enum is unusable in the same transaction; separate structure/data rollback | Single migration: technically impossible. |
