# Research: Fixes from the technical audit

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-15

Each decision relies on the code of branch `003-corrections-audit-technique` (commit
`809b44a`), read for this plan. The markings follow the convention of `docs/ARCHITECTURE.md`:
**[VERIFIED]** = read in the code or observed by a command; **[INFERRED]** = interpretation.

## New findings noted during the plan

They complete the audit without redoing it; they will be carried over into `docs/ARCHITECTURE.md` (FR-024).

- **N1 [VERIFIED] — Possible blockage at approval.** The interface chooses whether to show the
  employee selector based on the **snapshot** (`RequestActions.tsx`:
  `automatic={request.rulesSnapshot.assignmentMode === 'AUTO'}`), while the server decides
  based on the **current category** (`RequestTransitionsService.assigneeContext`). If a
  category goes from automatic to manual while a request is waiting, the interface shows
  no selector and the server answers `ASSIGNEE_REQUIRED`: the manager cannot
  approve. Finding A04 [INFERRED] is therefore confirmed by reading; FR-009 will confirm it by a
  test. Decision D1 (everything frozen) removes this gap.
- **N2 [VERIFIED] — The cycles are wider than the audit says.** An analysis of the relative
  imports of `backend/src` (one-off script, folder by folder) shows that **11 folders**
  form a single strongly connected component: `audit`, `auth`, `common`, `coverage`,
  `files`, `notifications`, `realtime`, `requests`, `scheduler`, `settings`, `users`. The audit
  (§10) only cited four. See R7 for the scope retained.
- **N3 [VERIFIED] — Random order of events with the same timestamp.** Noted by the first
  CI run (T005, 2026-10-15): on the same commit, `coverage.spec.ts` passed in one
  run and failed in the other (`→CLOSED` before `→DONE`). The history is sorted by `createdAt`
  then `id` (`requests.service.ts`, `coverage.service.ts`, `coverage-admin.service.ts`); `id`
  is a random UUID, and two events of the same transaction often fall in the same
  millisecond. The order shown to users can therefore be wrong. See R15.

---

## R1 — Port 3002 in development, 3000 in production (FR-001, FR-002, A01)

**Decision**: align on 3002 all development sources still at 3000:
`backend/.env.example` (`PORT=3002`), `README.md` (line 41), `deploy/Caddyfile.dev` (two
`reverse_proxy host.docker.internal:3002`), `backend/test/unit/config.spec.ts` (expected 3002).
Production keeps 3000, already set explicitly by `deploy/api.Dockerfile` (`ENV PORT=3000`,
`EXPOSE`, `HEALTHCHECK`) and `docker-compose.yml` (`expose: '3000'`): nothing to change.

**Rationale**: [VERIFIED] `config.ts`, `main.ts`, `vite.config.ts`, `frontend/package.json` and
`start.bat` are already at 3002 (commit `1e6d4ee`). The production port is internal to the Docker
network and independent of the default value.

**Alternatives considered**: go back to 3000 everywhere (undoes an already committed choice); move
production to 3002 (no benefit, changes three deployment files and the healthcheck).

## R2 — Development launcher with reload (FR-003, A02)

**Decision**: the root script `dev:backend` calls `npm run -w backend start:dev`
(`nest start --watch`) instead of `start` (`node dist/main.js`). `start.bat` does not need to change
(it calls `npm run dev`).

**Rationale**: [VERIFIED] the README already recommends `start:dev`; `start` requires a prior
build and does not reload. A single change aligns both documents.

**Alternatives considered**: build before launching (`build && start`): slower, with no
reload.

## R3 — All configuration validated at startup (FR-004, A07)

**Decision**:
- `AppConfig` gains `trustProxy: string | number | boolean`. `loadConfig` reads `TRUST_PROXY`
  (default `loopback`) and accepts it if it is: `true`/`false`; an integer ≥ 0 (number of
  proxies); a comma-separated list of values among `loopback`, `linklocal`,
  `uniquelocal`, IPv4/IPv6 address or CIDR range. Otherwise an explicit `ConfigError`.
