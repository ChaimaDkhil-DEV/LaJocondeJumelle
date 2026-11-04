# Implementation Plan: Fixes from the technical audit

**Branch**: `003-corrections-audit-technique` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-corrections-audit-technique/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Fix the "technical fix" findings of `docs/ARCHITECTURE.md` without changing visible
behavior, except for the assignment rule settled in D1:

- **Environment**: align development on port 3002 (production keeps 3000,
  explicit), run the API in reload mode, validate the whole configuration at startup.
- **Security and traceability**: a single list of masked keys, a single origin check,
  the super administrator reset built into the initialization tool with audit and
  session closing.
- **Assignment (D1, D8, D9)**: mode **and** person frozen in the snapshot at submission;
  two validated exceptions traced in the history: earlier request → current category
  (EXC-1, D9); frozen person not assignable → refusal then choice by the manager
  (EXC-2, D8). This also fixes a real approval blockage (finding N1).
- **Dependencies**: layer order `config → common → audit → auth → files → requests →
  coverage → scheduler` checked by a test; file access through a registry; rules loader
  declared once; dead code removed; server/interface enums compared by a
  test.
- **Production**: GitHub CI for lint, types, unit, integration and interface tests,
  dependency audit (D3); mandatory manual check before every merge, for lack of
  branch protection on the private repository (D10); mandatory backup before migration;
  restore and headers verified on staging.

A single migration (adding `RequestEvent.seq`, N3), no new runtime dependency. Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js 24 — unchanged

**Primary Dependencies**: NestJS 11, Prisma 6, React 19, Vite, TanStack Query 5, MUI — unchanged.
Removal: `@mui/icons-material` (unused). Addition: no package; GitHub Actions (external
service, not a code dependency)

**Storage**: PostgreSQL 17 — **one migration** (`0003_request_event_seq`: column
`RequestEvent.seq`, N3); one key added in the `Request.rulesSnapshot` JSON
([data-model.md](./data-model.md))

**Testing**: Jest (unit, integration on embedded PostgreSQL), Vitest + RTL, Playwright.
New tests: `architecture-layers.spec.ts` (Jest), `enums-sync.test.ts` (Vitest), assignment
and reset integration tests, `TRUST_PROXY` cases in `config.spec.ts`

**Target Platform**: Windows 11 development workstation; Linux VPS production, Docker Compose,
Caddy; CI `ubuntu-latest`

**Project Type**: web application (`backend/` API + `frontend/` SPA, npm workspaces)

**Performance Goals**: unchanged (phase 1). The fixes add no database access on hot
paths; the entrypoint only adds `prisma migrate status` at startup

**Constraints**: FR-023 — no visible behavior change outside D1; existing tests
unchanged in their expectations (SC-007); a single API instance (unchanged, A28)

**Scale/Scope**: 24 requirements (FR-001 to FR-025, without FR-022), about 35 files touched (mostly backend), 3
deployment files, 1 CI workflow, 1 pre-merge check procedure (D10), 3 validation reports

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|----------|--------------|--------|
| I. TDD (non-negotiable) | Every fix starts with a red test: `config.spec.ts` (port 3002, `TRUST_PROXY`), assignment integration test (red on the current behavior, FR-009), CLI reset test, shared masking test, layers test (red as long as cycles exist), enum synchronization test, automated test of `api-entrypoint.sh` (5 cases, written before the script change), ports and `dev:backend` script consistency test. The existing interface behavior when the API is stopped is pinned by a test (no change, FR-023). Refactorings with no visible effect (R7, R8, R9) are protected by the existing suite, unchanged in its expectations. CI (T003) runs the suite on every push and every pull request. Since branch protection is not available on the private repository (free plan, D10), the rule "aucune modification ne peut être fusionnée si la suite de tests échoue" (no change may be merged if the test suite fails) is enforced by a mandatory manual check before every merge (T006, `docs/procedure-fusion.md`): it does not technically prevent a red merge. | ⚠️ rule applied by hand (D10) |
| II. Simplicity / YAGNI | No new dependency (layer and enum checks done by in-house tests of a few dozen lines); one dependency removed; scope of cycles limited to the folders cited by the audit (the others are recorded, not fixed); no merging of state machines (out of scope). The only new mechanism, the file access registry, replaces a direct dependency on two domains: see Complexity Tracking. | ✅ (1 justification) |
| III. Accessibility and UX | Two interface changes: the approval dialog shows the employee selector after `AUTO_ASSIGNEE_UNAVAILABLE`, with the server's message (existing component, already accessible and tested with axe; RTL test added); the history adds the assignment source after « Affectée à <nom> » (Assigned to <name>) (text only, allowed by FR-023; test in `HistoryTimeline.test.tsx`). | ✅ |
| IV. Security and data | Unified and widened masking (FR-005); proxy configuration validated (FR-004); single origin check (FR-006); no secret added; temporary password never logged; `npm audit` blocking in CI. Retention periods still provisional (D4, out of scope): reservation inherited from phase 1. | ⚠️ inherited reservation (D4) |
| V. Workflows and communications | Reset outside the interface now traced (`PASSWORD_RESET`, sessions deleted); assignment source traced in the history (`assigneeSource`); statuses and transitions unchanged; file access refusals still logged and returned as 404 (registry closed by default). | ✅ |

