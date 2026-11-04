---

description: "Task list for feature 006 — assignment edit by the admin (class, time slot)"
---

# Tasks: Modification d'une affectation par l'admin (classe, créneau) (Assignment edit by the admin: class, time slot)

**Input**: Design documents from `/specs/006-modification-affectation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY — constitution, principle I (non-negotiable TDD). Each test task
placed before an implementation MUST be written and seen **red** before coding. No existing
expectation is changed, except the labels « Demande modifiée » → « Affectation modifiée » (Request modified → Assignment modified)
(`UPDATED` event, `COVERAGE_UPDATED` notification), to be recorded in
`docs/validation/verification-006.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 (slot, P1), US2 (class, P2)

## Path Conventions

Monorepo: `backend/src/coverage/`, `backend/test/{unit,integration}/`, `frontend/src/features/coverage/`,
`frontend/tests/coverage/`, `e2e/`. Commands from the repository root.

---

## Phase 1: Setup

- [X] T001 On `006-modification-affectation`, record the starting state (`npm run verify`, backend and frontend typecheck, or a reference to the last full verification if no code file has changed since) in a new `docs/validation/verification-006.md`, section « État initial » (Initial state)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: protected `PATCH /api/coverage/:id` route, per-status rule, version, response and « Modifier » button — without yet changing either slot or class

**⚠️ CRITICAL**: no story starts before this phase is finished

- [X] T002 [P] Unit tests (red): in `backend/test/unit/coverage-state-machine.spec.ts`, the `UPDATE` action is allowed for the `ADMIN` actor from `PENDING`, `ACCEPTED`, `EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING` to the same status, refused (`INVALID_TRANSITION`) from `DONE`, `CLOSED`, `CANCELLED`, `UNFILLED`, and the teacher's rule (`PENDING`, `REQUESTER_TEACHER`) is unchanged; in a new `backend/test/unit/coverage-modification.spec.ts`, `modifiableFields(status)` returns `['classId','date','startTime','endTime']` for `PENDING`, `ACCEPTED`, `EN_ROUTE`, `LATE`, `['endTime']` for `ON_DUTY`, `RELIEF_PENDING`, `[]` for the final statuses
- [X] T003 [P] Integration test (red): in `backend/test/integration/supervision-permissions.spec.ts`, add `PATCH /api/coverage/:id` to the route × role matrix: admin and super administrator allowed; employee, supervisor, teacher → `404` and logged refusal `ACCESS_DENIED`
- [X] T004 [P] New `backend/test/integration/supervision-update.spec.ts` (red), foundation: different version → `409 STATE_CHANGED` with no write; finished or cancelled assignment → `409 INVALID_TRANSITION`; body with no change → `200`, version unchanged, no event or notification; `GET /api/coverage/:id` returns `modifiableFields` by status for an admin and `[]` for a supervisor
- [X] T005 In `backend/src/coverage/domain/coverage-state-machine.ts`, add the rule `{ from: [PENDING, ACCEPTED, EN_ROUTE, LATE, ON_DUTY, RELIEF_PENDING], action: 'UPDATE', to: 'same', actors: ['ADMIN'] }`; create `backend/src/coverage/domain/coverage-modification.ts` (`modifiableFields`); T002 green
- [X] T006 In `backend/src/coverage/coverage.dto.ts`, `UpdateCoverageDto` (`version` required integer; `classId` UUID, `date` YYYY-MM-DD, `startTime` and `endTime` HH:MM optional, same formats and messages as `TeacherRequestDto`); in `backend/src/coverage/coverage.controller.ts`, `@Patch(':id')` → `CoverageService.updateCoverage`; in `coverage.service.ts`, `updateCoverage`: admin check (`assertCoverageAdmin`, logged refusal), loading, version, `UPDATE` rule, early exit with no change; add `modifiableFields` to the detail (`coverage.mapper.ts`, empty for non-admins); T003 and T004 green
- [X] T007 [P] Frontend: in `frontend/src/features/coverage/types.ts`, `modifiableFields` on the detail; in `api.ts`, `useUpdateCoverage(id, handlers)` (`PATCH`, `onSuccess`/`onError` feedback at the mutation level like `useCoverageAction`, detail cached then module refreshed)

**Checkpoint**: the route exists, protected and versioned; the detail exposes `modifiableFields`

---

## Phase 3: User Story 1 - Correct an assignment's time slot (Priority: P1) 🎯 MVP

**Goal**: change date, start and end (end only during attendance), named conflict, due dates and reminders recomputed, history, audit and notification

**Independent Test**: change the slot of an assigned assignment; verify detail, supervisor's view, notification, history, audit; overlap refused with named conflict

### Tests for User Story 1 ⚠️