- `app.setup.ts` reads `config.trustProxy` via `APP_CONFIG` instead of `process.env.TRUST_PROXY`.
- `main.ts` listens on `app.get(APP_CONFIG).port` instead of re-reading `process.env.PORT`.
- `app.setup.ts` reads `config.isProduction` instead of `process.env.NODE_ENV` (same principle).

**Rationale**: [VERIFIED] `TRUST_PROXY` and `PORT` are read outside `loadConfig`; an invalid
`TRUST_PROXY` value is today only rejected by Express, with a technical message.
A single entry point for configuration makes validation testable by
`config.spec.ts`.

**Alternatives considered**: validation library (Joi, zod): a new dependency for
three lines of checking (principle II).

## R4 — Single list of sensitive keys (FR-005, A06)

**Decision**: create `backend/src/common/sensitive-keys.ts` exporting `SENSITIVE_KEY`, the union of the
two current expressions:
`/pass(word)?|hash|token|secret|cookie|authorization|^sid$|^text$|^message$|^content$/i`.
`common/app-logger.ts` and `audit/audit.service.ts` import it. The logger's text patterns
(`argon2`, `cookie`/`authorization` headers, `sid=`) stay specific to the logger, because
they apply to strings, not to keys.

**Rationale**: [VERIFIED] `authorization` is missing on the audit side and `^message$` on the logger side. Masking
a `message` key in a logged object does not affect an error's message
(`redact` handles `Error.message` separately) nor the first argument of Nest logs.

**Risk [INFERRED]**: a logged object whose `message` key carries useful information
(with no personal data) will be masked. The logger's unit test will check that error
messages remain readable.

**Alternatives considered**: two lists synchronized by a test: the duplication remains.

## R5 — Single origin check (FR-006, A08)

**Decision**: move `originOf` into `backend/src/common/origin.ts` with a function
`isAllowedOrigin(headers: { origin?: string; referer?: string }, appOrigin): boolean`.
`auth/origin.guard.ts` and `realtime/realtime.gateway.ts` both use it.

**Point to preserve [VERIFIED]**: today the HTTP guard accepts `Origin` **or**, failing that,
`Referer`; the Socket.IO gateway only accepts `Origin`. The single function takes
`referer` as optional: the gateway does not pass it, so as to change nothing in the behavior
(FR-023). The existing integration tests (`auth.spec.ts`, real-time tests) check both
paths.

**Alternatives considered**: align the gateway on `Referer`: unrequested behavior change.

## R6 — Super administrator reset in the initialization tool (FR-007, FR-010, A05, D2)

**Decision**:
- New subcommand of `backend/src/cli/bootstrap.ts`:
  `node dist/cli/bootstrap.js --reset-password [identifiant]` (default identifier: the oldest
  active super administrator). The first argument `--reset-password` is reserved; the
  historical call `bootstrap.js <identifiant> "<nom>"` stays unchanged.
- Exported, testable function `resetSuperAdminPassword(prisma, username?)` which, in **a
  single transaction**: checks that the account exists and has the `SUPER_ADMIN` role; writes
  the new Argon2id hash with `mustChangePassword: true`; deletes all the account's
  sessions; writes the `PASSWORD_RESET` audit (`actorId: null`, `targetType: 'User'`, `targetId`,
  `details: { reason: 'CLI' }`, `ip: null`). Temporary password of 16 random bytes
  (base64url), shown only once.
- Real-time connections still open are closed by the existing job
  `SessionRevalidationJob` (≤ 60 s), since the sessions no longer exist in the database.
- `backend/scripts/reset-superadmin-password.ts` is deleted; the README and the operations
  documentation point to the subcommand, which can also be used in the production container
  (`docker compose … exec api node dist/cli/bootstrap.js --reset-password`).

**Rationale**: [VERIFIED] the same sequence already exists in
`UsersService.resetPassword` (transaction, `session.deleteMany`, `PASSWORD_RESET` audit);
the initialization tool already logs (`USER_CREATED`, `reason: 'BOOTSTRAP'`). The current
script is not compiled into `dist/`: it cannot be used in production. The
`details.reason` field is part of the audit allowlist [VERIFIED: `USER_CREATED` already
uses it].

