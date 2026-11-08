# Tasks: Section « Surveillance » — renommage et trois onglets pour l'administration

**Input**: Design documents from `specs/012-section-surveillance/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. Constitution principle I (TDD, non-negotiable): every test task is written and
**seen failing** before the implementation task that follows it. Existing tests that encode the former
layout (research R6) are changed first, in the same way.

**Organization**: tasks grouped by user story (spec.md). Order of the phases: US1 (rename), US5 (group
tabs unchanged, guards the reorganisation), US2, US3, US4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: user story of spec.md (US1…US5)
- Frontend tests mock `fetch`; the admin profile is `GET /api/coverage/availability` with `canManage: true`
  (see `frontend/tests/coverage/coverage.test.tsx` and `admin-queue.test.tsx` for the existing helpers).

## Path Conventions

`frontend/src`, `frontend/tests`, `e2e/`. No backend change.

---

## Phase 1: Setup

- [X] T001 Run `npm run lint`, `npm run -w frontend typecheck` and `npm run -w frontend test` on branch `012-section-surveillance` and record any test already red before the feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tab and filter keys and the former-key mapping, as a pure module used by every story.

- [X] T002 [P] Write failing unit tests in `frontend/tests/coverage/surveillance-tabs.test.ts` for `frontend/src/features/coverage/surveillanceTabs.ts` (research R4, data-model.md): constants `ADMIN_TAB_KEYS = ['absences-retards', 'affectation', 'suivi']` and `TRACKING_FILTERS = ['en-attente', 'prise-en-charge', 'terminee']` with default `'prise-en-charge'`; `TRACKING_SCOPE` maps `en-attente → 'pending'`, `prise-en-charge → 'active'`, `terminee → 'finished'`; `resolveLegacyTab(onglet, filtre)` returns `{ onglet, filtre }` with `presences → absences-retards`, `en-attente → affectation`, `doublons → affectation` (hash `doublons`), `equipe → affectation` (hash `equipe`), `en-cours → suivi + prise-en-charge`, `terminees → suivi + terminee`, keeps new keys and group keys (`mes-signalements`, `mes-presences`, `mes-affectations`, `historique`) unchanged, returns `null` mapping when nothing changes, and `trackingFilterOf(filtre)` falls back to `'prise-en-charge'` for missing or unknown values
- [X] T003 Implement `frontend/src/features/coverage/surveillanceTabs.ts` (pure, no React) to make T002 pass; doc comment pointing to research R4

**Checkpoint**: keys and mapping ready.

---

## Phase 3: User Story 1 — The section is called « Surveillance » (Priority: P1) 🎯 MVP

**Goal**: menu, page title, tab-list label and back links read « Surveillance » (« Supervision » in English); addresses unchanged.

**Independent Test**: as admin, teacher, supervisor: menu and title read « Surveillance »; back links of detail, new assignment and statistics pages too; `/gardes/presence?c=…` opens the presence page.

### Tests for User Story 1 (write first, see them fail) ⚠️

- [X] T004 [P] [US1] In `frontend/tests/app/home.test.tsx` (≈ l.85), change the super administrator's expected navigation to `['Tableau de bord', 'Mes demandes', 'Nouvelle demande', 'Surveillance', 'Restauration', 'Administrateur']` and add a test that the « Surveillance » link has `href="/gardes"` and that « Gardes » is no longer in the menu
- [X] T005 [P] [US1] In `frontend/tests/coverage/coverage.test.tsx`, add a test that `CoveragePage` shows the heading « Surveillance » (no « Gardes de classe ») and a tab list labelled « Surveillance », for an admin, a teacher and a supervisor profile
- [X] T006 [P] [US1] Add tests that the back links of `CoverageDetailPage`, `CreateCoveragePage` and `CoverageStatsPage` read « Surveillance » and point to `/gardes` — in the existing test files of these pages (find them with `grep -rln "CoverageDetailPage\|CreateCoveragePage\|CoverageStatsPage" frontend/tests`)

### Implementation for User Story 1

- [X] T007 [US1] Replace `t('Gardes')` by `t('Surveillance')` in `frontend/src/app/AppLayout.tsx` (menu item, ≈ l.91; update the comment ≈ l.78), `frontend/src/features/coverage/CoverageDetailPage.tsx` (≈ l.223), `frontend/src/features/coverage/CoverageStatsPage.tsx` (≈ l.185), `frontend/src/features/coverage/CreateCoveragePage.tsx` (≈ l.168); in `frontend/src/features/coverage/CoveragePage.tsx` replace the title `t('Gardes de classe')` and the tab-list `aria-label` `t('Gardes')` by `t('Surveillance')`, and rename the panel id `panneau-gardes` → `panneau-surveillance`; make T004–T006 pass
- [X] T008 [US1] In `frontend/src/i18n/en/coverage.ts` and `frontend/src/i18n/en/shared.ts`, add `'Surveillance': 'Supervision'` (once, no duplicate key in a file) and remove `'Gardes'` / `'Gardes de classe'` entries that are no longer used (check with `grep -rn "t('Gardes" frontend/src`); run `frontend/tests/i18n`

**Checkpoint**: the section is renamed everywhere; tabs still the former ones.

---

## Phase 4: User Story 5 — Teachers and supervisors keep their views (Priority: P1)

**Goal**: guard the group tabs and buttons before reorganising the admin tabs.

**Independent Test**: teacher, supervisor and teacher+supervisor accounts see the same tabs and buttons as before.

- [X] T009 [US5] In `frontend/tests/coverage/coverage.test.tsx`, add (or confirm existing) tests that: a teacher sees exactly `['Mes signalements', 'Mes présences']` and the « Signaler un retard ou une absence » button; a supervisor sees exactly `['Mes affectations', 'Historique']` and « Déclarer une classe vide »; neither sees « Nouvelle affectation » or « Statistiques »; group tab keys in the address (`?onglet=mes-presences`, `?onglet=historique`) select the matching tab. These must pass **before and after** the reorganisation (regression guard)

---

## Phase 5: User Story 2 — « Absences et retards » (Priority: P1)

**Goal**: three administration tabs in the right order; the first is the former « Présences ».

**Independent Test**: as admin, `/gardes` opens « Absences et retards » showing clock-ins, announced lateness and absences, state of the classes.

### Tests for User Story 2 (write first, see them fail) ⚠️

- [X] T010 [US2] In `frontend/tests/coverage/coverage.test.tsx` (≈ l.256–281) change the expected tabs of an admin also supervisor to `['Absences et retards', 'Affectation des surveillants', 'Suivi des interventions', 'Mes affectations', 'Historique']` with « Absences et retards » selected by default, and the « admin who is not a supervisor » test to wait for the tab « Absences et retards »
- [X] T011 [P] [US2] In `frontend/tests/coverage/admin-queue.test.tsx` (≈ l.99), change the expected admin tabs to `['Absences et retards', 'Affectation des surveillants', 'Suivi des interventions']` with the first selected; move the queue assertions of that test to `setup` on `/gardes?onglet=affectation` (the queue now lives there; order unchanged: expired takeover first)
- [X] T012 [P] [US2] In `frontend/tests/attendance/attendance.test.tsx` (≈ l.465), expect the admin tab « Absences et retards » instead of « Présences », and add a test that `/gardes?onglet=presences` selects « Absences et retards » and rewrites the address to `onglet=absences-retards`; content assertions of the follow-up tab stay unchanged (FR-004: no teacher shown absent without a report)

### Implementation for User Story 2

- [X] T013 [US2] In `frontend/src/features/coverage/CoveragePage.tsx`, replace `ADMIN_TABS` by three entries using the keys of `surveillanceTabs.ts`: `absences-retards` « Absences et retards » → `<AttendanceFollowUpTab />`; `affectation` « Affectation des surveillants » → placeholder rendering the former queue until T019; `suivi` « Suivi des interventions » → placeholder rendering `ManagedCoverageTab scope="active"` until T024; apply `resolveLegacyTab` on read and, when it returns a mapping, rewrite the address with `setParams(..., { replace: true })` (keep the hash); update the component doc comment; make T010–T012 pass (except assertions that need T019/T024, kept failing until then)

**Checkpoint**: three admin tabs; « Absences et retards » complete.

---

## Phase 6: User Story 3 — « Affectation des surveillants » (Priority: P1)

**Goal**: queue, new assignment, duplicates and team in one tab.

**Independent Test**: as admin on `?onglet=affectation`: « Nouvelle affectation » link, then `h2` « À assigner », « Doublons possibles », « Équipe » with their content.

### Tests for User Story 3 (write first, see them fail) ⚠️

- [X] T014 [P] [US3] Create tests in `frontend/tests/coverage/assignment-tab.test.tsx` for `/gardes?onglet=affectation` as admin: a link « Nouvelle affectation » to `/gardes/nouvelle` inside the tab panel; headings (level 2) « À assigner », « Doublons possibles », « Équipe » in this order with ids `a-assigner`, `doublons`, `equipe`; the queue calls `/api/coverage?mainStatus=PENDING` and keeps the server order; duplicates and team render their current content and empty messages (« Aucun doublon à trancher », « Aucun surveillant »)
- [X] T015 [P] [US3] In `frontend/tests/coverage/coverage.test.tsx` (or `direct-assignment.test.tsx`), add a test that for an admin the page header no longer contains « Nouvelle affectation » but still contains « Statistiques », and that « Déclarer une classe vide » / « Signaler un retard ou une absence » stay in the header when the admin is also supervisor / teacher
- [X] T016 [P] [US3] In `frontend/tests/coverage/admin-duplicates.test.tsx` (≈ l.180), switch the address to `/gardes?onglet=affectation` and add a test that the former `/gardes?onglet=doublons` still shows the duplicates (mapped to `affectation`, address rewritten); keep every decision assertion unchanged
- [X] T017 [P] [US3] Add a test (in the existing `CoverageDetailPage` test file) that the « possible duplicate » link of a detail page points to `/gardes?onglet=affectation#doublons`

