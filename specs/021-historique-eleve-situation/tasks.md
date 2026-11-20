---

description: "Task list for student class history and situation at a given moment"
---

# Tasks: Student class history and situation at a given moment

**Input**: Design documents from `/specs/021-historique-eleve-situation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/student-situation.md, quickstart.md

**Tests**: Required. Constitution principle I (test first, non-negotiable): in every phase the test tasks come first and MUST be seen failing before the code that satisfies them.

**Organization**: grouped by user story. US1 and US2 are both P1; US2 needs the class history of US1, so US1 comes first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an unfinished task
- **[Story]**: US1 to US4, as in spec.md
- Paths are from the repository root. Backend `backend/`, frontend `frontend/`, end-to-end `e2e/`.

## Project rules that apply to every task

- Migration (CLAUDE.md): created on the local development database only; `migration.sql` written once, complete (the project hook applies it on write); never edit an applied migration; if `migrate dev` offers a reset, refuse and report; check with `migrate status`.
- Before any commit or PR: `npm run lint` and the dependency audit locally. After a test run, rerun only the failing tests unless code changed.
- Comments and messages in French, matching the code base.

---

## Phase 1: Setup

**Purpose**: settle the two open points of the plan and prepare shared test fixtures.

- [X] T001 Read `backend/src/coverage/coverage-actions.service.ts` (events `ASSIGNED`, `REASSIGNED`, `RELEASED`, `PRESENCE_CONFIRMED`), `backend/src/attendance/domain/session-status.ts` and `backend/src/attendance/expected-teachers.service.ts`; write the confirmed `fromValue`/`toValue` shapes and whether the announcement-matching predicate can be imported unchanged into `specs/021-historique-eleve-situation/research.md` (close R9 and R11, one short paragraph each).
- [X] T002 [P] Add fixture helpers in `backend/test/utils/situation-fixtures.ts` to create, with fixed timestamps: a class with a level and floor, a pupil in it, a teaching session, a teacher attendance, an announced absence with a substitute (and a `SUBSTITUTE_SET` event), a coverage with assignee, presence and reinforcement. Reuse the existing helpers in `backend/test/utils/` first.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the table, its protections and the shared write helper.

**⚠️ CRITICAL**: no story starts before this phase is complete.

- [X] T003 Write `backend/test/integration/migration-0032.spec.ts` first (follow `migration-0014.spec.ts`): after the migration every existing pupil has exactly one `StudentClassHistory` row with `reconstructed = true`, `startedAt` equal to `Student.createdAt`, `changedById` null, `classId` equal to `Student.classId`; `UPDATE`, `DELETE` and `TRUNCATE` on the table raise the append-only error; the index on `AuditLog(targetType, targetId, createdAt)` exists; the audit value `STUDENT_SITUATION_VIEWED` exists. Run it and see it fail.
- [X] T004 Add to `backend/prisma/schema.prisma`: model `StudentClassHistory` with `id` uuid primary key; `seq` BigInt autoincrement; `studentId` uuid required; `classId` uuid required; `startedAt` timestamptz(3) required; `changedById` uuid optional; `reconstructed` boolean default false; `createdAt` timestamptz(3) default now; relations to `Student`, `SchoolClass`, `User` (restrict); indexes `(studentId, startedAt, seq)` and `(classId)`; the back-relations on those models; enum value `STUDENT_SITUATION_VIEWED` in `AuditAction`; `@@index([targetType, targetId, createdAt])` on `AuditLog`. Comment the model in French like its neighbours (end of a period = start of the next row; no update).
- [X] T005 Create the migration `backend/prisma/migrations/0032_student_class_history/migration.sql` in one go, complete (per data-model.md outline: enum value, table, indexes, triggers `StudentClassHistory_append_only` and `StudentClassHistory_no_truncate` using `forbid_modification()`, audit index, backfill `INSERT … SELECT` from `"Student"` with `createdAt = now()`, runtime-role privileges: none to write, `applyRuntimeRole` in `backend/src/database/runtime-role.ts` recomputes them after each migration and already removes `UPDATE`/`DELETE` on append-only tables) and `down.sql` modelled on `0031_timetable/down.sql` (stops if any non-reconstructed row exists or the audit value was used; does not remove the enum value once used; says to restore the backup in that case). Run `npm exec -w backend -- prisma migrate dev --name student_class_history` on the local database, then `npm exec -w backend -- prisma migrate status` ("Database schema is up to date!"). Do not touch any other database.
- [X] T006 Run T003 again: it must now pass.
- [X] T007 [P] Create `backend/src/students/class-history.ts` with `appendClassHistory(tx, { studentId, classId, changedById, at? })` that inserts one row with server time as `startedAt` (never a client value), and `currentClassOf(tx, studentId)`; unit-test it in `backend/test/unit/class-history.spec.ts` first.
- [X] T008 [P] In `backend/src/audit/audit.service.ts` add `'at'` to `ALLOWED_DETAIL_KEYS` (keep `before`, `after`, `fields`, `studentId`); extend the existing audit unit test in `backend/test/unit/` to show `at` is kept and a `parentPhone` key inside `before`/`after` passed by mistake is still the caller's responsibility (the exclusion is done in T015).

**Checkpoint**: table, trigger, backfill and helper exist and are tested.

---

## Phase 3: User Story 1 — Class history of a pupil (Priority: P1) 🎯 MVP

**Goal**: every class a pupil belongs to is recorded and readable by the administration, with authors, and the pupil audit shows before and after.

**Independent Test**: create a pupil in class A, move to B then C: three rows, continuous, with authors; a phone change adds none; the audit entry shows before and after `classId` and never the phone.

### Tests for User Story 1 (write first, see them fail)

- [X] T009 [US1] `backend/test/integration/student-class-history.spec.ts`: create → one row, current, author = actor; move A→B→C → three rows ordered by `(startedAt, seq)`; update that changes only name or phone → no row (FR-003); two changes within one minute → `seq` decides; failure inside the transaction (force a constraint error) leaves neither the pupil change nor a row (FR-002).
- [X] T010 [US1] Same file: CSV import (first verify the import only creates pupils and never moves an existing one, FR-002) of N pupils (`backend/src/students/students-import.service.ts`) → N rows with the importing admin as author; an import that fails validation writes no pupil and no row.
- [X] T011 [US1] (done in `backend/test/integration/seed-demo.spec.ts`, which already runs the demo seed) invariant over the whole database after the seeds (`prisma/seed.ts`, `seed-demo.ts`, `seed-volume.ts` run against the test database as the existing seed tests do): every `Student` has at least one row and the row with the highest `(startedAt, seq)` has `classId = Student.classId` (SC-004).
- [X] T012 [P] [US1] `backend/test/integration/append-only.spec.ts`: add `StudentClassHistory` to the append-only cases (update, delete, truncate refused).
- [X] T013 [US1] `backend/test/integration/student-class-history.spec.ts`: `STUDENT_CHANGED` on update carries `{ action: 'update', fields, before, after }` where `before` and `after` contain only changed fields among `firstName`, `lastName`, `classId`, `active`, and `parentPhone` appears in `fields` only (FR-007); on create the entry keeps `{ action: 'create', classId }`.
- [X] T014 [US1] `backend/test/integration/student-class-history.spec.ts`: `GET /admin/students/:id/class-history` returns items most recent first with `endedAt` = next item's `startedAt` (null for the current), `changedBy`, `reconstructed`, and `availability` `PROBABLE` plus `warning` for a reconstructed row before its `createdAt`, `KNOWN` after; unknown or malformed id → 404.

### Implementation for User Story 1

- [X] T015 [US1] `backend/src/students/students.service.ts`: in `create`, append the first history row inside the existing transaction; in `update`, append a row only when `dto.classId !== current.classId`, inside the same transaction as `updateMany`; build `before`/`after` for changed fields among `firstName`, `lastName`, `classId`, `active` only, never `parentPhone`, and pass them with `fields` to `audit.log('STUDENT_CHANGED', …)`.
- [X] T016 [US1] `backend/src/students/students-import.service.ts`: generate the pupil ids client-side (`randomUUID`) so `tx.student.createMany` and `tx.studentClassHistory.createMany` run in the same transaction with the importing admin as `changedById`.
- [X] T017 [P] [US1] (only `seed-demo.ts` creates pupils; also `prisma/demo/reset.ts` purge and its unit test) `backend/prisma/seed.ts`, `backend/prisma/seed-demo.ts`, `backend/prisma/seed-volume.ts`: write one history row with each pupil created (`reconstructed = false`, author null is not allowed for new rows: use the seeding admin, or the first super administrator when the seed has none).
- [X] T018 [US1] `backend/src/students/student-situation.controller.ts` (new, `@Controller('admin/students')`, `@UseGuards(AdministrationGuard)`) and `backend/src/students/student-situation.service.ts` (new): `GET :id/class-history` per `contracts/student-situation.md` (class with level, floor, room; `changedBy` display name; availability rule R2 from `research.md`); register both in `backend/src/students/students.module.ts`. Use the existing `UUID` check and `AppException('NOT_FOUND')` for bad ids.
- [X] T019 [P] [US1] `frontend/src/features/students/studentSituationApi.ts`: typed client and TanStack Query hook for `class-history` (copy the style of the other `features/students` hooks).
- [X] T020 [US1] `frontend/src/features/students/StudentHistoryDrawer.tsx`: drawer opened by a new "Historique" button on each row of `frontend/src/features/students/StudentsAdminPage.tsx`; lists the class periods (class, start, end, author), shows the `PROBABLE` warning in words (not by colour only), loading, empty and error states; keyboard focus managed on open and close; Vitest test beside it written first (renders periods, warning, error state).

**Checkpoint**: US1 works and is demonstrable alone; data starts accumulating (the reason it ships first).

---

## Phase 4: User Story 2 — Situation at a precise moment (Priority: P1)

**Goal**: for a pupil and a minute, one page with class, planned session, actual teacher, announcement, substitute in force and supervisors, each with an availability.

**Independent Test**: seeded session 10:00–11:00, teacher arrival 10:12, pupil in the class: asking for 10:42 shows class, session, teacher and the 10:12 arrival.

### Tests for User Story 2 (write first, see them fail)

- [X] T021 [P] [US2] `backend/test/unit/student-situation.spec.ts`: pure-function tests of `buildSituation` for the eight scenarios of US2 in spec.md (on time; absent with substitute who arrived; arrival after the moment (corrected value used) listed as later; a corrected arrival is marked corrected and its original appears in changes; supervisor window before and after its end; no session planned; probable class and downgraded dependants; before the pupil's creation → `UNAVAILABLE` with `reasonUnavailable`; cancelled session with reason, time, author) plus: end-of-minute rule (event at 10:42:30 counts for `at` 10:42), tie of two class rows decided by `seq`, "no arrival recorded" never shown as absent unless an `ABSENT` row exists (FR-017), departure not returned, `dayLevelOnly` when two sessions of the teacher share the day, anonymized teacher shown as `{ anonymized: true }`.
- [X] T022 [P] [US2] `backend/test/integration/student-situation.spec.ts`: the same scenarios through `GET /admin/students/:id/situation?at=` with real rows built by T002 helpers; `at` without offset is read in `SCHOOL_TIMEZONE`; `at` missing, malformed or in the future → 422 with a field error on `at`. Edge cases: pupil and class deactivated since the moment, the situation still answers; a reinforcement released before the moment is not listed; a teacher who left the school and has not returned at the moment is shown as left.
- [X] T023 [P] [US2] `frontend/src/features/students/SituationView.test.tsx`: renders each section with its availability in words, the probable warning, the unavailable reason, "none recorded" for supervisors; no information carried by colour alone.

### Implementation for User Story 2

- [X] T024 [US2] `backend/src/students/domain/situation.ts`: pure `buildSituation(facts, at)` and the availability rules of `data-model.md` (one place); input types for the facts; no database, no clock.
- [X] T025 [P] [US2] `backend/src/students/student-situation.dto.ts`: query DTO with `at` required, `IsISO8601`, parsed by the existing school-time helpers (`backend/src/common/school-time.ts`, `atLocalTime`): seconds dropped, evaluated instant = end of the minute, refused if after now.
- [X] T026 [US2] `backend/src/students/student-situation.service.ts`: `situation(id, at)` gathers facts with indexed Prisma queries — history rows of the pupil; the class's sessions of the local day; `TeacherAttendance` of the class and day; `TeacherDeparture` of the teachers; the announcement `CoverageDetail` (predicate per T001); `RequestEvent` `SUBSTITUTE_SET`, `ASSIGNED`, `REASSIGNED`, `RELEASED` of the coverage request; `CoveragePresence` and `CoverageSupport`; `AuditLog` `ATTENDANCE_CORRECTED` entries for the attendance rows read, only to set `corrected` (original value, reason, author and time are listed by T032) — then calls `buildSituation`. No write.
- [X] T027 [US2] `backend/src/students/student-situation.controller.ts`: add `GET :id/situation` with the DTO of T025; response per contract.
- [X] T028 [P] [US2] `frontend/src/features/students/studentSituationApi.ts`: add the situation query (date and time as a local `datetime-local` value, sent without offset).
- [X] T029 [US2] `frontend/src/features/students/SituationView.tsx` and the date/time form inside `StudentHistoryDrawer.tsx`: sections class, session, teacher, announcement, substitute, supervisors; availability badge with text; print stylesheet with the author and production time in the header (FR-023); usable from 320 px and by keyboard.

**Checkpoint**: US1 and US2 deliver the answer to the parent's question.

---

## Phase 5: User Story 3 — What changed around the moment (Priority: P2)

**Goal**: timetable changes, attendance corrections and substitute changes of the day, with author and before/after, flagged when made after the moment.

**Independent Test**: change a session's room and correct an arrival the next day; both appear with author and the right `madeAfterMoment`.

### Tests for User Story 3 (write first, see them fail)

- [X] T030 [P] [US3] `backend/test/unit/student-situation.spec.ts`: `changes` section ordering (by time), `madeAfterMoment` true only when `createdAt > evaluatedAt`, previous substitutes listed in order with the one in force marked.
- [X] T031 [P] [US3] `backend/test/integration/student-situation.spec.ts`: room change at 09:00 listed with author, old and new room; arrival corrected the next day with a reason shows original and corrected values and `madeAfterMoment: true`, while the arrival shown in the teacher section is the corrected value, not the original; substitute changed twice → `inForce` correct for two different `at` values and `previous` lists both; entries about other classes or teachers are not returned.

### Implementation for User Story 3

- [X] T032 [US3] `backend/src/students/student-situation.service.ts`: read `AuditLog` entries of the day (reuse the `ATTENDANCE_CORRECTED` read of T026, do not query twice) for the session, its series, the attendance rows of the class and day, and the coverage request, using the new `(targetType, targetId, createdAt)` index; add `RequestEvent` `SUBSTITUTE_SET`.
- [X] T033 [US3] `backend/src/students/domain/situation.ts`: build `changes` and `substitute.previous`; no new rule outside this file.
- [X] T034 [US3] `frontend/src/features/students/SituationView.tsx`: render the changes list with before/after, author, time and the words "made after the moment" (not colour only); Vitest case added to the file of T023.

**Checkpoint**: corrections made after an incident are visible and flagged.

---

## Phase 6: User Story 4 — Access control and traceability (Priority: P2)

**Goal**: only the administration reads the history and situation; each situation consultation is logged; the administration can list the audit entries of a pupil.

**Independent Test**: a teacher is refused (403, logged); an administrator's consultation creates one `STUDENT_SITUATION_VIEWED` entry.

### Tests for User Story 4 (write first, see them fail)

- [X] T035 [P] [US4] `backend/test/integration/student-situation-access.spec.ts`: teacher and supervisor accounts get 403 on the three routes (`AdministrationGuard`) and an `ACCESS_DENIED` entry is written; `ADMIN` and `SUPER_ADMIN` get 200; unknown pupil → 404 for admins, same body as for a refused role (nothing revealed).
- [X] T036 [P] [US4] Same file: one consultation writes exactly one `STUDENT_SITUATION_VIEWED` with `{ studentId, at }`, author, time and IP, and a failed request (422) writes none.
- [X] T037 [P] [US4] Same file: `GET /admin/students/:id/audit` returns the pupil's `STUDENT_CHANGED` and `STUDENT_SITUATION_VIEWED` entries (matched by `targetId` and `details.studentId`), most recent first, cursor pagination as `/admin/audit`, and never an entry about another target or a secret.
- [X] T038 [P] [US4] Add the three routes to `backend/test/integration/admin-routes-access.spec.ts` and `backend/test/integration/idor-matrix.spec.ts` following their existing tables.

### Implementation for User Story 4

- [X] T039 [US4] `backend/src/students/student-situation.service.ts`: after the situation is built and before returning, `audit.log('STUDENT_SITUATION_VIEWED', { actorId, ip, targetType: 'Student', targetId: id, details: { studentId: id, at } })`.
- [X] T040 [US4] `backend/src/students/student-situation.controller.ts` and service: `GET :id/audit?limit=&cursor=` using `parseLimit`, `buildPage`, `decodeCursor` from `backend/src/common/pagination` and the same entry shape as `backend/src/audit/admin-audit.controller.ts`.
- [X] T041 [P] [US4] `frontend/src/features/students/studentSituationApi.ts` and `StudentHistoryDrawer.tsx`: a "Journal de l'élève" tab listing the audit entries with load-more; Vitest case written first.

- [X] T041b [P] [US4] Add the French label for `STUDENT_SITUATION_VIEWED` in `frontend/src/features/admin/labels.ts` so `frontend/src/features/admin/AuditLogPage.tsx` shows it; Vitest case written first in the existing labels test.

**Checkpoint**: access and traceability proven.

---

## Phase 7: Polish and cross-cutting

- [X] T042 [P] `e2e/student-situation.spec.ts`: journey of the manual scenario in `quickstart.md` (move a pupil, record an arrival, ask for a minute inside the session, read the sections, open the pupil journal), keyboard-only pass, 320 px width without horizontal scroll, axe check with no violation; print emulation (`page.emulateMedia({ media: 'print' })`): header with the author and the production time visible, navigation hidden, every section readable on one page; a teacher account gets "not found".
- [X] T043 [P] Docs: add a paragraph to the admin guide in `docs/` (what the situation shows, what "probable" means, per-day arrival limit, no pupil attendance), the retention note (history follows the pupil record, policy out of scope), and the new routes.
- [X] T044 [P] (no change needed: the document already states that a future append-only table is covered by `applyRuntimeRole`, and `forbid_modification` is in its list) `docs/roles-base-de-donnees.md`: add `StudentClassHistory` to the runtime-role table (`SELECT`, `INSERT`).
- [X] T045 (done as a test in `backend/test/integration/seed-demo.spec.ts`, on the full demonstration data) Measure SC-007: run the situation for one pupil on the `seed:volume` data and record the time in `quickstart.md`; if above 3 seconds, add the missing index through a new migration (never edit 0032).
- [X] T046 (all green on 2026-11-20 except `npm run audit:check`, which fails on `effect` GHSA-7589-6fvf-x4pw, a transitive dependency of `prisma@6.19.3` (`@prisma/config`) present on `master` before this feature: no dependency file was changed) Run the whole checklist of `quickstart.md`; run `npm run lint`, the dependency audit, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test` and `npm run test:e2e -- student-situation`; rerun only failing tests after a pass.
- [X] T047 Update `specs/021-historique-eleve-situation/checklists/requirements.md` and mark the spec status Implemented once T046 is green.

