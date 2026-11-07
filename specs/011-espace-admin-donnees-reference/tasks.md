# Tasks: Espace Administrateur pour l'ADMIN — données de référence et liste des employés

**Input**: Design documents from `specs/011-espace-admin-donnees-reference/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. Constitution principle I (TDD, non-negotiable): every test task is written and
**seen failing** before the implementation task that follows it. Existing tests that encode the old
rule (research R5) are changed first, in the same way.

**Organization**: tasks are grouped by user story (spec.md) so that each story can be delivered and
tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: user story of spec.md (US1…US4)
- Test accounts (test seed `seedDemo`): `superadmin` (SUPER_ADMIN), `admin` (ADMIN), `surveillant`,
  `enseignante` (EMPLOYEE)

## Path Conventions

Web application: `backend/src`, `backend/test/{unit,integration}`, `frontend/src`, `frontend/tests`,
`e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirm a green starting point; no new dependency, no migration.

- [X] T001 Run `npm run lint`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test` on branch `011-espace-admin-donnees-reference` and record any test that is already red before the feature, so that it is not blamed on 011

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the role rule, the server guard and the role-aware « Administrateur » layout used by
every story.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### Tests first

- [X] T002 [P] Add failing unit tests for `canUseAdministrationSpace` in `backend/test/unit/authorization.spec.ts`: true for active `SUPER_ADMIN` and active `ADMIN`; false for `EMPLOYEE` (active or not) and for inactive `ADMIN` / `SUPER_ADMIN` (rule: `user.active && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')`)
- [X] T003 [P] Add failing frontend tests in `frontend/tests/admin/admin-pages.test.tsx` (describe « Accès à l'administration »), keeping the existing test « refuse l'espace Administrateur à un admin… » on `/admin/comptes` (still valid): (a) an `ADMIN` opening `/admin` lands on « Étages » and the section nav (`Sections de l'espace Administrateur`) contains exactly the links Étages, Niveaux, Classes, Élèves, Employés; (b) the super administrator's nav still contains exactly today's sections (Suivi des gardes, Comptes, Catégories, Consignes, Groupes, Étages, Niveaux, Classes, Élèves, Réglages, Journal d'audit) and no « Employés »; (c) an `EMPLOYEE` opening `/admin/etages` sees « Accès réservé à l'administration. » and no `/api/admin` call is made; (d) an `ADMIN` opening `/admin/journal`, `/admin/suivi`, `/admin/groupes`, `/admin/reglages` sees « Accès réservé au super administrateur. » and no `/api/admin` call is made
- [X] T004 [P] Add a failing test in `frontend/tests/app/home.test.tsx` (or the existing layout test that covers the menu) that the « Administrateur » menu entry is shown to `ADMIN` and `SUPER_ADMIN`, hidden for `EMPLOYEE`, and that « Restauration » is unchanged

### Implementation

- [X] T005 Add `canUseAdministrationSpace(user: Pick<PolicyUser, 'role' | 'active'>)` in `backend/src/common/authorization.ts` with a doc comment (research R1); make T002 pass
- [X] T006 Create `AdministrationGuard` in `backend/src/audit/administration.guard.ts`, copied from `backend/src/audit/super-admin.guard.ts`: allows `canUseAdministrationSpace`, otherwise logs `ACCESS_DENIED` with `details: { reason: 'NOT_ADMINISTRATION', route: requestPath(req), method: req.method, channel: 'http' }` and throws `AppException('FORBIDDEN')`
- [X] T007 [P] Create `frontend/src/features/admin/access.ts` exporting `canUseAdministrationSpace(me)` (role `ADMIN` or `SUPER_ADMIN`) and `isSuperAdmin(me)`, used by the menu and the layout
- [X] T008 Update `frontend/src/app/AppLayout.tsx`: show `ADMIN_ITEM` when `canUseAdministrationSpace(me.data)`; update the comment of `ADMIN_ITEM`; make T004 pass
- [X] T009 Update `frontend/src/features/admin/AdminLayout.tsx`: each entry of `SECTIONS` gets `roles: Role[]` per [contracts/ui.md](contracts/ui.md) (`employes` → `['ADMIN']` only, reference sections → both, others → `['SUPER_ADMIN']`); let in `canUseAdministrationSpace`, otherwise `ErrorState` « Accès réservé à l'administration. »; render only the sections of the current role; header description lists only those sections (two `t()` strings, one per role); update the doc comment
- [X] T010 Update `frontend/src/features/admin/adminRoutes.tsx`: add a `SuperAdminOnly` element (shows `ErrorState` « Accès réservé au super administrateur. » for non super administrators without mounting its child) and wrap `comptes`, `categories`, `consignes`, `reglages`, `journal`, `suivi`, `groupes`, `tableau-de-bord`; make the index route redirect to `comptes` (super administrator) or `etages` (`ADMIN`); update the comment « Routes /admin/* (super administrateur uniquement) »; make T003 pass except the « Employés » link (done in US3) — mark that assertion `it.todo` until T029 if needed, never delete it

**Checkpoint**: rule, guard and layout ready; no server route uses the new guard yet.

---

## Phase 3: User Story 1 — Manage floors, levels and classes (Priority: P1) 🎯 MVP

**Goal**: an active `ADMIN` manages floors, levels and classes, including class QR codes, exactly
like the super administrator; dashboard, export and groups stay reserved.

**Independent Test**: as `admin`, create/edit/deactivate a floor, a level and a class, print then
revoke a class QR code; the old QR is refused; the audit log shows `admin` as author.

### Tests for User Story 1 (write first, see them fail) ⚠️

- [X] T011 [P] [US1] In `backend/test/integration/admin-floors.spec.ts` (refusal block ≈ l.150–160): `admin` now gets 200/201 on `GET`/`POST /api/admin/floors` and `PATCH /api/admin/floors/:id`; `surveillant` and `enseignante` still get 403 with an `ACCESS_DENIED` entry `reason: 'NOT_ADMINISTRATION'`; a floor created by `admin` has an audit entry with `actorId` = admin's id; update the file header comment
- [X] T012 [P] [US1] In `backend/test/integration/admin-levels.spec.ts` (≈ l.141): same change for `GET`/`POST /api/admin/levels` and `PATCH /api/admin/levels/:id` (`admin` allowed and audited as author; other employees 403 `NOT_ADMINISTRATION`)
- [X] T013 [P] [US1] In `backend/test/integration/coverage.spec.ts` test 13 (≈ l.906): split the loop — for `admin`, `GET /api/admin/coverage/classes`, `GET …/classes/:id/qr` and `POST …/classes/:id/qr/revoke` succeed, the revoke bumps the QR version and the previous QR link is then refused at check-in, and `dashboard`, `export.csv`, `groups` stay 403 with `reason: 'NOT_SUPER_ADMIN'`; for `surveillant` every one of these paths stays 403; add `POST` and `PATCH /api/admin/coverage/classes` by `admin` (created, edited, audited with `admin` as actor)
- [X] T014 [US1] Rewrite `backend/test/integration/admin-routes-access.spec.ts` as a table: constant `ADMIN_ALLOWED` = the 15 method+path pairs of [contracts/http-api.md](contracts/http-api.md) « Routes whose access widens » plus `GET /api/admin/employees`; tests: (1) route count ≥ 30 (kept); (2) `enseignante` gets 403 on every `/admin/*` route; (3) `admin` gets 403 on every route **not** in `ADMIN_ALLOWED`; (4) `admin` is never 401/403 on the `GET` routes of `ADMIN_ALLOWED`; (5) every entry of `ADMIN_ALLOWED` exists among the discovered routes (the list cannot go stale); (6) 401 without session (kept); (7) super administrator passes on every `GET` (kept); update the describe comment (« réservées au super administrateur, sauf les données de référence… »). Until US2/US3 are done, the students and employees entries fail: expected

### Implementation for User Story 1

- [X] T015 [US1] In `backend/src/coverage/coverage-admin.controller.ts`, switch `FloorsAdminController` from `SuperAdminGuard` to `AdministrationGuard` and update its doc comment (« Étages : administration (admin et super administrateur) »)
- [X] T016 [US1] Create `backend/src/coverage/classes-admin.controller.ts`: `@Controller('admin/coverage/classes')`, `@UseGuards(AdministrationGuard)`, moving unchanged from `CoverageAdminController` the handlers `classes` (`GET`), `createClass` (`POST`), `updateClass` (`PATCH :id`), `qr` (`GET :id/qr`), `revokeQr` (`POST :id/qr/revoke`), all delegating to `CoverageAdminService`; remove them from `CoverageAdminController` (which keeps `dashboard`, `export.csv`, `groups*` and `SuperAdminGuard`)
- [X] T017 [US1] Register `ClassesAdminController` and `AdministrationGuard` in `backend/src/coverage/coverage.module.ts` (and `AuditService` if not already available); make T011, T013 and the floors/classes rows of T014 pass
- [X] T018 [US1] In `backend/src/students/students.controller.ts` the levels routes share the controller with students: switch the controller to `AdministrationGuard` (covers levels for US1 and students for US2), update its doc comment, register the guard in `backend/src/students/students.module.ts`; make T012 pass
- [X] T019 [P] [US1] Check that `frontend/tests/admin/floors.test.tsx` and `frontend/tests/admin/levels.test.tsx` and the classes page tests pass when rendered for an `ADMIN` user (add one `ADMIN` case per page if the setup takes a user): the pages themselves are unchanged

**Checkpoint**: US1 works for `admin` through the UI (Étages, Niveaux, Classes) and the API.

---

## Phase 4: User Story 2 — Manage students (Priority: P1)

**Goal**: an active `ADMIN` creates and edits students and imports them from CSV (check mode, all or
nothing).

**Independent Test**: as `admin`, create and edit a student, import a CSV in check mode then for
real; check the result and the audit authorship.

### Tests for User Story 2 (write first, see them fail) ⚠️

- [X] T020 [P] [US2] In `backend/test/integration/csv-imports.spec.ts` (≈ l.427 `it.each(['admin', 'surveillant', 'enseignante'])('%s ne peut pas importer')`): remove `admin` from the refused list; add a test where `admin` runs `POST /api/admin/students/import` with `dryRun: true` (nothing created, errors by line) then `dryRun: false` (all created, audit entry with `actorId` = admin's id); `surveillant` / `enseignante` stay 403
- [X] T021 [P] [US2] Add to `backend/test/integration/admin-levels.spec.ts` (or a new `backend/test/integration/admin-students.spec.ts` if the students CRUD has no integration file yet — check with `grep -rln "/api/admin/students'" backend/test`) tests that `admin` gets 200/201 on `GET`/`POST /api/admin/students` and `PATCH /api/admin/students/:id` with the same validation errors as the super administrator, and that `enseignante` gets 403 `NOT_ADMINISTRATION`
- [X] T022 [P] [US2] Check `frontend/tests/admin/students.test.tsx` and `frontend/tests/admin/csv-import.test.tsx` with an `ADMIN` user (add one `ADMIN` case if the setup takes a user)

### Implementation for User Story 2

- [X] T023 [US2] Confirm T018's guard switch covers `GET/POST /api/admin/students`, `PATCH /api/admin/students/:id` and `POST /api/admin/students/import` in `backend/src/students/students.controller.ts` (no service change: `StudentsService` and `StudentsImportService` audit with `ctx.actor`); make T020, T021 and the students rows of T014 pass

**Checkpoint**: US1 and US2 work independently for `admin`.

---

## Phase 5: User Story 4 — Sections that stay reserved (Priority: P1)

**Goal**: opening reference data opens nothing else; `EMPLOYEE` still has no access; nothing changes
for the super administrator.

**Independent Test**: as `admin` and `enseignante`, call each reserved section and action; refused
(403), logged, no resource existence revealed.

### Tests for User Story 4 (write first, see them fail) ⚠️

- [X] T024 [P] [US4] In `backend/test/integration/admin-users.spec.ts` (≈ l.139), keep the refusal of `admin` on `/api/admin/users*` (`reason: 'NOT_SUPER_ADMIN'`) and add: an `admin` demoted to `EMPLOYEE` by the super administrator while her session is open gets 403 `NOT_ADMINISTRATION` on her next `POST /api/admin/floors`; deactivated, she gets 401
- [X] T025 [P] [US4] Update `e2e/us8-admin.spec.ts` (V16, ≈ l.89–97): `admin` now **sees** the « Administrateur » menu entry; `/admin/comptes` still shows « Accès réservé au super administrateur. »; `GET /api/admin/users` still returns 403; update the comment « L'admin n'a ni menu ni accès »

### Implementation for User Story 4

- [X] T026 [US4] Review that `T014` (table), `T003` (d) and `T024` pass with no change to `SuperAdminGuard` users (`admin-users`, `admin-categories`, `admin-guidelines`, `admin-settings`, `admin-audit`, `dashboard`, `coverage-admin` controllers); fix any route that leaked

**Checkpoint**: the rights matrix of [data-model.md](data-model.md) holds for every `/api/admin` route.

---

## Phase 6: User Story 3 — See the employee list (Priority: P2)

**Goal**: an active `ADMIN` sees every account with exactly six fields and no account action.

**Independent Test**: as `admin`, open « Employés »: columns Nom, Fonction, Rôle, Groupes, Étage,
Statut; no action; direct calls to account actions refused and logged.

### Tests for User Story 3 (write first, see them fail) ⚠️

- [X] T027 [P] [US3] Create `backend/test/integration/admin-employees.spec.ts`: `GET /api/admin/employees` as `admin` and as `superadmin` returns 200, every account (active and inactive, super administrator included), sorted by `displayName`, each item with **exactly** the keys `id`, `displayName`, `jobTitle`, `role`, `active`, `groups`, `floor` (no `username`, `mustChangePassword`, `createdAt`, `recipientCategories`); `groups` lists only **active** employee groups as `{ id, name }` sorted by name (deactivate a group in the test to check); `floor` is `{ id, name }` or `null`; `jobTitle` is `null` when empty; `enseignante` gets 403 with `ACCESS_DENIED` `reason: 'NOT_ADMINISTRATION'`; no session → 401
- [X] T028 [P] [US3] Create `frontend/tests/admin/employees-list.test.tsx` for `/admin/employes` as `ADMIN` (per [contracts/ui.md](contracts/ui.md)): heading « Employés »; list labelled « Liste des employés »; columns Nom, Fonction, Rôle (label from `ROLE_LABELS`), Groupes (comma-separated, « — » if none), Étage (« — » if none), Statut (« Actif » / « Inactif » as text); **no** button or link acting on an account; loading, error with retry, empty state « Aucun employé. »; no axe violation (vitest-axe); calls only `/api/admin/employees`

### Implementation for User Story 3

- [X] T029 [US3] Add `listEmployees(): Promise<EmployeeListItem[]>` and the exported type `EmployeeListItem` in `backend/src/users/users.service.ts`: one Prisma query with `select` limited to `id`, `displayName`, `jobTitle`, `role`, `active`, `floor: { select: { id, name } }`, `groupMemberships` filtered on `group.active = true` (relation `EmployeeGroupMember` → `EmployeeGroup`), `orderBy: { displayName: 'asc' }`; map groups to `{ id, name }` sorted by name
- [X] T030 [US3] Create `backend/src/users/employees.controller.ts`: `@Controller('admin/employees')`, `@UseGuards(AdministrationGuard)`, `@Get()` → `UsersService.listEmployees()`; register it and `AdministrationGuard` in `backend/src/users/users.module.ts`; make T027 and the employees row of T014 pass
- [X] T031 [P] [US3] Add type `EmployeeListItem` in `frontend/src/api/types.ts` and hook `useEmployees()` (query key `['admin', 'employees']`, `apiFetch<EmployeeListItem[]>('/api/admin/employees')`) in `frontend/src/features/admin/api.ts`
- [X] T032 [US3] Create `frontend/src/features/admin/EmployeesAdminPage.tsx` per [contracts/ui.md](contracts/ui.md): MUI table on ≥ 600 px, one card per employee below (usable at 320 px, no horizontal scroll), `LoadingState`, `ErrorState` with retry, `EmptyState`, all strings through `t()`; no action
- [X] T033 [US3] Add the route `{ path: 'employes', element: <EmployeesAdminPage /> }` in `frontend/src/features/admin/adminRoutes.tsx` and the « Employés » section (`roles: ['ADMIN']`, icon `Contact` from lucide-react) in `frontend/src/features/admin/AdminLayout.tsx`; make T028 and the « Employés » assertion of T003 pass (remove the `it.todo` if T010 added one)

**Checkpoint**: all four stories work independently.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T034 [P] Create `e2e/admin-reference-admin.spec.ts`: as `admin`, menu « Administrateur » → lands on « Étages »; create a floor, a level, a class on that floor and a student; revoke the class QR; open « Employés » (six columns, no action); `expectNoA11yViolations` on Étages, Classes, Élèves, Employés; at 320 px width « Employés » has no horizontal scroll; `/admin/journal` shows « Accès réservé au super administrateur. »; then as `superadmin`, the audit log lists the floor creation with `admin` as author
- [X] T035 [P] Update the user documentation of the « Administrateur » space for the `ADMIN` role in `docs/` (find the page with `grep -rln "Administrateur" docs`), and `README.md` if it lists rights per role
- [ ] T036 Run the quickstart manual scenarios of [quickstart.md](quickstart.md) against the local app (including scenario 8, demotion during an open session)
- [X] T037 Run every CI step in order — `npm run lint`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm audit --audit-level=high` — and the e2e specs `us8-admin` and `admin-reference-admin`; report the audit result in the PR body instead of claiming CI will pass
- [ ] T038 Before merging, tick the checks of `docs/procedure-fusion.md` honestly (tests written first for every task above); report any deviation instead of ticking it

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup; blocks every story (rule, guard, layout).
- **US1 (Phase 3)**: after Foundational. MVP.
- **US2 (Phase 4)**: after Foundational; shares the guard switch of T018 with US1 (same controller
  file), so do T018 before T023.
- **US4 (Phase 5)**: after Foundational; its full proof (T014 green) needs US1, US2 and US3 routes.
- **US3 (Phase 6)**: after Foundational; independent of US1/US2.
- **Polish (Phase 7)**: after the stories it exercises.

### Within each story

Tests first and seen failing → controller/service → UI → checkpoint.

### Parallel Opportunities

- T002, T003, T004 together; T007 alongside T005/T006.
- US1 tests T011, T012, T013 together (different files); T014 after them (it lists their routes).
- US2 tests T020, T021, T022 together.
- US3 tests T027, T028 together; T031 alongside T029/T030.
- US3 can be built in parallel with US1/US2 once Phase 2 is done.
- T034, T035 together.

---

## Parallel Example: User Story 1

```text
Task: "T011 [US1] admin allowed on /api/admin/floors in backend/test/integration/admin-floors.spec.ts"
Task: "T012 [US1] admin allowed on /api/admin/levels in backend/test/integration/admin-levels.spec.ts"
Task: "T013 [US1] admin allowed on class routes, not on dashboard/export/groups in backend/test/integration/coverage.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 → Phase 2 → Phase 3.
2. Stop and validate: `admin` manages floors, levels, classes and QR codes; everything else refused.

### Incremental Delivery

1. Foundation + US1 → MVP (reference structure).
2. + US2 → students and CSV import.
3. + US4 → full rights matrix proven by the route table.
4. + US3 → read-only « Employés » list.
5. Polish → e2e, docs, full CI.

## Notes

- No Prisma schema change in this feature: if a task seems to need one, stop and revisit the plan.
- Never delete an existing assertion that still describes valid behaviour; change only those that
  encode the old rule (research R5).
- Commit after each green checkpoint; keep French UI strings through `t()`.

## Implementation notes (2026-11-07)

- **T018 / US2 order**: the guard switch of `StudentsController` (T018) covers students too, so the
  US2 tests (T020, T021) were written after it. To keep principle I, they were run once with the old
  guard put back temporarily: 4 failures, then green with `AdministrationGuard`.
- **T028 / T032**: the frontend unit tests have no axe tool (vitest-axe is not installed); the axe
  check of « Employés » is in `e2e/admin-reference-admin.spec.ts` (T034). The page follows the
  « Comptes » list pattern rather than a MUI table (contracts/ui.md updated).
- **T031**: `EmployeeListItem` lives in `frontend/src/features/admin/api.ts`, next to `AdminUser`,
  not in `frontend/src/api/types.ts`.
- **QR dialog bug, fixed at the user's request (2026-11-07)**: in `ClassesAdminPage.tsx` `QrDialog`,
  after « Révoquer », the component-level `onSuccess` ran `setImage(null)` only once the class list had
  been refetched (TanStack Query runs `mutate` callbacks after the hook's `onSettled`), i.e. after the new
  image was already drawn: the dialog stayed on « Génération du QR code » (super administrator too).
  Test first: `frontend/tests/coverage/classes-qr-link.test.tsx` « Révocation du QR code d'une classe »
  (class list delayed by 50 ms, as on the network) failed, then passed once the image is tied to the link it
  was generated from (no more clearing). The e2e `admin-reference-admin` now checks « Version 2 », the image
  and « Imprimer » in the open dialog.
