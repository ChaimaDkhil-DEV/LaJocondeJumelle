# Verification of feature 004 — teacher delays and absences, supervisor assignment

- **Branch**: `004-retards-affectation-surveillants`
- **Machine**: Windows 11, Node.js 24.21, embedded PostgreSQL 17 (embedded-postgres)

## Initial state (T001)

- **Date**: 20 October 2026
- **Commit**: `aa76140` (design documents only, no code modified). The branch was
  rebased on `master` (`38b968f`, PR #17). `master` now contains
  `0006_request_event_dashboard_indexes` (PR #13) and `0007_audit_request_actions` (PR #17): the
  feature's migrations are renumbered `0008_supervision_schema` and
  `0009_supervision_data` in all design documents.

| Command | Exit code | Result |
|----------|----------------|----------|
| `npm run lint` | 0 | no problems |
| `npm run -w backend typecheck` | 0 | no errors |
| `npm run -w frontend typecheck` | 0 | no errors |
| `npm run -w backend test` (unit) | 0 | 431 / 431; 24 suites |
| `npm run -w backend test:integration` | 0 | 313 / 313; 29 suites (133 s) |
| `npm run -w frontend test` | 0 | 159 / 159; 21 files |

**Environment note**: in a fresh working copy (`git worktree`), `npm ci` does not
generate the Prisma client. The first run of the backend typecheck and the integration tests
then fails (`@prisma/client` types missing, enums `undefined`). After
`npm exec -w backend -- prisma generate`, both pass; the results above are those of the
second run. No code is at fault.

**No failure.**

## Phase 2 — foundation (T004 to T039)

### TDD order and "red" findings

- **T004 to T009** (unit): written first, 74 failures observed before the code, then green.
- **T010** (migrations): red because the `0008`/`0009` folders were missing, then 15 / 15.
- **T017** (pre-check): red because the module was missing, then 6 / 6.
- **T011, T012, T013**: written before the service code, but during the rewrite the API no
  longer compiled; they were therefore only seen red through compilation, not on a behavior.
  They are green as soon as the backend recompiles.

### Implementation decisions

- **T011 — refusal of the `/admin/floors` routes**: 403 and `ACCESS_DENIED` (`NOT_SUPER_ADMIN`), like
  all `/admin/*` routes (`SuperAdminGuard`), and not 404 as the task states. The "out of scope" 404
  applies to the assignments module (`/coverage/*`), which respects it.
- **System-key groups**: any active account can be a member (a teacher admin, a supervisor
  super administrator, R7, FR-004b); previously, only accounts with the employee role.
- **`CANCEL` action**: the SYSTEM actor is added to cancel a handover in cascade when
  the original assignment ends (existing behavior kept).
- **Closing reminder**: the job re-checks the actual due date (extended end, or end of the local day
  for a shift "until arrival") and pushes the row back instead of sending too early (FR-016a).
- **Handover**: a handover request creates a "pending" assignment (source `ADMIN_DIRECT`, with
  a pick-up deadline); the admin assigns it. No more broadcast.
- **Migration SQL**: limited to WIN1252 (embedded PostgreSQL on Windows); `0009` without explicit
  `BEGIN`/`COMMIT` (Prisma runs it as a single query, hence an implicit transaction; an explicit
  block hid the safeguards' message). `Europe/Paris` time zone in the SQL of `0009`.

### Tests deleted or replaced (broadcast removed, FR-011a)

`backend/test/integration/coverage.spec.ts` (T038):

| Original case | Outcome | Reason |
| --- | --- | --- |
| 2. concurrency: two employees accept at the same time | deleted | no more acceptance by a volunteer; serialization of assignments remains (lock per supervisor) |
| rate limiting on "Je prends" (I'll take it) | deleted | `ACCEPT` action removed (400 `UNKNOWN_ACTION`, case 9) |
| 2 bis. "Déjà prise par [nom]" (Already taken by [name]) | deleted | no more reduced view for members of a targeted group |
| 3. employee outside the target group cannot accept | replaced | employee outside the module: 404 and logged refusal |
| 4. employee already on shift cannot accept | replaced | busy supervisor not assignable (`NOT_AVAILABLE`) |
| 4 bis. assignment forced by the manager | replaced | no more forcing: `force` refused (400), case 4 and T012 |
| 5. withdrawal and rebroadcast | deleted | `RELEASE` action removed (FR-008f) |
| 6. no taker: unfilled, group reminded | replaced | "unfilled" at the end of the slot without assignment: T013 |
| employees see a taken shift disappear (`coverage:taken`) | deleted | event removed (contracts/realtime-events.md) |
| empty group: warning, widening (`WIDEN`) | deleted | no more targeted groups or widening |

Added in the same file: assignment of a pending request (supervisor and teacher
notified, FR-017a); extension with recalculated closing reminder.

`backend/test/unit/coverage-policy.spec.ts`: case "rediffusion : délai de prise en charge" (rebroadcast: pick-up deadline)
deleted (broadcast removed; the pick-up deadline is a `CoverageReminder` due date).

`backend/test/integration/coverage-work-isolation.spec.ts` (T039): the reference shift is
created by direct assignment (status `ACCEPTED` instead of `BROADCAST`); work request
expectations unchanged. `notifications.spec.ts` and `realtime.spec.ts`: green without modification.

### Result

`npm run lint` with no errors; backend and frontend typecheck with no errors; backend unit 546 / 546;
integration 366 / 366 (34 suites); frontend 159 / 159.

## Phase 2 — interface (T033, T036, T040, T041)

- **T041** (`status-badges.test.tsx`) and **T036** (`floors.test.tsx`): written first, red
  (18 and 5 failures), then green. Two expectations of `floors.test.tsx` corrected afterwards: waiting
  for the list to load, and closing of the dialog instead of the Toast message (the
  `ToastProvider` is not mounted in this harness, as for the other administration screens).
- **T040** (`coverage.test.tsx`): rewritten before the code, but not run in between; it
  referenced missing types and would only have failed through compilation.
- **Creation screen**: `CreateCoveragePage.tsx` (broadcast to groups) and the route
  `/gardes/nouvelle` are removed; direct assignment will be rewritten in T074 (US3). Until then,
  the admin assigns pending requests from their detail.

`frontend/tests/coverage/coverage.test.tsx` (T040) — cases deleted or replaced:

| Original case | Outcome | Reason |
| --- | --- | --- |
| withdrawal: reason mandatory | replaced | withdrawal removed (FR-008f); same check on the handover request |
| forced assignment of an employee already on shift | replaced | no more forcing: unavailable ones listed but not selectable |
| tab "À prendre" (To take): "Je prends", race lost | deleted | broadcast removed (FR-011a) |
| button "Je prends" disabled | deleted | same |
| detail "Déjà prise par [nom]" | deleted | no more reduced view |
| quick creation: group without anyone available | deleted | creation by broadcast removed; direct assignment in T071/T074 |

Added: supervisor tabs ("Mes affectations" (My assignments), "Historique" (History)), cancellation by the admin
with optional reason.

Result: lint with no errors; frontend typecheck with no errors; frontend 180 / 180 (23 files).

## Phase 3 — US4, "Admin" role (T042 to T048)

- **T042** (`role-admin-rename.spec.ts`): written first, red on the API message "Seuls les
  responsables…" (Only managers…) (1 failure out of 6), then green. **T043** (`role-labels.test.tsx`): red (3 failures),
  then green; one expectation corrected (the "Par un admin" (By an admin) option only exists once the list is open).
- **T044**: interface labels; "Responsable" (Manager) in the sense of the assigned employee → "Employé
  affecté" (Assigned employee) (decision of 2026-10-17). Existing tests adapted for the label only: `admin-pages`,
  `CreateRequestPage`, `routing`, `HistoryTimeline`, `ApprovalPanel` (case titles).
- **T046**: `auth`, `us5-admin-validation`, `us6-deadlines`, `us8-admin`, `admin-dashboard`:
  10 / 10 on Chromium (`npx playwright test --project=chromium …`, 3 min). The other browser
  profiles are run in T086.

### T048 — remaining occurrences of "responsable" (SC-007)

`git grep -in responsable -- backend/src frontend/src e2e README.md docs`:

| File | Occurrences | Justification |
| --- | --- | --- |
| `backend/src`, `frontend/src`, `README.md` | 0 | — |
| `e2e/coverage-class.spec.ts` | 6 | flow of the removed broadcast, rewritten in T082 |
| `docs/superadmin-fonctionnalites.md` | 13 | dated inventory (PR #12), prior to 004; note at the top pointing to specification 004 |
| `docs/coverage-migration.md` | 4 | describes migration `0002_coverage` (`MANAGER` accounts of the time); note at the top; updated in T083 |
| `docs/validation/verification-004.md` | 1 | quotation of the replaced error message (above) |

Meanings unrelated to the role ("le surveillant reste responsable" of the class) were reworded
("reste en charge de la classe") (the supervisor remains in charge of the class) rather than kept.

## Phase 4 — US1, teacher request (T049 to T059)

### Backend (T049, T050, T052 to T056)

- **T049** (`supervision-teacher-request.spec.ts`, 17 cases) and **T050** (`supervision-deadlines.spec.ts`,
  8 cases): written first, red (routes missing, 17 failures for T049), then green. Two expectations
  of T049 corrected: serializing a full `RequestEvent` fails on `seq` (BigInt); the
  "no reason in the history" check now covers `fromValue`, `toValue`, `comment`.
- **Contract additions**: `GET /coverage/classes` (all active classes, for any member of the
  module, FR-012); `schoolDates` (`today`, `tomorrow`, time zone) in `GET /coverage/availability`,
  the browser not knowing `SCHOOL_TIMEZONE`; `isTeacher` and `isSupervisor` in
  `GET /auth/me` and the login response (T059, "Gardes" (Shifts) menu). The group computation was moved
  to `common/group-flags.ts` (layer order: `auth` does not depend on `coverage`).
- `WITHDRAW` after assignment answers `409 NOT_PENDING`, like modification.
- `auth.spec.ts`: response of `GET /auth/me` completed with the two fields (addition only).
- **Instability observed once**: during a full run, `admin-audit.spec.ts` could not
  reach the embedded PostgreSQL (`Can't reach database server at localhost:55433`). Re-run alone
  then in the full suite (397 / 397) without error; cause not established, to be monitored.

### Interface (T051, T057 to T059)

- **T051** (`teacher-request.test.tsx`, 7 cases; `admin-queue.test.tsx`, 7 cases): written first, red
  (module missing, tabs and menu missing), then green on the first run of the code.
- **T057**: `TeacherRequestPage.tsx` (creation at `/gardes/signaler`, modification and withdrawal at
  `/gardes/signalements/:id`, read-only once assigned) and "Mes signalements" (My reports) tab. Times
  are entered as `HH:MM` in a text field: the local date and time of an existing request
  are computed in the school time zone returned by the server (`schoolDates`).
- **T058**: admin queue with the "En attente" (Pending) tab first (`mainStatus=PENDING`, server sort:
  expired deadlines first), then "En cours" (In progress), "Équipe" (Team), "Terminées" (Completed). The assignment
  dialog stays in `CoverageActions.tsx` (no separate `AssignDialog.tsx` file); it is
  tested in `coverage.test.tsx` (floor first, unavailable ones not selectable).
- **T059**: "Gardes" menu computed from `GET /auth/me` (`canSeeCoverage`): admin, super
  administrator, member of the Teachers or Supervisors groups; no more call to the module
  profile to display the menu.

Result: lint with no errors; typechecks with no errors; frontend 197 / 197 (26 files).

## Phase 5 — US2, empty class declared by a supervisor (T060 to T069)

### Backend (T060, T061, T063 to T066)

- **T060** (`coverage-duplicates.spec.ts`, 15 cases): red (module missing), then green with
  `domain/coverage-duplicates.ts` (T063). Support takes precedence over any attachment; on a tie,
  the range that starts earliest.
- **T061** (`supervision-empty-class.spec.ts`, 15 cases): red (15 failures, route missing), then green.
  Expectations corrected after the first run, without changing the targeted behavior: the supervisor view
  carries `reason: null` (as in US1); a refused QR answers `422` (existing `QR_*` codes);
  `RELIEVE` leads to `CLOSED` when the category does not require final validation; two
  notifications from the same transaction have the same timestamp (order not significant).
- **Deviations from the contract**:
  - `ALREADY_ASSIGNED` returns `coverage: null`: the declarant is neither assigned nor in support of
    the request, so they have no access to its view; `assignedTo` gives the supervisor in charge.
  - Additions: `GET /coverage/teachers` (supervisor and admin, optional field FR-015a); alerts
    `DOUBLE_ASSIGNMENT` (overlapping assignments or support, FR-015j) and
    `POSSIBLE_DUPLICATE` (suggestion pending, FR-015h) in the lists.
  - Idempotent resend: by `Request.clientId` when an assignment is created; otherwise by a
    `declarationClientId` marker in the event that traces the declaration (`UPDATED` for an
    attachment, `SUPPORT_JOINED` for support). `ALREADY_ASSIGNED` modifies nothing and is
    not deduplicated (only effect: a notification to the admin).
  - Declarations serialized per class (advisory lock): two supervisors declaring the
    same class at the same time do not open two assignments.
- **Decision after the fact (FR-015h)**: if the absorbed assignment is already final, its status is
  not rewritten; only `mergedIntoId` is set (statistics exclude it, R6). A suggestion
  already decided answers `409 STATE_CHANGED`.
- **T066**: `SUPPORT_DECISION` / `SUPPORT_ESCALATION` processing already present since T032;
  verified end to end by T061 (3 reminders 10 min apart, then escalation to the super
  administrator).
- Result: lint and typechecks with no errors; unit 561 / 561; integration 412 / 412 (38 suites).

### Interface (T062, T067 to T069)

- **T062**: `empty-class.test.tsx` (10 cases) and `urgent-alert.test.tsx` (4 cases) written first.
  Red: page missing, sound and preference missing. Two cases of `urgent-alert` already passed
  (existing `alert` role and assertive announcement; no sound since there was none): they
  describe behavior already in place, kept. One case corrected afterwards: the menu hides
  the rest of the page from assistive technologies while it closes, so the test waits
  for it to be closed before sending the alert.
- **T068**: tested by `admin-duplicates.test.tsx` (5 cases, written before the code): tab
  "Doublons" (Duplicates) (confirm, keep distinct, "Non tranché" (Undecided)), badges "Surveillant sur deux
  affectations" (Supervisor on two assignments) and "Doublon possible" (Possible duplicate) in the queue, support to release and teacher
  correction in the detail. `admin-queue.test.tsx`: the "Doublons" tab is added after
  "En cours".
- **T067**: `EmptyClassPage.tsx` (`/gardes/classe-vide`); the QR page offers "Déclarer cette
  classe vide" (Declare this class empty) when the supervisor has no assignment for this class (class and QR
  carried over). "Mes affectations" (assignments, support, "Terminer" (Finish)) has existed since phase 2.
  Back link of the QR page fixed (`onglet=mes-affectations`).
- **T069**: `useUrgentSound.ts`: audio context created at the first interaction only;
  local preference (`localStorage`, reads and writes protected); checkbox "Signal
  sonore des urgences" (Audible signal for urgencies) in the notifications menu.

Result: lint and typechecks with no errors; frontend 216 / 216 (29 files).

## Phase 6 — US3, direct assignment by the admin (T070 to T074)

- **T070** (`supervision-direct.spec.ts`, 18 cases): written first. First run: 16 green,
  2 red. Direct creation (`ACCEPTED`, `ADMIN_DIRECT`, removed fields refused, `409
  NOT_AVAILABLE`) and reassignment (status unchanged if assigned; handover assigned to the new one
  if in progress, former one relieved at their attendance) had been rewritten in phase 2 (commit 12a14ee):
  **T072 and T073 required no new code**, they are verified by T070. The 2 red ones
  concerned the addition below, green afterwards. The suite sets the shift category to "QR only"
  proof; the photo remains covered by `coverage.spec.ts`.
- **Contract addition**: `GET /coverage/candidates?classId&startAt&endAt` (admins): supervisors
  that can be proposed for a slot, before any creation (scenario 2: a supervisor busy on an
  overlapping slot is not proposed). Same sort as `/:id/candidates`.
- **T071** (`direct-assignment.test.tsx`, 5 cases): red (page missing), then green.
- **T074**: `CreateCoveragePage.tsx` rewritten (`/gardes/nouvelle`, "Nouvelle affectation" (New assignment) button
  for admins): class, type, optional teacher, date (up to 7 days, server limit),
  start, end, supervisor among those available for the slot, reason, instruction. The times entered are those
  of the school (`schoolTime.ts`, time zone returned by the server). Voice message not carried over into this
  form (still accepted by the API). "Réassigner" (Reassign) dialog: on an assignment in progress,
  reminds that the current supervisor stays until the new one's attendance.

Result: lint and typechecks with no errors; unit 561 / 561; integration 430 / 430 (39 suites);
frontend 221 / 221 (30 files).

## Phase 7 — US5, history, statistics, anonymization (T075 to T080)

- **T075** (`coverage-stats.spec.ts`, 10 cases): red (module missing), then green with
  `domain/coverage-stats.ts`. Two rules not written in data-model §7, chosen and tested:
  a handover is counted with the original assignment (not a second delay); after
  anonymization, assignments go under "Enseignant anonymisé" (Anonymized teacher), distinct from "Enseignant non
  précisé" (Teacher not specified). Pending pair whose request is cancelled: the declaration remains the event.
- **T076** (`supervision-stats.spec.ts`, 7 cases): 4 red, 3 green before the code. Green: scenario
  1 (detailed history already served by `GET /coverage/:id`) and the two refusals, which
  were passing for a wrong reason (`/coverage/stats` fell on `/:id` → 404); they
  check the real route since T078. One expectation corrected (display name "Enseignante").
- **T077** (`supervision-anonymization.spec.ts`, 4 cases): red (job missing), then green. The technical
  account `enseignant-anonymise` (migration 0009) is recreated identically if missing (test
  database reset) rather than making the job fail. Expectation corrected: the audit log
  is not emptied between cases, the count is done before / after.
- **T078**: `GET /coverage/stats` (admins and super administrator; default period: current
  school month; 400 days at most; no export, unknown parameter refused).
- **T079**: `CoverageAnonymizationService` + `CoverageAnonymizationJob` (every hour,
  advisory lock, batches of 200, idempotent). For a teacher request, the author moves to the
  technical account and the instruction is erased; the `cancelReason` entered by the admin is kept.
- **Fix (US2)**: the keys `sourceRequestId`, `targetRequestId`, `afterTheFact` of the audit log
  of `COVERAGE_MERGE_DECIDED` were filtered out by the allow list; added, with
  `retentionMonths` and `cutoff` (anonymization).
- **T080**: `CoverageStatsPage.tsx` (`/gardes/statistiques`, "Statistiques" (Statistics) button for admins);
  detail history: sources, reassignments "de X à Y" (from X to Y), support, teacher
  correction, duplicate decisions, names resolved at read time (never stored, R5);
  `stats.test.tsx` (5 cases) red then green.
- **Full run**: a first run had 1 failure (`coverage.spec.ts`, "disponibilité" (availability) case,
  30 s timeout exceeded; the suite took 270 s). Re-run alone: 23 / 23 in 12 s; full
  re-run: 441 / 441 (41 suites) in 212 s. Same occasional instability of the embedded database as in
  phase 4; cause not established.

Result: lint and typechecks with no errors; unit 571 / 571; integration 441 / 441; frontend
226 / 226 (31 files).

## Phase 8 — Finishing touches (T081 to T086)

### T081 — Permissions matrix

- `supervision-permissions.spec.ts`: 26 routes × 5 roles + no session, 157 cases. First
  run: 10 failures, all real deviations from principle V (no expectation corrected):
  `GET /coverage/mine`, `GET /coverage/history` and `PATCH /coverage/availability` answered
  200 to any logged-in account (empty lists or availability editable by an employee outside the
  module); `POST /coverage/presence/resolve` gave the class name of a QR to an employee
  outside the module. Fixed: supervisor space reserved for the Supervisors group and the super
  administrator, QR page for module members; `404` refusals logged.
- Accepted exception: `GET /coverage/availability` stays open to any logged-in account; it
  only returns the caller's capabilities and availability (no one else's data).
- Module administration: `403` logged (SuperAdminGuard), deviation already documented in phase 2.
- Result: unit 571 / 571; integration 598 / 598 (42 suites).

### T083 — Documentation

`docs/ARCHITECTURE.md` (section 13 and tables updated) and `docs/coverage-migration.md`
(004 procedure: pre-check, validations V1 to V3, deployment, checks, rollback).

### T084 — Migration rehearsal

- **Database used**: disposable embedded PostgreSQL (port 55498, temporary folder), **not a
  copy of production**: none is available in this environment, and the shared development
  database (5433) was not used. Data: `0007` state built with the migration test
  set (shifts in every status) + 2,000 completed shifts, i.e. 2,011 shifts
  and 2,011 events.
- **Real tools**: `buildPreflightReport` (script `preflight:supervision`), `prisma migrate
  deploy` for `0008` then `0009`, `prisma db execute` for the `down.sql` files.
- **Results**:

| Step | Duration | Result |
|---|---|---|
| Pre-check | 36 ms | read-only (no event added); 2 members listed (V1); 0 shifts without an equivalent (V2); 0 anonymizations on first run (V3) |
| `0008_supervision_schema` | 1.6 s | applied |
| `0009_supervision_data` | 1.6 s | `BROADCAST` 1 → `PENDING`; non-completed `UNFILLED` 1 → `PENDING`; other statuses unchanged; `MANAGER` → `ADMIN`; groups `SUPERVISORS` and `TEACHERS`; account `enseignant-anonymise` inactive |
| Checks | — | 2,011 events kept (all identifiers present) + 2 added (`migration-0009`); audit log unchanged (1 row) |
| `0009/down.sql` then `0008/down.sql` | 1.5 s each | initial statuses restored identically, `MANAGER` role restored, new tables dropped; append-only history: 2 events added by the rollback, none deleted |

- **Remaining before going to production**: the same rehearsal on a copy of the
  production database in pre-production (quickstart, "Migration"), with validations V1 to V3 signed.
  Rehearsal script not versioned (one-off tool); the procedure is that of
  `docs/coverage-migration.md`.

### T082 — End-to-end flows

- `e2e/coverage-class.spec.ts` rewritten: three flows, each at 360, 768 and 1280 px
  (Chromium): A. teacher request → assignment → on the way → QR + photo attendance →
  completed; B. empty class → second declaration as support → support released by the admin →
  completed; C. direct assignment → reassignment → cancellation. Horizontal scrolling and axe
  checked on every screen visited. Same-day slots: flows skipped after 22:00 (school
  time).
- **First run**: 3 failures. Single cause: at 360 px, flow B failed on the message
  "Remplaçante est libéré(e)" (Substitute is released); the assignment left open made the
  following flows fail (supervisor busy, declaration attached). Fixes:
  - **real interface defect**: releasing the last support worked (history
    "Renfort libéré" (Support released)) but without confirmation. The support list was only mounted if some remained;
    TanStack Query does not run the callbacks of a `mutate` whose component has disappeared.
    The list stays mounted (empty rendering). **Same defect** found on review on the withdrawal of a
    request by the teacher (the page becomes read-only, "Demande retirée." (Request withdrawn.) lost): actions
    moved out of the form. Two non-regression tests (`admin-duplicates.test.tsx`,
    `teacher-request.test.tsx`) **red without the fix, green with it**; the fake
    servers had to re-read the up-to-date state with a network delay, like the real one, to reproduce the defect;
  - **independence of flows**: each begins by cancelling, through the API and with the
    admin's session, any assignments still open.
- Orphaned e2e servers after stopping the first run (API and Vite of this worktree): stopped
  after checking their command line; e2e database already stopped.
- **Second run**: 9 / 9 (3.7 min).
- `e2e/a11y-responsive.spec.ts`: assignment screens at 320 px (teacher, supervisor,
  admin and its five tabs, new assignment, statistics, floors): 3 / 3 (`mobile-320`
  profile).

Result: lint and typechecks with no errors; frontend 226 / 226 (31 files).

### T085 — Manual scenarios (quickstart)

Run on 20/10/2026 between 21:05 and 22:10 (school time), in a real browser
(Chromium driven step by step, screenshots reviewed), on the e2e servers (disposable database,
scheduled tasks active every 15 s). Additional read-only checks on
the disposable database (due dates, notifications, audit log).

| # | Result | Observations |
|---|---|---|
| 1 | Compliant | "en attente" (pending); admin notified; morning reminder scheduled at 07:00 |
| 2 | Compliant | candidates from the 1st floor first, unavailable one greyed out and labeled; supervisor and teacher notified; reason absent for the supervisor |
| 3 | Compliant | URGENT alert to the admin at +2 min, request at the top with red border; escalation to the super administrator at +7 min |
| 4 | Compliant after fix | first run: false "double assignment" (see defect 1); re-checked on the fixed code: no warning, a single URGENT notification `COVERAGE_EMPTY_CLASS` |
| 5 | Compliant | support; 3 reminders to the admin then escalation to the super administrator. Machine sleep from 21:28 to 22:05 (Windows log): late reminders caught up on resume, in a burst (about 30 s) |
| 6 | Compliant | busy supervisors greyed out with their reason; through the API: `409 NOT_AVAILABLE`; with an available one: "assignée" (assigned) |
| 7 | Compliant | handover assigned; the former one stays in the class; at the new one's attendance (QR + photo), the original is closed and the support released automatically |
| 8 | Compliant | "non pourvue" (unfilled) at the end of the slot, URGENT banner live at the admin; teacher notified; counted separately in the statistics |
| 9 | Compliant | `reprographie`: no "Gardes" menu, empty page; `surveillant`: `ASSIGN` and admin list → `404`, refusals logged (`NOT_VISIBLE`, `NOT_COVERAGE_ADMIN`) |
| 10 | Compliant | "Admin" for the admin; "Administrateur" menu and page; categories and workflow B unchanged |
| 11 | Compliant | exact figures with respect to the data: 2 events, 50% unfilled, average duration 7 min, "Enseignant non précisé" separately |

**Defects fixed** (commit `24f0c1e`, non-regression tests red without the fix):

1. Unknown end of a slot treated as "no end": a declared empty class overlapped
   any future assignment (false URGENT double assignments, supervisor unavailable for
   the following days, including in the "Équipe" tab). Unknown end = end of the school
   day (FR-016a); "available now" checked at the present moment.
2. Start of assignments without the day ("À 07:00" for tomorrow) and "Maintenant" (Now) for any past
   start.

**Point to decide (not fixed)**: the forms enter and display school time,
the lists display the machine's time. On a machine set to another time zone (the test browser
was in `Etc/GMT-1`), the same request reads 08:00 in the form and 07:00 in the
list. No effect when machines are in the school's time zone.

**Observations not fixed** (existing behaviors or labels):
- `NOT_AVAILABLE` message in the old vocabulary ("employé", "garde"); title "Garde — …";
  tile "Retards et absences" (Delays and absences) that also counts empty classes;
- "Prolonger" (Extend) offered on a pending request and on an assignment without an end (then sets
  an end); a support can be chosen for a reassignment of the same assignment;
- direct assignment does not flag a pending request for the same class and the same
  slot (the duplicate check only targets declarations, as the spec provides);
- after a server interruption, late reminders go out one after the other;
- outside 004: each logout adds two `UNAUTHENTICATED` entries to the audit log (re-read
  by the page after the end of the session);
- the sound of the urgent alert was not listened to (browser without audio output); covered by
  `urgent-alert.test.tsx`.

Cleanup: servers stopped (orphan processes checked by their command line then
stopped), temporary read scripts and browser artifacts folder deleted.

### T086 — Full verification

- `npm run verify` (lint, all tests, `npm audit --audit-level=high`): **passed**.
  Unit 572 / 572 (29 suites); integration 599 / 599 (42 suites); frontend 229 / 229
  (32 files). `npm audit`: no high or critical vulnerabilities; 21 moderate, all in
  dependencies already present on `master` (no dependency added, see below).
- Typechecks: backend and frontend with no errors.
- **R15, dependencies**: `package-lock.json` identical to `master`; only addition in
  `backend/package.json`: the `preflight:supervision` script.
- **Full Playwright** (6 projects: chromium, firefox, webkit, iPhone 13, Pixel 7,
  mobile-320; 40 min): 141 passed, 73 skipped by design (flows reserved for Chromium,
  checks reserved for the 320 px profile), **2 failures**:
  1. `auth.spec.ts`, first test of the Firefox project: `NS_ERROR_CONNECTION_REFUSED` on the
     development server. Re-run alone: 4 / 4. One-off incident at Firefox startup,
     all other Firefox tests passed.
  2. `a11y-responsive.spec.ts`, 004 screens at 320 px: **real defect**. The statistics
     table overflows the screen and its scroll area was not reachable by keyboard
     (axe `scrollable-region-focusable`, serious). Not seen in the previous run: on a database
     with no assignment for the month, the page shows the empty state and not the table. Fix: named
     (`role="region"`, table title) and focusable area. The e2e test now creates a
     cancelled request before the screens, so that the table is always present. Demonstrated:
     **without the fix, the test fails on this rule; with it, 3 / 3**. Assertion added in
     `stats.test.tsx` (red then green).

Final result: lint and typechecks with no errors; unit 572 / 572; integration 599 / 599;
frontend 229 / 229; full e2e green after the fix (the two failures explained and re-run).

### CI of PR #18 — time-dependent tests

First CI run (21:09 UTC, i.e. 23:09 school time): 6 failures in 3 integration
suites, green locally earlier in the day. Cause: "same-day" slots created
from now (up to +90 min) went past midnight (request refused `INVALID_RANGE`), and
an availability test still assumed the "no end" end replaced in T085. No defect in the
application code.

Fix: `test/utils/school-timezone.ts` places the school, for these suites, in a fixed-offset
time zone where it is noon at execution time (restored after the suite). Availability
test rewritten according to the current rule (busy until the end of the school day,
available the next day). Reproduced locally at 22:30 school time: **6 failures before,
51 / 51 after**; full integration suite: 599 / 599.