- [X] T008 [P] [US1] In `backend/test/unit/coverage-reminders.spec.ts` (red): `reminderChanges` for the `UPDATE` action on an `ACCEPTED` or `ON_DUTY` assignment resolves the end-of-slot reminders and reschedules some from the new end (like `EXTEND`); on `PENDING`, current behavior unchanged
- [X] T009 [P] [US1] In `backend/test/integration/supervision-update.spec.ts` (red), slot: new date and new times (school time zone) saved, `estimatedMinutes` recomputed, status and supervisor unchanged; end before start or past → `400 INVALID_RANGE`; start outside 12 h before / 7 days after → `400 VALIDATION_ERROR` on `startTime`; during attendance (`ON_DUTY`): `classId`, `date` or `startTime` → `400 VALIDATION_ERROR` « Non modifiable pendant la présence en classe. », end earlier than now refused, later end accepted; overlap with another assignment of the same supervisor → `409 NOT_AVAILABLE`, message « Surveillant déjà affecté : <classe>, <date> <début>–<fin>. Réassignez d’abord, puis modifiez. », `details.conflict` set, nothing changed; absent supervisor → `409 NOT_AVAILABLE` with no named conflict; `UPDATED` event (`fromValue`/`toValue`: `classId`, `startAt`, `plannedEndAt`, `toValue.byAdmin`), audit `COVERAGE_MANAGED` with `details.action = 'UPDATE'`, before and after, without the reason; `COVERAGE_UPDATED` notification to the assigned supervisor and the other admins (not the author); due date (`currentDueAt`) recomputed on the new start before attendance
- [X] T010 [P] [US1] New `frontend/tests/coverage/edit-coverage.test.tsx` (red): « Modifier » button present only if `allowedActions` contains `UPDATE`; « Modifier l’affectation » dialog pre-filled (local date and times); fields disabled according to `modifiableFields` and sentence « Le surveillant est en classe : seule l’heure de fin peut changer. »; « Enregistrer » sends only the changed fields with `version`; `INVALID_RANGE` and `VALIDATION_ERROR` error under the field; `NOT_AVAILABLE` in a dialog alert with the server's message; success: dialog closed and toast « Affectation modifiée. » even if the detail unmounts before the response
- [X] T011 [P] [US1] In `frontend/tests/coverage/edit-coverage.test.tsx` (red, real detail rendering): history text of an admin `UPDATED` — « Affectation modifiée : 09:00–10:00 → 09:30–10:30 » (slot only), with the date if the day changes; generic label « Affectation modifiée »

### Implementation for User Story 1

- [X] T012 [US1] In `backend/src/coverage/domain/coverage-reminders.ts`, `UPDATE` case: assigned or in-progress assignment → end-of-slot reminders recomputed (`endOfSlotPlan`), `PENDING` unchanged; T008 green
- [X] T013 [US1] In `backend/src/coverage/coverage.service.ts` (`updateCoverage`): slot in the school time zone (`atLocalTime`), R3 rules and fields allowed by `modifiableFields`; supervisor availability on the new slot (`availabilityFor` excluding the assignment, under `lockEmployee`), `NOT_AVAILABLE` refusal naming the conflict (`guardRequestId` → class and slot); in the transaction: versioned `updateMany`, `coverageDetail` (`startAt`, `plannedEndAt`, `estimatedMinutes`), due date (`nextCoverageDeadline`) before attendance, `applyReminders` (`UPDATE`), `UPDATED` event, audit `COVERAGE_MANAGED`, `COVERAGE_UPDATED` notification (supervisor and other admins), `pushUpdate`; T009 green
- [X] T014 [US1] In `historyOf` (`coverage.service.ts`), resolve `classId` → `className` in `fromValue`/`toValue` (like `assigneeName`); in `frontend/src/features/coverage/CoverageDetailPage.tsx`, text of the `UPDATED` event (contracts/ui.md) and label « Affectation modifiée »; in `frontend/src/features/notifications/api.ts`, `COVERAGE_UPDATED` label « Affectation modifiée »; T011 green
- [X] T015 [US1] New `frontend/src/features/coverage/EditCoverageDialog.tsx` (date, start time, end time; class read-only for now) and « Modifier » button in `CoverageDetailPage.tsx` (admin actions area); T010 green
- [X] T016 [P] [US1] In `e2e/coverage-class.spec.ts`, new Chromium flow (red then green) at 1280 px: direct assignment → « Modifier » the end → supervisor's view updated without reloading, history; second assignment of the same supervisor changed to overlap → conflict message; cleanup by cancellation (replayable database)
- [X] T017 [US1] Run `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test` and the T016 flow: all green

**Checkpoint**: US1 deliverable on its own (MVP)

---

## Phase 4: User Story 2 - Change an assignment's class (Priority: P2)

**Goal**: change the class before attendance (floor, title, notification highlighting the class), status unchanged (including « En route »), QR code of the new class