### Implementation for User Story 3

- [X] T018 [US3] Create `frontend/src/features/coverage/AssignmentTab.tsx`: « Nouvelle affectation » button-link (`UserPlus` icon) to `/gardes/nouvelle`; sections with `h2` « À assigner » (`id="a-assigner"`) + `ManagedCoverageTab scope="pending"`, « Doublons possibles » (`id="doublons"`) + `MergeProposalsTab`, « Équipe » (`id="equipe"`) + `TeamTab`; all strings through `t()`; doc comment (research R2)
- [X] T019 [US3] In `frontend/src/features/coverage/CoveragePage.tsx`, render `<AssignmentTab />` for `affectation`; remove « Nouvelle affectation » from the header actions; after a mapped address with a hash (`#doublons`, `#equipe`), scroll the matching heading into view once rendered
- [X] T020 [US3] In `frontend/src/features/coverage/CoverageDetailPage.tsx` (≈ l.287), change the link `/gardes?onglet=doublons` to `/gardes?onglet=affectation#doublons`
- [X] T021 [US3] Add the English labels « Affectation des surveillants » → « Supervisor assignment », « À assigner » → « To assign », « Doublons possibles » → « Possible duplicates », « Absences et retards » → « Absences and lateness » in `frontend/src/i18n/en/coverage.ts` (check « Équipe » already exists); make T014–T017 and the dictionary test pass

