# Verification of feature 003 — fixes from the technical audit

- **Branch**: `003-corrections-audit-technique`
- **Machine**: Windows 11, Node.js 24.21, embedded PostgreSQL 17 (embedded-postgres)

## Initial state (T001)

- **Date**: 15 October 2026
- **Commit**: `ea47b02` (design documents only, no code modified since branch 002)

| Command | Exit code | Result |
|----------|----------------|----------|
| `npm run lint` | 0 | no problems |
| `npm run -w backend typecheck` | 0 | no errors |
| `npm run -w frontend typecheck` | 0 | no errors |
| `npm run -w backend test` (unit) | 1 | 348 / 349; 15 suites, 1 of them failing |
| `npm run -w backend test:integration` | 0 | 248 / 248; 24 suites (140 s) |
| `npm run -w frontend test` | 0 | 120 / 120; 17 files |

**Failure observed**: `backend/test/unit/config.spec.ts` › `loadConfig` › "charge une
configuration valide avec les valeurs par défaut" (loads a valid configuration with the default values): `expect(config.port).toBe(3000)`, received
`3002`. This is the expected failure (finding A01): the default port was changed to 3002 in commit
`1e6d4ee` without updating the test. It is fixed by T002.

**No other failure.**

## Phase 2 — green suite and CI

- **T002**: `config.spec.ts` now expects 3002; `npm run -w backend test`: 349 / 349.
- **T003**: `.github/workflows/ci.yml` created (job `verify`, "Contrôles qualité" (Quality checks)).
- **T004**: `package-lock.json` already contains `node_modules/@embedded-postgres/linux-x64`
  (`17.10.0-beta.17`, line 1155): no change to the lock file needed.

- **T005, first CI run** (commit `b9ed428`, 15 October 2026): `push` run
  (`38809322292`) succeeded on all steps; `pull_request` run (`38809324478`) failed on
  `coverage.spec.ts` › "1. nominal": `→CLOSED` received before `→DONE`. Same commit, different
  result: flaky test, finding **N3** (research R15). The Linux binary of embedded-postgres,
  `npm audit` and `search-performance.spec.ts` work in CI: no exclusion needed.
- **T063**: two deterministic tests added (`history-priority.spec.ts`, `coverage.spec.ts`);
  red before the fix (order reversed in both histories).
- **T064**: column `RequestEvent.seq` (migration `0003_request_event_seq`), sorting by
  `createdAt` then `seq`. Migration SQL identical to what Prisma generates for the schema.
  Local suite: lint and types with no errors; unit 349 / 349; integration 250 / 250;
  frontend 120 / 120.
- **T005, CI after the fix** (commit `6aac605`): `push` (`38811005287`, 3 min 40 s) and
  `pull_request` (`38811010302`, 4 min 30 s) runs succeeded on all steps.
- **T006**: `docs/procedure-fusion.md`, `.github/pull_request_template.md` and a pointer in
  `README.md`. Manual procedure (decision D10): GitHub does not prevent a red merge.

## Phase 3 — US1, consistent port 3002

- **T007**: `backend/test/unit/dev-port-consistency.spec.ts`, 9 cases; red on 6 before the
  fix (`.env.example`, `Caddyfile.dev`, `README.md`, `dev:backend`), green after.
- **T008**: `client.test.ts`, two expectations tightened to the exact message; green as soon as
  written (existing behavior, documented exception to the "red first" rule).
- **T009 to T012**: `PORT=3002` and comment in `backend/.env.example`; `Caddyfile.dev`
  to 3002; README (port 3002, instruction for an old `.env`); `dev:backend` →
  `start:dev`. `start.bat` calls `npm run dev`: no other change.
- Suites: backend unit 358 / 358; frontend 120 / 120; lint with no errors.
- **T013** (manual, Windows machine): **to do** — `start.bat`, login, reload without
  compilation, timing (SC-001), message displayed with the API stopped.

## Phase 4 — US2, security and traceability

- **T014 to T017** (tests first, all red before the fix): `TRUST_PROXY` cases in
  `config.spec.ts`; `sensitive-keys.spec.ts`; `origin.spec.ts`; `describe('resetSuperAdminPassword')`
  in `bootstrap-production.spec.ts`, real command line and unreachable database included.