**Application of principle I's merge rule (D10)**: the rule "Aucune modification ne
peut être fusionnée si la suite de tests échoue" (no change may be merged if the test suite fails) remains whole; this is not a waiver of
the rule. Only the means of enforcing it changes: for lack of branch protection on the
private repository (free plan), it relies on the manual check before merging (T006). Residual
risk accepted by the project lead: a red merge remains technically possible
by mistake; it is then fixed and recorded (`contracts/cli-and-deploy.md`).

**Result before Phase 0**: pass. **Result after Phase 1** (re-checked against
[data-model.md](./data-model.md) and [contracts/](./contracts/)): pass; a single migration (column addition, N3),
no new status, REST contract changed at a single point (approval); the D4 reservation
remains that of phase 1.

## Requirements → decisions mapping

| Requirements | Decision | Findings |
|---|---|---|
| FR-001, FR-002 | R1 | A01 |
| FR-003 | R2 | A02 |
| FR-004 | R3 | A07 |
| FR-005 | R4 | A06 |
| FR-006 | R5 | A08 |
| FR-007, FR-010 | R6 | A05 |
| FR-008, FR-009, FR-011 | R14 | A03, A04, N1 |
| FR-012, FR-013 | R7 | A09, A12, N2 |
| FR-014 | R8 | A10, A11 |
| FR-015 | R9 | A13, A15, A16, A18, A19 |
| FR-016 | R10 | A17 |
| FR-017, FR-019 | R11 | A20, A21, A26 |
| FR-018 | R12 | A22, A23 |
| FR-020, FR-021 | R13 | A24, A25 |
| FR-023 | all (non-regression) | — |
| FR-024 | closure ([quickstart.md](./quickstart.md)) | A01–A35, N1–N3 |
| FR-025 | R15 | N3 |

## Recommended order of work

1. **US1** (port, `dev:backend`, configuration): brings the suite back to green; prerequisite for
   everything else (principle I).
2. **CI (R11)** as soon as the suite is green, to verify the following steps; then the
   manual pre-merge check procedure (D10: no branch protection on the
   private repository).
3. **US2** (masking, origin, CLI reset).
4. **US3** (frozen assignment): red test first.
5. **US4** (layers, file registry, cleanup, enums): last on the code side, because
   these are large moves; one commit per move to ease review.
6. **US5** (backup before migration, restore, headers) then closure FR-024.

## Project Structure

### Documentation (this feature)

