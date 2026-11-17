# Tasks: Multi-administrator handling of work requests (018)

**Input**: `specs/018-multi-admin-transferts/` — [spec.md](spec.md), [plan.md](plan.md),
[research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md),
[quickstart.md](quickstart.md)

**Rules for every task**

- Tests first (constitution I): each implementation task follows a test task whose test has been run and
  seen failing for the expected reason.
- Stay on the current branch. No commit, push or merge without the user's authorisation.
- Never edit an applied migration; `migrate dev` on the local database only (CLAUDE.md).
- No existing test is deleted or weakened. An existing test is edited only to extend a list it guards
  (noted on the task).
- `[P]` = can run in parallel (different files, no dependency on an unfinished task).

## Phase 1: Setup

- [X] T001 Record the baseline before any change: run `npm run lint`, `npm run -w backend build`,
  `npm run -w frontend build`, `npm run -w backend test`, `npm run -w backend test:integration`,
  `npm run -w frontend test`, `npm audit --audit-level=high`; note the results (counts, any pre-existing
  failure) to compare at the end of each lot
- [X] T002 Check `npm exec -w backend -- prisma migrate status` reports "Database schema is up to date!" on
  the local database (`localhost:5433`); stop and report any drift

## Phase 2: Foundational (blocks every story)

- [X] T003 Write the failing migration test `backend/test/integration/migration-0029.spec.ts` (model:
  `migration-0024.spec.ts`): `Request.adminOwnerId` / `adminOwnedAt` exist and are null on existing rows;
  CHECK « both null or both set »; `RequestAssignment` refuses UPDATE, DELETE and TRUNCATE; a second
  `PENDING` `RequestTransfer` on the same request is refused by `RequestTransfer_one_pending`; CHECK
  `initiatorId <> recipientId`; CHECK by type (`TAKEOVER_REQUEST` ⇒ `recipientId = currentOwnerId`,
  `DELEGATION_REQUEST` ⇒ `initiatorId = currentOwnerId`)