- **T018**: `common/sensitive-keys.ts`, single list; the logger now masks `message`,
  the audit removes `authorization`. No logger call passes an object with a `message` key [VERIFIED].
- **T019**: `common/origin.ts` (`isAllowedOrigin`); Referer accepted for HTTP only,
  as before.
- **T020, T021**: `TRUST_PROXY` validated by `loadConfig` (list returned without spaces around
  commas); `app.setup.ts` and `main.ts` read `APP_CONFIG`. `process.env` is now only read in
  `config/` and `cli/bootstrap.ts`.
- **T022, T023**: `bootstrap.ts --reset-password [identifiant]`; script
  `reset-superadmin-password.ts` deleted; examples in the README.
- Suites: lint and types with no errors; unit 392 / 392; integration 257 / 257; frontend
  120 / 120.
- **T024** (manual, quickstart scenarios 2 and 3): **to do**.

## Phase 5 — US3, assignment frozen at submission

- **T025**: `auto-assignment-snapshot.spec.ts`, 7 cases. Before the fix: (1) assigned to E2 instead
  of E1 ([INFERRED] finding **A04 confirmed**, FR-009); (2) `422 ASSIGNEE_REQUIRED` (**N1
  confirmed**); (3) and (3b) `RECIPIENT_NOT_ALLOWED` instead of `AUTO_ASSIGNEE_UNAVAILABLE`;
  (5) and (6) source missing; (4) green (behavior kept). All green after the fix.
- **T026, T031** (interface): red, then green.
- **T027 to T029**: `autoAssigneeId` frozen in the snapshot; code `AUTO_ASSIGNEE_UNAVAILABLE`;
  `assigneeContext` follows the snapshot (EXC-1, EXC-2), source on the `ASSIGNED` event. The
  new refusal only replaces `ASSIGNEE_REQUIRED`, after the permission and state checks.
  `requests-circuit-b.spec.ts` and `assignable-employees.spec.ts` green, expectations unchanged.
- **T030**: approval dialog in manual-choice mode after `AUTO_ASSIGNEE_UNAVAILABLE` (server
  message, focus on the employee choice, without `autoFocus`: rule `jsx-a11y/no-autofocus`).
  **Deviation**: `autoAssigneeId` is not added to the interface's `rulesSnapshot` type, because
  the API does not expose it (`requests.mapper.ts`) and the interface does not need it.
- **T031**: source displayed after "Affectée à <nom>" (Assigned to <name>); earlier events unchanged.
- Suites: lint and types with no errors; unit 392 / 392; integration 264 / 264; frontend
  122 / 122. Local incident: an orphaned test PostgreSQL (end of run in `EBUSY` on
  Windows) blocked port 55433; stopped, then the integration suite was green.
- **T032** (manual, quickstart scenario 4): **to do**; D1 still has to be confirmed
  by the school.

## Phase 6 — US4, readable and verified dependencies

- **T033**: `architecture-layers.spec.ts`, red at the start on 11 imports: `auth → requests`
  (2), `common → audit`, `common → auth`, `files → requests` (4), `files → coverage` (3),
  `coverage → scheduler`. The import expression also covers imports without bindings
  (`import '…'`), without which counter-test (a) could not fail.
- **T034**: `enums-sync.test.ts`, green. `RequestStatus` and `DeadlineStage` in the schema are
  shared by work requests and class coverage; the interface splits them
  (`RequestStatus` + `CoverageStatus`, `DeadlineStage` + `CoverageStage`): the test compares the
  schema with their union. No real divergence.
- **T035 to T041** (one commit per move; after each, types, unit and integration
  green): `common/authorization.ts`; `request-info` to `common/`; `SuperAdminGuard` to
  `audit/`; `RequestPolicyModule`; file access registry (`WorkFileAccess`,
  `CoverageFileAccess`, closed by default; attaching a file to a coverage at
  upload remains refused, as before); coverage deadlines job in `scheduler/`.
  Existing tests: only import paths modified; two `describe` blocks of `access-policy.spec.ts`
  moved into `authorization.spec.ts`, expectations unchanged.