**Checkpoint**: US1, US2, US3 complete.

---

## Phase 7: User Story 4 — « Suivi des interventions » (Priority: P2)

**Goal**: one tab, three filters, rows unchanged.

**Independent Test**: as admin on `?onglet=suivi`: switching filters calls the three former queries; reload keeps tab and filter; `?onglet=terminees` lands on « Terminée ».

### Tests for User Story 4 (write first, see them fail) ⚠️

- [X] T022 [P] [US4] Create tests in `frontend/tests/coverage/tracking-tab.test.tsx` for `/gardes?onglet=suivi` as admin: a group labelled « Filtrer les interventions » with buttons « En attente », « Prise en charge », « Terminée »; « Prise en charge » pressed by default (`aria-pressed="true"`) and the list calls `/api/coverage?mainStatus=ASSIGNED&mainStatus=IN_PROGRESS`; clicking « En attente » calls `/api/coverage?mainStatus=PENDING`, « Terminée » calls `/api/coverage?mainStatus=DONE&mainStatus=CANCELLED&mainStatus=UNFILLED`; each click sets `filtre=` in the address; `?onglet=suivi&filtre=terminee` opens with « Terminée » pressed; rows show precise statuses and alerts (e.g. « En route », « Relève demandée », « Non pourvue »); each filter shows its former empty message
- [X] T023 [P] [US4] Add tests (same file) that former addresses `?onglet=en-cours` and `?onglet=terminees` open « Suivi des interventions » with « Prise en charge » / « Terminée » pressed and the address rewritten to `onglet=suivi&filtre=…`