- [X] T004 Update `backend/prisma/schema.prisma` per data-model.md: two `Request` columns with relation
  `RequestAdminOwner` and index `(adminOwnerId, status)`; enums `RequestAssignmentOperation` (`CLAIMED`,
  `REASSIGNED`, `RELEASED`, `TRANSFERRED`), `RequestTransferType` (`TAKEOVER_REQUEST`, `DELEGATION_REQUEST`),
  `RequestTransferStatus` (`PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `EXPIRED`),
  `RequestTransferCancelCause` (`INITIATOR`, `REQUEST_FINISHED`, `OWNER_CHANGED`,
  `REASSIGNED_BY_SUPER_ADMIN`, `PARTICIPANT_UNAVAILABLE`); models `RequestAssignment` (`reason`
  varchar(500) null) and `RequestTransfer` (`reason` varchar(500) required, `responseReason` varchar(500)
  null) with named relations and indexes `(requestId, status)`, `(recipientId, status)`,
  `(initiatorId, status)`; seven `NotificationType` values
- [X] T005 Create `backend/prisma/migrations/0029_request_admin_owner_transfers/migration.sql` in one go
  (`prisma migrate dev --create-only --name request_admin_owner_transfers`, then complete by hand before
  saving): generated DDL + partial unique index + CHECKs + append-only triggers on `RequestAssignment`; and
  `down.sql` per data-model.md §Rollback. Then `prisma migrate status`; refuse any proposed reset and report
- [X] T006 [P] Add `transferResponseMinutes` (int, 5–2880, default 120, label « entre 5 et 2880 minutes »)
  to `backend/src/settings/settings.service.ts`, test first in the existing settings unit/integration spec
- [X] T007 [P] Add error codes to `backend/src/common/errors.ts` (`REQUEST_ALREADY_CLAIMED` 409,
  `TRANSFER_NOT_POSSIBLE` 409, `TRANSFER_PENDING_EXISTS` 409, `TRANSFER_ALREADY_ANSWERED` 409,
  `TRANSFER_OWNER_CHANGED` 409, `TRANSFER_RECIPIENT_INVALID` 422) with French messages, and the keys
  `transferId`, `adminOwnerId` to the whitelist in `backend/src/audit/audit.service.ts` (test first in the
  audit unit spec)
- [X] T008 [P] Add the new enums and types to `frontend/src/api/types.ts` so that
  `frontend/tests/api/enums-sync.test.ts` passes again (it fails after T004 — expected)
- [ ] T009 Add a second administrator `admin2` (role `ADMIN`, responsible for the same categories as
  `admin`) to `backend/prisma/seed.ts` and `e2e/support/accounts.ts`, by addition only; extend the account
  expectations of `backend/test/integration/seed.spec.ts` if it counts accounts (extension, noted)
- [ ] T010 Run backend unit + integration + frontend tests: only T003's new test and the lists extended in
  T008–T009 differ from the baseline

**Checkpoint**: schema in place, nothing behaves differently yet.

## Phase 3: User Story 1 — File commune and prise en charge (P1, lot 1) 🎯 MVP

**Goal**: one responsible administrator per request, taken atomically from a shared list.

**Independent Test**: two administrators, one request: one takes it, the other cannot take or modify it,
the history shows who and when.

### Tests first

- [X] T011 [P] [US1] `backend/test/unit/ownership.spec.ts`: table tests of `isOwnable`, `isEligibleAdmin`,
  `inCommonQueue`, `canClaim` (data-model.md §Rules) — inactive account, `EMPLOYEE`, `SUPER_ADMIN`, not
  responsible for the category, `DIRECT` / `PEER` category, `COVERAGE` kind, already taken, wrong status
- [X] T012 [P] [US1] Extend `backend/test/unit/access-policy.spec.ts` (new cases only): free request →
  identical results to today for every role; taken request → responsible administrator keeps `MANAGER`,
  another eligible administrator has no actor, no allowed action, cannot write in the thread, still reads;
  `SUPER_ADMIN` unchanged
- [X] T013 [P] [US1] `backend/test/integration/admin-requests-queue.spec.ts`: `GET /admin/requests/available`
  (content, order, fields, category scope, super administrator sees all), `GET /admin/requests/mine` with
  the three scopes, `GET /admin/requests/summary`; `enseignante` → 403 audited
- [X] T014 [P] [US1] `backend/test/integration/admin-requests-claim.spec.ts`: success (owner, date, version
  + 1, one `RequestAssignment` `CLAIMED`, one audit `REQUEST_MANAGED`/`CLAIM`); already taken → 409
  `REQUEST_ALREADY_CLAIMED`; stale version → 409 `STATE_CHANGED`; not eligible → 404 audited; super
  administrator → 403; **two simultaneous claims (`Promise.all`, repeated 20 times) → exactly one 200, one
  409, one history row**
- [X] T015 [P] [US1] `backend/test/integration/ownership-existing-flows.spec.ts`: D4 — `APPROVE`, `REJECT`
  by an eligible administrator on a free request succeed and make them responsible (one `CLAIMED` row);
  by the super administrator succeed and leave the request free; a second administrator's `APPROVE` /
  thread message / priority change on a taken request → 403 audited; `GET /requests/:id` still 200 for
  them; `GET /admin/requests/:id/assignments`; `GET /admin/assignments/mine`
- [X] T016 [P] [US1] Frontend tests `frontend/tests/admin-workspace/CommonQueuePage.test.tsx`,
  `OwnedRequestsPage.test.tsx`, `WorkspaceDashboardPage.test.tsx`, `OwnershipHistoryPage.test.tsx`:
  loading, empty, error, rows, confirmation before taking, 409 message shown and list refreshed, counts
  equal to mocked lists, axe without violation

### Implementation

- [X] T017 [US1] `backend/src/requests/domain/ownership.ts` (pure) until T011 passes
- [X] T018 [US1] `adminOwnerId` in `PolicyRequest` (`request-policy.loader.ts`); `actorsFor` and
  `canReadRequest` in `backend/src/requests/domain/access-policy.ts` per research R4, until T012 passes and
  the whole existing `access-policy.spec.ts` stays green
- [X] T019 [US1] `backend/src/requests/request-ownership.service.ts`: `claimInTx` (conditional update,
  history, audit), `changeOwnerInTx`, `cancelPendingTransfersInTx`; export from `request-policy.module.ts`
  or `requests.module.ts`
- [X] T020 [US1] `backend/src/requests/request-transitions.service.ts`: in `commit`, when the actor is an
  `ADMIN` acting as `MANAGER` on a free request, set the responsible administrator in the same conditional
  update and write the `CLAIMED` row (D4); `emitRequestUpdated` unchanged
- [X] T021 [US1] Replace « the category's administrators » by « the responsible administrator if any » in
  `requests/domain/transition-notifications.ts`, `requests/requests.service.ts`,
  `messages/messages.service.ts`, `scheduler/overdue.job.ts` (research R5); test first by extending the
  matching unit spec with taken-request cases
- [X] T022 [US1] `adminOwner`, `adminOwnedAt`, `ownership.canClaim` in `backend/src/requests/requests.mapper.ts`
  and its callers
- [X] T023 [US1] New module `backend/src/transfers/` (`transfers.module.ts`, `transfers.dto.ts`,
  `transfers.mapper.ts`, `workspace.service.ts`, `admin-requests.controller.ts`) with `available`, `mine`,
  `summary`, `claim`, `assignments`, `assignments/mine`; register in `app.module.ts`; add `transfers` after
  `requests` in `backend/test/unit/architecture-layers.spec.ts` and the new routes to `ADMIN_ALLOWED` in
  `backend/test/integration/admin-routes-access.spec.ts` (list extensions, noted); until T013–T015 pass
- [X] T024 [P] [US1] `frontend/src/features/admin-workspace/api.ts`, `labels.ts`, `WorkspaceLayout.tsx`,
  `workspaceRoutes.tsx`; menu entry « Espace de travail » in `frontend/src/app/AppLayout.tsx` (administrators
  only) and routes in `frontend/src/app/routes.tsx`
- [X] T025 [US1] `CommonQueuePage.tsx`, `OwnedRequestsPage.tsx` (scope by route), `WorkspaceDashboardPage.tsx`
  (four counts in this lot), `OwnershipHistoryPage.tsx`, reusing `PrioritizedRequestList`, `SectionCard`,
  `ConfirmDialog`, `EmptyState`, `ErrorState`, `LoadingState`; until T016 passes
- [X] T026 [US1] `frontend/src/features/requests/RequestDetailPage.tsx`: show the responsible administrator,
  « Prendre en charge » when `ownership.canClaim`, read-only notice for other administrators; test first in
  `frontend/tests/requests/`
- [X] T027 [US1] `frontend/src/features/notifications/SocketProvider.tsx`: `request:updated` also invalidates
  the workspace queries; test first in `frontend/tests/notifications/`
- [X] T028 [P] [US1] English strings in `frontend/src/i18n/en/` for every new label (the i18n test fails
  until done)
- [X] T029 [US1] `e2e/multi-admin.spec.ts` steps 1–4 and 14: teacher creates; `admin` and `admin2` see the
  file commune; first takes; second cannot take nor modify (UI and direct API call); axe on each new page;
  desktop and phone projects
- [X] T030 [US1] Lot 1 gate: lint, both builds, backend unit + integration, frontend, `multi-admin.spec.ts`,
  then the whole E2E suite; compare with T001; report real results to the user

**Checkpoint**: lot 1 is usable and demonstrable alone.

## Phase 4: User Stories 2 and 3 — Delegation and takeover request (P2, lot 2)

**Goal**: administrators hand requests over, with the recipient's agreement.

**Independent Test**: delegation refused then accepted; takeover request accepted; expiry changes nothing.

### Tests first

- [X] T031 [P] [US2] `backend/test/unit/transfer-policy.spec.ts`: table tests of `canProposeDelegation`,
  `canAskTakeover`, `canAnswer`, `canCancel`, `isTransferable`, `newOwnerOf` — self, inactive recipient,
  non-eligible recipient, free request, finished request, not responsible, overdue proposal
- [X] T032 [P] [US2] `backend/test/integration/transfers.spec.ts` — delegation: propose (201, `PENDING`,
  `expiresAt` = now + setting, notification to recipient, owner unchanged, owner still able to act);
  accept (owner changes, `TRANSFERRED` row with `transferId`, audit, notification to initiator); refuse
  with and without reason; cancel by initiator; missing reason → 422; self / inactive / non-eligible → 422
  `TRANSFER_RECIPIENT_INVALID`; second proposal → 409 `TRANSFER_PENDING_EXISTS`; answer by a third
  administrator → 403 audited; lists `received`, `sent`, `history`; `transfer-candidates` shows only name
  and job title
- [X] T033 [P] [US3] Same file, takeover: ask (recipient = responsible administrator, `recipientId` in the
  body refused); accept → asker responsible; refuse; ask on a free request → 409 `TRANSFER_NOT_POSSIBLE`;
  responsible administrator asking on their own request → 422
- [X] T034 [P] [US3] `backend/test/integration/transfers-concurrency.spec.ts`: **two simultaneous accepts →
  one 200, one 409 `TRANSFER_ALREADY_ANSWERED`, one `TRANSFERRED` row**; accept and cancel together → one
  outcome; owner changed before the answer → 409 `TRANSFER_OWNER_CHANGED`, proposal `CANCELLED`
  (`OWNER_CHANGED`), owner untouched; request finished (`REJECT`, requester `CANCEL`) → proposal `CANCELLED`
  (`REQUEST_FINISHED`) in the same transaction; two simultaneous proposals → one 201, one 409
- [X] T035 [P] [US3] `backend/test/integration/transfer-expiry-job.spec.ts` (model: `auto-close-job.spec.ts`):
  overdue → `EXPIRED`, both notified once, owner unchanged, audit; not overdue → untouched; recipient
  deactivated or removed from the category → `CANCELLED` (`PARTICIPANT_UNAVAILABLE`); running the job twice
  creates no duplicate notification; accept on an overdue proposal → 409 and `EXPIRED`
- [X] T036 [P] [US2] Frontend tests `frontend/tests/admin-workspace/CollaborationPage.test.tsx`,
  `TransferDialog.test.tsx`, `TransferCard.test.tsx`: three sections, pending first, fields shown (initiator,
  recipient, title, type, reason, date, time left), accept / refuse distinct by label and icon, confirmation
  dialogs, optional refusal reason, mandatory proposal reason, cancel, server errors shown, axe

### Implementation

- [X] T037 [US2] `backend/src/transfers/domain/transfer-policy.ts` until T031 passes
- [X] T038 [US2] `backend/src/transfers/transfers.service.ts` (propose, accept, reject, cancel, lists) and
  `admin-transfers.controller.ts`, plus `POST /admin/requests/:id/transfers` and `transfer-candidates` in
  `admin-requests.controller.ts`, per research R2; extend `ADMIN_ALLOWED`; until T032–T034 pass
- [X] T039 [US2] Cancel the pending proposal when a request finishes: call `cancelPendingTransfersInTx` in
  `RequestTransitionsService.commit` for final statuses
- [X] T040 [US2] `emitTransferUpdated` in `backend/src/realtime/realtime.service.ts`; notifications of the
  seven types through `notifyInTx` / `flushAfterCommit`; test first by extending
  `backend/test/integration/realtime.spec.ts` and `notifications.spec.ts` with new cases
- [X] T041 [US3] `backend/src/scheduler/transfer-expiry.job.ts`, registered in `scheduler.module.ts`, until
  T035 passes
- [X] T042 [US2] `CollaborationPage.tsx`, `TransferCard.tsx` (uses `Countdown`), `TransferDialog.tsx` in
  `frontend/src/features/admin-workspace/`; the two remaining dashboard counts; until T036 passes
- [X] T043 [US2] `RequestDetailPage.tsx`: « Proposer une délégation », « Demander la reprise », pending
  proposal banner with its actions; test first
- [X] T044 [US2] `frontend/src/features/notifications/`: labels, icons and target page of the seven types in
  `NotificationCenter.tsx`; `transfer:updated` invalidation in `SocketProvider.tsx`; test first
- [X] T045 [P] [US2] English strings in `frontend/src/i18n/en/`
- [X] T046 [US2] `e2e/multi-admin.spec.ts` steps 5–11: takeover asked and accepted; delegation refused,
  owner keeps the request; another delegation accepted; axe; desktop and phone
- [X] T047 [US2] Lot 2 gate: same commands as T030; report real results

**Checkpoint**: lots 1–2 usable.

## Phase 5: User Story 5 — Supervision and reattribution (P3, lot 3)

**Goal**: the super administrator sees everything and can reassign or release.

**Independent Test**: reassign from A to B with a reason; B responsible, A notified, pending proposal
cancelled, history and audit written.

### Tests first

- [X] T048 [P] [US5] `backend/test/integration/super-admin-supervision.spec.ts`: `GET /super-admin/requests`
  with each filter and combinations; `adminOwnerUnavailable` flag; `GET /super-admin/administrators` counts;
  `GET /super-admin/transfers` by status; reassign (owner, `REASSIGNED` row with `previousAdminId`, version
  + 1, pending proposal `CANCELLED` `REASSIGNED_BY_SUPER_ADMIN`, both notified, audit `OWNER_REASSIGNED`,
  status unchanged); release (`RELEASED`, back in the file commune when waiting for validation); missing
  reason → 422; inactive or non-eligible target → 422; finished request → 409
- [X] T049 [P] [US5] `backend/test/integration/super-admin-routes-access.spec.ts` (model:
  `admin-routes-access.spec.ts`): every `/super-admin/*` route → 403 audited for `admin` and `enseignante`,
  not 403 for `superadmin`
- [X] T050 [P] [US5] `frontend/tests/admin/SupervisionPage.test.tsx`: filters, tabs requests / administrators
  / transfers, flagged rows, reassign and release dialogs with mandatory reason and confirmation, errors, axe

### Implementation

- [X] T051 [US5] `backend/src/transfers/supervision.service.ts` and `super-admin.controller.ts` until
  T048–T049 pass
- [X] T052 [US5] `frontend/src/features/admin/SupervisionPage.tsx`, `ReassignOwnerDialog.tsx`; section
  « Supervision » in `AdminLayout.tsx` and `adminRoutes.tsx` (super administrator only); until T050 passes
- [X] T053 [P] [US5] « Délai de réponse aux transferts » in `frontend/src/features/admin/SettingsAdminPage.tsx`
  (test first) and English strings
- [X] T054 [US5] `e2e/multi-admin.spec.ts` steps 12–13: super administrator reassigns; an employee is refused
  on the administration routes; axe; desktop and phone
- [X] T055 [US5] Lot 3 gate: same commands as T030; report real results

## Phase 6: Polish and final validation

- [X] T056 [P] Update `docs/ARCHITECTURE.md` (module `transfers/`, ownership rule) and
  `docs/superadmin-fonctionnalites.md` (supervision, reattribution)
- [ ] T057 Walk through [quickstart.md](quickstart.md) manually, the four scenarios
- [X] T058 Full validation: `npm run verify`, both builds, `npm run test:e2e` (whole suite); compare every
  figure with T001
- [ ] T059 Final report to the user: features delivered, files created and modified, migration, endpoints,
  rules by role, real test results, open issues, how to run and check, manual actions left

## Implementation notes — lot 1 (2026-11-17)

Deviations from the task text, decided while implementing:

- **T001 (baseline)** — lint is clean once the local, git-ignored `playwright-report/` folder is excluded
  (`eslint.config.mjs` does not ignore it; 3 997 errors come from that generated report only). Unit tests:
  1 219 passed. Frontend: 798 passed (one file timed out under machine load and passes alone). The
  integration baseline could not be taken on untouched code: it ran while the first files were being
  written. The reference is therefore the full run made after lot 1.
- **T006 (setting `transferResponseMinutes`)** — moved to lot 2, where it is first used.
- **T008** — no change needed in `frontend/src/api/types.ts`: `enums-sync.test.ts` compares only the enums
  the interface declares; the workspace types live in `features/admin-workspace/types.ts`.
- **T009 (second administrator)** — not added to the shared seed: existing integration tests assert the
  exact list of notifications sent to a category's administrators. Integration tests create it with
  `backend/test/utils/second-admin.ts`; the E2E scenario creates its own account and category through the
  super administrator API, like `us8-admin.spec.ts`.
- **T016 / T026** — two test files (`tests/admin-workspace/workspace.test.tsx`,
  `request-ownership.test.tsx`) instead of one per screen. Accessibility is checked by axe in the E2E
  scenario, the project's existing practice (no axe in the Vitest suites).
- **T020 (D4) and audit** — an action on a free request writes the `CLAIMED` history row in the same
  transaction; it adds no separate audit entry, because the action's own `REQUEST_MANAGED` entry already
  exists and an existing test asserts the exact audit entries of a request. The explicit « Prendre en
  charge » writes its own audit entry (`action: CLAIM`).
- **T027** — no change in `SocketProvider.tsx`: the workspace query keys sit under `['requests', 'list']`,
  already invalidated by `request:updated` and `notification:new`.
- **Wording** — the interface says « Prise en charge par » and « à votre charge », never « responsable »:
  `role-admin-rename.spec.ts` forbids that word in API error messages since the role « Responsable » became
  « Admin » (004), and using it again for another notion would confuse.
- **`down.sql`** — also restores `NotificationType` to its 43 previous values (the type is recreated), so the
  migration can be re-applied after a rollback; research R11 said the values would remain.
- **File commune pagination** — not cursor-paginated: up to 100 requests in one page, urgent first; the
  dashboard count gives the total beyond that.

## Implementation notes — lot 2 (2026-11-17)

- **Pure rules** — « who may propose » (`isTransferable`, `canProposeDelegation`, `canAskTakeover`) lives in
  `requests/domain/ownership.ts`, because the request detail (module `requests`) exposes them and the layer
  order forbids `requests` from importing `transfers`. « Who may answer or cancel » is in
  `transfers/domain/transfer-policy.ts`.
- **Request detail** — `ownership` is now `{ canClaim, canDelegate, canAskTakeover, pendingTransferId }`. One
  route was added to the contract, `GET /admin/transfers/:id`, to show the pending proposal on the request
  page (participants, administrators of the category, super administrator).
- **T035** — the expiry cases are in `transfers-concurrency.spec.ts` (section « expiration ») rather than a
  separate file: they share the same fixtures. They call `TransfersService.expireDue()`, which is all the
  job `scheduler/transfer-expiry.job.ts` does.
- **Stale proposals** — besides expiry, each pass cancels the pending proposals that can no longer succeed
  (request finished, owner changed, a participant no longer an active administrator of the category), with
  the cause recorded. Account deactivation is therefore handled within one job interval, and immediately
  at answer time.
- **T040** — covered by the assertions on stored notifications in `transfers.spec.ts`; the socket event
  `transfer:updated` is covered end to end by the E2E scenario (lists refresh without reload).
- **T044** — a transfer notification opens the request page, where the pending proposal and its actions are
  shown; no new navigation rule.
- **Missing reason** — answered `422 REASON_REQUIRED` by the service (contract), not `400` by the DTO.

## Dependencies

```text
Phase 1 → Phase 2 → US1 (lot 1) → US2+US3 (lot 2) → US5 (lot 3) → Phase 6
```

- US4 (workspace) has no phase of its own: its screens are delivered with the story that feeds them
  (T024–T028 in lot 1, T042–T044 in lot 2).
- Inside a lot: tests → pure domain → services and controllers → frontend → E2E → gate.
- Backend and frontend of the same lot can progress in parallel once the contract of the lot is fixed.

## Parallel examples

- Lot 1 tests: T011, T012, T013, T014, T015, T016 together (six different files).
- Lot 2 tests: T031–T036 together.
- T006, T007, T008 together after T004.

## Implementation strategy

Lot 1 is the MVP: stop after T030, demonstrate, get the user's go-ahead (and commit authorisation) before
lot 2; same after T047 and T055.