- **T042**: layer check green, no unexpected violation.
- **T043 to T047**: `NoopNotificationPublisher` deleted; comment on
  `RealtimeGatewayModule`; `@mui/icons-material` uninstalled (frontend build green);
  `check-users.ts` formatted; header of `api/types.ts`.
- **T048, counter-tests**:
  (a) `import '../requests/request-policy.loader';` added in `files/files.service.ts` →
  `architecture-layers` fails: "files/files.service.ts → ../requests/request-policy.loader
  (files ne peut pas dépendre de requests)" (files cannot depend on requests); reverted.
  (b) `TEST_VALUE` added to `enum RequestStatus` → `enums-sync` fails: "RequestStatus :
  manquant côté interface [TEST_VALUE] ; en trop côté interface []" (missing on the interface side [TEST_VALUE]; extra on the interface side []); reverted.
  (c) full suite: lint and types with no errors; unit 393 / 393; integration 264 / 264;
  frontend 127 / 127. `git status` clean after the counter-tests.

## Phase 7 — US5, going to production (T049 to T054; T055 to T058 on pre-production)

### T049 — outputs of `prisma migrate status` (Prisma 6.19.3)

Recorded on 16 October 2026 on a **disposable** PostgreSQL 17 database (embedded-postgres, port
55444, temporary folder deleted afterwards), with a **temporary copy** of `backend/prisma`
to which an empty test migration (`9999_test_pending`) was added. Neither the development database
(port 5433) nor `backend/prisma/migrations` was modified; no migration was
applied to a persistent database, hence no prior backup.

| State | Code | Output |
|------|------|--------|
| Schema up to date | 0 | stdout: `Database schema is up to date!` |
| Migration pending | 1 | stdout: `Following migration have not yet been applied:` then `9999_test_pending` |
| Database stopped | 1 | stderr: ``Error: P1001: Can't reach database server at `localhost:55444` `` |

Consequence for the entrypoint (T053): "pending" and "database unreachable" have the same code;
only the text `have not yet been applied` (stdout) tells them apart. Any other non-zero output
is treated as a blocking error.

### T050 to T054

- **T050**: `backend/test/unit/api-entrypoint.spec.ts`, 5 cases, fake `npx` and `node`; shell
  `/bin/sh` on Linux, `bash.exe` from Git for Windows on Windows (explicit failure if missing).
  Before the fix: (1), (2), (3) and (5) failing — (1) too, because the old script applied
  `migrate deploy` at every startup; (4) green.
