---

description: "Task list for feature 005 — « Mon profil » (My profile) page and access to the password change"
---

# Tasks: Page « Mon profil » (My profile page) and access to the password change

**Input**: Design documents from `/specs/005-page-mon-profil/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY — constitution, principle I (non-negotiable TDD). Each test task
placed before an implementation MUST be written and seen **red** before coding. The existing
tests of the **forced** change (`frontend/tests/auth/login.test.tsx`, `e2e/auth.spec.ts`,
`nouveau` account) are not modified (SC-005).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: user story it belongs to (US1, US2)

## Path Conventions

Monorepo: `backend/src/`, `backend/test/{unit,integration}/`, `frontend/src/`,
`frontend/tests/`, `e2e/`. Commands from the repository root.

---

## Phase 1: Setup

**Purpose**: verified starting point

- [X] T001 On the `005-page-mon-profil` branch, run `npm run verify`, `npm run -w backend typecheck` and `npm run -w frontend typecheck`; record the starting counts (unit, integration, frontend tests) in a new `docs/validation/verification-005.md`, section « État initial » (Initial state)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the `/profil` page exists (empty shell), behind authentication; prerequisite of both stories

**⚠️ CRITICAL**: no story starts before this phase is finished

- [X] T002 Write the `frontend/tests/auth/profile.test.tsx` suite (red) modeled on `frontend/tests/auth/login.test.tsx` (`createMemoryRouter`, `QueryClientProvider`, mocked `fetch`): (a) `ProfilePage` displays a level-1 title « Mon profil » once `/api/auth/me` has loaded; (b) while loading, the shared loading state of `RequireAuth` (« Chargement de votre espace » (Loading your space)), without the title; (c) if `/api/auth/me` fails (500), the shared error state of `RequireAuth` (message and « Réessayer » (Retry)), without the title; (d) with `RequireAuth` and an account with `mustChangePassword: true`, the `/profil` route redirects to `/mot-de-passe` ("forced change in progress" edge case)
- [X] T003 Create `frontend/src/features/auth/ProfilePage.tsx` (title « Mon profil » via `PageHeader`, data from `useCurrentUser`; loading and error already handled by `RequireAuth`, no state of its own in the page) and declare the route `{ path: 'profil', element: <ProfilePage /> }` among the children of `AppLayout` in `frontend/src/app/routes.tsx` (hence behind `RequireAuth`); T002 green

**Checkpoint**: `/profil` opens (empty) for any signed-in account, and not during a forced change

---

## Phase 3: User Story 1 - Change your password when you want to (Priority: P1) 🎯 MVP

**Goal**: from the menu, open « Mon profil », choose « Changer mon mot de passe », cancel or change, return to the profile with the confirmation; the forced flow is unchanged

**Independent Test**: sign in, open the profile from the menu, change the password, sign in again with the new one; a session open elsewhere is closed

### Tests for User Story 1 ⚠️

> Write these tests first and see them red

- [X] T004 [P] [US1] In a new `frontend/tests/app/app-layout.test.tsx` (red): the `AppLayout` profile block is a link (`getByRole('link', { name: /^Mon profil : / })`) whose accessible name contains the visible name and role (« Mon profil : Enseignante, Employé ») and that leads to `/profil`; it carries `aria-current="page"` when `/profil` is displayed; on mobile (window < 900 px, mocked `matchMedia`), the link is in the drawer and activating it closes the drawer. Simulate real time (`SocketProvider`) as in `frontend/tests/notifications/NotificationCenter.test.tsx`
- [X] T005 [P] [US1] In a new `frontend/tests/auth/change-password.test.tsx` (red), account `mustChangePassword: false` (voluntary mode): (a) a « Annuler » (Cancel) button exists and leads to `/profil` without calling `POST /api/auth/password`; (b) success (`204`) → `/profil`, where a `role="status"` region displays « Mot de passe modifié. Vos autres sessions ont été fermées. » (Password changed. Your other sessions have been closed.); (c) errors unchanged: empty current one, new one under 12 characters, different confirmation, and `400 VALIDATION_ERROR` on `currentPassword` (« Mot de passe actuel incorrect. » (Current password incorrect.)) displayed under the field. Account `mustChangePassword: true` (forced mode): no « Annuler » button, success → `/` (home)
- [X] T006 [P] [US1] In `e2e/auth.spec.ts`, new test (red) reserved to Chromium (`test.skip(testInfo.project.name !== 'chromium', …)`, like the `nouveau` account test) with the `autre` account: open two signed-in contexts; in the first, activate the « Mon profil : … » menu link, then « Changer mon mot de passe », enter the current one and a new one of at least 12 characters; wait for the return to `/profil` and the status « Mot de passe modifié. Vos autres sessions ont été fermées. »; reload the second context → sign-in page; sign in again with the new password; **in a `finally` block, restore the old password** (through the UI or `POST /api/auth/password` with the `Origin` header) to leave the e2e database replayable

### Implementation for User Story 1

- [X] T007 [P] [US1] In `frontend/src/app/AppLayout.tsx`, turn the profile block (`user`, shared by the sidebar and the drawer) into a React Router link to `/profil`: visually hidden text « Mon profil : » (`visuallyHidden` from `frontend/src/components/a11y.ts`) before the visible `Person`, visible focus, `aria-current="page"` on `/profil`, drawer closes on click (like `NavList` `onNavigate`); T004 green
- [X] T008 [P] [US1] In `frontend/src/features/auth/ChangePasswordPage.tsx`, voluntary mode when `me.data.mustChangePassword` is `false`: « Annuler » button (secondary variant) → `navigate('/profil')`; success → `navigate('/profil', { replace: true, state: { passwordChanged: true } })`; forced mode strictly unchanged (explanatory text, no cancel, success → `/`); T005 green, `frontend/tests/auth/login.test.tsx` unchanged and green
- [X] T009 [US1] In `frontend/src/features/auth/ProfilePage.tsx`, add the « Changer mon mot de passe » action (link-button to `/mot-de-passe`, exact label of the server message in `backend/src/users/users.service.ts`, FR-013) and, if `location.state.passwordChanged`, the status « Mot de passe modifié. Vos autres sessions ont été fermées. » (`role="status"`, existing alert component); complete `frontend/tests/auth/profile.test.tsx` (red first) for the action and the status
- [X] T010 [US1] Run `npm run -w frontend test` and `npx playwright test -c e2e/playwright.config.ts e2e/auth.spec.ts --project=chromium`: T004 to T006 green

**Checkpoint**: US1 complete and testable on its own (MVP): the voluntary change is reachable in 2 actions (SC-001)

---

## Phase 4: User Story 2 - View your account information (Priority: P2)

**Goal**: « Mon profil » displays read-only the name, identifier, job title, role and assignment groups, with explicit labels for missing values

**Independent Test**: for an account of each role and a member of each group, the displayed values are those of the administration; nothing is editable

### Tests for User Story 2 ⚠️

- [X] T011 [P] [US2] New `backend/test/unit/auth-me.spec.ts` (red): `toMeResponse` (`backend/src/auth/auth.types.ts`) returns the user's `username` and `jobTitle`; `jobTitle` is `null` if not provided; the existing fields (`id`, `displayName`, `role`, sorted `permissions`, `mustChangePassword`, `isTeacher`, `isSupervisor`) are unchanged
- [X] T012 [P] [US2] In `backend/test/integration/auth.spec.ts` (red): `GET /api/auth/me` returns the `username` and `jobTitle` of the session's account (« `jobTitle`, texte, 100 caractères max, facultatif » (text, 100 characters max, optional): a set value, then `null` for an account without a job title); two signed-in accounts each receive their own values; the `POST /api/auth/login` response also contains both fields
- [X] T013 [P] [US2] Complete `frontend/tests/auth/profile.test.tsx` (red): description list — « Nom », « Identifiant de connexion », « Fonction », « Rôle », « Groupes d'affectation » (Name, Login identifier, Job title, Role, Assignment groups); role translated by `ROLE_LABELS` (« Employé », « Admin », « Super administrateur »); missing job title → « Non renseignée »; groups: « Surveillants », « Enseignants », both, or « Aucun »; no input field (`queryAllByRole('textbox')` empty); notice « Pour modifier ces informations, adressez-vous à l'administration. »

### Implementation for User Story 2

- [X] T014 [US2] In `backend/src/auth/auth.types.ts`, add `jobTitle: string | null` to `AuthenticatedUser`, `username: string` and `jobTitle: string | null` to `MeResponse`, and return them in `toMeResponse`; in `backend/src/auth/session.service.ts` (`toAuthenticatedUser`), set `jobTitle: user.jobTitle`; fix the test fixtures that build an `AuthenticatedUser` (`npm run -w backend typecheck`); T011 and T012 green
- [X] T015 [P] [US2] In `frontend/src/api/types.ts`, add `username: string` and `jobTitle: string | null` to `Me`; update the mocked `Me` objects in `frontend/tests/**` (search `mustChangePassword:`) so that `npm run -w frontend typecheck` passes
- [X] T016 [US2] In `frontend/src/features/auth/ProfilePage.tsx`, display the list from `contracts/ui.md` (`dl` element, terms and values, long values wrap for 320 px) and the administration notice; T013 green
- [X] T017 [US2] Run `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`: T011 to T013 green, no existing test modified except type fixtures (T014, T015)

**Checkpoint**: US1 and US2 work, each testable on its own

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: verified accessibility, up-to-date documentation, full verification

- [X] T018 [P] In `e2e/a11y-responsive.spec.ts`, V18 test (profile `mobile-320`, account `enseignante`): add `page.goto('/profil')` then `checkScreen(page, 'mon profil')`, and `page.goto('/mot-de-passe')` then `checkScreen(page, 'changer mon mot de passe (volontaire)')` — without submitting the form; also verify the keyboard path to the « Mon profil : … » link in the "keyboard only" test (FR-011, SC-004)
- [X] T019 [P] Update `docs/superadmin-fonctionnalites.md`: §1.1 « Bloc profil » row (route `/profil`, status « Complète » (Complete)) and « Profil et déconnexion » paragraph; §4.2 remove « Pas de page de profil ni de lien « Changer mon mot de passe » »; §4.4 remark S01
- [X] T020 [P] Update the demo: subtitle « Il n'existe pas de page de profil » of `demo/scenarios/S01-menu-lateral.ts` (show the link to « Mon profil ») and S01 remark in `demo/README.md`; replay `npx tsx demo/run.ts S01 --env=test` before 10 pm, school time
- [ ] T021 Run through manual scenarios 1 to 7 of `specs/005-page-mon-profil/quickstart.md` and record the result in `docs/validation/verification-005.md`
- [X] T022 Final verification: `npm run verify`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`, `npm run test:e2e` (all profiles); record the counts in `docs/validation/verification-005.md`; CI green on the last commit; pull request according to `docs/procedure-fusion.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependency
- **Foundational (Phase 2)**: after Setup; **blocks both stories** (T002 → T003)
- **US1 (Phase 3)** and **US2 (Phase 4)**: after Phase 2; independent of each other, but both modify `ProfilePage.tsx` (T009, T016) and `profile.test.tsx` (T009, T013): do T009 before T016, or merge carefully
- **Polish (Phase 5)**: after both stories

### User Story Dependencies

- **US1 (P1)**: does not use the new fields of `/api/auth/me`; only the page shell (T003) is required
- **US2 (P2)**: independent of US1 on the server side (T011, T012, T014); on the page side, after T003

### Within Each User Story

- Tests written and **red** before implementation (T004–T006 before T007–T009; T011–T013 before T014–T016)
- Server before UI for US2 (T014 before T016); frontend types (T015) before T016

### Parallel Opportunities

- US1: T004, T005, T006 in parallel (distinct files); then T007 and T008 in parallel
- US2: T011, T012, T013 in parallel; T015 in parallel with T014
- Phases 3 and 4 can progress in parallel after phase 2 (watch `ProfilePage.tsx`)
- Polish: T018, T019, T020 in parallel

---

## Parallel Example: User Story 1

```text
# Tests first, together (red):
T004 frontend/tests/app/app-layout.test.tsx
T005 frontend/tests/auth/change-password.test.tsx
T006 e2e/auth.spec.ts

# Then implementation, together:
T007 frontend/src/app/AppLayout.tsx
T008 frontend/src/features/auth/ChangePasswordPage.tsx
```

## Parallel Example: User Story 2

```text
T011 backend/test/unit/auth-me.spec.ts
T012 backend/test/integration/auth.spec.ts
T013 frontend/tests/auth/profile.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001) and Phase 2 (T002–T003)
2. Phase 3 (T004–T010): the voluntary password change is reachable from the menu
3. **Stop and validate**: quickstart scenarios 1, 3, 4, 5 and 6; deliverable on its own (the profile page
   then displays only the title and the action)

### Incremental Delivery

1. Setup + Foundational → protected `/profil` page
2. US1 → voluntary change (MVP, security stake)
3. US2 → account information
4. Polish → accessibility at 320 px, documentation, demo, final verification
