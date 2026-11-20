# Research: Student class history and situation

Each point lists the decision, why, and what was rejected. Findings come from reading the code on 2026-11-20.

## R1 — How to store the class history

- **Decision**: one append-only table `StudentClassHistory(id, seq, studentId, classId, startedAt, changedById?, reconstructed, createdAt)`. A period ends when the next row of the same pupil starts (`ORDER BY startedAt, seq`). There is no `endedAt`.
- **Why**: FR-004 (one current class, no overlap) becomes true by construction. FR-006 (not editable) can be enforced by a trigger, because no row ever needs updating. `seq` (autoincrement, like `RequestEvent.seq`) orders two changes in the same minute.
- **Rejected**: `(from, to)` rows as in the request wording. Closing the previous row needs an UPDATE, which forbids the immutability trigger, and needs an overlap constraint to stay consistent. A temporal-table extension: heavier than the need.

## R2 — Probable versus known (answer to clarification Q1)

- **Decision**: the backfilled row has `reconstructed = true`, `startedAt = Student.createdAt`, and `createdAt = migration time`. For a moment `T` in a reconstructed row, the class is `PROBABLE` if `T < row.createdAt`, otherwise `KNOWN` (any change after migration is recorded).
- **Why**: the go-live date is carried by the row itself, so no setting and no extra column are needed, and it stays right per pupil.
- **Edge**: before `Student.createdAt` the pupil did not exist: `UNAVAILABLE`.

## R3 — Where history rows are written

- **Decision**: in the same transaction as the pupil write, in `students.service.ts` (`create`, `update` when `classId` changes) and `students-import.service.ts` (which uses `createMany`; the rows get client-generated ids so the history can reference them in the same transaction). Seeds (`seed.ts`, `seed-demo.ts`, `seed-volume.ts`) also write them.
- **Why**: FR-002 requires atomicity and an author; the only writers of `Student` are these (checked by search: no other `student.create/update/upsert` outside tests).
- **Guard**: an integration test asserts, over the whole database after the seeds, that every pupil has at least one row and that the latest row's class equals `Student.classId`. This covers SC-004 without a database trigger.
- **Rejected**: a database trigger on `Student` that inserts the row. It cannot know the author (`changedById`) without a session variable, and it hides a write from the code that reads best.

## R4 — Audit of pupil changes

- **Decision**: `STUDENT_CHANGED` details become `{ action, fields, before, after }` where `before`/`after` hold only the changed fields among `firstName`, `lastName`, `classId`, `active`. `parentPhone` stays in `fields` but never in `before`/`after`.
- **Why**: FR-007. Finding: `SENSITIVE_KEY` does not match `parentPhone`, so the existing scrubber would keep it; the exclusion must be done by the caller. The keys `before`, `after`, `fields` are already on the audit whitelist.
- **New**: audit key `at` (moment consulted) added to the whitelist; `studentId` is already allowed.

## R5 — Reading the audit trail by pupil

- **Decision**: a new admin route `GET /admin/students/:id/audit` returns entries with `targetType = 'Student'` and `targetId = :id`, plus `STUDENT_SITUATION_VIEWED` entries whose `details.studentId` is the pupil. Add index `AuditLog(targetType, targetId, createdAt)`.
- **Why**: FR-021 needs admins (not only the super administrator) to read these entries. Opening `/admin/audit` to admins would expose every entry (logins, settings). A narrow route exposes only what concerns the pupil.
- **Rejected**: adding `targetId` filters to `/admin/audit` and widening its guard: wider disclosure than the need.

## R6 — Which minute is "the moment"

- **Decision**: `at` is an ISO 8601 date-time. With an offset or `Z` it is used as given; without, it is read in `SCHOOL_TIMEZONE` (existing helper `atLocalTime`, `common/school-time.ts`). Seconds are ignored and the instant evaluated is the **end of that minute** (`HH:MM:59.999`), so an event recorded during the asked minute counts and "at the minute of a change the new class applies" holds. A moment after now is refused (422, field error on `at`).

## R7 — Planned session

- **Decision**: among the class's `TeachingSession` rows of the local day, pick the one with `startAt ≤ T < endAt`, including `CANCELLED` ones (shown as cancelled with reason, time, author). None found: section `NONE` ("no session planned").
- **Why**: the database already forbids two scheduled sessions overlapping for a class; a cancelled one may overlap a replacement, so scheduled wins if both exist, and the cancelled one is listed under changes.

## R8 — Actual teacher and the per-day arrival limit

- **Decision**: `TeacherAttendance` rows of that class and local day with `status != ABSENT` and `arrivedAt ≤ T` (or `recordedAt ≤ T` when no time was given, flagged). Rows with `arrivedAt > T` are listed as "later than the moment". `TeacherDeparture` rows with `departedAt ≤ T` and (`returnedAt` null or `> T`) show "left, not returned".
- **Corrections**: the attendance row shown is its current value. If an `ATTENDANCE_CORRECTED` audit entry exists for the row, the arrival is marked corrected and the original value is listed under the changes (FR-018).
- **Limit kept (from the spec)**: arrivals are per class and day, not per session. If the teacher has two sessions in that class that day, the section states that the arrival is a day-level fact. No attempt to split it, and `TeacherAttendance` is not changed.
- **Why**: the spec's out of scope excludes changing the attendance model; the rule in `attendance/domain/attendance-matching.ts` already accepts this granularity.

