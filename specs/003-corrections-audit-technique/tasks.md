---

description: "Task list for feature 003 — fixes from the technical audit"
---

# Tasks: Fixes from the technical audit

**Input**: Design documents from `/specs/003-corrections-audit-technique/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY — constitution, principle I (non-negotiable TDD). Every test listed before
an implementation MUST be written and seen **red** before coding. Refactorings
with no visible effect (US4) are protected by the existing suite: its expectations MUST NOT
be modified (SC-007); only import paths may change.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 to US5, see spec.md)
- The `Rn` references point to research.md, `Ann`/`Nn` to the findings register of spec.md

## Path Conventions

- Web application, npm workspaces: `backend/src/`, `backend/test/{unit,integration,utils}/`,
  `frontend/src/`, `frontend/tests/`, `deploy/`, `docs/`
- Commands: `npm run -w backend test` (unit), `npm run -w backend test:integration`
  (embedded PostgreSQL, run serially), `npm run -w frontend test`, `npm run lint`,
  `npm run verify` (lint + all tests + `npm audit --audit-level=high`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: establish the measured starting state

- [X] T001 Run `npm run lint`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm run -w backend typecheck` and `npm run -w frontend typecheck` on branch `003-corrections-audit-technique`; record each result (passed / failed, names of failing tests) in a section « État initial » (Initial state) of `docs/validation/verification-003.md` (create the file on the model of `docs/validation/verification-finale.md`). Known expectation: `backend/test/unit/config.spec.ts` failing (expected 3000, received 3002). Any other failure MUST be reported before continuing.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: bring the suite back to green, run it in CI and frame every merge with a manual
check before any other change (constitution: no merge if the suite
fails; rule applied by hand, with no technical protection, decision D10)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 In `backend/test/unit/config.spec.ts`, replace the expectation `expect(config.port).toBe(3000)` with `toBe(3002)` (the code has been at 3002 since commit `1e6d4ee`); rerun `npm run -w backend test`: everything MUST be green (A01)
- [X] T003 Create `.github/workflows/ci.yml` according to `contracts/cli-and-deploy.md` §Intégration continue (Continuous integration) (R11): `name: CI`; triggers `push` and `pull_request`; a single job with identifier `verify` and `name: Contrôles qualité` (stable name, cited by the pre-merge check of T006); `runs-on: ubuntu-latest`; `actions/checkout`; `actions/setup-node` with `node-version-file: .nvmrc` and npm cache; `sudo apt-get update && sudo apt-get install -y ffmpeg`; `npm ci`; `npm run -w backend prisma:generate`; then, each as a blocking step: `npm run lint`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm audit --audit-level=high`. Do NOT include `npm run test:e2e` (decision D3)
- [X] T004 Check that `package-lock.json` contains the Linux binary of embedded-postgres (`grep -n "@embedded-postgres/linux-x64" package-lock.json`). If it is missing: add it to the lock (`npm install --package-lock-only --os=linux --cpu=x64` then check that the Windows lock still works with `npm ci` locally); record the check in `docs/validation/verification-003.md` ([INFERRED] point of R11)
- [X] T063 **Test first (N3, FR-025)** — noted by the first CI pass (T005): `coverage.spec.ts` failed on one run and passed on the other, at the same commit (`→CLOSED` before `→DONE`). Add in `backend/test/integration/history-priority.spec.ts` the test `restitue dans leur ordre d’écriture des événements de même horodatage (N3)` (returns events with the same timestamp in their write order) and in `backend/test/integration/coverage.spec.ts` the test `1 ter. historique : des événements de même horodatage restent dans leur ordre d’écriture (N3)` (history: events with the same timestamp stay in their write order): insert with `prisma.requestEvent.create` two `OVERDUE` events with the same `createdAt`, whose `id`s are in the reverse order of writing (`ffffffff-…` then `00000000-…`), then read the history (`GET /api/requests/:id/history`, `GET /api/coverage/:id`) and expect the write order. Observe the failure, without depending on chance (research R15)
- [X] T064 Fix N3 (FR-025, research R15): in `backend/prisma/schema.prisma`, add to `RequestEvent` `seq BigInt @default(autoincrement())`; create `backend/prisma/migrations/0003_request_event_seq/migration.sql` (`ALTER TABLE "RequestEvent" ADD COLUMN "seq" BIGSERIAL NOT NULL;`) and check that it matches the schema (`prisma migrate diff --from-empty --to-schema-datamodel`); replace `{ id: 'asc' }` with `{ seq: 'asc' }` in the event sorts of `requests/requests.service.ts` (`history`), `coverage/coverage.service.ts` (`historyOf`) and `coverage/coverage-admin.service.ts`, and add `{ seq: 'desc' }` to the releases sort of `coverage.service.ts`; do not expose `seq` through the API. T063 green; full suites green with no change of expectations; then resume T005
- [X] T005 Push the branch, observe the CI passing on GitHub (Actions tab); if `backend/test/integration/search-performance.spec.ts` is unstable on the GitHub machine, exclude it from CI with `--testPathIgnorePatterns search-performance` in `.github/workflows/ci.yml` only and note it in `docs/validation/verification-003.md` (R11). Do not move on until CI is green
- [X] T006 **Manual pre-merge check** (finding G3, decision D10, constitution principle I: « Aucune modification ne peut être fusionnée si la suite de tests échoue » (No change may be merged if the test suite fails)): branch protection is not available on the private repository (free GitHub plan, [VERIFIED] on 2026-10-15); do NOT make the repository public or change the plan. (a) Create `docs/procedure-fusion.md` according to `contracts/cli-and-deploy.md` §Vérification avant fusion (Pre-merge check): at the top, the warning « Procédure manuelle : elle ne constitue pas une protection technique ; GitHub n'empêche pas une fusion dont les tests échouent » (Manual procedure: it is not a technical protection; GitHub does not prevent a merge whose tests fail); the rules (every change to `master` through a pull request, checks verified on the latest commit and ticked in the pull request, an unsatisfied check forbids the merge); the table of the four checks (1 CI result « Contrôles qualité », 2 required tests, 3 no unresolved failure, 4 diff review) with how to verify them (`gh pr checks <n°>`, `gh pr diff <n°>`); what to do if a merge happens despite a failure; the protection rule to create if the plan changes (research R11). (b) Create `.github/pull_request_template.md`: the four checks as checkboxes, each with its refusal criterion, and a link to `docs/procedure-fusion.md`. (c) In `README.md`, add a pointer to `docs/procedure-fusion.md` next to the test commands. After T005 (the « Contrôles qualité » job must have run once). The template only shows once merged into `master`: the first merge (that of this feature, T062) applies the procedure by copying the checkboxes by hand. Creates no workflow: CI belongs to T003

**Checkpoint**: green suite locally and in CI, pre-merge check procedure in place — the user stories can begin

---

## Phase 3: User Story 1 - Start and test the project without port inconsistency (Priority: P1) 🎯 MVP

**Goal**: a developer follows the README and gets an API on 3002 reachable by the interface, with reload (FR-001 to FR-003)

**Independent Test**: quickstart.md, scenario 1 — on a clean workstation, copy the example configuration, `npm run dev`, log in; `git grep -nE "localhost:3000|host\.docker\.internal:3000|^PORT=3000" -- README.md backend/.env.example deploy/Caddyfile.dev frontend/vite.config.ts` returns nothing (same check as T007; mentions of 3000 in a sentence about the old `.env` or about production remain allowed)

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T007 [US1] Create `backend/test/unit/dev-port-consistency.spec.ts`: reads with `node:fs` (paths relative to the repository root via `path.resolve(__dirname, '../../..')`) `backend/.env.example`, `deploy/Caddyfile.dev`, `frontend/vite.config.ts` and `README.md`; checks that `.env.example` contains the line `PORT=3002`, that each `reverse_proxy host.docker.internal:<port>` of `Caddyfile.dev` to the API (`/api/*` and `/socket.io/*` blocks) uses 3002, that `vite.config.ts` contains `'http://localhost:3002'`, and that none of these sources contains `localhost:3000` or `:3000` outside production; that `loadConfig` without `PORT` returns 3002, and that the `dev:backend` script of the root `package.json` is exactly `npm run -w backend start:dev` (finding C2, FR-003). Observe the failure (A01, A02)

- [X] T008 [P] [US1] In `frontend/tests/api/client.test.ts`, **strengthen the two existing tests** that already cover the stopped API, without adding a test or a `describe` (no duplicate), to pin the existing behavior (FR-023: no message is changed): (a) in `it('produit une erreur lisible si la réponse d’erreur n’est pas au format attendu')` (502 response with no JSON body, like the Vite proxy's when the API does not answer), replace `expect(error.message).toMatch(/erreur/i)` with `expect(error.message).toBe('Une erreur inattendue est survenue. Réessayez plus tard.')`; (b) in `it('signale une coupure réseau avec le code NETWORK_ERROR')`, replace `expect(error.message).toMatch(/connexion/i)` with `expect(error.message).toBe('Connexion impossible. Vérifiez votre connexion internet puis réessayez.')`. The other assertions (status 502 / 0, codes `INTERNAL_ERROR` / `NETWORK_ERROR`) remain unchanged. **Documented exception to the "red first" rule**: these tightened expectations describe behavior already in place (`UNEXPECTED_MESSAGE` and `NETWORK_MESSAGE` of `frontend/src/api/client.ts`); they are green as soon as written; observe it and state it in the commit message (finding G2, spec edge case). (Test titles: "produces a readable error if the error response is not in the expected format" and "reports a network cut with the NETWORK_ERROR code"; messages: "An unexpected error occurred. Try again later." and "Unable to connect. Check your internet connection and try again.")

### Implementation for User Story 1

- [X] T009 [P] [US1] In `backend/.env.example`, replace `PORT=3000` with `PORT=3002` (line 17) and add above it the comment `# Port de l'API en développement (la production fixe 3000 dans deploy/api.Dockerfile).` (API port in development; production sets 3000 in deploy/api.Dockerfile) (R1)
- [X] T010 [P] [US1] In `deploy/Caddyfile.dev`, replace the two `reverse_proxy host.docker.internal:3000` with `host.docker.internal:3002` (R1)
- [X] T011 [P] [US1] In `README.md` line 41, replace `# API : http://localhost:3000` with `# API : http://localhost:3002`; add in the installation section a sentence: « Si votre `backend/.env` date d'avant le passage au port 3002, remplacez `PORT=3000` par `PORT=3002` » (If your `backend/.env` predates the switch to port 3002, replace `PORT=3000` with `PORT=3002`) (spec edge case)
- [X] T012 [P] [US1] In the root `package.json`, replace `"dev:backend": "npm run -w backend start"` with `"dev:backend": "npm run -w backend start:dev"` (R2, A02); check that `start.bat` (which calls `npm run dev`) needs no other change
- [ ] T013 [US1] Rerun `npm run -w backend test` (T007 green) and run quickstart.md scenario 1 by hand under Windows with `start.bat`: successful login, a change to a file in `backend/src` picked up without a build; time the path from copying `.env.example` to the successful login, excluding downloads (SC-001: under 10 minutes); stop the API and check that the interface shows the message of T008 with no blank screen; record the result and the duration in `docs/validation/verification-003.md`

**Checkpoint**: US1 complete — consistent development environment, green suite

---

## Phase 4: User Story 2 - Guarantee traceability and security of sensitive operations (Priority: P1)

**Goal**: unified masking, fully validated configuration, single origin check, traced super administrator reset (FR-004 to FR-007, FR-010)

**Independent Test**: quickstart.md, scenarios 2 and 3

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T014 [P] [US2] In `backend/test/unit/config.spec.ts`, add cases for `TRUST_PROXY` (contract `contracts/configuration.md`): absent → `trustProxy` is `'loopback'`; `'true'` → `true`; `'false'` → `false`; `'2'` → `2`; `'uniquelocal'`; `'loopback, 10.0.0.0/8'`; `'::1'` → accepted and returned as is (string stripped of spaces); `'n'importe quoi'`, `'-1'`, `'10.0.0.0/99'`, `'loopback,'` → `ConfigError` whose message starts with `TRUST_PROXY invalide` (FR-004, R3)
- [X] T015 [P] [US2] Create `backend/test/unit/sensitive-keys.spec.ts`: imports `SENSITIVE_KEY` from `backend/src/common/sensitive-keys.ts`; checks that it recognizes `password`, `passwordHash`, `token`, `secret`, `cookie`, `authorization`, `Authorization`, `sid`, `text`, `message`, `content` and does not recognize `reason`, `route`, `username`, `messages`, `contentType`; then checks that `redact({ authorization: 'Bearer x', message: 'contenu' })` (logger, `backend/src/common/app-logger.ts`) and `sanitizeAuditDetails` (`backend/src/audit/audit.service.ts`) both mask or remove `authorization` and `message`; and that a `new Error('Erreur lisible')` passed to `redact` keeps its message readable ([INFERRED] risk of R4) (FR-005)
- [X] T016 [P] [US2] Create `backend/test/unit/origin.spec.ts` for `backend/src/common/origin.ts`: `isAllowedOrigin({ origin: 'https://a.fr' }, 'https://a.fr')` → true; foreign origin → false; `origin` missing and `referer: 'https://a.fr/page'` → true only if the referer option is passed; non-URL value → false; `origin: 'null'` → false (FR-006, R5)
- [X] T017 [US2] In `backend/test/integration/bootstrap-production.spec.ts`, add a `describe('resetSuperAdminPassword')`: (a) with a super administrator having two sessions in the database, the call returns a temporary password of 22 base64url characters, sets `mustChangePassword` to true, changes `passwordHash` (check with `argon2.verify`), deletes both sessions and creates **one** `AuditLog` row `action: 'PASSWORD_RESET'`, `actorId: null`, `targetType: 'User'`, `targetId` = the account's id, `details: { reason: 'CLI' }`, `ip: null`; (b) without an identifier, targets the oldest active `SUPER_ADMIN`; (c) unknown identifier or `EMPLOYEE` account → rejects with the message `Compte « <identifiant> » introuvable ou non super administrateur : aucune modification.`, no write (no user, no session, no audit); (d) the plaintext password appears in no `AuditLog` row; (e) **command line**: run `npx tsx src/cli/bootstrap.ts --reset-password inconnu` (`child_process.spawnSync`, `cwd: backend`, `DATABASE_URL` = test database) → exit code 1, message of (c) on stderr, nothing on stdout; run `npx tsx src/cli/bootstrap.ts` with no argument on a database where a super administrator exists → code 0, message « existe déjà » (already exists) (historical call unchanged); (f) **unreachable database** (spec edge case): `resetSuperAdminPassword` with a `PrismaClient` whose URL points to a closed port → the promise is rejected and no password is returned; on the command line, exit code 1 (FR-007, FR-010, R6, data-model §AuditLog, finding G5)

### Implementation for User Story 2

- [X] T018 [P] [US2] Create `backend/src/common/sensitive-keys.ts` exporting `export const SENSITIVE_KEY = /pass(word)?|hash|token|secret|cookie|authorization|^sid$|^text$|^message$|^content$/i;` with a comment saying it serves the logger and the audit log; in `backend/src/common/app-logger.ts` and `backend/src/audit/audit.service.ts`, delete the local `SENSITIVE_KEY` constants and import the shared constant; the logger's text patterns (`TEXT_PATTERNS` or equivalent: argon2, cookie/authorization headers, `sid=`) stay in `app-logger.ts`; T015 green, `log-redaction.spec.ts` and `audit-sanitize.spec.ts` green (FR-005)
- [X] T019 [P] [US2] Create `backend/src/common/origin.ts`: move `originOf(value)` from `backend/src/auth/origin.guard.ts` and export `isAllowedOrigin(headers: { origin?: string; referer?: string }, appOrigin: string, options?: { allowReferer?: boolean }): boolean`; `auth/origin.guard.ts` calls `isAllowedOrigin(req.headers, appOrigin, { allowReferer: true })`; `realtime/realtime.gateway.ts` deletes its copy of `originOf` and calls `isAllowedOrigin(socket.handshake.headers, appOrigin)` without referer (behavior unchanged, FR-023); T016 green, `auth.spec.ts` and `realtime.spec.ts` green (FR-006)
- [X] T020 [US2] In `backend/src/config/config.ts`: add `trustProxy: boolean | number | string` to `AppConfig`; in `loadConfig`, read `env.TRUST_PROXY?.trim() || 'loopback'` and validate: `true`/`false` → boolean; `/^\d+$/` → number; otherwise a comma-separated list where each element (after `trim`, non-empty) is `loopback`, `linklocal`, `uniquelocal`, an IP address (`net.isIP` from `node:net`) or a CIDR range `IP/n` (n ≤ 32 for IPv4, ≤ 128 for IPv6); otherwise `throw new ConfigError('TRUST_PROXY invalide : utilisez true, false, un nombre de proxys, ou une liste parmi loopback, linklocal, uniquelocal, adresses IP ou plages CIDR')` (TRUST_PROXY invalid: use true, false, a number of proxies, or a list from loopback, linklocal, uniquelocal, IP addresses or CIDR ranges); T014 green (FR-004, R3)
- [X] T021 [US2] In `backend/src/app.setup.ts`, replace `process.env.TRUST_PROXY ?? 'loopback'` with `config.trustProxy` and `process.env.NODE_ENV !== 'production'` with `!config.isProduction`, `config` being obtained by `app.get<AppConfig>(APP_CONFIG)`; in `backend/src/main.ts`, replace `Number(process.env.PORT ?? 3002)` with `app.get<AppConfig>(APP_CONFIG).port`; check with `grep -rn "process.env" backend/src` that only `config/`, `cli/bootstrap.ts` and `config/load-env-file.ts` remain; `npm run -w backend test:integration` green (FR-004)
- [X] T022 [US2] In `backend/src/cli/bootstrap.ts`, add and export `resetSuperAdminPassword(prisma: PrismaClient, username?: string): Promise<{ username: string; temporaryPassword: string }>` according to research R6: password `randomBytes(16).toString('base64url')`, hashed with Argon2id; in **one** `prisma.$transaction`: `user.update({ passwordHash, mustChangePassword: true })`, `session.deleteMany({ where: { userId } })`, `auditLog.create({ action: 'PASSWORD_RESET', actorId: null, targetType: 'User', targetId: user.id, details: { reason: 'CLI' }, ip: null })`; without `username`, targets `findFirst({ where: { role: 'SUPER_ADMIN', active: true }, orderBy: { createdAt: 'asc' } })`; account missing or not `SUPER_ADMIN` → `throw new Error('Compte « <identifiant> » introuvable ou non super administrateur : aucune modification.')` before any write. In `main()`, if `process.argv[2] === '--reset-password'`, call `resetSuperAdminPassword(prisma, process.argv[3])` and write to stdout `Mot de passe provisoire de « <identifiant> » (affiché une seule fois, à changer à la première connexion) : <mot de passe>`; otherwise historical behavior unchanged; update the usage comment at the top of `main()`; T017 green (FR-007, FR-010, `contracts/cli-and-deploy.md`)
- [X] T023 [US2] Delete `backend/scripts/reset-superadmin-password.ts`; look for its mentions (`grep -rn "reset-superadmin" --exclude-dir=node_modules .`) and replace them, in `README.md` and any operations documentation, with the two examples of `contracts/cli-and-deploy.md` (development and production) (FR-010, D2)
- [ ] T024 [US2] Run quickstart.md scenarios 2 and 3 by hand (two browsers logged in as `superadmin`) and record the result in `docs/validation/verification-003.md`

**Checkpoint**: US1 and US2 work independently

---

## Phase 5: User Story 3 - Automatic assignment following the snapshot rule (Priority: P2)

**Goal**: in workflow B, approval assigns according to the mode **and** the person frozen at submission (D1), with an explicit fallback if the person is no longer assignable (FR-008, FR-009, FR-011)

**Independent Test**: quickstart.md, scenario 4

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T025 [US3] Create `backend/test/integration/auto-assignment-snapshot.spec.ts` (model: `requests-circuit-b.spec.ts`, utilities `seedDemo`, `loginAs`, `userId`, `categoryId` from `backend/test/utils/auth-helpers.ts`). Prepare a category in workflow B, `assignmentMode: 'AUTO'`, `autoAssigneeId` = E1, with E1, E2, E3 as active recipients. Cases, with the expected result according to `contracts/rest-api.md`: (1) submit D1, set `autoAssigneeId` to E2, approve without `assigneeId` → `200`, `assigneeId` = E1; (2) submit D2, switch the category to `MANUAL` (`autoAssigneeId: null`), approve without `assigneeId` → `200`, assigned to E1 (today `422 ASSIGNEE_REQUIRED`, finding N1); (3) submit D3, deactivate E1, approve without `assigneeId` → `422` code `AUTO_ASSIGNEE_UNAVAILABLE`, request unchanged (status, version); then approve with `assigneeId` = E3 → `200`, assigned to E3; (3b) submit D3b, **remove E1 from the recipients** of the category (account still active), approve without `assigneeId` → `422 AUTO_ASSIGNEE_UNAVAILABLE`, then with `assigneeId` = E3 → `200`, assigned to E3 (EXC-2, decision D8); (4) same situation as (3) but `assigneeId` of an inactive account or non-recipient → `422 RECIPIENT_NOT_ALLOWED`, request unchanged; (5) AUTO category intact, approve with `assigneeId` = E2 → `200`, assigned to E1 (the supplied choice is ignored); (6) request whose `autoAssigneeId` key is removed from `rulesSnapshot` by `prisma.request.update` (earlier request, EXC-1, decision D9), category designating E2 → assigned to E2; (7) for each successful case, the `RequestEvent` of type `ASSIGNED` created by the approval carries `toValue.assigneeSource` = `SNAPSHOT` (1, 2, 5), `MANAGER_CHOICE` (3, 3b), `CATEGORY_CURRENT` (6). Before the fix, observe the failure of (1), (2), (3), (3b) and (7); (4), (5) and (6) already pass, because they describe preserved behavior (FR-009: confirms finding A04 [INFERRED])
- [X] T026 [P] [US3] In `frontend/tests/requests/ApprovalPanel.test.tsx` (target file confirmed: it renders `RequestActions`, which opens `ApprovalDialog`, and already contains `describe('Approbation (circuit B)')` with the case « en affectation automatique, approuve sans choix d’employé » (in automatic assignment, approves without choosing an employee); no new test file), add in this `describe` the test `it('en affectation automatique, propose le choix de l’employé si la personne prévue n’est plus disponible')` (in automatic assignment, offers the choice of employee if the planned person is no longer available): request with snapshot `assignmentMode: 'AUTO'`; call `stubFetch` directly (not `renderActions`, which always answers `200`) with a handler that returns the same `/api/requests/r1/assignees` list as `renderActions`, then, for the **first** `POST /api/requests/r1/actions`, `json(422, { error: { code: 'AUTO_ASSIGNEE_UNAVAILABLE', message: 'La personne désignée pour cette catégorie n’est plus disponible. Choisissez l’employé qui réalisera la demande.' } })`, and `200` afterwards; same rendering as `renderActions` (`QueryClientProvider` + `RequestActions`). Expected: after the first submission, the server's message is shown in an element with `role="alert"` of the dialog « Approuver la demande » (Approve the request), the combobox « Employé chargé de la demande » (Employee in charge of the request) appears and has focus; after choosing « Reprographie » (Reprographics) and submitting again, the **last** call to `/api/requests/r1/actions` has the body `{ action: 'APPROVE', version: 2, assigneeId: 'e1' }`. The existing tests of the file remain unchanged. Observe the failure

### Implementation for User Story 3

- [X] T027 [US3] In `backend/src/requests/request-policy.loader.ts`: add `autoAssigneeId: string | null` to `RequestRulesSnapshot`; in `rulesSnapshot()`, set `autoAssigneeId: category.assignmentMode === 'AUTO' ? category.autoAssigneeId : null` (data-model: "Set if `assignmentMode = AUTO`, otherwise `null`"). No migration (JSON field)
- [X] T028 [US3] In `backend/src/common/errors.ts`, add to `ERROR_CATALOG`: `AUTO_ASSIGNEE_UNAVAILABLE: { status: 422, message: 'La personne désignée pour cette catégorie n’est plus disponible. Choisissez l’employé qui réalisera la demande.' }` (same typographic apostrophe as the neighboring messages); add the case to `backend/test/unit/http-exception.filter.spec.ts` if that file enumerates the codes
- [X] T029 [US3] In `backend/src/requests/request-transitions.service.ts`, rewrite the `APPROVE` branch of `assigneeContext` according to data-model §Résolution (Resolution): read `rules = readRulesSnapshot(request)`; if `rules.assignmentMode !== 'AUTO'` → `input.assigneeId`, source `MANAGER_CHOICE`; otherwise candidate = `'autoAssigneeId' in rules ? rules.autoAssigneeId : category.autoAssigneeId` (source `SNAPSHOT`, or `CATEGORY_CURRENT` for an earlier request: EXC-1, decision D9); if the candidate is non-null and assignable (`canPickRecipient`: active and current recipient) → candidate (a supplied `input.assigneeId` is ignored, FR-008); otherwise (EXC-2, decision D8): if `input.assigneeId` is supplied → use it, source `MANAGER_CHOICE`, checked by `canPickRecipient` (`RECIPIENT_NOT_ALLOWED` refusal unchanged); otherwise `throw new AppException('AUTO_ASSIGNEE_UNAVAILABLE')` before any write. Implement nothing other than these rules (FR-008, FR-011). Pass the source to `commit`/`recordTransition` to add it to the `toValue` of the `ASSIGNED` event created by the approval (next to `assigneeId`; the `STATUS_CHANGED` event is unchanged) under the key `assigneeSource` (`SNAPSHOT` | `CATEGORY_CURRENT` | `MANAGER_CHOICE`); no longer read `category.assignmentMode` for `APPROVE`; T025 green, `requests-circuit-b.spec.ts` and `assignable-employees.spec.ts` green with no change to their expectations
- [X] T030 [P] [US3] In `frontend/src/features/requests/types.ts`, add `autoAssigneeId?: string | null` to the `rulesSnapshot` type; in `frontend/src/features/requests/RequestActions.tsx` (which receives the action mutation's error [VERIFIED]) and `frontend/src/features/requests/ApprovalDialog.tsx` (mode chosen by the `automatic` prop), on an `AUTO_ASSIGNEE_UNAVAILABLE` error, switch the dialog to manual mode: show the server's message in an alert, show the existing employee selector and put focus in it; the confirmation button sends `{ assigneeId }`; T026 green; axe check unchanged (`e2e/us5-admin-validation.spec.ts`)
- [X] T031 [P] [US3] Show the assignment source in the history (US3 scenario 5; mention allowed by FR-023). `HistoryTimeline.tsx` already shows the assignment detail (`describeEvent`, `ASSIGNED` case: « Affectée à <nom> » (Assigned to <name>)) [VERIFIED]. **Test first**: in `frontend/tests/requests/HistoryTimeline.test.tsx`, add `it('indique la source de l’affectation décidée à l’approbation')` (indicates the source of the assignment decided at approval), which calls `describeEvent` (exported by `frontend/src/features/requests/HistoryTimeline.tsx`) on `ASSIGNED` events with `toValue` `{ assigneeId: 'u2', assigneeName: 'Reprographie', assigneeSource }` and expects exactly (`toBe`): `SNAPSHOT` → « Affectée à Reprographie (personne prévue à la soumission) » (Assigned to Reprographie (person planned at submission)); `CATEGORY_CURRENT` → « Affectée à Reprographie (selon la catégorie actuelle, demande antérieure) » (according to the current category, earlier request) (EXC-1, D9); `MANAGER_CHOICE` → « Affectée à Reprographie (choix du responsable) » (manager's choice) (manual mode or EXC-2, D8: the event does not make it possible to tell the two apart); without `assigneeSource` (earlier events, workflow A) → exactly « Affectée à Reprographie » (unchanged). Observe the failure. Then, in `HistoryTimeline.tsx`, complete the `ASSIGNED` case of `describeEvent` accordingly (unknown value → no mention; `REASSIGNED` unchanged); new test green, existing test `présente chaque action en langage courant, avec auteur et date` (presents each action in plain language, with author and date) green with no change
- [ ] T032 [US3] Run quickstart.md scenario 4 by hand and record the result in `docs/validation/verification-003.md`; note that decision D1 remains to be confirmed by the school

**Checkpoint**: US1, US2 and US3 work independently

---

## Phase 6: User Story 4 - Readable internal dependencies, checked automatically (Priority: P2)

**Goal**: layer order `config → common → audit → auth → files → requests → coverage → scheduler` respected and checked; file access through a registry; duplicates and dead code removed; enums synchronized (FR-012 to FR-016)

**Independent Test**: quickstart.md, scenario 5; full suite green with no change of expectations (SC-007)

**Rule for the whole phase**: one commit per move task; after each task,
`npm run -w backend typecheck`, `npm run -w backend test` and `npm run -w backend test:integration`
MUST be green. Existing tests only change by their import paths.

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T033 [P] [US4] Create `backend/test/unit/architecture-layers.spec.ts` (R7): walk `backend/src` recursively (`node:fs`, `.ts` files); extract the relative imports, including `import type` and `export … from`, with the expression `/^\s*(?:import|export)\s[^'"]*?from\s+'(\.[^']+)'/gm`; resolve each target and reduce it to its top-level folder under `backend/src`; with `const LAYERS = ['config', 'common', 'audit', 'auth', 'files', 'requests', 'coverage', 'scheduler']`, fail if a file in a `LAYERS` folder imports a `LAYERS` folder of higher index; the failure message lists each violation in the form `<source file> → <target> (<folder> ne peut pas dépendre de <folder>)` (<folder> cannot depend on <folder>). Folders outside `LAYERS` are not checked. Observe the failure, with at least the violations `auth → requests`, `common → audit`, `common → auth`, `files → requests`, `files → coverage`, `coverage → scheduler`
- [X] T034 [P] [US4] Create `frontend/tests/api/enums-sync.test.ts` (R10): read `../backend/prisma/schema.prisma` (path resolved from the test file) and extract each `enum Name { … }` block (values = identifiers at the start of a line, ignoring `//` comments); read `frontend/src/api/types.ts` and `frontend/src/features/requests/types.ts` and extract each `export type Name = 'A' | 'B' …` as well as inline literal unions named like a Prisma enum; for each name present on both sides, compare the sets and fail by listing `<Name> : manquant côté interface [...] ; en trop côté interface [...]` (<Name>: missing on the interface side [...]; extra on the interface side [...]). The test MUST at minimum compare `Role`, `Priority`, `RequestStatus` and `AssignmentMode`, and fail if any of them cannot be found on the interface side. Fix any real divergences in `frontend/src/api/types.ts` (expected: green after the fix, since both sides are today aligned by hand)

### Implementation for User Story 4

- [X] T035 [US4] Create `backend/src/common/authorization.ts` and move into it from `backend/src/requests/domain/access-policy.ts`, without changing their body: `ALL_PERMISSIONS`, `PolicyUser`, `permissionsFor`, `canManageAdministration`, `canReadAudit`; in `access-policy.ts`, import them from `../../common/authorization` (no re-export); update the imports of `backend/src/auth/session.service.ts`, `backend/src/auth/auth.types.ts` and all other files (`grep -rn "permissionsFor\|PolicyUser\|ALL_PERMISSIONS\|canManageAdministration\|canReadAudit" backend/src backend/test`); move the corresponding tests from `backend/test/unit/access-policy.spec.ts` to a new `backend/test/unit/authorization.spec.ts`, expectations unchanged (A09 `auth → requests`, A12)
- [X] T036 [US4] Move `backend/src/auth/request-info.ts` to `backend/src/common/request-info.ts` (`git mv`, content unchanged) and update all imports (`grep -rn "request-info" backend/src backend/test`) (removes `common → auth`)
- [X] T037 [US4] Move `backend/src/common/super-admin.guard.ts` to `backend/src/audit/super-admin.guard.ts` (`git mv`); replace in it the test `user?.role === 'SUPER_ADMIN' && user.active` with `user && canManageAdministration(user)` imported from `../common/authorization`; import `clientIp`, `requestPath` from `../common/request-info`; update the imports in `audit/`, `categories/`, `coverage/`, `settings/`, `users/` (files listed by `grep -rln "SuperAdminGuard" backend/src`); `admin-*.spec.ts` green (removes `common → audit`)
- [X] T038 [US4] Create `backend/src/requests/request-policy.module.ts`: `@Module({ providers: [RequestPolicyLoader], exports: [RequestPolicyLoader] }) export class RequestPolicyModule {}`; remove `RequestPolicyLoader` from the `providers` of `requests.module.ts`, `categories.module.ts`, `messages.module.ts`, `coverage.module.ts` and `files.module.ts`, and add `RequestPolicyModule` to the `imports` of the first four (files: see T040) (A13, R9)
- [X] T039 [US4] Create `backend/src/files/file-access.ts` (R8) exporting `export interface RequestFileAccess { canRead(user: AuthenticatedUser, file: StoredFile, request: Request): Promise<boolean>; canAttach(user: AuthenticatedUser, request: Request): Promise<boolean>; }`; in `backend/src/files/files.service.ts`, add `private readonly access = new Map<RequestKind, RequestFileAccess>()` and `registerAccess(kind: RequestKind, access: RequestFileAccess): void` (throws an error if the type is already registered); rewrite `findReadable`: invalid UUID or missing file → `null`; `file.requestId === null` → readable by its author alone (unchanged); request missing → `null`; `this.access.get(request.kind)` missing → `null` (closed by default); otherwise `await access.canRead(user, file, request) ? file : null`; rewrite `assertCanAttach` likewise with `canAttach` (`NOT_FOUND` if refused, unchanged)
- [X] T040 [US4] Create `backend/src/requests/work-file-access.ts` (`@Injectable() WorkFileAccess implements RequestFileAccess, OnModuleInit`, injects `FilesService` and `RequestPolicyLoader`) taking over word for word the work-request branch of the old `findReadable` (`canReadRequest`) and of the old `assertCanAttach` (`canWriteInThread`), and registering itself with `files.registerAccess('WORK', this)` in `onModuleInit`; create `backend/src/coverage/coverage-file-access.ts` (`CoverageFileAccess`, injects `FilesService`, `PrismaService`, `CoverageAccessLoader`) taking over the `COVERAGE` branch (`coverage.facts`, proof = `file.isCompletionProof` or `coveragePresence` attendance, `canReadPresenceProof` / `coverageAccess === 'full'`) and `canAttach` equivalent to the current behavior for a coverage (check the current behavior of `assertCanAttach` on a `COVERAGE` request and reproduce it identically), registered by `registerAccess('COVERAGE', this)`; declare `WorkFileAccess` in `requests.module.ts` (which already imports `FilesModule`) and `CoverageFileAccess` in `coverage.module.ts`, **adding `FilesModule` to the `imports` of `CoverageModule`**: it does not import it today [VERIFIED], and `CoverageFileAccess` needs it to receive `FilesService` (exported by `FilesModule` [VERIFIED]). This `coverage → files` dependency respects the layer order of R7; check that `FilesModule` imports no module of `coverage/` or `requests/` (no NestJS module cycle); remove from `files.module.ts` and `files.service.ts` any import of `requests/` and `coverage/`; `files-voice.spec.ts`, `coverage.spec.ts`, `coverage-work-isolation.spec.ts`, `messages.spec.ts` green with no change of expectations (A10, A11, FR-014)
- [X] T041 [US4] Create `backend/src/scheduler/job-interval.ts` exporting `export const JOB_INTERVAL_MS = 15_000;` and remove it from `scheduler/auto-close.job.ts` (imported by `auto-close.job.ts`, `overdue.job.ts`); move `backend/src/coverage/coverage-deadlines.job.ts` to `backend/src/scheduler/coverage-deadlines.job.ts` (`git mv`), register it in `backend/src/scheduler/scheduler.module.ts` (import `CoverageModule` and have `CoverageModule` export the service the job depends on, `CoverageActionsService`) and remove it from `coverage.module.ts`; update the comments that cite the old path (`coverage/domain/coverage-deadlines.ts`, `scheduler/overdue.job.ts`) (A15)
- [X] T042 [US4] Rerun `backend/test/unit/architecture-layers.spec.ts`: it MUST be green. If violations not anticipated by R7 remain, fix them by a move of the same kind or, if that requires a behavior change, stop and report them (FR-012, FR-013)
- [X] T043 [P] [US4] In `backend/src/notifications/notifications.service.ts`, delete the `NoopNotificationPublisher` class and the comment « Implémentation sans effet en Phase 2 ; remplacée par Socket.IO en US4 (T070) » (No-op implementation in Phase 2; replaced by Socket.IO in US4 (T070)); check with `grep -rn "NoopNotificationPublisher" backend` that no mention remains (A16)
- [X] T044 [P] [US4] In `backend/src/realtime/realtime-gateway.module.ts`, replace the comment with: « Passerelle Socket.IO, séparée du registre des connexions (RealtimeModule, global, sans dépendance à l'authentification) : la passerelle authentifie avec SessionService (AuthModule). » (Socket.IO gateway, separate from the connection registry (RealtimeModule, global, with no dependency on authentication): the gateway authenticates with SessionService (AuthModule).) (R7)
- [X] T045 [P] [US4] Remove `@mui/icons-material` from `frontend/package.json` (`npm uninstall -w frontend @mui/icons-material`) after rechecking `grep -rn "@mui/icons-material" frontend/src frontend/tests` (no result expected); `npm run -w frontend build` and `npm run -w frontend test` green (A18)
- [X] T046 [P] [US4] Run `npx prettier --write backend/scripts/check-users.ts` (A19); `npm run lint` green
- [X] T047 [P] [US4] In `frontend/src/api/types.ts`, replace the header comment with: « Types partagés avec l'API, écrits à la main. Les énumérations sont comparées au schéma Prisma par tests/api/enums-sync.test.ts. » (Types shared with the API, written by hand. The enums are compared with the Prisma schema by tests/api/enums-sync.test.ts.) (A17, R10)

- [X] T048 [US4] Run quickstart.md scenario 5, **counter-tests included**: (a) temporarily add in `backend/src/files/files.service.ts` an `import '../requests/request-policy.loader';`, run `npm run -w backend test -- architecture-layers` → failure naming `files/files.service.ts → ../requests/request-policy.loader`; undo (`git checkout -- backend/src/files/files.service.ts`); (b) temporarily add a value `TEST_VALUE` to `enum RequestStatus` of `backend/prisma/schema.prisma`, run `npm run -w frontend test -- enums-sync` → failure listing `RequestStatus : manquant côté interface [TEST_VALUE]`; undo; (c) full `npm test` green; check with `git status` that no temporary change remains; record the outputs in `docs/validation/verification-003.md` (finding G1, US4 scenarios 1 and 2, SC-006)

**Checkpoint**: US1 to US4 work; layers checked automatically

---

## Phase 7: User Story 5 - Go to production safely (Priority: P3)

**Goal**: mandatory backup before migration, restore exercised, headers verified, checks replayed (FR-017 to FR-021)

**Independent Test**: quickstart.md, scenario 6, on a staging server

### Tests for User Story 5 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation** (finding C1, principle I)

- [X] T049 [US5] Observe, on a local database (`npm run -w backend db:dev`) with an empty test migration pending (`npx prisma migrate dev --create-only --name test_pending` in `backend/`), the exact exit code and text of `npx prisma migrate status` (Prisma 6) in three states: schema up to date, pending migration, database stopped; then delete the test migration; record the three outputs in `docs/validation/verification-003.md` ([INFERRED] point of R12). They serve as data for the fake `npx` of T050
- [X] T050 [US5] Create `backend/test/unit/api-entrypoint.spec.ts` (research R12): for each case, create a temporary folder (`fs.mkdtempSync`) containing `bin/npx` and `bin/node` (executable `#!/bin/sh` scripts) that append their arguments to a log file; the fake `npx` answers `prisma migrate status` with the output and code noted in T049 depending on the case, and succeeds for `prisma migrate deploy`; run `deploy/api-entrypoint.sh` with `spawnSync(shell, [script])`, `env: { PATH: <temporary bin> + separator + PATH, PRE_MIGRATION_BACKUP_DIR: <temporary backups folder>, PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES: '60' }`. Shell: `/bin/sh` under Linux; under Windows, `bash.exe` from Git for Windows, derived from `git --exec-path` (`…/mingw64/libexec/git-core` → `…/bin/bash.exe`); if no POSIX shell is found, fail with an explicit message (no silent skip). Cases: (1) schema up to date → `migrate deploy` not called, fake `node` called with `dist/main.js`; (2) pending migration, empty backups folder → code 1, stderr contains « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. » (Pending migration without a recent backup: run deploy/deploy.sh.), neither `migrate deploy` nor `node`; (3) pending migration, `db-20260101T000000Z.dump` dated 2 hours ago (`fs.utimesSync`) → same as (2); (4) pending migration, archive dated 5 minutes ago → `migrate deploy` then `node dist/main.js`, in this order; (5) database unreachable (error output of T049) → code 1, Prisma output copied, neither `migrate deploy` nor `node`. Observe the failure of cases (2), (3) and (5) with the current entrypoint

### Implementation for User Story 5

- [X] T051 [P] [US5] Create `deploy/deploy.sh` (executable, `set -euo pipefail`, header comment in the style of `deploy/backup/restore.sh`) according to `contracts/cli-and-deploy.md`: `COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)`; step 1 `"${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/bash backup /scripts/backup.sh`, stop with a message on failure; step 2 `"${COMPOSE[@]}" up -d --build` (R12)
- [X] T052 [P] [US5] In `deploy/docker-compose.yml`, `api` service: add the volume `${BACKUP_DIR:-./backups}:/backups:ro` and the variable `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES: ${PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES:-60}`; add it commented out to `deploy/.env.example` (`contracts/configuration.md`)
- [X] T053 [US5] In `deploy/api-entrypoint.sh` (POSIX `sh` shell, `set -eu` kept), before `npx --no-install prisma migrate deploy`: `BACKUP_DIR="${PRE_MIGRATION_BACKUP_DIR:-/backups}"`; run `npx --no-install prisma migrate status` capturing output and code (without `set -e` interrupting); according to the outputs noted in T049: schema up to date → start without a check; pending migration → require a file `"$BACKUP_DIR"/db-*.dump` modified less than `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes ago (`find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' -mmin -"${PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES:-60}"`), otherwise print on stderr « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. » and `exit 1`; any other error (database unreachable) → print the output and `exit 1`; `exec node dist/main.js` unchanged. T050 green locally and in CI
- [X] T054 [P] [US5] In `README.md` (production section) and `docs/coverage-migration.md`, replace the manual backup before updating and the command `docker compose … up -d --build` with `deploy/deploy.sh`, explaining that the API refuses to apply a migration without a backup less than `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes old (FR-018)
- [ ] T055 [US5] On staging, run quickstart.md scenario 6 point 1 (empty test migration, `up` without the script → refusal; `deploy/deploy.sh` → backup then migration); then check with `docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps` that the `api` service is `healthy` (its healthcheck queries `http://127.0.0.1:3000/api/health`: the production port stays 3000 despite the change in `main.ts`, FR-002, US1 scenario 5, finding G4); delete the test migration from the repository; record in `docs/validation/verification-003.md` (FR-018, A22, A23)
- [ ] T056 [US5] On a blank server, restore a real backup with `deploy/backup/restore.sh <timestamp>`; check the login, a request with a voice message and a photo, the audit log; measure the duration; record in a new `docs/validation/restauration.md` (date, server, backup timestamp, duration, gaps) (FR-020, A24, SC-008)
- [ ] T057 [P] [US5] On staging over HTTPS, run `curl -sI https://<domain>/` and `curl -sI https://<domain>/api/health`; check `Content-Security-Policy` and `Strict-Transport-Security`; send a 27 MB file to the API and observe the refusal; record the outputs in a new `docs/validation/en-tetes-securite.md` (FR-021, A25)
- [X] T058 [US5] Run `npm run test:e2e` (all profiles, including `e2e/sc001-create-timing.spec.ts`) and record the result in `docs/validation/verification-003.md` (FR-017, FR-019 manual part, A20, A26)

**Checkpoint**: all user stories are functional and verified

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: documentation closure and final verification

- [X] T059 Update `docs/ARCHITECTURE.md` (FR-024): remove the mention "trois modifications non commitées" (three uncommitted changes) from the header; mark each handled finding "corrigé (commit <sha>)" (fixed (commit <sha>)); re-mark A04, A11, A20, A23, A24, A25, A26 as [VERIFIED] (confirmed or refuted) with the proof; add N1 to N3; describe the layer order and the test that checks it (§10); list the remaining out-of-scope cycles (`auth ↔ settings`, `auth ↔ realtime`, `users`, `notifications`); update §9 (port 3002, `start:dev`, `deploy/deploy.sh`, CI) and §11
- [X] T060 [P] Update the register of `specs/003-corrections-audit-technique/spec.md`: status of each CT finding, and a note in the decisions table that D1 awaits confirmation by the school
- [X] T061 Run `npm run verify` and `npm run -w backend typecheck`, `npm run -w frontend typecheck`; record the final results in `docs/validation/verification-003.md` (section « Vérification finale » (Final verification), with the test counts as in `verification-finale.md`); check that CI is green on the latest commit (SC-002)
- [X] T062 Reread `quickstart.md` from start to finish and check that each scenario is recorded in `docs/validation/`; tick in `specs/003-corrections-audit-technique/spec.md` the criteria SC-001 to SC-009 that are reached, and list those that remain open (for example for lack of a staging server); before merging the feature into `master`, apply `docs/procedure-fusion.md` (T006) and tick the four checks in the pull request

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependency
- **Foundational (Phase 2)**: after Phase 1; BLOCKS all user stories (green suite + CI)
- **US1 (Phase 3)**: after Phase 2
- **US2 (Phase 4)**: after Phase 2; functionally independent of US1, but T014 and T020 modify `config.spec.ts` / `config.ts` like T002 and T007 → do US1 first to avoid conflicts
- **US3 (Phase 5)**: after Phase 2; independent of US1 and US2. T029 adds `AUTO_ASSIGNEE_UNAVAILABLE` in `errors.ts` (T028); no conflict with US4 if US3 is finished before T035–T040 (files `request-transitions.service.ts`, `request-policy.loader.ts` touched by both)
- **US4 (Phase 6)**: after Phase 2; **recommended after US2 and US3**, because T035–T041 move files that US2 (`origin.guard.ts`, `app-logger.ts`) and US3 (`request-policy.loader.ts`) modify
- **US5 (Phase 7)**: T051, T052 and T054 are independent (no dependency on another task; they follow the contracts); T053 depends on T049 and T050 (outputs noted in T049, red test of T050, itself written after T049); T055 depends on T051, T052 and T053; T055–T058 also require a staging server and the end of US1 to US4 to validate the final version
- **Polish (Phase 8)**: after all stories

### Within Each User Story

- Tests written and seen red before implementation (T063, T014–T017, T025–T026, test of T031, T033–T034, T050); the only exception, T008, pins an existing behavior and is green as soon as written
- US5: T049 → T050 → T053; T051, T052 and T054 with no prerequisite; T051, T052 and T053 before T055
- T063 → T064 → T005 (CI must be green: N3 noted by its first pass) → T006
- US4: T035 → T036 → T037 (same chain of `common`/`audit`/`auth` imports); T038 before T040; T039 before T040; T042 after T035–T041

### Parallel Opportunities

- US1: T009, T010, T011, T012 (distinct files)
- US2: T014, T015, T016 (tests); T018 and T019 (distinct files)
- US3: T026, T030 and T031 (frontend) in parallel with T027–T029 (backend)
- US4: T033 and T034; T043, T044, T045, T046, T047 among themselves and with the chain T035–T042
- US5: T051, T052 and T054 among themselves and with the chain T049 → T050 → T053; T057; T049–T054 can progress during US3/US4
- Team: one developer on US3 (assignment backend), another on US5 (deployment), with no file conflicts

---

## Parallel Example: User Story 2

```bash
# Tests first, in parallel:
Task: "TRUST_PROXY cases in backend/test/unit/config.spec.ts"
Task: "SENSITIVE_KEY union in backend/test/unit/sensitive-keys.spec.ts"
Task: "isAllowedOrigin in backend/test/unit/origin.spec.ts"

# Then two independent implementations:
Task: "Create backend/src/common/sensitive-keys.ts and use it in app-logger.ts and audit.service.ts"
Task: "Create backend/src/common/origin.ts and use it in origin.guard.ts and realtime.gateway.ts"
```

## Parallel Example: User Story 4

```bash
Task: "Layer check in backend/test/unit/architecture-layers.spec.ts"
Task: "Enum sync in frontend/tests/api/enums-sync.test.ts"
Task: "Remove NoopNotificationPublisher from backend/src/notifications/notifications.service.ts"
Task: "Remove @mui/icons-material from frontend/package.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (initial state) + Phase 2 (green suite, CI)
2. Phase 3 (US1)
3. **STOP and VALIDATE**: quickstart.md scenario 1; a new developer starts without modifying any file
4. Merge possible after the manual check of T006: the team has a consistent environment and a CI

### Incremental Delivery

1. Setup + Foundational → green suite protected by CI
2. US1 → consistent environment (MVP)
3. US2 → security and traceability (P1, to deliver before any go-live)
4. US3 → assignment compliant with D1 (fixes the N1 blockage)
5. US4 → cleaned-up dependencies (no visible effect)
6. US5 → production procedure verified on staging
7. Polish → `docs/ARCHITECTURE.md` up to date, final verification

---

## Notes

- [P] = different files, no dependency on an unfinished task
- Commit after each task or logical group; in US4, one commit per move
- No existing test must see its expectations modified (SC-007), except T002 (port), which aligns a test with an already committed choice, and T008, which tightens two expectations (regular expression → exact message) without changing their meaning
- If a task reveals a gap with research.md, stop and report it rather than improvising a behavior change (FR-023)
- T055 to T058 depend on a staging server: if it is not available, leave them open and report it in `docs/validation/verification-003.md`