### Implementation for User Story 4

- [X] T024 [US4] Create `frontend/src/features/coverage/TrackingTab.tsx`: exclusive MUI `ToggleButtonGroup` (`aria-label` « Filtrer les interventions », wraps on small screens) bound to `?filtre=` via `useSearchParams` (`replace: true`), value from `trackingFilterOf`, rendering `ManagedCoverageTab scope={TRACKING_SCOPE[filtre]}`; render it for `suivi` in `frontend/src/features/coverage/CoveragePage.tsx`; doc comment (research R3)
- [X] T025 [US4] Add English labels « Suivi des interventions » → « Intervention tracking », « Filtrer les interventions » → « Filter interventions », « Prise en charge » → « Taken over », « Terminée » → « Finished » (check « En attente » exists) in `frontend/src/i18n/en/coverage.ts`; make T022, T023 and the remaining assertions of T010–T013 pass

**Checkpoint**: all five stories done.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T026 [P] Update `e2e/attendance-qr.spec.ts` (≈ l.103–104): admin opens `/gardes?onglet=absences-retards` and expects the tab « Absences et retards » selected (keep teacher steps on `mes-presences` unchanged)
- [X] T027 [P] Update `e2e/coverage-class.spec.ts`: ≈ l.183 the admin queue is in « Affectation des surveillants » (tab selected via `?onglet=affectation`); ≈ l.285 and l.493 `?onglet=en-cours` → `?onglet=suivi&filtre=prise-en-charge`; ≈ l.323 the « Nouvelle affectation » link is inside the « Affectation des surveillants » tab; status texts (« En attente », « En cours ») on rows stay unchanged
- [X] T028 [P] Update `e2e/a11y-responsive.spec.ts`: page title « Gardes de classe » → « Surveillance » (≈ l.171, 177, 178, 184, 201); ≈ l.184 `?onglet=en-attente` → `?onglet=affectation`; ≈ l.200 loop over `['absences-retards', 'affectation', 'suivi']` plus `suivi&filtre=en-attente` and `suivi&filtre=terminee`
- [X] T029 Create `e2e/surveillance.spec.ts` (Chromium): as `admin`, menu « Surveillance » → title « Surveillance », three tabs in order; « Absences et retards » sections visible; « Affectation des surveillants » shows « Nouvelle affectation » and the three headings; « Suivi des interventions »: each filter sets `filtre=` and reload keeps it; `/gardes?onglet=terminees` rewrites to `onglet=suivi&filtre=terminee`; `expectNoA11yViolations` on each tab; at 320 px no horizontal scroll on « Suivi des interventions »; as `enseignante`, tabs « Mes signalements », « Mes présences » and title « Surveillance »
- [X] T030 [P] Update user-facing docs mentioning the « Gardes » section and its tabs: `docs/superadmin-fonctionnalites.md` (« Gardes » row, ≈ l.39), `docs/ARCHITECTURE.md` (« The "Gardes" (Duties) menu… », ≈ l.787), README if it names the section
- [X] T031 Run every CI step in order — `npm run lint`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm audit --audit-level=high` — and the e2e specs `surveillance`, `coverage-class`, `attendance-qr`, `a11y-responsive` on Chromium; report the audit result in the PR body
- [ ] T032 Before merging, wait for « Contrôles qualité » to finish on the latest commit, then tick the four checks of `docs/procedure-fusion.md`; if a merge happens outside the procedure, add it to the register together with the pending #83 entry

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → US1 (3) → US5 (4) → US2 (5) → US3 (6) → US4 (7) → Polish (8).
- US2, US3 and US4 all edit `CoveragePage.tsx`: sequential. Their test tasks in separate files can be
  written in parallel.
- US1 does not depend on Phase 2 and can start right after Setup.

### Within each story

Tests first and seen failing → component → wiring in `CoveragePage.tsx` → English labels → checkpoint.

### Parallel Opportunities

- T004, T005, T006 together.
- T011 and T012 together (T010 shares `coverage.test.tsx` with T005/T009: sequential).
- T014, T015, T016, T017 together.
- T022 and T023 are in the same file: write them together.
- T026, T027, T028, T030 together.

---

## Parallel Example: User Story 3

```text
Task: "T014 [US3] assignment tab tests in frontend/tests/coverage/assignment-tab.test.tsx"
Task: "T016 [US3] former ?onglet=doublons in frontend/tests/coverage/admin-duplicates.test.tsx"
Task: "T017 [US3] detail page duplicate link test"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Setup → US1 (T004–T008): the section is called « Surveillance », nothing else changes.
2. Stop and validate: can be merged alone.

