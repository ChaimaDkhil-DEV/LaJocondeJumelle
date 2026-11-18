# Tasks: Teacher timetables linked to the QR attendance (020)

**Input**: `specs/020-emplois-du-temps/` — [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: required (constitution I, and the user asked for unit, integration and E2E tests).

**Rules for every task**

- Tests first: each implementation task follows a test task whose test has been run and seen failing for the
  expected reason.
- Stay on branch `020-emplois-du-temps`. No commit, push or merge without the user's authorisation.
- Never edit an applied migration; `migrate dev` on the local database only (CLAUDE.md). Write each
  `migration.sql` in one go (the hook applies it on save).
- No existing test is deleted or weakened. An existing test is edited only to extend a list it guards (noted on
  the task).
- No new scan logic: `arrive`, `depart`, `return` keep their behaviour; only the `resolve`/`arrive` response gains
  the `session` field (FR-019).
- `[P]` = can run in parallel (different files, no dependency on an unfinished task).

## Phase 1: Setup

- [X] T001 Record the baseline: `npm run lint`, `npm run -w backend build`, `npm run -w frontend build`,
  `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`,
  `npm audit --audit-level=high`; note counts and pre-existing failures (expected: audit red on `picomatch`,
  memory note) to compare at the end of each phase
- [X] T002 Check `npm exec -w backend -- prisma migrate status` reports "Database schema is up to date!" on
  `localhost:5433`; stop and report any drift

## Phase 2: Foundational (blocks every story)

- [X] T003 Write the failing migration test `backend/test/integration/migration-0031.spec.ts` (model:
  `migration-0029.spec.ts`): tables `TimetableSeries` and `TeachingSession` exist; DELETE and TRUNCATE refused on
  both; `TeachingSession_range` refuses `endAt <= startAt`; `TeachingSession_cancel_reason` refuses `CANCELLED`
  with null `cancelReason`; `TeachingSession_teacher_no_overlap` refuses two `SCHEDULED` rows of the same teacher
  overlapping (SQLSTATE `23P01`), accepts touching rows (08:00–09:00 / 09:00–10:00) and accepts an overlap when one
  row is `CANCELLED`; same three cases for `TeachingSession_class_no_overlap`; `AuditAction` contains
  `TIMETABLE_CHANGED`
- [X] T004 Edit `backend/prisma/schema.prisma`: enum `TeachingSessionStatus { SCHEDULED CANCELLED }`; `AuditAction`
  + `TIMETABLE_CHANGED`; model `TimetableSeries` (`weekday` Int 1–7 ISO, `startTime`/`endTime` VarChar(5) `HH:MM`,
  `subject` VarChar(100)?, `room` VarChar(80)?, `startDate`/`endDate` `@db.Date`, `createdById`, timestamps;
  indexes `(teacherId)`, `(classId)`); model `TeachingSession` (`seriesId`?, `teacherId`, `classId`, `localDate`
  `@db.Date`, `startAt`/`endAt` Timestamptz(3), `subject` VarChar(100)?, `room` VarChar(80)?, `status` default
  `SCHEDULED`, `detached` Boolean default false, `cancelReason` VarChar(500)?, `cancelledAt`?, `cancelledById`?,
  `createdById`, timestamps; indexes `(localDate)`, `(teacherId, localDate)`, `(classId, localDate)`,
  `(seriesId)`); back-relations on `User` and `SchoolClass`; model comments naming the SQL-only constraints (as
  for `TeacherDeparture_one_open`)
- [X] T005 Run `npm exec -w backend -- prisma migrate dev --name timetable --create-only`, then complete
  `backend/prisma/migrations/0031_timetable/migration.sql` in one write with: `CREATE EXTENSION IF NOT EXISTS
  btree_gist`, the two `EXCLUDE USING gist (... tstzrange("startAt","endAt",'[)') WITH &&) WHERE ("status" =
  'SCHEDULED')` constraints, the two CHECK constraints, no-delete/no-truncate triggers reusing `forbid_deletion()`
  (data-model.md); apply with `migrate dev`; T003 green
- [X] T006 Research R3 check: `npm exec -w backend -- prisma migrate status` → up to date, and
  `npm exec -w backend -- prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel
  prisma/schema.prisma --shadow-database-url <local shadow>` → empty. If Prisma reports drift on the exclusion
  constraints, stop and report to the user with the fallback of R3 (advisory locks) before going further
- [X] T007 Write `backend/prisma/migrations/0031_timetable/down.sql` (model: `0015_audit_level_changed/down.sql`):
  refuses if `TIMETABLE_CHANGED` appears in `AuditLog`; drops both tables and `TeachingSessionStatus`; recreates
  `AuditAction` without the value; removes the `_prisma_migrations` row; leaves `btree_gist`; states order and
  API restart in its header. Test it by hand on a throw-away copy of the local database, never on the dev data
- [X] T008 [P] Write failing tests in `backend/test/integration/attendance-settings.spec.ts` (model:
  `push-window-settings.spec.ts`): defaults 5 and 10 returned by `GET /admin/settings`;
  `PUT` accepts 0–60 and refuses -1 and 61; refuses `attendanceLateThresholdMinutes` > current
  `attendanceToleranceMinutes` and `attendanceToleranceMinutes` < current threshold (`VALIDATION_ERROR` on the
  saved key); admin (non super admin) refused as for other settings
- [X] T009 Add `attendanceLateThresholdMinutes: 5` and `attendanceToleranceMinutes: 10` to `SETTING_DEFAULTS`
  and `{ kind: 'int', min: 0, max: 60, label: 'entre 0 et 60 minutes' }` to `SETTING_RULES` in
  `backend/src/settings/settings.service.ts`; cross-field rule in `backend/src/settings/admin-settings.service.ts`;
  T008 green
- [X] T010 [P] Add `TIMETABLE_CONFLICT` (409, `details.conflicts`) and `SESSION_LOCKED` (409) with French messages
  to `backend/src/common/errors.ts`
- [X] T011 Export `AttendanceGate` from `backend/src/attendance/attendance.module.ts`; create the empty
  `backend/src/timetable/timetable.module.ts` (imports `AttendanceModule`, `AuditModule`, `RealtimeModule`) and
  register it in `backend/src/app.module.ts`; `npm run -w backend build` green

**Checkpoint**: schema, settings and module skeleton in place; all pre-existing suites still green.

## Phase 3: User Story 1 — The administration builds the weekly timetable (P1) 🎯 MVP

**Goal**: series and single sessions created by ADMIN/SUPER_ADMIN, conflicts refused and listed.

**Independent Test**: create a series and check its dated sessions; overlapping series for the same teacher, then
the same class, refused with every conflict listed.

### Tests for User Story 1

- [X] T012 [P] [US1] Write failing unit tests `backend/test/unit/timetable-series.spec.ts` for
  `backend/src/timetable/domain/series.ts`: dates of a weekday between two dates (ISO weekday 1–7, period inclusive,
  only dates ≥ today, R10); local `HH:MM` → instants in the default `SCHOOL_TIMEZONE` (`Europe/Paris`), including
  the DST change days (last Sunday of March/October); validation: `endTime > startTime`, duration 5 min – 12 h, same local day,
  `endDate ≥ startDate`, `endDate ≤ startDate + 366 days`, at least one date produced
- [X] T013 [P] [US1] Write failing unit tests `backend/test/unit/timetable-conflicts.spec.ts` for
  `backend/src/timetable/domain/conflicts.ts`: overlap with `[)` ranges (touching = no conflict), TEACHER and CLASS
  kinds, cancelled ignored, the edited session not compared with itself, output ordered by date (no comparison
  inside one batch: a request carries one session, or one session per week of a series, which never collide)
- [X] T014 [P] [US1] Write failing integration tests `backend/test/integration/timetable.spec.ts` (US1 part):
  `POST /timetable/series` creates N sessions with teacher, class, level of the class, subject, room; refuses an
  inactive teacher, a non-Teachers-group user, an inactive class (`VALIDATION_ERROR` on the field); 409
  `TIMETABLE_CONFLICT` lists every conflicting date for teacher and for class, and creates nothing (count unchanged);
  two concurrent `POST /timetable/sessions` overlapping → one 201, one 409 (exclusion `23P01` mapped); touching
  sessions accepted; `GET /timetable/sessions` bounded to 31 days (400 beyond); unknown query key → 400;
  EMPLOYEE, PARENT, teacher and supervisor → 404 and one `ACCESS_DENIED` audit entry each; each write → one
  `TIMETABLE_CHANGED` entry (`SERIES_CREATED` with `sessionCount`, `SESSION_CREATED` with `after`); `timetable:updated`
  emitted to admins and the teacher (spy on `RealtimeService.emitToUsers`, as `teacher-presence.spec.ts`)

### Implementation for User Story 1

- [X] T015 [P] [US1] Implement `backend/src/timetable/domain/series.ts` (pure, uses `common/school-time.ts`); T012 green
- [X] T016 [P] [US1] Implement `backend/src/timetable/domain/conflicts.ts` (pure); T013 green
- [X] T017 [US1] Write `backend/src/timetable/timetable.dto.ts`: `CreateSessionDto` (`teacherId` UUID, `classId`
  UUID, `date` `YYYY-MM-DD`, `startTime`/`endTime` `HH:MM`, `subject` ≤ 100 trimmed empty→null, `room` ≤ 80
  trimmed empty→null), `CreateSeriesDto` (+ `weekday` 1–7, `startDate`, `endDate`), `SessionsQuery` (`from`, `to`,
  `teacherId?`, `classId?`, `includeCancelled?`)
- [X] T018 [US1] Write `backend/src/timetable/timetable.mapper.ts` (`SessionView` of contracts/api.md: level from the
  class, room = own room else class room, `weekday`)
- [X] T019 [US1] Implement `TimetableService.createSession`, `createSeries`, `listSessions`, `listSeries` in
  `backend/src/timetable/timetable.service.ts`: `gate.assertManager`; teacher active + Teachers group
  (`groupFlagsOf`), class active; pre-check conflicts with one query over the batch ranges; single transaction;
  map `23P01` to `TIMETABLE_CONFLICT` after re-running the check; audit `TIMETABLE_CHANGED`; `timetable:updated`
  `{ dates }` after commit
- [X] T020 [US1] Add routes `GET/POST /timetable/sessions`, `GET/POST /timetable/series` in
  `backend/src/timetable/timetable.controller.ts`; T014 green
- [X] T021 [P] [US1] Write failing frontend tests `frontend/tests/timetable/admin-timetable.test.tsx`: page lists a
  teacher's (or a class's) week grouped by day; series form with labelled fields and validation messages; a 409
  shows `ConflictList` naming date, time, teacher or class and how to fix it; focus moves to the error summary;
  week navigation; non-admin route reserved like the other admin pages