**Alternatives considered**: keep the separate script (D2 option A, rejected by the decision);
reuse `UsersService` outside Nest (it depends on `RealtimeService` and on injection).

## R7 — Dependencies between folders: scope and verification (FR-012, FR-013, A09, A12, N2)

**Decision — scope**: make acyclic, and keep acyclic, the subgraph of the folders
`common`, `audit`, `auth`, `files`, `requests`, `coverage`, `scheduler`, following this layer
order (a folder may only import folders located **before** it, plus
`config`):

```text
config → common → audit → auth → files → requests → coverage → scheduler
```

The other cycles noted in N2 (`auth ↔ settings`, `auth ↔ realtime`, `users`, `notifications`)
are **out of scope**: they are recorded as remaining [VERIFIED] findings in
`docs/ARCHITECTURE.md`, without a fix (principle II).

**Decision — moves** (no business rule changed):

| Element | From | To | Cycle removed |
|---|---|---|---|
| `PolicyUser`, `ALL_PERMISSIONS`, `permissionsFor`, `canManageAdministration`, `canReadAudit` | `requests/domain/access-policy.ts` | `common/authorization.ts` | `auth → requests` (A09, A12) |
| `clientIp`, `requestPath` | `auth/request-info.ts` | `common/request-info.ts` | `common → auth` |
| `SuperAdminGuard` (now uses `canManageAdministration`) | `common/super-admin.guard.ts` | `audit/super-admin.guard.ts` | `common → audit` |
| File access decision | `files/files.service.ts` | registry by request type (R8) | `files → requests`, `files → coverage` (A10) |
| `CoverageDeadlinesJob` | `coverage/` | `scheduler/` | `coverage → scheduler` (A15) |
| `JOB_INTERVAL_MS` | `scheduler/auto-close.job.ts` | `scheduler/job-interval.ts` | — (clarity) |

Why `SuperAdminGuard` goes into `audit/` and not `auth/`: it depends on `AuditService`;
placing it in `auth/` would create `audit → auth` (the audit controller uses it) while
`auth → audit` already exists.

**Decision — automatic verification**: Jest test
`backend/test/unit/architecture-layers.spec.ts`, with no new dependency: it walks
`backend/src/**/*.ts`, extracts the relative imports (including `import type`), maps them to the
top-level folder, and fails if a folder of the list imports a folder located after
it, naming the source file and the target. It runs with the unit suite, therefore in CI
(R11).

**Rationale**: [VERIFIED] ESLint has no import plugin installed; `madge` or
`dependency-cruiser` reason per file or require heavier configuration than a
50-line test. A test in the existing suite respects principle I and costs no
dependency.

**The `RealtimeGatewayModule` module is kept [VERIFIED]**: it separates the connection registry
(`RealtimeService`, global, with no dependency on authentication) from the gateway
(which authenticates with `SessionService`). This is a legitimate split, not just a
workaround; only its comment is reworded. Scenario 1 of user story 4 of the spec
is adjusted accordingly.

**Alternatives considered**: remove all cycles among the 11 folders (large refactoring, high
risk, beyond the stated need); NestJS `forwardRef` (hides the cycle without removing it).

## R8 — File access by registry (FR-014, A10, A11)

**Decision**: `files/` defines an interface `RequestFileAccess`:

```text
canRead(user, file, request): Promise<boolean>
canAttach(user, request): Promise<boolean>
```

and `FilesService` exposes `registerAccess(kind: RequestKind, access: RequestFileAccess)`.
`RequestsModule` (kind `WORK`) and `CoverageModule` (kind `COVERAGE`) register their
implementation at startup (`onModuleInit`), which takes the current logic of
`findReadable` and `assertCanAttach` **word for word**. `FilesService` keeps: file without a request → readable by
its author alone; unregistered type → refusal (closed by default). `FilesModule` no longer imports
`RequestPolicyLoader` nor `CoverageAccessLoader`.

