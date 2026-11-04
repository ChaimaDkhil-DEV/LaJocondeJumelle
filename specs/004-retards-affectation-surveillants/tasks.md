---

description: "Task list for feature 004 — teacher lateness and absences, supervisor assignment"
---

# Tasks: Teacher lateness and absences, supervisor assignment

**Input**: Design documents from `/specs/004-retards-affectation-surveillants/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY — constitution, principle I (TDD, non-negotiable). Each test task placed
before an implementation MUST be written and seen **red** before coding. The existing guard duty
tests are modified only for the removed broadcast and the role rename
(FR-002); every test removal is listed with its reason in
`docs/validation/verification-004.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 to US5 (spec.md). Execution order: US4 → US1 → US2 → US3 → US5 (plan.md)
- `Rn` → research.md; `§n` → data-model.md; `FR-nnn` → spec.md

## Path Conventions

- Web application, npm workspaces: `backend/src/`, `backend/prisma/`, `backend/scripts/`,
  `backend/test/{unit,integration,utils}/`, `frontend/src/`, `frontend/tests/`, `e2e/`,
  `deploy/`, `docs/`
- Commands: `npm run -w backend test`, `npm run -w backend test:integration` (embedded
  PostgreSQL, serial), `npm run -w frontend test`, `npm run -w backend typecheck`,
  `npm run -w frontend typecheck`, `npm run lint`, `npx playwright test -c e2e/playwright.config.ts`,
  `npm run verify`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: measured starting state and shared configuration

