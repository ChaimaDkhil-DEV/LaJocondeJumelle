# Tasks: Déclaration d'une classe vide par QR code, caméra dans l'application

**Input**: Design documents from `specs/013-declaration-classe-vide-qr/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. Constitution principle I (TDD, non-negotiable): every test task is written and
**seen failing** before the implementation task that follows it.

**Organization**: tasks grouped by user story (spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: user story of spec.md (US1…US4)
- Page tests: `frontend/tests/coverage/empty-class.test.tsx`, helper `setup(path, declaration)` mocks `fetch`
  (`/api/coverage/classes`, `/api/coverage/teachers`, `POST /api/coverage/empty-class`) and renders
  `EmptyClassPage` at `/gardes/classe-vide`. **QR tokens need a UUID class id** (`c1.<uuid>.<version>.<sig>`):
  add a class with a UUID id to `CLASSES` for the scan tests, e.g.
  `{ id: '0a1b2c3d-1111-4222-8333-444455556666', name: 'CE1 Vert', … }` and the token
  `c1.0a1b2c3d-1111-4222-8333-444455556666.1.c2ln`, link `http://localhost:5173/gardes/presence?c=<token>`.
- In jsdom there is no camera: `QrScannerDialog` shows its « camera not available » message and the manual field
  « Lien ou code du QR code » + « Continuer », which calls the same `onToken` as a camera read (research R5).

## Path Conventions

`frontend/src`, `frontend/tests`, `e2e/`. No backend change.

---

## Phase 1: Setup

- [X] T001 Run `npm run lint`, `npm run -w frontend typecheck` and `npm run -w frontend test` on branch `013-declaration-classe-vide-qr` and record any test already red before the feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: read the class id from a QR token (research R2).

- [X] T002 [P] Add failing tests in `frontend/tests/attendance/qr-token.test.ts` for `classIdFromToken(token: string): string | null` exported by `frontend/src/features/attendance/qrToken.ts`: returns the lower-cased UUID of `c1.<uuid>.<version>.<signature>` (e.g. `c1.0A1B2C3D-1111-4222-8333-444455556666.1.sig` → `0a1b2c3d-1111-4222-8333-444455556666`); returns `null` for a text that is not a class token (`'bonjour'`, `'c1.pas-un-uuid.1.sig'`, `'c2.<uuid>.1.sig'`, empty string); it accepts only what `tokenFromScan` returns, never a link (the page calls `tokenFromScan` first)
- [X] T003 Implement `classIdFromToken` in `frontend/src/features/attendance/qrToken.ts` with a doc comment: convenience only, the server re-checks signature, version and class (`backend/src/coverage/domain/qr-token.ts`); make T002 pass

**Checkpoint**: class id readable from a token.

---

## Phase 3: User Story 1 — Declare by scanning, without leaving the app (Priority: P1) 🎯 MVP

**Goal**: « Scanner le QR code de la classe » first on the page; a read QR code sends the declaration at once; result names the class.

**Independent Test**: as a supervisor, open the scan window, give a class QR link; one `POST /api/coverage/empty-class` with `{ classId: <uuid of the token>, teacherId: null, qrToken: <token> }`; result shows the class name and « Scanner une autre classe ».

### Tests for User Story 1 (write first, see them fail) ⚠️