- [X] T022 [P] [US1] Write `frontend/src/features/timetable/{api.ts,types.ts,labels.ts}` (TanStack Query keys
  `['timetable', ...]`) and French strings in `frontend/src/i18n/en/timetable.ts`
- [X] T023 [US1] Implement `frontend/src/features/timetable/{SessionList.tsx,ConflictList.tsx,TimetableFormDialog.tsx (series + session, create and edit),
  TimetableAdminPage.tsx}` (lists, not an absolute grid; teacher/class selector; week
  navigation); route `emplois-du-temps` in `frontend/src/features/admin/adminRoutes.tsx` and the entry in
  `AdminLayout.tsx` for ADMIN and SUPER_ADMIN; T021 green

**Checkpoint**: US1 works alone (manual steps 1–2 of quickstart.md).

## Phase 4: User Story 2 — Exceptional changes (P1)

**Goal**: change one session, a series from a date, change teacher, cancel (one or a range) with reason; started
sessions locked.

**Independent Test**: modify one session of a series, then the series from a later date; the modified session keeps
its change; a cancelled session is never "Non arrivé" (checked once US3 exists).

### Tests for User Story 2

- [X] T024 [P] [US2] Extend `backend/test/integration/timetable.spec.ts` (US2 part), failing first:
  `PATCH /timetable/sessions/:id` on a future session changes it, sets `detached` when in a series, checks
  conflicts (incl. new teacher); on a started session (`startAt ≤ now`) teacher/class/date/times → 409
  `SESSION_LOCKED`; on a `CANCELLED` session → 409; `POST .../cancel` without reason → 400, with reason →
  `CANCELLED`, `cancelledAt/ById` set, allowed up to 7 days back, refused beyond; `PATCH /timetable/series/:id`
  `{ from, startTime, endTime }` updates scheduled, not detached, not started sessions with `date ≥ from` only,
  conflicts all-or-nothing; weekday not accepted (400); `endDate` extended → missing sessions created; shortened →
  sessions beyond cancelled with reason « Fin de série avancée »; `POST /timetable/series/:id/cancel { from, to,
  reason }` cancels the range; every action audited with `before`/`after`/`reason`; ids not UUID → 404