### Incremental Delivery

1. + Phase 2 + US5 guard → + US2 (three tabs, first one complete).
2. + US3 (assignment tab) → + US4 (tracking with filters).
3. Polish → e2e, docs, full CI.

## Notes

- No backend file changes in this feature: if one seems needed, stop and revisit the plan.
- Never delete an assertion that still describes valid behaviour; change only those naming the former
  tabs or the « Gardes » label (research R6), and list them in the PR as the documented exception.
- Status labels on rows (« En attente », « En cours », « Terminée »…) are not tab names: their assertions
  stay unchanged.

## Implementation notes (2026-11-08)

- **T002/T003**: `resolveLegacyTab(onglet)` takes only the tab key (the former keys never carried a
  filter); it returns `{ onglet, filtre, hash }` or `null`.
- **T014/T022**: the assignment and tracking tests share their helpers, so they live in one file,
  `frontend/tests/coverage/surveillance-page.test.tsx`, instead of `assignment-tab.test.tsx` and
  `tracking-tab.test.tsx`.
- **T013/T021/T025**: English labels reuse existing entries where they already existed, to avoid one key
  with two translations: « Prise en charge » → « Takeover », « Terminée » → « Done », « Doublons possibles »,
  « Équipe », « En attente », « Nouvelle affectation » (contracts/ui.md listed « Taken over », « Finished »).
- **T012**: the « Absences et retards » content assertion checks the selected tab only; the content of
  `AttendanceFollowUpTab` (unchanged) is already covered by its own tests in the same file.
- **E2E environment (pre-existing, not caused by 012)**: on Windows, each `npm run test:e2e` run leaves an
  orphaned `postgres.exe` child of the disposable e2e database holding port 55434, so the next run fails with
  « Process from config.webServer was not able to start ». Workaround used: stop only `embedded-postgres`
  processes whose parent process is gone (the dev database on 5433 is a different process tree).
- **T031 (user decision, 2026-11-08)**: no backend file changed, so the local run was shortened to the steps
  that cover the change: lint, frontend typecheck, frontend tests (552), `npm audit` (no high or critical).
  Backend typecheck and unit tests (842) had already passed in the stopped full run; backend integration
  tests run in the GitHub CI on the pull request (check 1 of `docs/procedure-fusion.md`).