**Independent Test**: change the class of an « En route » assignment; supervisor notified; QR of the old class refused, of the new one accepted

### Tests for User Story 2 ⚠️

- [X] T018 [P] [US2] In `backend/test/integration/supervision-update.spec.ts` (red), class: new active class saved with its floor (`floorId`), title `Garde — <classe>` (or `Retard`/`Absence` depending on the assignment); disabled class → `400 CLASS_INACTIVE`; `EN_ROUTE` assignment → stays `EN_ROUTE`, `departedAt` kept; `COVERAGE_UPDATED` notification to the supervisor; attendance: QR of the old class no longer finds the assignment (`resolveQr`), the new one's finds it; class changed together with the slot: a single version, a single event
- [X] T019 [P] [US2] Complete `frontend/tests/coverage/edit-coverage.test.tsx` (red): « Classe » list of active classes (name, room, floor), change sent as `classId`; disabled during attendance; and `frontend/tests/coverage/coverage.test.tsx`: history « Affectation modifiée : classe 2e année Bleu → 1ère année Violet »

### Implementation for User Story 2

- [X] T020 [US2] In `updateCoverage` (`coverage.service.ts`): active class (`CLASS_INACTIVE`), `classId` and `floorId`, title according to the existing source and type, status and `departedAt` unchanged; T018 green
- [X] T021 [US2] In `EditCoverageDialog.tsx`, « Classe » field (active classes, like `CreateCoveragePage.tsx`), enabled according to `modifiableFields`; history text with the class; T019 green
- [X] T022 [P] [US2] In `e2e/coverage-class.spec.ts`, complete the T016 flow: class change of an « En route » assignment → still « En route » on the supervisor's side, new class displayed; attendance by QR of the new class
- [X] T023 [US2] Run the backend and frontend suites and `e2e/coverage-class.spec.ts` (Chromium): all green

**Checkpoint**: US1 and US2 work, each testable on its own

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T024 [P] In `e2e/a11y-responsive.spec.ts`, test « 004 — écrans des affectations à 320 px » (004 — assignment screens at 320 px): open « Modifier » on an assignment and `checkScreen` of the dialog (axe, no horizontal scrolling); reach « Modifier » and the fields by keyboard (FR-013, SC-005)
- [X] T025 [P] Update `docs/superadmin-fonctionnalites.md`: §3 (edit by the admin), §2.7 (audit `COVERAGE_MANAGED`: change), §4.2 (remove « Modification d'une affectation par l'admin (classe, horaire) : absente »)
- [X] T026 Run through scenarios 1 to 8 of `specs/006-modification-affectation/quickstart.md` (automatic coverage and what remains to do by hand) and record in `docs/validation/verification-006.md`, with the changed labels (« Affectation modifiée »)
- [X] T027 Final verification: `npm run verify`, backend and frontend typecheck, `npm run test:e2e` (all profiles, during the school day); record the counts; CI green; pull request according to `docs/procedure-fusion.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → **US1 (Phase 3)** and **US2 (Phase 4)** → **Polish (Phase 5)**
- Phase 2 blocks both stories (route, rule, version, `modifiableFields`)

### User Story Dependencies

- **US1**: after phase 2.
- **US2**: after phase 2; shares `updateCoverage`, `EditCoverageDialog.tsx`, `supervision-update.spec.ts` and `edit-coverage.test.tsx` with US1 — do US1 first (T013 before T020, T015 before T021) to avoid conflicts in these files.

### Within Each User Story

- Red tests before implementation (T008–T011 before T012–T015; T018–T019 before T020–T021)
- Server before UI (T013 before T015; T020 before T021)

### Parallel Opportunities

- Phase 2: T002, T003, T004 in parallel; T007 in parallel with T005–T006
- US1: T008, T009, T010, T011 in parallel; T016 in parallel with T012–T015 (written red first)
- US2: T018 and T019 in parallel; T022 in parallel with T020–T021
- Polish: T024 and T025 in parallel

---

## Parallel Example: Foundational

```text
T002 backend/test/unit/coverage-state-machine.spec.ts + coverage-modification.spec.ts
T003 backend/test/integration/supervision-permissions.spec.ts
T004 backend/test/integration/supervision-update.spec.ts
```

## Parallel Example: User Story 1

```text
T008 backend/test/unit/coverage-reminders.spec.ts
T009 backend/test/integration/supervision-update.spec.ts
T010 frontend/tests/coverage/edit-coverage.test.tsx
T011 frontend/tests/coverage/coverage.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001), Phase 2 (T002–T007)
2. Phase 3 (T008–T017): slot change, named conflict, traces
3. **Stop and validate**: quickstart scenarios 1, 2, 3, 5, 6, 7

### Incremental Delivery

1. Foundation → protected and versioned route
2. US1 → slot (most frequent case)
3. US2 → class
4. Polish → 320 px accessibility, documentation, final verification