- [X] T025 [P] [US2] Extend `frontend/tests/timetable/admin-timetable.test.tsx`: edit one session, "this session /
  the series from this date" choice, cancel dialog requires a reason (error text), cancelled sessions shown with
  « Séance annulée » and the reason, started sessions show no edit action

### Implementation for User Story 2

- [X] T026 [US2] Add `UpdateSessionDto`, `CancelDto` (`reason` 1–500), `UpdateSeriesDto` (`from` + optional
  fields, no `weekday`), `CancelSeriesDto` (`from`, `to`, `reason`) to `backend/src/timetable/timetable.dto.ts`
- [X] T027 [US2] Implement `updateSession`, `cancelSession`, `updateSeries`, `cancelSeriesRange` in
  `backend/src/timetable/timetable.service.ts` (R2 rules, lock rules of data-model.md, conflict pre-check +
  `23P01` mapping, audit, realtime) and the routes in `timetable.controller.ts`; T024 green
- [X] T028 [US2] Implement edit/cancel actions and `CancelDialog.tsx` in `frontend/src/features/timetable/`; T025 green

**Checkpoint**: US1 + US2 cover the whole timetable management.

## Phase 5: User Story 3 — Expected teachers and statuses (P1)

**Goal**: `GET /attendance/expected` and the « Attendus » tab with the seven statuses computed from existing facts.