- [X] T004 [US1] In `frontend/tests/coverage/empty-class.test.tsx`, add a `describe('Déclarer par QR code (013)')` with tests: (a) the first button of the page (before the form's « Déclarer la classe vide ») is « Scanner le QR code de la classe », with the text « La déclaration part dès que le QR code de la porte est lu. »; (b) clicking it opens the dialog « Scanner le QR code de la classe »; pasting the QR link of the UUID class in « Lien ou code du QR code » then « Continuer » closes the dialog and sends exactly one `POST /api/coverage/empty-class` whose body has `classId` = the token's UUID, `teacherId: null`, `qrToken` = the token, and a UUID `clientId`; no other field of the form is needed; (c) the result shows a level-2 heading with the class name (« CE1 Vert »), the CREATED outcome message (existing `outcomeMessage`), « Voir l'affectation » and « Scanner une autre classe »; (d) « Scanner une autre classe » opens the dialog again and the next declaration uses a new `clientId`; (e) while the request is pending (delayed response), « Déclaration de la classe… » is shown

### Implementation for User Story 1

- [X] T005 [US1] In `frontend/src/features/coverage/EmptyClassPage.tsx`, add above the form a scan block: contained large button « Scanner le QR code de la classe » (`QrCode` icon from lucide-react) and the text « La déclaration part dès que le QR code de la porte est lu. », then a separator « ou » before the existing form (unchanged); state `scanning` opens `QrScannerDialog` (from `../attendance/QrScannerDialog`)
- [X] T006 [US1] In `frontend/src/features/coverage/EmptyClassPage.tsx`, handle `onToken(token)`: close the dialog, `classId = classIdFromToken(token)`, class name from `classes.data` (fallback: empty), call `declare.mutate({ clientId: clientId.current, classId, teacherId: null, qrToken: token })` and on success store the result with the class name; while `declare.isPending` from a scan, render `LoadingState` « Déclaration de la classe… »; doc comment of the component updated (two choices, 013)
- [X] T007 [US1] In the result view of `frontend/src/features/coverage/EmptyClassPage.tsx`, add a level-2 heading with the class name above the outcome alert, and a « Scanner une autre classe » button that renews `clientId`, resets the mutation and reopens the dialog; keep « Voir l'affectation » and « Déclarer une autre classe » unchanged
- [X] T008 [US1] Generalise the doc comment of `frontend/src/features/attendance/QrScannerDialog.tsx` (it no longer only « opens the confirmation page »: the caller decides what a read does); no behaviour change
- [X] T009 [US1] Add English labels in `frontend/src/i18n/en/coverage.ts` (check each key is not already present): « La déclaration part dès que le QR code de la porte est lu. » → « The declaration is sent as soon as the door QR code is read. », « ou » → « or », « Déclaration de la classe… » → « Declaring the class… », « Scanner une autre classe » → « Scan another class » (« Scanner le QR code de la classe » already exists in `frontend/src/i18n/en/attendance.ts`: do not duplicate it); run `frontend/tests/i18n`; make T004 pass

**Checkpoint**: US1 works with a pasted link in tests and with the camera on a phone.

---

## Phase 4: User Story 2 — Without a camera, or by preference: manual entry and form (Priority: P1)

**Goal**: the manual entry and the unchanged form keep a complete path.

**Independent Test**: no camera (jsdom); manual entry declares; form declares exactly as before; closing the dialog sends nothing.

### Tests for User Story 2 (write first, see them fail) ⚠️

- [X] T010 [US2] In `frontend/tests/coverage/empty-class.test.tsx`: (a) opening the dialog in jsdom shows the camera-unavailable message and the manual field (existing dialog messages); (b) closing the dialog with « Fermer » sends no `POST` and the form is still there; (c) every existing form test still passes unchanged (do not edit them); (d) with `?classe=k2&c=JETON` (phone-camera path), the form still preselects the class and sends the QR with the form, and the scan button is still shown

### Implementation for User Story 2

- [X] T011 [US2] Adjust `frontend/src/features/coverage/EmptyClassPage.tsx` only if T010 fails (closing the dialog must not send; the `?c=`/`?classe=` behaviour of the form stays as it is); make T010 pass

**Checkpoint**: US1 and US2 done.

---

## Phase 5: User Story 3 — Wrong or unusable QR codes are refused clearly (Priority: P2)

**Goal**: refused QR codes create nothing and say why.

**Independent Test**: not-a-class code ignored; `QR_INVALID` and `CLASS_INACTIVE` refusals shown; one request per scanning session.

### Tests for User Story 3 (write first, see them fail) ⚠️

- [X] T012 [US3] In `frontend/tests/coverage/empty-class.test.tsx`: (a) pasting a text that is not a class QR code shows « Ce lien ou ce code n'est pas celui d'un QR code de classe. » in the dialog and sends nothing; (b) server answer `422 { error: { code: 'QR_INVALID', message: 'Ce QR code n’est pas valide ou a été révoqué. Demandez le QR code à jour.' } }`: the message is shown in an alert (`role="alert"`) above the scan button, no result view, the scan button and the form remain usable; (c) server answer `400 CLASS_INACTIVE` with « Cette classe est introuvable ou désactivée. »: same; (d) after a refusal, a new scan sends a new request (the dialog was closed after the first read: one request per scanning session)

### Implementation for User Story 3

- [X] T013 [US3] In `frontend/src/features/coverage/EmptyClassPage.tsx`, show the scan refusal (`declare.error` from a scan, `ApiError.message`, fallback « Déclaration impossible. Réessayez. ») in an `Alert severity="error"` placed above the scan button, distinct from the form's error display; clear it when a new scan starts; make T012 pass

**Checkpoint**: US1–US3 done.

---

## Phase 6: User Story 4 — The phone-camera path stays as it is (Priority: P2)

**Goal**: opening a class QR link outside the scan button declares nothing by itself.

**Independent Test**: `/gardes/presence?c=…` page unchanged; no `POST /api/coverage/empty-class` before the click.

- [X] T014 [P] [US4] In `frontend/tests/coverage/coverage.test.tsx` (« Page du QR code de la classe », next to « classe scannée sans garde : un seul geste déclare la classe vide… », ≈ l.404), add a test that opening `/gardes/presence?c=<token>` for a class without an assignment shows the « Déclarer cette classe vide » button and the « Préciser l'enseignant » link to `/gardes/classe-vide?classe=…&c=…`, and sends **no** `POST /api/coverage/empty-class` before the button is clicked (regression guard: must pass before and after; no change to `frontend/src/features/coverage/PresencePage.tsx`)

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T015 Create `e2e/empty-class-qr.spec.ts` (Chromium): as `surveillant`, open « Surveillance » → « Déclarer une classe vide »; the scan button comes first; `expectNoA11yViolations`; click it, paste the QR link of a seeded class (get it as `superadmin` like `qrLink` in `e2e/attendance-qr.spec.ts`) in « Lien ou code du QR code », « Continuer »; expect the result heading with the class name and the outcome message; `expectNoA11yViolations`; at 320 px no horizontal scroll on the page; then as `admin`, the assignment of that class is listed in « Suivi des interventions » (« Prise en charge »); finally cancel the created assignment through the API (as in `cancelOpenCoverages` of `e2e/coverage-class.spec.ts`) so shared data is left clean
- [X] T016 [P] Update `docs/superadmin-fonctionnalites.md` where the empty-class declaration is described (grep « classe vide ») to mention the in-app QR scan with automatic send and the unchanged form and phone-camera path
- [X] T017 Run lint, frontend typecheck, frontend tests, `npm audit --audit-level=high`, and the e2e specs `empty-class-qr`, `attendance-qr`, `coverage-class` on Chromium; before each e2e run, stop orphaned `embedded-postgres` processes whose parent is gone (port 55434, see memory « E2E long-run pitfalls »); backend suites run in the pull request's CI (no backend change)
- [ ] T018 Check by hand on a phone over HTTPS (online demo): the camera opens inside the page and a printed class QR code is declared at once (quickstart scenario 2); record the result in the PR description
- [ ] T019 Before merging, wait for « Contrôles qualité » to finish on the latest commit, then tick the four checks of `docs/procedure-fusion.md`; if a merge happens outside the procedure, add it to the register together with the pending #83 entry

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (1) → Foundational (2) → US1 (3) → US2 (4) → US3 (5) → Polish (7).
- US4 (6) is independent (guard test on an unchanged page) and can run any time after Setup.
- US1, US2 and US3 edit the same files (`EmptyClassPage.tsx`, `empty-class.test.tsx`): sequential.

### Within each story

Tests first and seen failing → implementation → English labels → checkpoint.

### Parallel Opportunities

- T002 and T014 together (different files: `qr-token.test.ts`, `coverage.test.tsx`).
- T016 alongside T015.

---

## Parallel Example: Foundational + guard

```text
Task: "T002 classIdFromToken tests in frontend/tests/attendance/qr-token.test.ts"
Task: "T014 [US4] presence page guard test"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Setup → Foundational → US1: the scan button sends the declaration and shows the class.
2. Stop and validate on a phone over HTTPS.

### Incremental Delivery

1. + US2 (manual entry and form guaranteed) → + US3 (clear refusals) → + US4 guard.
2. Polish → e2e, docs, checks, manual phone check.

## Notes

- No backend file changes: if one seems needed, stop and revisit the plan.
- `QrScannerDialog` behaviour must not change (teachers' clock-in uses it): only its doc comment.
- A scan sends `teacherId: null`; with an open teacher request for the class the server answers
  `MERGE_PROPOSED` (current rule): the existing outcome message covers it.

## Implementation notes (2026-11-08)

- **T010/T011 (US2)**: the four US2 tests passed as soon as they were written: the behaviours (camera-unavailable
  message and manual field, closing sends nothing, form and `?c=` path unchanged) come from the reused
  `QrScannerDialog` and from the US1 wiring. They were not seen failing; they stay as regression tests. T011 needed
  no code.
- **T012**: MUI `Alert` has `role="alert"` by default, including the scanner's « camera not available » message;
  the test for the cleared refusal checks the refusal text, not any alert.
- **T014**: the existing test « classe scannée sans garde : un seul geste… » already checked that nothing is sent
  before the click; the new guard adds the « Préciser l'enseignant » link and a short wait.
- **T015**: the two seeded classes are used by other e2e specs, so `e2e/empty-class-qr.spec.ts` creates its own
  class (unique name), then cancels the created assignment and deactivates the class.
- **E2E environment**: orphaned `embedded-postgres` processes (port 55434) were stopped before and after each run
  (pre-existing issue, see feature 012 notes).