- **T053**: `deploy/api-entrypoint.sh` (POSIX `sh`, `set -eu`, LF line endings enforced by
  `.gitattributes`): schema up to date → start; pending migration → a `db-*.dump` archive less
  than `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes old required in `PRE_MIGRATION_BACKUP_DIR`
  (default `/backups`), otherwise refusal; any other error → Prisma's output copied, code 1.
  T050 green (5 / 5).
- **T051**: `deploy/deploy.sh` (bash, `set -euo pipefail`, executable, mode 100755):
  backup by the `backup` service then `up -d --build`; refuses to run outside the repository
  root or without `deploy/.env` (checked locally). **Deliberate deviation**: without `--no-deps`
  (contract and R12), so that the database is started before the backup at the first deployment.
  The Docker steps were not executed (Docker absent from the machine): to be verified in T055.
- **T052**: `docker-compose.yml`, `api` service: `${BACKUP_DIR:-./backups}:/backups:ro` and
  `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` (default 60); variable commented in
  `deploy/.env.example`. Production port 3000 and healthcheck unchanged.
- **T054**: `README.md` (Deployment section) and `docs/coverage-migration.md`: `deploy/deploy.sh`
  replaces the manual backup and `docker compose … up -d --build`; refusal explained.
- Suites: lint and types with no errors; unit 398 / 398; integration 264 / 264; frontend
  127 / 127.
- **T055 to T058**: not run (pre-production needed).

## Phase 8 — closing

- **T059**: `docs/ARCHITECTURE.md` updated: header, fixed findings with their commit,
  A04 and A11 re-marked [VERIFIED], A20 and A26 partially verified, A23 to A25 left open
  (pre-production); layer order and test described; remaining cycle measured on 16 October 2026:
  `auth`, `realtime`, `settings`, `users` (out of scope); new follow-up §12 (A01 to A35,
  N1 to N3).
- **T060**: handling status added to the register in `spec.md`; D1 still has to be confirmed
  by the school.

### Final verification (T061) — 16 October 2026, starting commit `4575b84`

`npm run verify`: exit code 0.

| Step | Result |
|-------|----------|
| Lint (ESLint, including jsx-a11y) | no problems |
| Backend and frontend types (`typecheck`) | no errors |
| Backend unit tests | 398 / 398 (21 suites) |
| Backend integration tests (embedded PostgreSQL) | 264 / 264 (25 suites) |
| Frontend tests (Vitest) | 127 / 127 (18 files) |
| `npm audit --audit-level=high` | no high or critical vulnerabilities (21 moderate, as in phase 1) |

Node warning `DEP0190` removed: `bootstrap-production.spec.ts` now launches `tsx` through
`node`, without a shell. GitHub CI green on `4575b84` (push and pull request); to be re-checked on
the closing commit.

### Final verification and end to end (T061, T058) — 22 October 2026, `master` `855961c`

Section A of `docs/validation/preproduction-003.md`, locally (Windows), after `npm ci` (the
local dependencies dated from 16 October: `@vitejs/plugin-react` was missing, launching the
frontend tests failed; unrelated to the code, CI installs with `npm ci`).

`npm run verify`: exit code 0.

| Step | Result |
|-------|----------|
| Lint (ESLint, including jsx-a11y) | no problems |
| Backend and frontend types (`typecheck`) | no errors |
| Backend unit tests | 572 / 572 (29 suites) |
| Backend integration tests (embedded PostgreSQL) | 599 / 599 (42 suites) |
| Frontend tests (Vitest) | 229 / 229 (32 files) |
| `npm audit --audit-level=high` | no high or critical vulnerabilities (21 moderate) |

GitHub CI green on `855961c` ("Contrôles qualité", all steps).

`npm run test:e2e` (T058), run from 00:04 to 00:42, school time: the assignment
flows ran. (Correction of 2026-10-22, spec 006: the guard meant to skip them from
22:00 to midnight never applied — the hour "22 h" read by `Number` gave NaN; fixed
in `e2e/coverage-class.spec.ts`, see `verification-006.md`.) 6 profiles: Chromium, Firefox, WebKit,
iPhone 13, Pixel 7, 320 px. **143 passed, 0 failed, 73 deliberately skipped** (37.7 min):

- 45: assignment flows `coverage-class.spec.ts` (3 flows × 3 widths), reserved for
  Chromium;
- 15: V18 and assignment screens at 320 px, reserved for the 320 px profile;
- 5: forced password change (shared `nouveau` account), reserved for Chromium;
- 4: V14 (real delays), reserved for Chromium and iPhone 13;
- 4: SC-001 measurement, reserved for the phone profiles.

SC-001 measurement (complete voice request created and sent, limit 60 s): **iPhone 13: 15.9 s;
Pixel 7: 14.0 s** (annotations of the `e2e/playwright-report` report).

### Quickstart review (T062)

| Scenario | Recorded | State |
|----------|----------|------|
| 1 — Start on port 3002 | automatic checks (Phase 3) | manual walkthrough **to do** (T013) |
| 2 — Configuration refused at startup | `config.spec.ts` tests (Phase 4) | manual startup **to do** (T024) |
| 3 — Traced reset | `bootstrap-production.spec.ts` tests (Phase 4) | two-browser walkthrough **to do** (T024) |
| 4 — Frozen assignment | `auto-assignment-snapshot.spec.ts` tests (Phase 5) | manual walkthrough **to do** (T032) |
| 5 — Dependencies and cleanup | counter-tests (Phase 6, T048) | **done** |
| 6 — Going to production | entrypoint tested (Phase 7); end to end and final verification (22 October) | T058 and T061 **done**; **to do on pre-production** (T055 to T057) |
| Closing | `docs/ARCHITECTURE.md` §12 (T059) | done; A23 to A26 open |

Success criteria: SC-003 to SC-007 met; SC-001, SC-002, SC-008 and SC-009 open or
partial (details in `spec.md`, "État des critères" (Status of the criteria)). The feature **cannot be
declared ready for production** until T055 to T058 are done.