**Independent Test**: session at 08:00, tolerance 10, no scan → « Attendu » at 08:09, « Non arrivé » at 08:10; scan
at 08:12 → « En retard » (12 min).

### Tests for User Story 3

- [X] T029 [P] [US3] Write failing unit tests `backend/test/unit/session-status.spec.ts` for
  `backend/src/attendance/domain/session-status.ts`, one `it` per rule of research R5 and per acceptance scenario
  1–7 of US3: cancelled; announced absence overlapping → EXCUSED; manual `ABSENT` that day (any class) → EXCUSED;
  human `ON_TIME`/`LATE` in the session's class wins; present at start → PRESENT; arrival at S+G → PRESENT, S+G+1 →
  LATE with minutes; empty class declared in [S,E) before arrival → LATE `EMPTY_CLASS`, then arrival keeps LATE with
  its time; empty class while already present in school and no arrival in that class → LATE, never NOT_ARRIVED;
  announced lateness → LATE `ANNOUNCED` until E, then NOT_ARRIVED if never arrived; now < S → UPCOMING; S ≤ now <
  S+T → EXPECTED (incl. S+T−1 ms); now = S+T → NOT_ARRIVED; departure before S without return → NOT_ARRIVED after T;
  return at S+20 → LATE 20; manual arrival without time uses `recordedAt`; past day never UPCOMING/EXPECTED; G = 0 and
  T = 0 edge values
- [X] T030 [P] [US3] Write failing integration tests `backend/test/integration/expected-teachers.spec.ts`: real rows
  (sessions, `TeacherAttendance` by QR via `/attendance/arrive`, manual via `/attendance/manual`, departures via
  `/attendance/depart`, announced lateness/absence via the existing coverage creation, substitute via
  `PATCH /attendance/substitutes/:id`, empty class via the existing declaration route) → expected statuses; substitute
  → two lines (TITULAR EXCUSED « remplacé par », SUBSTITUTE evaluated); several sessions in a day; settings changes
  applied; `serverNow` present; teacher/employee/supervisor → 404 + `ACCESS_DENIED`; no `TeacherAttendance` row is
  ever created by reading the list (count unchanged)
- [X] T031 [P] [US3] Write failing frontend tests `frontend/tests/attendance/expected.test.tsx`: table columns
  (teacher, class and level, date, times, status text, arrival time, minutes late, replacement, cancel reason);
  statuses as text + icon with accessible names; refetch on `attendance:updated` and `timetable:updated` and every
  60 s (fake timers); empty, loading and error states; extend `frontend/tests/coverage/surveillance-tabs.test.ts`
  only to add `attendus` to the guarded key list