```text
specs/003-corrections-audit-technique/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R15, findings N1–N3
├── data-model.md        # Phase 1: snapshot, history, audit, configuration
├── quickstart.md        # Phase 1: validation scenarios
├── contracts/
│   ├── rest-api.md          # APPROVE and AUTO_ASSIGNEE_UNAVAILABLE
│   ├── configuration.md     # environment variables and ports
│   └── cli-and-deploy.md    # bootstrap --reset-password, deploy.sh, entrypoint, CI
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

Files touched (N = new, M = modified, D = moved, S = deleted):

```text
.github/workflows/ci.yml                              N  CI (R11)
.github/pull_request_template.md                      N  pre-merge check checkboxes (D10)
package.json                                          M  dev:backend → start:dev (R2)
README.md                                             M  port 3002, --reset-password, deploy.sh, pointer to procedure-fusion.md
backend/
├── .env.example                                      M  PORT=3002
├── prisma/schema.prisma                              M  RequestEvent.seq (N3, R15)
├── prisma/migrations/0003_request_event_seq/         N  adds the seq column (N3)
├── scripts/
│   ├── reset-superadmin-password.ts                  S  (R6)
│   └── check-users.ts                                M  formatting
├── src/
│   ├── main.ts                                       M  port read from APP_CONFIG
│   ├── app.setup.ts                                  M  trustProxy, isProduction from APP_CONFIG
│   ├── config/config.ts                              M  trustProxy validated
│   ├── cli/bootstrap.ts                              M  --reset-password, resetSuperAdminPassword()
│   ├── common/
│   │   ├── authorization.ts                          N  PolicyUser, permissionsFor, canManageAdministration, canReadAudit
│   │   ├── request-info.ts                           D  from auth/
│   │   ├── origin.ts                                 N  originOf + isAllowedOrigin
│   │   ├── sensitive-keys.ts                         N  single SENSITIVE_KEY
│   │   ├── app-logger.ts                             M
│   │   ├── errors.ts                                 M  AUTO_ASSIGNEE_UNAVAILABLE
│   │   └── super-admin.guard.ts                      D  → audit/
│   ├── audit/
│   │   ├── super-admin.guard.ts                      D  from common/
│   │   └── audit.service.ts                          M  shared SENSITIVE_KEY
│   ├── auth/ (origin.guard, session.service, auth.types)  M  imports from common/
│   ├── realtime/realtime.gateway.ts                  M  isAllowedOrigin; module comment reworded
│   ├── files/ (files.service, files.module, file-access.ts N)  M  RequestFileAccess registry (R8)
│   ├── requests/
│   │   ├── request-policy.module.ts                  N  provides and exports RequestPolicyLoader
│   │   ├── request-policy.loader.ts                  M  autoAssigneeId in the snapshot
│   │   ├── request-transitions.service.ts            M  assigneeContext reads the snapshot (R14)
│   │   ├── requests.service.ts                       M  history sorted by createdAt then seq (N3)
│   │   ├── work-file-access.ts                       N  WORK implementation of the registry
│   │   └── domain/access-policy.ts                   M  cross-cutting rules removed
│   ├── coverage/ (coverage.module, coverage-file-access.ts N)  M  COVERAGE implementation; job moved
│   ├── coverage/ (coverage.service, coverage-admin.service)  M  history sorted by createdAt then seq (N3)
│   ├── categories/, messages/ (*.module.ts)          M  import RequestPolicyModule
│   ├── notifications/notifications.service.ts        M  NoopNotificationPublisher removed
│   └── scheduler/
│       ├── job-interval.ts                           N  JOB_INTERVAL_MS
│       ├── coverage-deadlines.job.ts                 D  from coverage/
│       └── scheduler.module.ts                       M
└── test/
    ├── unit/config.spec.ts                           M  3002, TRUST_PROXY
    ├── unit/dev-port-consistency.spec.ts             N  ports and dev:backend (US1)
    ├── unit/api-entrypoint.spec.ts                   N  5 entrypoint cases (R12)
    ├── unit/architecture-layers.spec.ts              N  (R7)
    ├── unit/sensitive-keys.spec.ts                   N  (R4)
    ├── integration/auto-assignment-snapshot.spec.ts  N  (R14, written first)
    ├── integration/history-priority.spec.ts          M  write order, deterministic test (N3)
    ├── integration/coverage.spec.ts                  M  write order, deterministic test (N3)
    └── integration/bootstrap-production.spec.ts      M  describe('resetSuperAdminPassword') (R6, T017)
frontend/
├── package.json                                      M  @mui/icons-material removed
├── src/api/types.ts                                  M  "generated types" comment removed
├── src/features/requests/ApprovalDialog.tsx          M  selector on AUTO_ASSIGNEE_UNAVAILABLE
├── src/features/requests/HistoryTimeline.tsx         M  assignment source (assigneeSource, US3)
├── tests/api/client.test.ts                         M  API stopped: existing tests strengthened, exact messages (US1)
├── tests/requests/HistoryTimeline.test.tsx           M  assignment source (US3)
└── tests/api/enums-sync.test.ts                      N  (R10)
deploy/
├── Caddyfile.dev                                     M  3002
├── deploy.sh                                         N  backup then up (R12)
├── api-entrypoint.sh                                 M  backup check before migration (PRE_MIGRATION_BACKUP_DIR)
└── docker-compose.yml                                M  /backups:ro in api
docs/
├── ARCHITECTURE.md                                   M  closure FR-024
├── coverage-migration.md                             M  deploy.sh
├── procedure-fusion.md                               N  manual pre-merge check (D10)
└── validation/ (restauration.md, en-tetes-securite.md, verification-003.md)  N
```

**Structure Decision**: existing structure kept (`backend/` and `frontend/` workspaces,
`deploy/`, `docs/`). Only the location of a few files changes to respect the layer
order of R7, plus the addition of `.github/` (CI workflow, pull request template).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| File access registry by request type (`registerAccess`), instead of direct calls | FR-014: file storage must no longer know each domain's access policy; removes the `files ↔ requests` and `files → coverage` cycles | Current direct calls: they are what creates the cycles (A09, A10). NestJS `forwardRef`: keeps the cycle and hides it. Check in each business controller: duplicates file download and streaming. |
