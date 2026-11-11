# Verification of feature 017 — communications centred on the administration

Branch `017-backend` (from `017-communications-administration`, merged with `master` at `b321c69`). Specification,
plan and tasks: [specs/017-communications-administration/](../../specs/017-communications-administration/).
Operation: [docs/parent-communications.md](../parent-communications.md).

## Automated checks (T073)

| Step                                                                | Result                                                                                                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                      | green (0 error, 0 warning)                                                                                                                                                                           |
| Type checks (backend, frontend)                                     | green                                                                                                                                                                                                |
| Backend unit tests                                                  | 1201 / 1201                                                                                                                                                                                          |
| Backend integration tests                                           | 1093 passed, 2 suites skipped (`assist-whisper-live`, `parent-communications-n8n-live`: need a live service), 524 s                                                                                  |
| Frontend tests (Vitest)                                             | 762 / 762 (an earlier run of the whole suite under load had `tests/admin/dashboard.test.tsx` fail to load; it passed alone and in the next full run; no file of that test changed)                   |
| `npm audit --audit-level=high`                                      | 30 low/moderate, no high or critical (unchanged)                                                                                                                                                     |
| End to end, `e2e/communications.spec.ts` (`chromium`, `mobile-320`) | 2 passed (full journey with four users on Chromium; 320 px screens without horizontal scroll nor axe violation)                                                                                      |
| Migrations `0025`, `0026`, `0027` on the development database       | applied with `prisma migrate dev`, no extra migration generated; `prisma migrate status`: up to date (27 migrations); the one 015 message of the development database is in one archive conversation |

New suites: `conversation-access.spec.ts` (40 cases, the 12 access rules), `parent-communication-workflow.spec.ts`
(rewritten), `communications-migration.spec.ts` (17: backfill, constraints, triggers, `down.sql`, re-application),
`communications-teacher|admin|validation|parent|archive|files|general.spec.ts` (59).

Not run: n8n against a real n8n (`parent-communications-n8n-live.spec.ts`, opt-in); migrations on a copy of
production data. The new journey runs on Chromium only (skipped on the other profiles by design: four users, simulated
microphone).

## Full end-to-end suite after the merge (11/11/2026)

`npm run test:e2e` on `master` at `b74f3af`, 7 profiles, 1 h 01: **208 passed, 4 failed, 236 skipped** (skips by
design: many scenarios run on Chromium or `mobile-320` only).

| Profile             | Passed | Failed | Skipped |
| ------------------- | ------ | ------ | ------- |
| `chromium`          | 44     | 0      | 20      |
| `firefox`           | 26     | 0      | 38      |
| `webkit`            | 25     | 1      | 38      |
| `iPhone 13`         | 27     | 1      | 36      |
| `iPhone 17 Pro Max` | 26     | 1      | 37      |
| `Pixel 7`           | 26     | 1      | 37      |
| `mobile-320`        | 34     | 0      | 30      |

None of the failures involves 017 (`e2e/communications.spec.ts` passed wherever it runs):

- `e2e/teacher-home.spec.ts` on `webkit`, `iPhone 13`, `iPhone 17 Pro Max` (all WebKit): « Enregistrer un message
  vocal » not found; the screen showed « Votre navigateur ne permet pas d’enregistrer un message vocal ». WebKit on
  Windows has no `MediaRecorder` in Playwright. Test defect predating 017 (feature 016; #107 changed neither this test
  nor the voice module). Fixed by installing the simulated recorder on WebKit, as `e2e/assist.spec.ts` already does;
  after the fix the test passes on these three profiles and on `chromium` (4 passed).
- `e2e/us2-process-request.spec.ts` « V8 — annulation possible avant acceptation seulement » on `Pixel 7`: the login
  page did not load within the 60 s test timeout, late in the run. Run again alone: passed (15 s). Flaky under load, no
  change.

## Tests first (constitution principle I)

- Seen failing before the code: `conversation-access.spec.ts`, `parent-communication-workflow.spec.ts`,
  `role-permissions.spec.ts`, `communications-migration.spec.ts` (for `0027`: run once more without the migration
  folder, it fails), the frontend `communications.test.tsx`, `parent-messages.test.tsx` and `admin-nav.test.tsx`.
- **Deviation**: the HTTP integration suites `communications-*.spec.ts` were written before the services but run
  for the first time after them. Mutation check: with message visibility always granted
  (`canSeeMessage` → `true`), `communications-validation`, `communications-archive` and `communications-files` fail
  (1, 2 and 1 cases); `communications-parent` does not (no pending message on the parent side in that suite).

## Changed expectations of existing tests

- Removed, replaced by the 017 suites: `parent-conversations.spec.ts`, the teacher draft, validation, parent space
  and discussions sections of `parent-communications.spec.ts` (the guardians and teacher classes section is kept),
  `parent-conversation-rules.spec.ts`, `parent-communication-discussions.spec.ts`, frontend `teacher.test.tsx`,
  `conversations.test.tsx`, `validation-parent.test.tsx`, `e2e/parent-communications.spec.ts`.
- Adapted to 017: `parent-communications-n8n(-live).spec.ts` (publication by direct sending, `senderName`, link to
  the conversation), `admin-routes-access.spec.ts` (new admin routes), `seed-demo.spec.ts` (children listed without
  teachers), `seed.spec.ts`, `role-admin-rename.spec.ts`, `admin-categories.spec.ts`, `authorization.spec.ts`
  (ADMIN default permission and super administrator permission count, D6), `home.test.tsx` (« Communications » in
  the super administrator's navigation), `NotificationCenter.test.tsx` (« À valider » address).

## Manual journeys (quickstart)

Covered by the end-to-end journey on Chromium: teacher voice report, administration inbox with inline playback and
answer, « Contacter le parent » submitted for validation, approval by another validator, parent reading signed
« L’école » and answering, answer in the inbox, internal conversation refused to the parent by address. Not done by
hand: closure and reopening in the browser (covered by integration and frontend tests), archive display (covered by
`communications-archive.spec.ts`).