### Implementation for User Story 3

- [X] T032 [US3] Implement `backend/src/attendance/domain/session-status.ts` (pure, `now` and settings as
  parameters, types of data-model.md); T029 green
- [X] T033 [US3] Implement `backend/src/attendance/expected-teachers.service.ts` (five queries on the day: sessions,
  arrivals, all departures, announced requests `TEACHER_REQUEST` not cancelled not merged, `EMPTY_CLASS`
  declarations; settings via `SettingsService`; lines per R6) and `GET /attendance/expected` with `ExpectedQuery`
  (`date?`, `teacherId?` UUID, `classId?` UUID, `status?` enum of 7) in `attendance.controller.ts` /
  `attendance.dto.ts`; provide it in `attendance.module.ts`; T030 green
- [X] T034 [US3] Emit `timetable:updated` handling in `frontend/src/features/notifications/SocketProvider.tsx`
  (invalidate `['timetable']` and `['attendance','expected']`); add `expected` query to
  `frontend/src/features/attendance/{api.ts,types.ts}`
- [X] T035 [US3] Implement `frontend/src/features/attendance/ExpectedTeachersTab.tsx` (table + status labels in
  `labels.ts`, 60 s refetch) and the `attendus` tab in `frontend/src/features/coverage/surveillanceTabs.ts` and
  `CoveragePage.tsx`; strings in `frontend/src/i18n/en/attendance.ts`; T031 green

**Checkpoint**: MVP complete (US1 + US2 + US3): undeclared absences are visible.

## Phase 6: User Story 4 — Teacher's own timetable (P2)

**Goal**: `/emploi-du-temps` day and week views, own sessions only; current/next session on the QR page.

**Independent Test**: teacher sees own day and week; no way to show another teacher's timetable.

### Tests for User Story 4

- [X] T036 [P] [US4] Extend `backend/test/integration/timetable.spec.ts` (US4 part), failing first:
  `GET /timetable/mine?from&to` returns only own sessions + sessions as named substitute (`replaces`), own sessions
  under an announced absence flagged `announcedAbsence`, cancelled ones without `cancelReason`; range > 14 days →
  400; `teacherId` query → 400; non-teacher → 404 + `ACCESS_DENIED`
- [X] T037 [P] [US4] Extend `backend/test/integration/attendance.spec.ts` only by adding cases: `resolve` and `arrive`
  return `session.current` / `session.next` for the scanning teacher today (null without sessions); existing
  assertions untouched
- [X] T038 [P] [US4] Write failing frontend tests `frontend/tests/timetable/my-timetable.test.tsx`: day and week
  views (date, weekday, times, class, level, subject, room), previous/next navigation, empty day message, cancelled
  label without reason, « Remplacement de … »; link from `TeacherHomePage`; and in
  `frontend/tests/attendance/presence.test.tsx` add a case for the session line on the QR page

### Implementation for User Story 4

- [X] T039 [US4] Implement `TimetableService.mine` + `OwnSessionView` mapping and `GET /timetable/mine`
  (`assertTeacher`, `MineQuery` `from`, `to`) in `backend/src/timetable/`; T036 green