---

## Dependencies and execution order

- Phase 1 → Phase 2 → US1 → US2 → US3 and US4. US3 and US4 both extend the US2 service and can run in parallel after it, but touch the same service file: do T032 and T039/T040 one after the other.
- Inside Phase 2: T003 → T004 → T005 → T006; T007 and T008 can run beside T004 to T006.
- Inside each story: tests, see them fail, then implementation. Services before controller before frontend.
- T015 and T016 both edit pupil write paths in different files; T017 touches three seed files, one task because they share the helper.

## Parallel opportunities

- T002 beside T001. T007 and T008 beside the migration.
- US1 tests T009 to T014 (T009, T010, T011, T013, T014 share one file: write them in one sitting; T012 and the frontend test are separate files).
- US2: T021, T022, T023 in parallel; T025 and T028 in parallel.
- US4 tests T035 to T038; T041 beside T039 and T040.
- Polish T042 to T044 in parallel.

## Implementation strategy

- **MVP**: Phases 1 to 3. It ships the history and starts collecting data that cannot be recovered later, even before the situation screen exists.
- **Then** US2 for the answer the administration needs, then US3 and US4. US4's access tests also protect US1 and US2, so run T035 early if a reviewer wants the security proof before the UI.
- Commit after each phase checkpoint. One pull request per phase if a smaller review is wanted; the migration (T005) must be in the first one.

## Notes

- Not in this list, by the spec's scope: incident register, supervision planning, retention policy, pupil attendance, parent access.
- Two open reads are closed in T001; if they show the event shapes differ from research.md R10 and R11, fix the research file first, then T026 and T021.