**Rationale**: [VERIFIED] `FilesModule` today declares the loaders of both domains.
Registration at startup avoids any circular injection (`files` knows no
business module). The file reading integration tests (requests and attendance
proofs) remain unchanged in their expectations (SC-007).

**Alternatives considered**: multi-provider injection token (not native in NestJS);
move the check into each business controller (would duplicate the download service).

## R9 — Single declaration of the rules loader and cleanup (FR-015, A13, A15, A16, A18, A19)

**Decision**:
- `requests/request-policy.module.ts` provides and exports `RequestPolicyLoader`;
  `requests`, `categories`, `messages`, `coverage` import it; `files` no longer needs it (R8).
- Removal of `NoopNotificationPublisher` and its outdated comment
  (`notifications.service.ts`) [VERIFIED: no use in `src` nor `test`].
- Removal of `@mui/icons-material` from `frontend/package.json` [VERIFIED: no import].
- `backend/scripts/check-users.ts` reformatted by Prettier (the other script is deleted in R6).
- `CoverageDeadlinesJob` moved into `scheduler/` (see R7).

**Rationale**: mechanical fixes, covered by the existing suite.

## R10 — Statuses and enums synchronized between server and interface (FR-016, A17)

**Decision**: Vitest test `frontend/tests/api/enums-sync.test.ts` that reads
`backend/prisma/schema.prisma` and `frontend/src/api/types.ts` (and
`frontend/src/features/requests/types.ts` if an enum is redeclared there), extracts the
values of the common enums (`Role`, `Priority`, `RequestStatus`, `RequestKind`,
`Circuit`, `ClosureMode`, `AssignmentMode`, `Permission` and the others present on both
sides) and fails by listing the missing or extra values. The comment in `types.ts`
announcing generated types is removed; the `api:types` script is kept as an
optional tool, with no promise.

**Rationale**: [VERIFIED] the backend does not decorate its DTOs for OpenAPI (no `@ApiProperty`):
the generated types would be poor without an annotation project. The database is the
source of truth for enums; a file-reading test is enough, with no dependency.

**Alternatives considered**: full OpenAPI generation (heavy project, beyond the need);
shared types package (new workspace, principle II).

## R11 — Partial continuous integration (FR-017, FR-019, A20, A21, D3, D10)

**Decision**: `.github/workflows/ci.yml` (GitHub repository `origin` [VERIFIED]), triggered on
`push` and `pull_request`, with a single job of identifier `verify` and name « Contrôles qualité »
(quality checks) (stable name, cited by the pre-merge check and reusable by a future branch
protection):
1. `ubuntu-latest`, Node 24 (`.nvmrc`), `npm ci`, installation of `ffmpeg` (apt);
2. `npm run lint`; `npm run -w backend typecheck`; `npm run -w frontend typecheck`;
3. `npm run -w backend test`; `npm run -w backend test:integration`;
   `npm run -w frontend test`;
4. `npm audit --audit-level=high`.

End-to-end tests (including the timing test `e2e/sc001-create-timing.spec.ts`) stay
manual, with a dated report in `docs/validation/` (model: `verification-finale.md`).
[VERIFIED] The search performance test (`search-performance.spec.ts`) is an
integration test: it therefore runs in CI; if it is unstable on GitHub machines, it will be
excluded from it and replayed by hand.

**Points to check on the first CI pass [INFERRED]**:
- the integration tests start their own PostgreSQL via `embedded-postgres`
  (`test/utils/global-setup.ts`): `package-lock.json`, produced under Windows, must
  contain the optional Linux binary (`@embedded-postgres/linux-x64`); otherwise, regenerate the
  lock or use a `postgres:17` service in CI;
- `prisma generate` must run before the tests (via `postinstall` or a dedicated step).

**Merge into `master` (finding G3, decision D10)**: CI reports failures but does not block
the merge by itself. The branch protection that would do so is not available:
[VERIFIED] on 2026-10-15, `GET /repos/…/branches/master/protection` returns `403 Upgrade to
GitHub Pro or make this repository public` (private repository, free plan). Decision D10: the
repository stays private, with no subscription; the protection is postponed and replaced by a
**mandatory manual check before every merge** (`contracts/cli-and-deploy.md`
§Vérification avant fusion, i.e. the pre-merge check): CI result, required tests, absence of unresolved failure,
diff review, ticked in the pull request. It does not technically prevent a merge
whose tests fail.