- [X] T040 [US4] Add `session: { current, next }` to `resolve` and `arrive` in
  `backend/src/attendance/attendance.service.ts` (read-only query on today's sessions of the user); T037 green
- [X] T041 [US4] Implement `frontend/src/features/timetable/MyTimetablePage.tsx` (reuses `SessionList.tsx`), route
  `/emploi-du-temps` in `frontend/src/app/routes.tsx`, link in `frontend/src/features/home/TeacherHomePage.tsx`,
  session line in `frontend/src/features/attendance/ArrivalPage.tsx`; T038 green

## Phase 7: User Story 5 — Indicators and filters (P2)

**Goal**: four indicators and filters by date, teacher, class, status kept in the URL.

**Independent Test**: known data → each indicator value; each filter alone and combined.

### Tests for User Story 5

- [X] T042 [P] [US5] Extend `backend/test/integration/expected-teachers.spec.ts`: `counts` (expected = not cancelled
  and not EXCUSED; present; late; notArrived) honour `date`, `teacherId`, `classId` but never `status`; `status`
  filters `lines` only; past date has no UPCOMING/EXPECTED
- [X] T043 [P] [US5] Extend `frontend/tests/attendance/expected.test.tsx`: KPI row (labelled values), filters as
  labelled controls synced with the URL (`?onglet=attendus&date=&enseignant=&classe=&statut=`), reload keeps them,
  reset filter

### Implementation for User Story 5

- [X] T044 [US5] Compute `counts` in `backend/src/attendance/expected-teachers.service.ts`; T042 green
- [X] T045 [US5] Add KPI row (reuse `frontend/src/features/admin/KpiCard.tsx`) and URL filters to
  `ExpectedTeachersTab.tsx`; T043 green

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T046 [P] Settings page: two fields in `frontend/src/features/admin/SettingsAdminPage.tsx` and
  `frontend/src/features/admin/api.ts`, test in `frontend/tests/admin/attendance-settings.test.tsx` (model:
  `transfer-setting.test.tsx`), threshold > tolerance error shown
- [X] T047 Write `e2e/timetable.spec.ts` following quickstart.md steps 1–9 (sessions relative to real time, R11;
  teacher, supervisor and admin contexts as `attendance-qr.spec.ts`), with the overflow + axe check on each new
  screen inside the spec itself (teacher at 320 px; `e2e/a11y-responsive.spec.ts` left unchanged); run with `npm run test:e2e -- timetable
  a11y-responsive` (memory: no `--list`, kill the orphan postgres on 55434 afterwards)
- [X] T048 [P] Demo data, **for part of the teachers only** (user's request, 2026-11-18): `backend/prisma/demo/timetable.ts`
  (10 class teachers in their class Mon–Fri 08:00–10:00 and 10:15–12:00, the English teacher Mon–Thu 14:00–15:00 in
  four of those classes; from today to 2027-06-30; stable ids, insert-if-absent), called by `runDemoSeed` and by the new
  `db:seed:demo -- --timetable` option; purge `--reset` clears both tables; pure checks in
  `backend/test/unit/demo-seed.spec.ts` (only part of the teachers, no overlap); extend
  `backend/test/integration/seed-demo.spec.ts` (sessions in base for those teachers only, re-run adds nothing)
- [X] T049 [P] Document in `docs/ARCHITECTURE.md` a section 17 "Teacher timetables (feature 020)": tables,
  SQL-only constraints, status rules (R5), routes, realtime event; and update the "There is still no timetable"
  sentences of sections on 019 and lot 3, and the comments of `attendance-matching.ts`, `presence.ts` and the
  `AttendanceStatus` enum that say no timetable exists (no behaviour change)
- [X] T050 Run full local CI and compare with T001: `npm run lint`, both builds (types), `npm run -w backend test`,
  `npm run -w backend test:integration`, `npm run -w frontend test`, `npm audit --audit-level=high`, E2E of T047;
  `prisma migrate status` up to date; report results to the user before any commit

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. T006 is a stop point (R3).
- US1 (Phase 3) first: every other story needs sessions.
- US2 depends on US1 (same service and page).
- US3 depends on Phase 2 and on sessions existing (tests create them through US1's routes); can start right after
  T020, in parallel with US2.
- US4 depends on US1 only; can run in parallel with US2/US3.
- US5 depends on US3.
- Polish after the stories it touches (T046 after T009; T047 after all stories).

### Within each story

Tests (seen failing) → DTOs/pure domain → service → controller → frontend.

### Parallel opportunities

- Phase 2: T008 and T010 alongside T003–T007.
- US1: T012, T013, T014 together; then T015 and T016 together; T021 and T022 alongside the backend.
- US3: T029, T030, T031 together.
- US4: T036, T037, T038 together.
- Polish: T046, T048, T049 together.

## Parallel Example: User Story 3

```text
T029 unit tests session-status.spec.ts
T030 integration tests expected-teachers.spec.ts
T031 frontend tests expected.test.tsx
→ then T032 (domain) → T033 (service + route) → T034/T035 (frontend)
```

## Implementation Strategy

1. **MVP = US1 + US2 + US3** (all P1): the administration enters the timetable and sees who has not arrived. Stop and
   validate with quickstart steps 1–7.
2. Then US4 (teacher view, QR page line), then US5 (indicators, filters).
3. Polish: settings UI, E2E + axe, demo data, docs, full CI. No commit before the user's go-ahead.
