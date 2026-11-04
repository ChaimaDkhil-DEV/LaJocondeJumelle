# Verification of feature 006 — modification of an assignment by the admin

Specification, plan and tasks: `specs/006-modification-affectation/`.

## Initial state (T001)

Branch `006-modification-affectation`, created from `master` (`d939375`, merge of PR #23).
No file in `backend/`, `frontend/`, `e2e/` or the dependencies has changed since `d939375`.

| Step | Result |
|-------|----------|
| CI on `d939375` ("Contrôles qualité" (Quality checks), all steps) | green |
| Backend unit tests | 575 / 575 (final verification of 005) |
| Backend integration tests | 601 / 601 (same) |
| Frontend tests (Vitest) | 248 / 248 (247 + non-regression test of PR #23) |
| End to end (6 profiles) | 143 passed, 78 deliberately skipped; the intermittent failure of flow A at 768 px is fixed by PR #23 |

## Existing expectations modified (exceptions recorded)

Direct consequences of the spec (FR-001, FR-002: the admin can modify an assignment, including
"en attente" (pending)); no other existing expectation is modified.

| File | Expectation | Before | After |
|---------|---------|-------|-------|
| `backend/test/unit/coverage-state-machine.spec.ts` ("UPDATE et WITHDRAW par l’enseignant auteur…" (UPDATE and WITHDRAW by the authoring teacher…)) | `UPDATE` by the admin on "en attente" | `FORBIDDEN` | allowed, status unchanged |
| `backend/test/unit/coverage-state-machine.spec.ts` ("admin : en attente, puis en cours" (admin: pending, then in progress)) | actions offered to the admin, "en attente" and "en cours" (in progress) | without `UPDATE` | with `UPDATE` |
| `backend/test/unit/coverage-policy.spec.ts` ("admin : assigner, annuler…" (admin: assign, cancel…)) | actions offered to the admin, "en attente" | without `UPDATE` | with `UPDATE` |

Labels "Demande modifiée" → "Affectation modifiée" (history `UPDATED`, notification
`COVERAGE_UPDATED`) (displayed as "Request modified" → "Assignment modified"): no existing test covered the old label.

**State machine**: `findTransition` now chooses the rule for the action **and the actor**
(the `UPDATE` action has two rules on "en attente": authoring teacher and admin). Without this,
the admin would have received `FORBIDDEN` on "en attente". If the actor only has the action in
other statuses, the refusal remains `INVALID_TRANSITION` (teacher on an assigned assignment:
behavior unchanged). The whole unit suite stayed green apart from the expectations above.

## Tests added

| File | Covers |
|---------|--------|
| `backend/test/unit/coverage-modification.spec.ts` | FR-002, FR-005 (`modifiableFields`) |
| `backend/test/unit/coverage-state-machine.spec.ts` ("modification par l’admin" (modification by the admin) block) | FR-001, FR-002 |
| `backend/test/unit/coverage-reminders.spec.ts` (`UPDATE` assigned / in progress) | FR-011 |
| `backend/test/integration/supervision-update.spec.ts` (16 tests) | FR-002 to FR-012: version, final statuses, time slot, attendance, named conflict, absent, traces (history, audit without reason, notifications, due date), class, "En route" (On the way), QR, class + time slot |
| `backend/test/integration/supervision-permissions.spec.ts` (route added) | FR-001 (roles, logged refusals) |
| `frontend/tests/coverage/edit-coverage.test.tsx` (14 tests) | FR-013 and interface contract: button, pre-filling at school time, fields depending on status, sending only changed fields, errors, conflict, confirmation, history, class |
| `e2e/coverage-class.spec.ts` (2 "spec 006" flows, Chromium) | US1 (seen by the supervisor without reloading, named conflict), US2 ("En route" kept, QR of the new class) |
| `e2e/a11y-responsive.spec.ts` (test 004 at 320 px) | FR-013, SC-005 (keyboard dialog, axe, 320 px) |

The two e2e flows were written after the implementation they cover (T016, T022): they did not
go through red. Each of the behaviors checked had first been checked by a red
integration or frontend test (T009, T010, T018, T019).

## Findings during implementation

- **Incomplete test fields**: adding `modifiableFields` to the detail made a test fail
  (`stats.test.tsx`) whose fixture builds a detail by hand; field added to the assignment
  detail fixtures (`coverage.test.tsx`, `admin-duplicates.test.tsx`, `teacher-request.test.tsx`,
  `stats.test.tsx`), without changing any expectation.
- **School times**: `formatTime` (existing) formats in the browser's time zone;
  the modification history formats explicitly in the school's time zone (`schoolClock`).
- **Assignment title**: various prefixes ("Garde" (Shift), "Retard" (Delay), "Absence", "Relève" (Handover),
  "Classe vide" (Empty class)); the existing prefix is kept, only the class name changes.

## Quickstart scenarios (T026)

| Scenario | Automated coverage | Left to do by hand |
|----------|------------------------|-------------------------|
| 1 — Time slot | `supervision-update.spec.ts` (time slot, traces); e2e "créneau modifié, vu du surveillant" (time slot modified, seen by the supervisor) (without reloading, history) | notification "Affectation modifiée — Garde — …" seen in the bell; audit log as `superadmin` |
| 2 — Invalid time slot | integration (end before start, beyond 7 days); frontend (message under the field) | — |
| 3 — Named conflict | integration (409, message, `details.conflict`, nothing modified); e2e (dialog alert) | reassignment then modification accepted |
| 4 — Class before attendance | integration ("En route" kept, QR); e2e (new class seen, attendance through its QR code) | notification highlighting the new class, seen in the bell |
| 5 — During attendance | integration (end only, past end refused, class refused); frontend (disabled fields, explanation) | — |
| 6 — Final statuses and roles | integration (`INVALID_TRANSITION`); permissions matrix (404 and logged refusal for each role) | — |
| 7 — Concurrency | integration (`409 STATE_CHANGED` without write) | two tabs: message and reload |
| 8 — Accessibility | test 004 at 320 px (keyboard dialog, axe, no horizontal scrolling) | real screen reader; visual check of focus |

## Transient failure (T023)

One run of `npm run -w backend test:integration` (2026-10-22, around 19:40, just after an
e2e session) gave **18 failures out of 623**; its output was not kept (filtered down to the
counters). Re-run alone immediately: **623 / 623**. No database was modified between the two
runs (only documentation files and an e2e test). To be monitored: the final verification
(T027) keeps the full output.

## Late-evening guard of the e2e flows (fixed)

In `e2e/coverage-class.spec.ts`, school time was read with
`Number(new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', … }).format(…))`: the French
format of an hour alone is "20 h", and `Number('20 h')` is NaN. The guards `hour >= 22` (flow of
004, existing) and `hour >= 20` (flow of spec 006) therefore **never** skipped the tests
(observed: the "spec 006" flow ran at 20:08 during the final verification — and passed,
its time slots still fitting within the day). Fixed by `schoolHour()` (`formatToParts`, value
of the hour alone). Inaccurate statement in `verification-003.md` ("skipped from 22:00 to midnight")
corrected.

## Final verification (T027) — 22 October 2026, branch `006-modification-affectation`

`npm run verify`: exit code 0; backend and frontend types: no errors. Full outputs
kept: the integration suite is **green** (the transient failure did not recur).

| Step | Start (T001) | Final |
|-------|---------------|-------|
| Lint (including `e2e/`) | no problems | no problems |
| Backend unit tests | 575 | **585 / 585** (31 suites) |
| Backend integration tests | 601 | **623 / 623** (43 suites) |
| Frontend tests (Vitest) | 248 | **262 / 262** (36 files) |
| `npm audit --audit-level=high` | no high vulnerabilities | no high vulnerabilities (21 moderate, unchanged) |
| End to end (6 profiles, 234 tests) | 143 passed (+1 intermittent failure fixed by PR #23) | **146 passed, 0 failed, 88 deliberately skipped** (39.3 min) |

End to end: the two "spec 006" flows (Chromium) passed at 20:08 and 20:09 (the late-evening
guard, inoperative at the time, did not skip them; time slots fitting within the day); modification dialog
at 320 px (test 004) without violation; flow A at 768 px green. The 88 skipped are
the tests reserved for one profile (assignments and spec 006: Chromium; 320 px; phones; V14;
`nouveau` account), each run in its own profile.

Fixed guard observed: at 20:43, `-g "spec 006"` (Chromium) → **2 skipped**.

GitHub CI: to be observed on the pull request.

## Fix: end time during attendance, shift ending after midnight (22 October 2026)

Finding: the CI of PR #26 (spec 007, unrelated to this code) failed at 23:07 school
time on `supervision-update.spec.ts` ("pendant la présence : seule l'heure de fin change,
jamais dans le passé" (during attendance: only the end time changes, never into the past)): a past end time was accepted (200 instead of 400 `INVALID_RANGE`).

Cause: during attendance, the end time entered was placed on the **date of the planned end**
(`coverage.service.ts`). For a shift ending after midnight, "22:37" became the next day
at 22:37: accepted, the shift was extended by about a day. The test, which creates a shift
ending 60 min later, only revealed it between 23:00 and 00:30 (school time); it passed
at any other time, hence the green verifications of 006.

Fix: `presenceEndAt` (`backend/src/coverage/domain/coverage-modification.ts`) places
the time entered at the occurrence closest to the planned end (within 12 h): "23:59" stays on the
previous day, "00:30" is after midnight, a time from the previous evening is no longer moved to the following
evening. Before attendance, nothing changes (the date is entered).

Tests: `test/unit/coverage-modification.spec.ts`, 4 fixed-time cases (written first, red:
function missing). Live reproduction at 23:15 (school time):
`supervision-update.spec.ts` without the fix → 1 failure out of 16; with the fix → 16 / 16.