## R9 — Announced absence or lateness

- **Decision**: a `CoverageDetail` with `type` in (`ABSENCE`, `LATENESS`), `teacherId` = titular teacher, request not cancelled or merged, whose window contains `T` (`startAt ≤ T ≤ plannedEndAt`, or end of day when `plannedEndAt` is null), as the statuses logic in `attendance/domain/session-status.ts` does. The reason is returned (administration only, FR-012).
- **To confirm in `tasks.md` T001**: reuse the matching predicate from `session-status.ts` / `expected-teachers.service.ts` if it can be imported unchanged; otherwise copy the rule once into `domain/situation.ts` with a test that pins both to the same fixtures.

## R10 — Substitute in force at the moment

- **Decision**: from the announcement's request, read `RequestEvent` rows of type `SUBSTITUTE_SET` (they hold `fromValue.teacherId`, `toValue.teacherId`, `createdAt`, `actorId`). The substitute at `T` is the `toValue` of the last event with `createdAt ≤ T` (order by `seq`). Earlier ones are listed. If the detail has a substitute but no event exists, show the current value as `PROBABLE`.
- **Actual substitute**: a `TeacherAttendance` row with `substituteForId` = titular, class and day, `arrivedAt ≤ T`.
- **Why**: `CoverageDetail.substituteTeacherId` is overwritten, but every change writes an event (checked in `attendance.service.ts`, `setSubstitute`).

## R11 — Supervisors

- **Decision**: for coverages of the pupil's class whose window contains `T`:
  - the assignee in force: last `ASSIGNED`/`REASSIGNED`/`RELEASED` event with `createdAt ≤ T` (`toValue.assigneeId`), shown as "present" if a `CoveragePresence` exists with `createdAt ≤ T` and `relievedAt` is null or `> T`, otherwise "assigned, presence not recorded at that moment";
  - reinforcements with `joinedAt ≤ T` and (`releasedAt` null or `> T`);
  - source of the coverage (`CoverageSource`).
- No coverage: `NONE` with the wording "none recorded" (there is no supervision planning, per the spec).
- **To confirm in `tasks.md` T001**: event value shapes at `coverage-actions.service.ts` lines near 376 and 434 (`REASSIGN`) are read by a test fixture before the reader is written.

## R12 — Changes around the moment

- **Decision**: `AuditLog` entries of the day for the targets involved (the session, its series, attendance rows of that class and day, the coverage request) plus `RequestEvent` `SUBSTITUTE_SET`. Each carries `madeAfterMoment = createdAt > T`. Read by `targetType`/`targetId` using the new index.
- **Why**: all the changes the spec lists already write an audit entry with before and after (`TIMETABLE_CHANGED`, `ATTENDANCE_CORRECTED`, `COVERAGE_MANAGED` with `SET_SUBSTITUTE`).

## R13 — Access and denial

- **Decision**: `AdministrationGuard` on the new controller (same as `StudentsController`, roles `ADMIN` and `SUPER_ADMIN`). Other roles get 404 and the denial is logged (existing guard behaviour; confirmed by `admin-routes-access.spec.ts`, where the new routes are added).
- **Consultation log**: `STUDENT_SITUATION_VIEWED` with `{ studentId, at }` written in the same request, before the response is returned.

## R14 — Printing

- **Decision**: a print stylesheet on the situation view (browser print / save as PDF), with the author and the production time in the page header. No server-side PDF.
- **Rejected**: generating a PDF on the server: a new dependency for a need the browser already meets.

## R15 — Retention

- **Decision**: none added (out of scope). The class history follows the pupil record. Noted in the docs paragraph so the question stays visible.

## Confirmations de T001 (2026-11-20)

- **R9, annonce** : le critère n'est pas exportable, il est écrit en ligne dans `attendance/expected-teachers.service.ts` : `source = TEACHER_REQUEST`, `type` dans (`LATENESS`, `ABSENCE`), `mergedIntoId` null, demande non `CANCELLED`, et fenêtre qui chevauche la séance (`startAt < fin de séance` et `plannedEndAt` null ou `> début de séance`). Il est recopié une seule fois dans `students/domain/situation.ts`, avec un test qui fixe le même jeu de cas.
- **R10, remplaçant** : confirmé, `SUBSTITUTE_SET` écrit `fromValue: { teacherId }` et `toValue: { teacherId }` (`attendance.service.ts`, `setSubstitute`).
- **R11, surveillants** : `ASSIGNED` et `REASSIGNED` portent `toValue: { assigneeId }` (`REASSIGNED` peut aussi porter `reliefRequestId`) ; `RELEASED` porte `fromValue: { assigneeId }` et `toValue: { byManager: true }`. Le surveillant en vigueur à T est celui du dernier événement `ASSIGNED`/`REASSIGNED` antérieur ; un `RELEASED` ultérieur à cet événement et antérieur à T le retire. La présence vient de `CoveragePresence` (`createdAt`, `method`). Fin d'une garde : `relievedAt`, sinon `plannedEndAt`, sinon ouverte.
- **Gardes de la classe** : toutes les `CoverageDetail` de la classe (tous types, hors annulées et fusionnées) dont la fenêtre contient T ; une classe déclarée vide (`EMPTY_CLASS`) est la garde typique.
