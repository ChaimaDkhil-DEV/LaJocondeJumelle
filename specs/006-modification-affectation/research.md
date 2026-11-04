# Research — 006 Modification d'une affectation par l'admin (Assignment edit by the admin)

No technical unknown: the edit reuses the mechanisms of the teacher's correction of a
report (`CoverageService.updateTeacherRequest`), of the extension
(`EXTEND`) and of reassignment (availability). Decisions fixed from `master`
(`d939375`).

## R1 — Route and authorization

- **Decision**: new route `PATCH /api/coverage/:id` (admins and super administrator),
  body `UpdateCoverageDto`: `version` (required) and, optional, `classId`, `date`
  (YYYY-MM-DD), `startTime`, `endTime` (HH:MM, school time zone). Authorization through the state
  machine: new rule `{ from: [PENDING, ASSIGNED…, ON_SITE…], action: 'UPDATE', to: 'same',
  actors: ['ADMIN'] }`, in addition to the teacher's existing rule (`PENDING`,
  `REQUESTER_TEACHER`). `allowedActions` then contains `UPDATE` for the admin: the UI
  shows « Modifier » (Edit) with no client-specific rule.
- **Rationale**: same shape as `PATCH /api/coverage/:id/teacher-request` (partial form, not
  a simple transition); the `UPDATE` action already exists in the state machine; refusal logged
  `ACCESS_DENIED` and `404` for the other roles, like the other routes of the module (principle V).
- **Alternatives considered**: `POST /:id/actions` action with an admin `UPDATE` (the actions' body
  carries neither class nor slot: rejected); new `MODIFY` action (duplicate of `UPDATE`:
  rejected).

## R2 — Fields editable by status (FR-002, FR-005, Clarification Q1)

- **Decision**: pure function `modifiableFields(status)` in `backend/src/coverage/domain/`
  (unit tested):
  - `PENDING`, `ACCEPTED`, `EN_ROUTE`, `LATE` → class, date, start, end;
  - `ON_DUTY`, `RELIEF_PENDING` → end only;
  - final statuses → nothing (the state machine rule already refuses `UPDATE`).
  The service refuses any field outside this list (`400 VALIDATION_ERROR`, relevant field).
  The UI uses the same rule, returned in the assignment detail
  (`modifiableFields`), to disable the fields.
- **Rationale**: a single business rule, on the server side, exposed to the client (no duplication).

## R3 — Time slot (FR-003, FR-004)

- **Decision**: date and times converted into the school time zone with `atLocalTime`
  (`backend/src/common/school-time.ts`). Direct creation rules: end after the start
  (`INVALID_RANGE`), end not yet past, start between 12 h before and 7 days after now
  (`MAX_PAST_MS`, `MAX_FUTURE_MS` of `coverage.service.ts`). During attendance, the start is not
  editable and the end must be later than now.
- **Alternatives considered**: ISO instants like direct creation (the form enters a
  date and local times, like the teacher's report: rejected).

## R4 — Availability and named conflict (FR-006, Clarification Q2)

- **Decision**: if the assignment has a supervisor and the slot changes, `availabilityFor`
  (`coverage-availability.ts`) on the new slot **excluding the assignment itself**, under the
  supervisor's lock (`lockEmployee`, like assignment). Unavailable → `409 NOT_AVAILABLE`
  with a message that names the conflict when `guardRequestId` is set (« Surveillant déjà
  affecté : <classe>, <date> <début>–<fin>. Réassignez d'abord, puis modifiez. » (Supervisor already assigned: <class>, <date> <start>–<end>. Reassign first, then edit.)) and
  `details.conflict = { id, className, startAt, plannedEndAt }`; for absent, unavailable or
  disabled account, the reason's message. Nothing is changed.
- **Rationale**: `EmployeeAvailability.guardRequestId` already exists; no forcing (004).

## R5 — Status, class and attendance (FR-008, FR-009, Clarification Q3)

- **Decision**: status unchanged, including `EN_ROUTE` (no reset of `departedAt`). The
  request title follows the class (`Garde — <classe>`, `Retard — <classe>`, `Absence — <classe>`,
  according to the existing source and type). Attendance by QR code already compares the
  assignment's class (`CoverageService.resolveQr`): after a class change, only the QR code of the
  new class is valid, with no change.

## R6 — Due dates and reminders (FR-011)

- **Decision**:
  - request due date (`currentDueAt`, `warnAt`) recomputed from the new start with
    `nextCoverageDeadline`, as at creation, as long as attendance is not confirmed;
  - reminders (`reminderChanges`, `domain/coverage-reminders.ts`): the `UPDATE` case
    today handles only the wait for assignment; it will also handle assigned or
    in-progress assignments like `EXTEND` (end-of-slot reminders recomputed). Domain unit tests.

## R7 — History, audit, notifications (FR-007, FR-010)

- **Decision**:
  - existing `UPDATED` event, `fromValue`/`toValue` = `{ classId, startAt, plannedEndAt }`,
    `toValue.byAdmin = true`; never the reason;
  - class names resolved at read time in `historyOf` (like `assigneeName`, `teacherName`,
    principle R5 of 004); text: « Affectation modifiée : classe A → B ; 09:00–10:00 →
    09:30–10:00 » (only the changed items);
  - audit `COVERAGE_MANAGED` (« Affectation gérée par un admin ») with `action: 'UPDATE'`, values
    before and after;
  - existing `COVERAGE_UPDATED` notification to the assigned supervisor and the other admins; its
    label becomes « Affectation modifiée » (also for the teacher's correction of a
    report, already notified under this type); the updated title makes the new
    class appear in the notification; real-time update (`pushUpdate`);
  - no effective change (same values): response with no effect, no event, no
    notification.
- **Rationale**: no new event or notification type, hence **no migration**.

## R8 — UI

- **Decision**: « Modifier » button on the assignment detail (admins, if `UPDATE` is in
  `allowedActions`), « Modifier l'affectation » dialog: class, date, start time, end
  time, fields disabled according to `modifiableFields` with an explanatory sentence during attendance;
  errors tied to the fields; conflict in a dialog alert; success: toast « Affectation
  modifiée. ». Mutation feedback at the mutation level (lesson from PR #23). 320 px layout.

## R9 — Test strategy (principle I)

- Unit: `modifiableFields`, admin `UPDATE` state machine rule, `reminderChanges`
  (`UPDATE` on an assigned assignment).
- Integration (`backend/test/integration/supervision-update.spec.ts`, new): roles, statuses,
  class refused during attendance, invalid slot, named conflict, concurrent version,
  history, audit, notification, QR of the new class.
- Frontend: dialog (fields by status, errors, conflict, success) and history text.
- e2e (Chromium): change of the slot and class of a direct assignment, supervisor's view;
  dialog screen in the 004 test at 320 px (axe).