Setting to create if the plan ever allows it (GitHub → Settings → Branches → Branch protection
rules, on `master`): "Require a pull request before merging", "Require status checks to
pass before merging" with « Contrôles qualité », "Require branches to be up to date before
merging".

**Rationale**: decision D3; takes exactly `npm run verify`, without the browsers.

**Alternatives considered**: everything in CI, including Playwright (rejected by D3); another CI
service (the repository is on GitHub); paid GitHub plan or public repository to get
branch protection (rejected for now by D10).

## R12 — Guaranteed backup before migration (FR-018, A22, A23)

**Decision**:
- `deploy/deploy.sh` (host): (1) one-off backup via the `backup` service
  (`docker compose run --rm --entrypoint /bin/bash backup /scripts/backup.sh`), stop if it
  fails; (2) `docker compose up -d --build`.
- `deploy/api-entrypoint.sh`: before `prisma migrate deploy`, runs `prisma migrate status`;
  if migrations remain to be applied, requires a `db-*.dump` archive newer than
  `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` (default 60) in `/backups`, mounted **read-only**
  in the `api` container; otherwise it stops with an explicit message without touching the database.
  With no pending migration, normal startup (no slowdown of restarts).
- `README.md` and `docs/coverage-migration.md` replace the manual step "make a backup"
  with `deploy/deploy.sh`.
- **Testability (finding C1 of the analysis, principle I)**: the backups folder is read from
  `PRE_MIGRATION_BACKUP_DIR` (default `/backups`) instead of being hard-coded, and the
  `npx` and `node` commands are resolved through the `PATH`. A Jest test
  `backend/test/unit/api-entrypoint.spec.ts` runs the script with a POSIX shell, a fake `npx`
  and a fake `node` (scripts placed at the head of the `PATH`, which write their arguments to a
  log and simulate the output of `prisma migrate status`) and a temporary backups folder whose
  age is set by `fs.utimesSync`. Cases: schema up to date (no
  migration, startup); pending migration with no archive (code 1, message, neither `migrate
  deploy` nor startup); pending migration with an archive that is too old (same); pending
  migration with a recent archive (`migrate deploy` then startup); database unreachable (code 1,
  Prisma output shown, neither `migrate deploy` nor startup). Shell: `sh` under Linux (CI);
  under Windows, `bash.exe` from Git for Windows, found from `git --exec-path`
  (`…/mingw64/libexec/git-core` → `…/bin/bash.exe`). If no POSIX shell is found, the test
  fails with a message explaining it (no silent skip). The test runs in the unit suite,
  therefore in CI.

**Rationale**: [VERIFIED] the `api` container has no `pg_dump`; the `backup` service has it and already
knows how to produce and check an archive (`pg_restore --list`). The check in the entrypoint
also covers a `docker compose up` launched by hand, without the script.

**Point to check [INFERRED]**: the exit code and the text of `prisma migrate status`
(Prisma 6) when migrations are pending; the entrypoint will rely on the text
"Database schema is up to date" if the exit code is not enough. Noted before the test
(task T049), then verified on staging (quickstart, scenario 6).

**Alternatives considered**: backup in the API entrypoint (adds the PostgreSQL client to the
image, mixes responsibilities); trust in the manual procedure
(this is the situation denounced by A22).

## R13 — Restore and security headers verified (FR-020, FR-021, A24, A25)

**Decision**: no code; two reports to produce on a staging server:
`docs/validation/restauration.md` (real backup → `deploy/backup/restore.sh` on a blank
server, duration, checks: login, a request with a voice message and a photo, audit log)
and `docs/validation/en-tetes-securite.md` (output of `curl -sI` on `/` and `/api/health`:
`Content-Security-Policy`, `Strict-Transport-Security`, and refusal of an upload larger than 26 MB).

**Rationale**: these [INFERRED] findings can only be confirmed under real conditions.

