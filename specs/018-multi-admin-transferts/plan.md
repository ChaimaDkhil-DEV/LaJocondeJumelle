# Implementation Plan: Multi-administrator handling of work requests (018)

**Branch**: `feat-transcription-langue` (current branch, D7) | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-multi-admin-transferts/spec.md` (decisions D1–D7 validated
2026-11-17).

## Summary

Give every « via l'administration » work request at most one **responsible administrator**
(`Request.adminOwnerId`, `adminOwnedAt`), taken from a shared list of free requests by a conditional update
that only one caller can win, and let administrators hand requests to each other through **transfer
proposals** (takeover request, delegation) that the recipient accepts or refuses. The super administrator
supervises and can reassign or release. Technically: one additive migration (`0029`), a pure ownership policy
in `requests/domain`, a small change to the existing access policy (a non-responsible administrator reads but
no longer acts), a new backend module `transfers/`, one expiry job, and a new frontend folder
`features/admin-workspace/`. Statuses, transitions, circuits and existing endpoints are unchanged. Details:
[research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md),
[quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (Node.js 24; backend NestJS 11, frontend React 19 + Vite 8)

**Primary Dependencies**: NestJS 11, Prisma 6.19, socket.io 4, class-validator; React Router 7, TanStack
Query 5, MUI 9, lucide-react. **No new dependency.**

**Storage**: PostgreSQL 17 — one Prisma migration `0029_request_admin_owner_transfers` with `down.sql`.

**Testing**: Jest (unit + integration on a real PostgreSQL), Vitest + Testing Library + axe (frontend),
Playwright with axe (`e2e/`, desktop and phone projects).

**Target Platform**: Linux server (Docker, Caddy), browsers from 320 px wide.

**Project Type**: web application (`backend/` + `frontend/`, npm workspaces).

**Performance Goals**: lists open in under 1 s at school scale (≈ 10 administrators, ≈ 10 000 requests per
year); a colleague's screen refreshes within 2 s (SC-005). Indexes: `Request(adminOwnerId, status)`,
`RequestTransfer(requestId|recipientId|initiatorId, status)`.

**Constraints**: single API process (in-memory Socket.IO and jobs, as today); never modify an applied
migration; `migrate dev` on the local database only; WCAG 2.2 AA; existing tests unchanged in what they
verify (SC-007).

**Scale/Scope**: 2 new tables, 2 new columns, ≈ 17 new endpoints, 6 new screens, 1 job; 6 existing backend
files and 5 existing frontend files touched.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. TDD (non-negotiable) | ✅ | Every task pair is « failing test, then code ». Pure ownership and transfer rules as table-driven unit tests; concurrency (two claims, two accepts) as integration tests on real PostgreSQL; one test file per screen; one E2E file for the 14 steps. |
| II. Simplicity / YAGNI | ✅ (two justified additions) | No new role, permission, status, audit action or dependency. Two tables and one module are justified in Complexity Tracking. |
| III. Accessibility / UX | ✅ | Existing components (`PageHeader`, `SectionCard`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `LoadingState`, `Countdown`, `PrioritizedRequestList`); axe in every screen test and in the E2E file; phone project. |
| IV. Security / data protection | ✅ | Identity from the session only; DTOs validated; refusals audited, 404 for unreadable requests; candidate lists limited to name and job title; no new personal data. |
| V. Workflow integrity | ✅ | State machine untouched; ownership history append-only by trigger; one pending proposal per request enforced by a partial unique index; audit entry in the same transaction as each change. |

Post-design re-check: no new violation. The one behavioural change to existing rules — a non-responsible
administrator loses the `MANAGER` actor on a taken request — applies only to a state that does not exist
before this feature (a request with a responsible administrator), so no existing scenario changes.

## Project Structure

### Documentation (this feature)

```text
specs/018-multi-admin-transferts/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                                   # modified
│   └── migrations/0029_request_admin_owner_transfers/  # new: migration.sql, down.sql
├── src/
│   ├── requests/
│   │   ├── domain/ownership.ts                # new, pure: who may take, who acts, who is eligible
│   │   ├── domain/access-policy.ts            # modified: MANAGER actor only if free or responsible
│   │   ├── domain/transition-notifications.ts # modified: responsible administrator instead of all
│   │   ├── request-ownership.service.ts       # new: claimInTx, changeOwnerInTx, cancelPendingInTx
│   │   ├── request-policy.loader.ts           # modified: adminOwnerId in PolicyRequest
│   │   ├── request-transitions.service.ts     # modified: D4 (acting is taking), cancel on finish
│   │   ├── requests.mapper.ts                 # modified: adminOwner in summary and detail
│   │   └── requests.service.ts, ../messages/messages.service.ts, ../scheduler/overdue.job.ts
│   │                                          # modified: « managers » → responsible administrator
│   ├── transfers/                             # new module (after `requests` in the layer order)
│   │   ├── domain/transfer-policy.ts          # pure: create / answer / cancel rules
│   │   ├── admin-requests.controller.ts       # /admin/requests/*
│   │   ├── admin-transfers.controller.ts      # /admin/transfers/*
│   │   ├── super-admin.controller.ts          # /super-admin/*
│   │   ├── workspace.service.ts               # lists, counts, claim
│   │   ├── transfers.service.ts               # propose, accept, reject, cancel, expire
│   │   ├── supervision.service.ts             # super administrator lists, reassign, release
│   │   ├── transfers.dto.ts, transfers.mapper.ts, transfers.module.ts
│   ├── scheduler/transfer-expiry.job.ts       # new
│   ├── common/errors.ts                       # modified: 6 codes
│   ├── audit/audit.service.ts                 # modified: `transferId`, `adminOwnerId` detail keys
│   ├── settings/settings.service.ts           # modified: transferResponseMinutes
│   └── realtime/realtime.service.ts           # modified: emitTransferUpdated
└── test/
    ├── unit/ownership.spec.ts, transfer-policy.spec.ts, access-policy (extended)
    └── integration/migration-0029.spec.ts, admin-requests-queue.spec.ts, admin-requests-claim.spec.ts,
        ownership-existing-flows.spec.ts, transfers.spec.ts, transfers-concurrency.spec.ts,
        transfer-expiry-job.spec.ts, super-admin-supervision.spec.ts, super-admin-routes-access.spec.ts