- [X] T001 Run `npm run lint`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm run -w backend typecheck`, `npm run -w frontend typecheck` on the `004-retards-affectation-surveillants` branch; record the results in an "État initial" (initial state) section of `docs/validation/verification-004.md` (create the file following the model of `docs/validation/verification-003.md`). Any failure MUST be reported before continuing.
- [X] T002 [P] Add `SCHOOL_TIMEZONE: ${SCHOOL_TIMEZONE:-${TZ:-Europe/Paris}}` to the API service environment in `deploy/docker-compose.yml`, the commented line `SCHOOL_TIMEZONE=Europe/Paris` in `deploy/.env.example`, and a documentation line in `README.md` (R4).
- [X] T003 [P] Create `backend/test/utils/clock.ts`: injectable clock `fixedNow(iso)` usable by the services and the jobs (`runOnce(now?: Date)`), following the model of the existing `runOnce()` calls of the jobs.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema, migrations, technical role rename, derived statuses, state machine
without broadcast, due dates, floors, system-key groups. **No story starts before the end
of this phase.**

### Tests (write first, see them red)

- [X] T004 [P] Unit tests for `SCHOOL_TIMEZONE` in `backend/test/unit/config.spec.ts`: default `Europe/Paris`, invalid IANA identifier refused at startup (explicit message), valid value accepted.
- [X] T005 [P] Unit tests `backend/test/unit/school-time.spec.ts` for `backend/src/common/school-time.ts`: `localDate(now, tz)`, "today / tomorrow" (including 23:59 → 00:01), `atLocalTime(date, "07:00", tz)`, `endOfLocalDay(instant, tz)`, switch to summer and winter time in `Europe/Paris`.
- [X] T006 [P] Unit tests `backend/test/unit/coverage-status.spec.ts`: complete R1 mapping of `coverageMainStatus(status)` → `{ mainStatus, subState }` (`PENDING`→en attente (pending); `ACCEPTED`→assignée (assigned); `EN_ROUTE`→assignée/"En route"; `LATE`→assignée/"En retard"; `ON_DUTY`→en cours (in progress); `RELIEF_PENDING`→en cours/"Relève demandée"; `DONE`→terminée (done); `CLOSED`→terminée/"Clôturée après validation"; `CANCELLED`→annulée (cancelled); `UNFILLED`→non pourvue (unfilled)); `BROADCAST` and any work-request status throw an error; `MAIN_STATUS_VALUES` sets used by the filters.
- [X] T007 [P] Unit tests `backend/test/unit/coverage-reminders.spec.ts` for `backend/src/coverage/domain/coverage-reminders.ts` (R3): `TAKEOVER.dueAt = max(now, startAt − threshold 60) + takeoverMinutes 2` (distant time slot, time slot in 30 min, time slot already started); no `TAKEOVER` row for `source = SUPERVISOR_REPORT`; `MORNING` at 07:00 local on the day of `startAt` only if that day is after the local day of creation; `END_OF_SLOT = plannedEndAt + 10` then `END_OF_SLOT_ADMIN = +10`; **"until arrival" guard duty (`plannedEndAt` null): `END_OF_SLOT = endOfLocalDay(startAt) + 10`, no closing reminder before the end of the local day (FR-016a, R3)**; `SUPPORT_DECISION` every 10 min, `maxAttempts = 3`, then `SUPPORT_ESCALATION`; recomputation after `UPDATE` (FR-008g) and `EXTEND`.
- [X] T008 [P] Rewrite `backend/test/unit/coverage-state-machine.spec.ts` according to the transition table of data-model §4: each allowed transition (actors `ADMIN`, `ASSIGNEE`, `REQUESTER_TEACHER`, `SUPERVISOR`, `SYSTEM`); removed actions `ACCEPT`, `WIDEN`, `RELEASE` refused (`UNKNOWN_ACTION`); `EXPIRE` `BROADCAST→UNFILLED` absent; `EXPIRE_UNFILLED` only from `PENDING`; the supervisor has no accept, refuse or cancel action (FR-008f); `CANCEL` by ADMIN from `PENDING`, `ACCEPTED`, `EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING` (FR-008b, FR-008e, FR-008h); `WITHDRAW` and `UPDATE` by the teacher author only in `PENDING` (FR-008g); final statuses `DONE`/`CLOSED`, `CANCELLED`, `UNFILLED`.
- [X] T009 [P] Rewrite `backend/test/unit/coverage-policy.spec.ts`: the "Permissions by role" matrix of plan.md (super admin, admin, supervisor, teacher, other employees), including: super admin passes all checks (FR-004b); other employees have no access (FR-023b); `reason` visible only to the admin and the super admin (FR-023c); eligibility = active member of the `SUPERVISORS` group (R7).
- [X] T010 [P] Integration test `backend/test/integration/migration-0009.spec.ts` (contracts/migration.md, "Migration verification"): database in state `0007` with a set of guard duties in each status (`BROADCAST`, `UNFILLED` upcoming and past, `ACCEPTED`, `EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING`, `DONE`, `CLOSED`, `CANCELLED`), a `responsable` account from the seed, the "Surveillants/Remplaçants" group with members → apply `0008` + `0009` → expected statuses, one `RequestEvent STATUS_CHANGED` with comment `migration-0009` per modified row, `ADMIN` role, groups and `systemKey`, `admin` account, technical account `enseignant-anonymise`, `coverage*` settings; number of `RequestEvent`/`AuditLog` only increased; guard: `0009` refuses if a guard duty with no equivalent exists; then `0009/down.sql` and `0008/down.sql` restore the initial state (no event deleted) and refuse when new data exists.
- [X] T011 [P] Integration test `backend/test/integration/admin-floors.spec.ts`: CRUD `/admin/floors` by the super admin (`FLOOR_CHANGED` audited), `404` refusal for admin and employees; `warning: "NO_SUPERVISOR"` when no supervisor is attached, without blocking (FR-006a); `floorId` required when creating and modifying a class (`/admin/coverage/classes`); `floorId` optional on `/admin/users`; group with `systemKey` cannot be deleted or deactivated (`409 SYSTEM_GROUP`).
- [X] T012 [P] Integration test `backend/test/integration/supervision-availability.spec.ts` (data-model §5): candidates = active members of `SUPERVISORS`; sorted by the class's floor first then the others; reasons `INACTIVE`, `ABSENT`, `UNAVAILABLE`, `ON_GUARD`, `SUPPORT`; an active backup makes the supervisor busy; range overlap (unknown end = +∞); assigning an unavailable one refused `409 NOT_AVAILABLE` (no more `force`).
- [X] T013 [P] Integration test `backend/test/integration/supervision-reminders-job.spec.ts` (clock `backend/test/utils/clock.ts`): `CoverageRemindersJob.runOnce(now)` sends each type to the right recipient, only once (idempotence, `attempts`, `resolvedAt`), writes `REMINDER_SENT`/`ESCALATED`; condition rechecked before sending (row resolved `OBSOLETE` if the assignment is no longer concerned); two concurrent runs do not send twice; **guard duty with `plannedEndAt` null: no `COVERAGE_CLOSE_REMINDER` before `endOfLocalDay(startAt) + 10 min`**; `EXPIRE_UNFILLED` on `PENDING` whose end has passed; `CoverageDeadlinesJob` now processes only `ARRIVAL` (`ACCEPTED`/`EN_ROUTE` → `LATE`).

### Schema and migrations

- [X] T014 Modify `backend/prisma/schema.prisma` according to data-model.md: `Role` (`MANAGER` → `ADMIN`); `RequestStatus` + `PENDING`; new enums `CoverageSource` (`TEACHER_REQUEST`, `SUPERVISOR_REPORT`, `ADMIN_DIRECT`), `CoverageType` (`LATENESS`, `ABSENCE`, `EMPTY_CLASS`), `GroupSystemKey` (`TEACHERS`, `SUPERVISORS`), `CoverageReminderKind`, `MergeProposalStatus`; additions to `RequestEventType`, `NotificationType`, `AuditAction` (data-model §1); models `Floor` (`name` varchar(60) unique, `position` int, `active` bool default true), `CoverageSupport` (partial unique index "only one active backup per (requestId, userId)" declared in SQL), `CoverageMergeProposal` (unique `(sourceRequestId, targetRequestId)`), `CoverageReminder` (index `(resolvedAt, dueAt)`, `resolution` varchar(30)); columns `CoverageDetail.source|type|teacherId|reason varchar(1000)|floorId|mergedIntoId|anonymizedAt` (all nullable in the database), `SchoolClass.floorId`, `User.floorId`, `EmployeeGroup.systemKey` unique; indexes `CoverageDetail (teacherId)`, `(floorId)`, `(source, type)`.
- [X] T015 Write `backend/prisma/migrations/0008_supervision_schema/migration.sql` (purely additive: `ADD VALUE`, `CREATE TYPE`, `CREATE TABLE`, nullable `ADD COLUMN`, indexes, no data modified) and `down.sql` following the model of `0002_coverage/down.sql` (guard if the new tables or columns contain data; recreation of the enums without the added values; deletion of the `_prisma_migrations` row). The role rename is NOT in 0008.
- [X] T016 Write `backend/prisma/migrations/0009_supervision_data/migration.sql` (contracts/migration.md step 2, points 1 to 8, one transaction) and `down.sql` (restoration from the `migration-0009` events by **adding** `migration-0009-down` events, guards, deletion of the `_prisma_migrations` row). Makes T010 pass together with T015.
- [X] T017 Create `backend/scripts/supervision-preflight.ts` and the `preflight:supervision` script in `backend/package.json`: read-only Markdown report `supervision-preflight-<date>.md` with sections A (group members: name, identifier, title, role — validation V1), B (count by status, target status, named list "with no obvious equivalent" — V2), C (12 rolling months, number of assignments anonymized on the first run — V3), and signature spots (name, date) for V1–V3. Test: `backend/test/integration/supervision-preflight.spec.ts` (expected report on the T010 data set, no database write).

### Technical role rename (compilation)

- [X] T018 Replace `Role.MANAGER` / `'MANAGER'` (in the sense of the role only) by `ADMIN` in `backend/src/**` (including `settings/default-permissions.ts`, `settings/admin-settings.service.ts`, `common/authorization.ts`, `requests/domain/access-policy.ts` (`isAdministration`, `canCreateInCategory`), `requests/domain/visibility.ts` (`DIRECT` and `PEER` requests visible to any admin), `categories/admin-categories.service.ts` (accounts eligible for categories), `users/users.dto.ts`, `coverage/`) and `backend/prisma/seed.ts`; DO NOT rename `ClosureMode.MANAGER`, the `MANAGER` actor of the state machines, `RELEASE_BY_MANAGER` nor the assignment source `MANAGER_CHOICE` (R8). `npm run -w backend typecheck` green.
- [X] T019 [P] Update `frontend/src/api/types.ts` (`Role`: `ADMIN`) and all uses of `'MANAGER'` in the sense of the role in `frontend/src/**` (including `features/admin/api.ts`, `SettingsAdminPage.tsx`, `UserFormDialog.tsx`, `features/requests/RequestListPage.tsx` (`isManager`), `features/admin/CategoryFormDialog.tsx` (default `creatorRoles` and the filter of eligible accounts; NOT `closureMode: 'MANAGER'`)); `frontend/tests/api/enums-sync.test.ts` green. `npm run -w frontend typecheck` green.
- [X] T020 [P] Adapt the tests that reference the `MANAGER` role (in the sense of the role) or the `responsable` account: only the value or the identifier changes, the expectations stay identical (FR-002, Q24). List established on 2026-10-16 (`grep` on `master` after PR #11):
  - **role value**: `backend/test/unit/access-policy.spec.ts`, `unit/authorization.spec.ts`, `unit/audit-sanitize.spec.ts`, `integration/admin-users.spec.ts`, `integration/admin-categories.spec.ts`, `integration/categories-form-list.spec.ts`, `integration/reassign.spec.ts`, `integration/requests-circuit-b.spec.ts`, `integration/requests-create.spec.ts`, `integration/routing-modes.spec.ts`; `frontend/tests/admin/admin-pages.test.tsx`, `admin/dashboard.test.tsx`, `requests/ApprovalPanel.test.tsx`, `requests/routing.test.tsx`;
  - **`responsable` account or labels**: `backend/test/integration/admin-audit.spec.ts`, `admin-dashboard.spec.ts`, `assignable-employees.spec.ts`, `auto-assignment-snapshot.spec.ts`, `history-priority.spec.ts`, `overdue-job.spec.ts`, `requests-actions-circuit-a.spec.ts`, `requests-search.spec.ts`, `search-performance.spec.ts`, `superadmin-notifications.spec.ts`, `backend/test/unit/notifications-recipients.spec.ts`; `frontend/tests/requests/CreateRequestPage.test.tsx`, `requests/HistoryTimeline.test.tsx`;
  - handled elsewhere: `coverage-policy.spec.ts` (T009), `coverage-state-machine.spec.ts` (T008), `seed.spec.ts` and `auth-helpers.ts` (T037), `coverage.spec.ts` (T038), `coverage-work-isolation.spec.ts` (T039), `coverage.test.tsx` (T040), e2e (T046, T082);
  - unchanged: `unit/request-state-machine.spec.ts` (`MANAGER` actor and closure mode, not the role), `MANAGER_CHOICE` in `auto-assignment-snapshot.spec.ts`.

### Domain foundation

- [X] T021 [P] Add `SCHOOL_TIMEZONE` to `backend/src/config/config.ts` (IANA validation via `Intl.DateTimeFormat`, default `Europe/Paris`) — makes T004 pass.
- [X] T022 [P] Create `backend/src/common/school-time.ts` (pure functions on `Intl`, no dependency) — makes T005 pass.
- [X] T023 [P] Add the keys `coverageUrgencyThresholdMinutes` (60, 5–720), `coverageEscalationMinutes` (5, 1–120), `coverageMorningReminderTime` ("07:00", `HH:MM`), `coverageCloseReminderMinutes` (10, 1–240), `coverageCloseEscalationMinutes` (10, 1–240), `coverageSupportReminderMinutes` (10, 1–120), `coverageSupportReminderMax` (3, 1–10), `coverageRetentionMonths` (12, 1–60) to `SETTING_DEFAULTS` and `SETTING_RULES` in `backend/src/settings/settings.service.ts`; labels in `frontend/src/features/admin/SettingsAdminPage.tsx`.
- [X] T024 [P] Create `backend/src/coverage/domain/coverage-status.ts` (`coverageMainStatus`, `MAIN_STATUS_VALUES`, `ACTIVE_STATUSES` including `PENDING` for the lists, `FINAL_STATUSES`) — makes T006 pass.
- [X] T025 [P] Create `backend/src/coverage/domain/coverage-reminders.ts` (pure computation of the `CoverageReminder` rows to create, recompute or resolve for each transition) — makes T007 pass, including the rule "deemed end = end of the local day" for `plannedEndAt` null.
- [X] T026 Rewrite `backend/src/coverage/domain/coverage-state-machine.ts` according to data-model §4 (remove `ACCEPT`, `WIDEN`, `RELEASE`, `EXPIRE` to `UNFILLED`; add `PENDING`, `ASSIGN`, extended `CANCEL`, `WITHDRAW`, `UPDATE`, `ATTACH_DECLARATION`, `EXPIRE_UNFILLED`, `SET_TEACHER`, `RELEASE_SUPPORT`, `REASSIGN` in place) — makes T008 pass.
- [X] T027 Rewrite `backend/src/coverage/domain/coverage-policy.ts`: actors `ADMIN` (role `ADMIN` or `SUPER_ADMIN`), `ASSIGNEE`, `REQUESTER_TEACHER`, `SUPERVISOR`, `SUPPORT`; limited view without `reason` for the supervisor; `isCoverageManagerUser` = role `ADMIN` or `SUPER_ADMIN` in `backend/src/coverage/coverage.service.ts` (R9) — makes T009 pass.
- [X] T028 Create `backend/src/coverage/coverage-groups.ts`: `isTeacher(userId)`, `isSupervisor(userId)`, `supervisorIds()`, `teacherIds()` by `EmployeeGroup.systemKey` (never by name, R7), and `adminRecipients(tx)` (active admins, otherwise active super admins) and `superAdminRecipients(tx)` (R11).
- [X] T029 Modify `backend/src/coverage/coverage-availability.ts` and `CoverageService.candidates` in `backend/src/coverage/coverage.service.ts`: `SUPERVISORS` eligibility, active backup = busy (reason `SUPPORT`), sorting by the class's floor, removal of `force` — makes T012 pass.
- [X] T030 Modify `backend/src/coverage/coverage-actions.service.ts`: remove `broadcastInTx`, `AcceptRateLimiter`, `ALREADY_TAKEN`, `coverage:taken`, `CoverageTarget` at creation; "category managers" recipients replaced by `adminRecipients`; creation, recomputation and resolution of the `CoverageReminder` rows via `coverage-reminders.ts` in the same transaction as each transition; `RequestEvent` events for each change (no name or reason in the payloads, R5); `createRelief` creates the handover as `PENDING` (no broadcast) or `ACCEPTED` when the admin designates the substitute (`REASSIGN` in place, FR-008j).
- [X] T031 Add `copyFloor` at creation: `CoverageDetail.floorId` = the class's floor at the time of creation (data-model §3) in `backend/src/coverage/coverage-actions.service.ts`.
- [X] T032 Create `backend/src/scheduler/coverage-reminders.job.ts` (15 s, `pg_try_advisory_xact_lock(hashtext('coverage-reminders-job'))`, `FOR UPDATE SKIP LOCKED`, batches of 200, `runOnce(now?)`) processing all `CoverageReminderKind` types and the `EXPIRE_UNFILLED` transition; modify `backend/src/scheduler/coverage-deadlines.job.ts` to keep only `ARRIVAL`; register in `backend/src/scheduler/scheduler.module.ts` — makes T013 pass.
- [X] T033 Add the new types to the labels and icons of `frontend/src/features/notifications/api.ts` and to the enums of `frontend/src/api/types.ts`; `frontend/tests/api/enums-sync.test.ts` green.

### Floors and groups (super administrator)

- [X] T034 Add the `/admin/floors` routes (GET, POST, PATCH) in `backend/src/coverage/coverage-admin.controller.ts` and `coverage-admin.service.ts` (`supervisorCount`, `warning: "NO_SUPERVISOR"`, audit `FLOOR_CHANGED`); `floorId` required on the class DTOs; refusal to delete or deactivate a group with a `systemKey` (`409 SYSTEM_GROUP`); add `FLOOR_CHANGED` and the new detail keys to `ALLOWED_DETAIL_KEYS` of `backend/src/audit/audit.service.ts`.
- [X] T035 [P] Add `floorId` (optional) to `backend/src/users/users.dto.ts` and `users.service.ts` (account sheet, super admin only) — together with T034, makes T011 pass.
- [X] T036 [P] Screen `frontend/src/features/coverage/FloorsAdminPage.tsx` (list, creation, renaming, order, activation, non-blocking "Étage sans surveillant" (floor without supervisor) warning) + route in `frontend/src/features/admin/adminRoutes.tsx`; required "Étage" (floor) field in `ClassesAdminPage.tsx`; "Étage (surveillant)" field in `frontend/src/features/admin/UserFormDialog.tsx`; test `frontend/tests/admin/floors.test.tsx` (accessibility: labels, focus, actionable errors).

### Demo data and existing tests

- [X] T037 Update `backend/prisma/seed.ts`: `admin` account (formerly `responsable`, role `ADMIN`, "Admin — surveillante générale"), groups "Surveillants" (`SUPERVISORS`) and "Enseignants" (`TEACHERS`), `enseignante` in Enseignants, `surveillant` and a second supervisor `surveillant2` on two floors, floors "1er étage" and "2e étage", classes attached; `reprographie` outside the groups; update `backend/test/utils/auth-helpers.ts`, `backend/test/integration/seed.spec.ts` and `e2e/support/accounts.ts`.
- [X] T038 Adapt `backend/test/integration/coverage.spec.ts`: replace the broadcast/acceptance setup by the admin's `ASSIGN`; remove the cases 1 bis/1 ter of broadcast, 2 (concurrent acceptance), rate limit, 2 bis, 3, 5, 5 bis, 6 (rebroadcast), live "taken", empty group — recording each removal and its reason (broadcast removed, FR-011a) in `docs/validation/verification-004.md`; keep and make pass QR/photo presence, handover, release by the admin, extension, arrival delay, cancellation, forbidden transitions, super admin screens, category.
- [X] T039 [P] Adapt `backend/test/integration/coverage-work-isolation.spec.ts`, `notifications.spec.ts` and `realtime.spec.ts` (no more `coverage:taken`, admin recipients) without changing the work request expectations.
- [X] T040 Remove the "À prendre" (To take) tab, `OpenCoverageCard`, `OpenCoverageTab`, the `ACCEPT` action ("Je prends", I take it), `canAccept`, `useOpenCoverage` and the widening from `frontend/src/features/coverage/CoveragePage.tsx`, `EmployeeViews.tsx`, `CoverageActions.tsx`, `api.ts`, `types.ts`, `labels.tsx`; remove `GET /coverage/open` and `CoverageService.open` on the backend; adapt `frontend/tests/coverage/coverage.test.tsx` (removal of the "À prendre" cases recorded).
- [X] T041 Show the main status and the sub-state as a badge (data-model R1) in the lists and the detail: `frontend/src/features/coverage/labels.tsx` (labels "en attente", "assignée", "en cours", "terminée", "annulée", "non pourvue"; badges "En route", "En retard", "Relève demandée", "Clôturée après validation"), `ManagerViews.tsx`, `CoverageDetailPage.tsx`; expose `mainStatus`/`subState` in `backend/src/coverage/coverage.mapper.ts`; test `frontend/tests/coverage/status-badges.test.tsx`.

**Checkpoint**: migrations applied and rolled back (T010), backend and frontend suites green,
existing guard duties working through admin assignment.

---

## Phase 3: User Story 4 - "Admin" role in place of "Responsable" (Priority: P1)

**Goal**: everywhere, "Admin" replaces "Responsable" without loss of access; the super
administrator area is called "Administrateur" (FR-004 to FR-004d).

**Independent Test**: the `admin` account (formerly `responsable`) regains all its rights according
to the routing mode (Q22: via administration, direct, peer-to-peer), reassignment and the
categories it manages; no interface text uses "responsable" in the sense of the role.

### Tests for User Story 4

- [X] T042 [P] [US4] Integration test `backend/test/integration/role-admin-rename.spec.ts`: a migrated former manager (role `ADMIN`) keeps `RolePermission`, `Category.creatorRoles`, `CategoryManager` and the rights of each routing mode (Q22) — `VIA_ADMIN`: validation or refusal (reason required), assignment, reassignment, priority and discussion in the categories it manages; `DIRECT` and `PEER`: read-only view of all requests, no action, no message, no notification; creation in any active category; API error messages without "responsable" in the sense of the role; the super admin stays distinct.
- [X] T043 [P] [US4] Test `frontend/tests/admin/role-labels.test.tsx`: `ROLE_LABELS.ADMIN === 'Admin'`, `SUPER_ADMIN === 'Super administrateur'`, menu and title of the "Administrateur" area, `CLOSURE_LABELS.MANAGER === 'Par un admin'`, category form "Admins de la catégorie", "Validation finale par un admin".

### Implementation for User Story 4

- [X] T044 [US4] Labels in `frontend/src/features/admin/labels.ts`, `AdminLayout.tsx`, `CategoryFormDialog.tsx`, `CategoriesAdminPage.tsx`, `UserFormDialog.tsx`, `frontend/src/app/AppLayout.tsx` ("Administrateur" menu), and the "responsable" texts in the sense of the role in `frontend/src/features/**` (`EmployeeViews.tsx`, `ManagerViews.tsx`, `CoverageDetailPage.tsx`, `CoverageActions.tsx`, `CoveragePage.tsx`, `CreateCoveragePage.tsx`, `coverage/api.ts`, `CreateRequestPage.tsx`, `HistoryTimeline.tsx`, `ReassignDialog.tsx`, `requests/api.ts`, `RequestListPage.tsx` ("Suivi" tab), the routing mode labels in `CategoryFormDialog.tsx` and `CategoriesAdminPage.tsx`, the Employees tab of `DashboardPage.tsx`) — makes T043 pass. These designate the assigned employee (and not the role) but are reworded to avoid any confusion with "Admin" (decision of 2026-10-17): "Responsable" columns of `DashboardPage.tsx` → "Employé affecté" (assigned employee), help text "« Reçues » : demandes de la période dont l'employé est actuellement responsable" → "« Reçues » : demandes de la période actuellement affectées à l'employé", and `UNASSIGNED: 'Demande sans responsable'` of `features/notifications/api.ts` → "Demande sans employé affecté" (consistent with the "Sans employé affecté" card); adapt `frontend/tests/admin/dashboard.test.tsx` and the notification tests concerned.
- [X] T045 [P] [US4] "Responsable" messages and comments in the sense of the role in `backend/src/**` (`coverage/coverage.service.ts`, `coverage.controller.ts`, `coverage.dto.ts`, `coverage-actions.service.ts`, `coverage-availability.ts`, `coverage-file-access.ts`, `domain/coverage-state-machine.ts`, `domain/coverage-policy.ts`, `categories/admin-categories.service.ts`, `requests/requests.service.ts`, `requests/requests.controller.ts`, `requests/request-transitions.service.ts`, `requests/domain/access-policy.ts`, `requests/domain/visibility.ts`, `messages/messages.service.ts`, `scheduler/overdue.job.ts`, `users/users.dto.ts`, `users/users.service.ts`) — makes T042 pass.
- [X] T046 [P] [US4] Adapt the e2e specs to the `admin` account and the labels: `e2e/us8-admin.spec.ts`, `e2e/us5-admin-validation.spec.ts`, `e2e/us6-deadlines.spec.ts`, `e2e/auth.spec.ts`, `e2e/admin-dashboard.spec.ts` (`e2e/coverage-class.spec.ts`: T082; `e2e/support/accounts.ts`: T037).
- [X] T047 [P] [US4] Documentation: `README.md` ("Rôles : employé, admin, super administrateur"), `docs/ARCHITECTURE.md`, `docs/coverage-migration.md`; note at the top of `specs/001-demandes-travail-vocales/spec.md` and `specs/003-corrections-audit-technique/spec.md`: "Depuis la fonctionnalité 004, le rôle "Responsable" s'appelle "Admin" ; la terminologie de la spécification courante fait foi" (Since feature 004, the "Responsable" role is called "Admin"; the terminology of the current specification prevails) (FR-004d), with no other rewriting.
- [X] T048 [US4] Final check: `git grep -in "responsable"` on `backend/src`, `frontend/src`, `e2e`, `README.md`, `docs`; each remaining occurrence is justified (meaning unrelated to the role) in `docs/validation/verification-004.md` (SC-007).

**Checkpoint**: US4 deliverable alone; existing journeys (phase 1, assigned guard duties) green.

---

## Phase 4: User Story 1 - Report a lateness or absence in advance (Priority: P1) 🎯 MVP

**Goal**: the teacher reports (today/tomorrow, free time range, class, type, optional reason);
the admin is notified and assigns an available supervisor; the supervisor and the teacher are
notified; deadline, escalation, 7:00 reminder, unfilled, closing and closing reminders.

**Independent Test**: `enseignante` reports a lateness for tomorrow; `admin` sees the request
"en attente" (pending) and assigns `surveillant`; `surveillant` sees the assignment without the
reason; moves it to "en cours" (in progress) then "terminée" (done); the history keeps who, when,
class and duration.

### Tests for User Story 1

- [X] T049 [P] [US1] Integration test `backend/test/integration/supervision-teacher-request.spec.ts` covering acceptance scenarios 1 to 7 of US1 and: validation (date today/tomorrow in `SCHOOL_TIMEZONE`, time range not entirely in the past, end > start, `endTime` or `durationMinutes`, a single class and a single range, FR-012); `400 INVALID_DATE`/`INVALID_RANGE`/`CLASS_INACTIVE`; `PATCH` and `WITHDRAW` only in `PENDING` with a traced `UPDATED` event (FR-008g); `409 NOT_PENDING` after assignment; `ASSIGN` by the admin → `ACCEPTED`, `ASSIGNED` to the supervisor **and to the teacher author** (class, time slot, supervisor name, FR-017a); `REASSIGN` → `COVERAGE_LIFTED` to the former one, `ASSIGNED` to the new one and to the teacher; admin `CANCEL`; the supervisor never sees `reason` (FR-023c); the teacher only sees their own requests; duration = `presenceAt` → `relievedAt` (FR-021).
- [X] T050 [P] [US1] Integration test `backend/test/integration/supervision-deadlines.spec.ts` (simulated clock): request for today in 30 min → URGENT `COVERAGE_TAKEOVER_EXPIRED` to the admins at +2 min, `COVERAGE_ESCALATED` to the super admins at +5 min, escalation stops at assignment, cancellation or withdrawal; viewing the alert has no effect; request for 15:00 at 7:00 → no deadline before 14:00, then same alert and same escalation (FR-011d/e); request for tomorrow → `COVERAGE_MORNING_REMINDER` at 07:00 if still `PENDING`, nothing otherwise (FR-011f); no active admin → super admins (R11); `PENDING` never assigned → `UNFILLED` after the time slot end (FR-008a); `END_OF_SLOT` at end + 10 min to the supervisor then admins at + 20 min (FR-016a); admin list: `PENDING` with expired deadline at the top.
- [X] T051 [P] [US1] Frontend tests `frontend/tests/coverage/teacher-request.test.tsx` (form: type, class among all classes, date today/tomorrow, start, end or duration, optional reason; per-field errors; editing and withdrawing while pending; accessibility) and `frontend/tests/coverage/admin-queue.test.tsx` (prioritized "En attente" queue, assignment dialog with candidates sorted by floor and unavailable ones marked as not selectable).

### Implementation for User Story 1

- [X] T052 [P] [US1] DTOs `TeacherRequestDto` and `UpdateTeacherRequestDto` in `backend/src/coverage/coverage.dto.ts` (contracts/rest-api.md: `type` `LATENESS|ABSENCE`, `classId`, `date` `YYYY-MM-DD`, `startTime`/`endTime` `HH:MM` or `durationMinutes`, `reason` ≤ 1000, `clientId`, `version` for the modification).
- [X] T053 [US1] `CoverageService.createTeacherRequest`, `updateTeacherRequest` and action `WITHDRAW` in `backend/src/coverage/coverage.service.ts` / `coverage-actions.service.ts`: source `TEACHER_REQUEST`, `teacherId` = requester, `requesterId` = teacher, status `PENDING`, `plannedEndAt` required, `TAKEOVER`/`MORNING` reminders, notification `COVERAGE_REQUESTED` (or `COVERAGE_UPDATED`) to the admins.
- [X] T054 [US1] Routes `POST /coverage/teacher-requests`, `PATCH /coverage/:id/teacher-request`, `GET /coverage/my-requests` in `backend/src/coverage/coverage.controller.ts`; filters `mainStatus`, `source`, `type`, `floorId`, `classId`, `teacherId`, `from`, `to` and priority sorting on `GET /coverage`; `404` for the unauthorized with `ACCESS_DENIED` logged.
- [X] T055 [US1] Views by actor in `backend/src/coverage/coverage.mapper.ts` (admin complete with `reason`; supervisor: class, floor, time slot, type, status, never `reason`; teacher: their request, status, supervisor name) and `ASSIGNED` notification to the teacher author on `ASSIGN`/`REASSIGN` in `coverage-actions.service.ts` (FR-017a).
- [X] T056 [US1] Processing of `TAKEOVER`, `TAKEOVER_ESCALATION`, `MORNING`, `END_OF_SLOT`, `END_OF_SLOT_ADMIN` and `EXPIRE_UNFILLED` in `backend/src/scheduler/coverage-reminders.job.ts` (recipients and priorities from contracts/realtime-events.md) — makes T050 pass.
- [X] T057 [P] [US1] Screen `frontend/src/features/coverage/TeacherRequestPage.tsx` (creation and modification) and "Mes signalements" (my reports) list in `frontend/src/features/coverage/TeacherViews.tsx`; hooks in `frontend/src/features/coverage/api.ts`; routes `/gardes/signaler` and `/gardes/signalements/:id` in `frontend/src/app/routes.tsx`.
- [X] T058 [US1] Admin queue in `frontend/src/features/coverage/ManagerViews.tsx`: "En attente" tab first, expired deadlines highlighted, dialog `AssignDialog.tsx` (candidates `/coverage/:id/candidates`, floor first, unavailability reasons), cancel and reassign actions; notifications and Snackbar via the existing `NotificationCenter`.
- [X] T059 [US1] Visibility of the "Gardes" menu in `frontend/src/app/AppLayout.tsx`: admin, super admin, members of `SUPERVISORS` or `TEACHERS`; nothing for other employees (FR-023b); expose `isTeacher`/`isSupervisor` in the session response (`backend/src/auth/`); test `frontend/tests/coverage/navigation.test.tsx`.

**Checkpoint**: MVP — teacher → admin → supervisor journey end to end, deadlines and
reminders included.

---

## Phase 5: User Story 2 - Report an empty class during the round (Priority: P1)

**Goal**: the supervisor reports an empty class (teacher optional); the assignment is born in
their name "en cours" (in progress); admin alerted in real time; duplicates, backups, attachment
proposals, double assignment (FR-015 to FR-015j).

**Independent Test**: `surveillant` reports an empty class; `admin` receives a highlighted alert;
`surveillant2` reports the same class and becomes backup; `surveillant` closes.

### Tests for User Story 2

- [X] T060 [P] [US2] Unit tests `backend/test/unit/coverage-duplicates.spec.ts` for `backend/src/coverage/domain/coverage-duplicates.ts`: table of data-model §6 (teacher specified + `PENDING` → attachment `ATTACH_DECLARATION`; `ACCEPTED`/`EN_ROUTE`/`LATE` → `ALREADY_ASSIGNED` without modification; `ON_DUTY`/`RELIEF_PENDING` on the class → `SUPPORT`; teacher not specified + existing request → `MERGE_PROPOSED`; otherwise `CREATED`); overlap on `[now, end of day)`.
- [X] T061 [P] [US2] Integration test `backend/test/integration/supervision-empty-class.spec.ts`: acceptance scenarios 1 to 4 of US2; report never blocked without `teacherId` (FR-015a); `teacherId` outside `TEACHERS` refused; immediate `ON_DUTY`, `presenceAt` = report; optional QR recorded as `CoveragePresence` (R10); no `TAKEOVER` row; URGENT `COVERAGE_EMPTY_CLASS` to the admins; each `outcome` of contracts/rest-api.md; supervisor already busy → assignment created anyway + URGENT `COVERAGE_DOUBLE_ASSIGNMENT` (FR-015j); backup busy until released by the admin (`RELEASE_SUPPORT`) or switch to "terminée", `SUPPORT_DECISION` reminders every 10 min, 3 at most, then `COVERAGE_ESCALATED` to the super admins (FR-015i); proposals: `CONFIRM` decision (absorbed one `CANCELLED` + `mergedIntoId`, R6) and `REJECT`, after-the-fact decision, `finalPresentedAt` when both are final, `MERGE_DECIDED` events and `COVERAGE_MERGE_DECIDED` audit (FR-015g, FR-015h); `SET_TEACHER` by the admin traced `TEACHER_SET` (FR-015c); `CANCEL` of an in-progress assignment by the admin only (FR-008h).
- [X] T062 [P] [US2] Frontend tests `frontend/tests/coverage/empty-class.test.tsx` (report in two gestures, optional teacher chosen from the Enseignants group, messages according to `outcome`, accessibility) and `frontend/tests/notifications/urgent-alert.test.tsx` (URGENT alert: `role="alert"`, `aria-live="assertive"`, persistent Snackbar; sound signal can be turned off, never played without prior interaction, never the sole carrier of the information).

### Implementation for User Story 2

- [X] T063 [P] [US2] Create `backend/src/coverage/domain/coverage-duplicates.ts` (pure) — makes T060 pass.
- [X] T064 [US2] `CoverageService.declareEmptyClass` and route `POST /coverage/empty-class` (`backend/src/coverage/coverage.service.ts`, `coverage.controller.ts`, `coverage.dto.ts`: `classId`, `teacherId|null`, `qrToken?`, `clientId`): source `SUPERVISOR_REPORT`, type `EMPTY_CLASS`, assignee = reporter, `ON_DUTY`, attachment, backup (`CoverageSupport`), proposal (`CoverageMergeProposal`), double assignment, notifications, `END_OF_SLOT` and `SUPPORT_DECISION` reminders.
- [X] T065 [US2] Actions `RELEASE_SUPPORT` and `SET_TEACHER`, release of backups on switch to `DONE`, and routes `GET /coverage/merge-proposals`, `POST /coverage/merge-proposals/:id/decision` in `backend/src/coverage/coverage-actions.service.ts` and `coverage.controller.ts`.
- [X] T066 [US2] Processing of `SUPPORT_DECISION` and `SUPPORT_ESCALATION` in `backend/src/scheduler/coverage-reminders.job.ts` — with T064 and T065, makes T061 pass.
- [X] T067 [P] [US2] Screen `frontend/src/features/coverage/EmptyClassPage.tsx` (choice of the class or QR via `PresencePage.tsx`, optional teacher, result according to `outcome`) + route `/gardes/classe-vide` in `frontend/src/app/routes.tsx`; supervisor's "Mes affectations" (my assignments) list in `EmployeeViews.tsx` (assignments and backups, "Terminer" button).
- [X] T068 [US2] Admin side in `frontend/src/features/coverage/ManagerViews.tsx` and `CoverageDetailPage.tsx`: backups (release), attachment proposals (confirm/refuse, "non tranché" mention), teacher correction, double assignment alert.
- [X] T069 [US2] Optional sound signal in `frontend/src/features/notifications/NotificationCenter.tsx` (Web Audio API, local preference that can be turned off, triggered only after a user interaction, always accompanied by the existing visual signal) — makes T062 pass.

**Checkpoint**: US1 and US2 work independently.

---

## Phase 6: User Story 3 - Create a direct assignment (Priority: P2)

**Goal**: the admin creates an assignment (class, type, range, available supervisor) without a
prior request; reassignment on assigned and in-progress assignments; cancellation (FR-008e,
FR-008j, FR-019).

**Independent Test**: `admin` creates a direct assignment for `surveillant`; a busy supervisor is
refused; `admin` reassigns an in-progress assignment to `surveillant2`, `surveillant` is released
only when `surveillant2` is present.

### Tests for User Story 3

- [X] T070 [P] [US3] Integration test `backend/test/integration/supervision-direct.spec.ts`: scenarios 1 to 3 of US3; `POST /coverage` is born `ACCEPTED`, source `ADMIN_DIRECT`, `type` required, `endAt` required, `teacherId` optional; removed fields (`groupIds`, `categoryId`, `estimatedMinutes`, `absentTeacher`, `force`) refused; `409 NOT_AVAILABLE`; reassignment in `ACCEPTED` (status unchanged, `COVERAGE_LIFTED` and `ASSIGNED`, `REASSIGNED` traced with former and new, FR-008k); reassignment in `ON_DUTY` → handover **assigned** to the new one, the former released by system `RELIEVE` when the new one is present, main status "en cours" kept (FR-008j); refusals for teacher and supervisor logged.
- [X] T071 [P] [US3] Frontend test `frontend/tests/coverage/direct-assignment.test.tsx` (form: class, type, optional teacher, start, end, supervisor among the available ones; errors; accessibility).

### Implementation for User Story 3

- [X] T072 [US3] Modify `CreateCoverageDto` and `CoverageService.create` in `backend/src/coverage/coverage.dto.ts` and `coverage.service.ts` (contracts/rest-api.md `POST /coverage`): guard category resolved server side, `ACCEPTED`, `END_OF_SLOT`, `ASSIGNED` notification.
- [X] T073 [US3] `REASSIGN` on `ON_DUTY`/`RELIEF_PENDING` via `createRelief` with a designated substitute in `backend/src/coverage/coverage-actions.service.ts` — makes T070 pass together with T072.
- [X] T074 [US3] Rewrite `frontend/src/features/coverage/CreateCoveragePage.tsx` (direct assignment; no more groups or broadcast) and the "Réassigner" (Reassign) action in `CoverageActions.tsx` for the assigned and in-progress statuses — makes T071 pass.

**Checkpoint**: US1, US2, US3 independent and green.

---

## Phase 7: User Story 5 - History, statistics and retention (Priority: P3)

**Goal**: complete history and statistics (FR-020 to FR-022, FR-008i, FR-015b, FR-015h);
anonymization at 12 rolling months (FR-023a).

**Independent Test**: after a set of done, cancelled, unfilled and duplicate assignments,
`admin` gets figures matching data-model §7; the anonymization erases the teacher and the
reason without touching the history or the audit log.

### Tests for User Story 5

- [X] T075 [P] [US5] Unit tests `backend/test/unit/coverage-stats.spec.ts` for `backend/src/coverage/domain/coverage-stats.ts`: rules of data-model §7 (events excluding cancelled and excluding `mergedIntoId`; "enseignant non précisé" (teacher not specified); average duration `DONE`/`CLOSED`; unfilled rate; cancelled separately; `PENDING` duplicates counted once, "non tranché" section if `finalPresentedAt`, `REJECTED` two, `CONFIRMED` one; after-the-fact correction).
- [X] T076 [P] [US5] Integration test `backend/test/integration/supervision-stats.spec.ts`: `GET /coverage/stats` by teacher, class, period (week, month, school time zone); admin and super admin access only (`404` otherwise); no export; scenarios 1 and 2 of US5.
- [X] T077 [P] [US5] Integration test `backend/test/integration/supervision-anonymization.spec.ts`: final assignments older than `coverageRetentionMonths` anonymized (`teacherId`, `absentTeacher`, `reason` to null; `requesterId` → `enseignant-anonymise` account and `description` to null for a teacher request; `anonymizedAt`); recent or non-final assignments intact; `ANONYMIZED` event added without personal data; `COVERAGE_ANONYMIZED` audit; **no `RequestEvent`, `AuditLog` or `Notification` row modified**; idempotence.

### Implementation for User Story 5

- [X] T078 [P] [US5] Create `backend/src/coverage/domain/coverage-stats.ts` (pure) and `backend/src/coverage/coverage-stats.service.ts` + route `GET /coverage/stats` in `coverage.controller.ts` — makes T075 and T076 pass.
- [X] T079 [P] [US5] Create `backend/src/coverage/coverage-anonymization.service.ts` and `backend/src/scheduler/coverage-anonymization.job.ts` (every hour, advisory lock, batches of 200, idempotent via `anonymizedAt`), registered in `scheduler.module.ts`; add `COVERAGE_ANONYMIZED` to the allowed audit keys — makes T077 pass.
- [X] T080 [US5] Screen `frontend/src/features/coverage/CoverageStatsPage.tsx` (period and grouping filters, accessible tables, "Enseignant non précisé", cancelled and "non tranchés" shown separately) and detailed history in `CoverageDetailPage.tsx` (sources, successive statuses, authors, reassignments, merges, backups); route `/gardes/statistiques`; test `frontend/tests/coverage/stats.test.tsx`.

**Checkpoint**: all stories delivered.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T081 [P] Cross-cutting integration test `backend/test/integration/supervision-permissions.spec.ts`: each route of the module × each role of the plan.md matrix; refusals logged `ACCESS_DENIED`; `404` outside the scope (principle V).
- [X] T082 Rewrite `e2e/coverage-class.spec.ts` as three journeys at 360, 768 and 1280 px: teacher request → assignment → in progress → done; empty class → second report as backup → admin decision; direct assignment → reassignment; and `e2e/a11y-responsive.spec.ts` extended to the new screens (no horizontal scroll at 320 px, axe with no violation).
- [X] T083 [P] Update `docs/ARCHITECTURE.md` (assignments module, jobs, derived statuses) and `docs/coverage-migration.md` (pointer to `specs/004-retards-affectation-surveillants/contracts/migration.md`, pre-check and rollback procedure).
- [X] T084 Migration rehearsal on a database copy (quickstart.md, "Migration"): pre-check, `0008`, `0009`, checks, dry-run `down.sql`; record the results in `docs/validation/verification-004.md`.
- [X] T085 Run the 11 manual scenarios of `quickstart.md` and record the results in `docs/validation/verification-004.md`.
- [X] T086 `npm run verify` (lint, all tests, `npm audit --audit-level=high`), `npm run -w backend typecheck`, `npm run -w frontend typecheck`, full Playwright; record in `docs/validation/verification-004.md`; no new dependency in `package-lock.json` (R15).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependency.
- **Foundational (Phase 2)**: after Setup; **blocks all stories**. Within the phase: tests
  T004–T013 first; T014 → T015 → T016 → T017; T018–T020 after T014; T021–T025 in parallel;
  T026 → T027 → T028 → T029 → T030 → T031 → T032; T034/T035 → T036; T037 before T038–T041.
- **US4 (Phase 3)**: after Foundational.
- **US1 (Phase 4)**: after Foundational; functionally independent of US4 (the technical rename
  is done in T018), but executed after US4 to stabilize the labels.
- **US2 (Phase 5)**: after Foundational; reuses the admin queue of US1 (T058) for display,
  without depending on it for its backend tests.
- **US3 (Phase 6)**: after Foundational; reuses `AssignDialog` (T058) on the interface side.
- **US5 (Phase 7)**: after Foundational; its tests build their own data sets.
- **Polish (Phase 8)**: after all the stories.

### Within Each User Story

Red tests → pure domain → services → routes → jobs → interface → checkpoint.

### Parallel Opportunities

- Phase 2: T004–T013 (distinct test files); T019/T020; T021–T025; T035/T036; T039.
- US4: T042/T043; T045/T046/T047.
- US1: T049/T050/T051; T052 and T057.
- US2: T060/T061/T062; T063 and T067.
- US3: T070/T071.
- US5: T075/T076/T077; T078/T079.
- Once Phase 2 is done, US2, US3 and US5 (backend) can proceed in parallel with US1.

## Parallel Example: User Story 1

```text
# Tests (together, before any US1 code)
T049 backend/test/integration/supervision-teacher-request.spec.ts
T050 backend/test/integration/supervision-deadlines.spec.ts
T051 frontend/tests/coverage/teacher-request.test.tsx + admin-queue.test.tsx

# Then in parallel
T052 backend/src/coverage/coverage.dto.ts
T057 frontend/src/features/coverage/TeacherRequestPage.tsx
```

## Parallel Example: User Story 2

```text
T060 backend/test/unit/coverage-duplicates.spec.ts
T061 backend/test/integration/supervision-empty-class.spec.ts
T062 frontend/tests/coverage/empty-class.test.tsx + notifications/urgent-alert.test.tsx
# then
T063 backend/src/coverage/domain/coverage-duplicates.ts
T067 frontend/src/features/coverage/EmptyClassPage.tsx
```

## Implementation Strategy

### MVP First

1. Phase 1 and Phase 2 (including migrations applied/rolled back and adapted guard duty tests).
2. Phase 3 (US4): visible rename, with no functional risk.
3. Phase 4 (US1): **MVP** — the teacher reports, the admin assigns, the supervisor steps in.
4. **STOP and validate**: quickstart scenarios 1, 2, 3, 8, 9, 10.

### Incremental Delivery

US2 (empty class, the most frequent situation) → US3 (direct assignment) → US5 (statistics
and retention). Each story adds value without breaking the previous ones; the complete suite
stays green at each checkpoint.

### Going to production

Only after T084–T086 and the signed validations V1–V3 (contracts/migration.md, step 0).

## Notes

- [P] = distinct files, no dependency on an unfinished task.
- Tests are written and seen red before the implementation (principle I).
- Commit after each task or logical group; never mix 004 with another
  feature in a commit.
- `RequestEvent` and `AuditLog`: additions only, everywhere, including migration and
  anonymization (principle V).