## R14 — Automatic assignment frozen at submission (FR-008, FR-009, FR-011, A03, A04, D1, D8, D9)

**Business decisions applied** (all validated on 2026-10-15, see spec "Clarifications"):
D1 (everything frozen), D8 (person not assignable → refusal then choice by the manager), D9 (earlier
requests → current category). No other rule is introduced.

**Decision**:
- `RequestRulesSnapshot` gains `autoAssigneeId: string | null`, set by
  `RequestPolicyLoader.rulesSnapshot` (`category.assignmentMode === 'AUTO' ?
  category.autoAssigneeId : null`). JSON field: **no migration**.
- `assigneeContext`, for `APPROVE`, reads `rules.assignmentMode` and `rules.autoAssigneeId` from the
  snapshot. If the snapshot does not contain the `autoAssigneeId` key (request submitted before the
  fix, exception EXC-1, D9), it reads `category.autoAssigneeId`, and only in that case.
- If the person to assign is missing or no longer assignable (`canPickRecipient`: inactive
  account or removed from the category recipients; exception EXC-2, D8), an approval
  without `assigneeId` receives the new code `AUTO_ASSIGNEE_UNAVAILABLE` (422, « La personne
  désignée pour cette catégorie n'est plus disponible. Choisissez l'employé qui réalisera la
  demande. » (The person designated for this category is no longer available. Choose the employee who will carry out the request.)). The manager can then approve by supplying `assigneeId`; the server only
  accepts it in automatic mode in that case, and refuses a non-assignable account
  (`RECIPIENT_NOT_ALLOWED`).
- The `ASSIGNED` history event created by the approval (`RequestEvent`, `toValue`) carries
  `assigneeSource`: `SNAPSHOT`, `CATEGORY_CURRENT` (EXC-1) or `MANAGER_CHOICE` (manual mode or
  EXC-2). `HistoryTimeline` shows it after « Affectée à <nom> » (Assigned to <name>).
- Interface: `ApprovalDialog` shows the selector when the server returns
  `AUTO_ASSIGNEE_UNAVAILABLE`.
- Tests first (FR-009): an integration test that reproduces the case "E1 designated at
  submission, E2 designated afterwards" (red today: assigned to E2), the case "category switched
  to manual" (red today: `ASSIGNEE_REQUIRED`, see N1), the cases "E1 deactivated" and
  "E1 removed from the recipients" (EXC-2), and the case "old request without `autoAssigneeId`"
  (EXC-1).

**Rationale**: decision D1. The snapshot already exists for this reason (FR-022 of phase 1); it is
enough to add the person to it. The explicit fallback prevents a request from staying blocked without
assigning an inactive account (FR-011).

**Alternatives considered**: backfilling existing snapshots by data migration (freezes after the
fact a value that may not have been the one at submission, hence inaccurate);
refusal without fallback (request blocked until the administrator intervenes).

## R15 — Write order of history events (FR-025, N3)

**Decision**: column `RequestEvent.seq` (`BIGSERIAL`, `@default(autoincrement())`), added
by migration `0003_request_event_seq`; chronological reads sort by `createdAt`
then `seq` instead of `createdAt` then `id`. `createdAt` stays the first criterion, because it carries
the displayed date. The column is never exposed by the API.

**Rationale**: the sequence reflects insertion order, including within a single transaction;
none of the 13 places that write events is modified. Adding a column rewrites
the table without triggering the "append-only" trigger (`BEFORE UPDATE OR DELETE`). Existing events
receive a number in the table's physical order, with no guarantee for past ties;
only future ties are fixed.

**Tests first**: `history-priority.spec.ts` and `coverage.spec.ts` insert two events with the
same `createdAt` whose `id`s are in the reverse order of writing: red with sorting by `id`,
green with `seq`, without depending on chance.

**Alternatives considered**: increasing timestamps imposed on each write (13 places to
modify, dates slightly falsified); UUID v7 (order guaranteed only from one millisecond to the
next); test tolerant of the order (hides a visible defect); CI rerun (unresolved failure,
forbidden by the pre-merge check).