frontend/
├── src/
│   ├── api/types.ts                           # modified: enums and types
│   ├── app/AppLayout.tsx, app/routes.tsx      # modified: one menu entry, workspace routes
│   ├── features/admin-workspace/              # new
│   │   ├── api.ts, labels.ts, workspaceRoutes.tsx, WorkspaceLayout.tsx
│   │   ├── WorkspaceDashboardPage.tsx, CommonQueuePage.tsx, OwnedRequestsPage.tsx
│   │   ├── CollaborationPage.tsx, TransferCard.tsx, TransferDialog.tsx, OwnershipHistoryPage.tsx
│   ├── features/admin/                        # modified: SupervisionPage.tsx (new), ReassignOwnerDialog.tsx
│   │                                          # (new), AdminLayout.tsx, adminRoutes.tsx, SettingsAdminPage.tsx
│   ├── features/requests/RequestDetailPage.tsx  # modified: responsible administrator, transfer actions
│   ├── features/notifications/                # modified: new types, cache invalidation
│   └── i18n/en/                               # modified: new strings
└── tests/admin-workspace/*.test.tsx, tests/admin/SupervisionPage.test.tsx

e2e/multi-admin.spec.ts                        # new: the 14 steps, desktop + phone, axe
backend/prisma/seed.ts                         # modified by addition only: a second administrator (e2e)
```

**Structure Decision**: existing two-workspace layout. `requests/` owns the ownership rule because the
existing transitions must apply it (D4) and the layer order forbids `requests` from importing a later
folder; everything that is new behaviour lives in `transfers/`, inserted after `requests` in
`architecture-layers.spec.ts`.

## Delivery lots

| Lot | Content | Usable alone |
|---|---|---|
| 1 | Migration, ownership policy, file commune, prise en charge, D4, « mes demandes », history, workspace screens without collaboration | Yes: administrators share a queue and see who is in charge |
| 2 | Transfer proposals (both types), answers, cancellation, expiry job, notifications, « Collaboration » screen, detail actions | Yes, on top of lot 1 |
| 3 | Super administrator supervision, transfers list, reassign / release, setting screen | Yes, on top of lots 1–2 |

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Table `RequestAssignment` | FR-007: an ownership history that cannot be modified, queried per administrator (« Mon historique ») | Reusing `RequestEvent`: it would need new enum values mixed into the request timeline shown to requesters, and has no column for the administrator concerned, so « my history » would be a JSON scan |
| Table `RequestTransfer` | FR-009–019: a proposal has its own life cycle, recipient and expiry | Columns on `Request`: cannot keep the history of past proposals nor enforce « one pending » while keeping refused ones |
| Module `transfers/` | Keeps the 624-line `requests.service.ts` from growing; the user asked for an independent module | Adding to `requests/`: larger blast radius on the most-tested module |
| Routes under `/super-admin/*` | Requested paths; keeps `admin-routes-access.spec.ts` semantics (every `/admin/*` route not listed is super-administrator only) simple | Putting them under `/admin/*` would also work; the prefix is the user's wording |
