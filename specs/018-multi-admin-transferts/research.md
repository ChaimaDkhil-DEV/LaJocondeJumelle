# Research: Multi-administrator handling of work requests (018)

Every item was settled by reading the code of the current branch (commit `8b61570`), not by assumption.

## R1 — How to make « prise en charge » atomic

- **Decision**: one conditional `updateMany` inside a Prisma transaction:
  `where { id, kind: WORK, status: PENDING_ADMIN_VALIDATION, adminOwnerId: null, version }`, setting
  `adminOwnerId`, `adminOwnedAt` and `version + 1`; `count === 0` → 409. The history row and the audit entry
  are written in the same transaction.
- **Rationale**: it is the project's existing pattern (`RequestTransitionsService.commit`,
  `changePriority`). Under PostgreSQL's default READ COMMITTED, the second writer waits for the first row
  lock, re-evaluates the `WHERE`, finds `adminOwnerId` no longer null and updates 0 rows. No explicit lock
  and no SERIALIZABLE retry loop are needed.
- **Why bump `version`**: an administrator who opened the request before a colleague took it, then presses
  « Approuver », gets the existing 409 `STATE_CHANGED` instead of acting on a request that is no longer free.
- **Alternatives**: `SELECT … FOR UPDATE` (longer lock, not used for requests in this project — rejected in
  001 research R5); SERIALIZABLE isolation (needs retries, no benefit for a single-row predicate).

## R2 — How to make an answer to a proposal atomic

- **Decision**: in one transaction, (1) `RequestTransfer.updateMany where { id, status: PENDING, recipientId:
  me, expiresAt > now }` → `ACCEPTED`; 0 rows → 409; (2) `Request.updateMany where { id, adminOwnerId:
  transfer.currentOwnerId, status not final }` → new responsible administrator, `version + 1`; 0 rows →
  the transaction is rolled back and the proposal is cancelled with cause `OWNER_CHANGED` or
  `REQUEST_FINISHED` in a second statement; (3) history row, audit entry, notifications.
- **Rationale**: step 1 serialises double clicks on the proposal row; step 2 is the « responsible
  administrator has not changed » check, done by the database rather than by a read-then-write.
- **Backstop**: partial unique index `RequestTransfer(requestId) WHERE status = 'PENDING'` (FR-013).
  Precedent in this repository: `CoverageSupport_active_key` (migration 0008), written by hand in
  `migration.sql` because Prisma's schema cannot express it.

## R3 — Where the ownership rule lives

- **Decision**: pure functions in `requests/domain/ownership.ts`; transaction helpers in
  `requests/request-ownership.service.ts`; everything else in the new `transfers/` folder.
- **Rationale**: `architecture-layers.spec.ts` allows a folder to import only folders placed before it.
  `RequestTransitionsService` must apply D4 and cancel a pending proposal when a request finishes, so those
  helpers cannot live in a folder placed after `requests`.
- **Consequence**: `transfers` is added to the `LAYERS` list after `requests` (an addition to the guard, not
  a relaxation).

## R4 — Change to the existing access policy

- **Decision**: `actorsFor` gives the `MANAGER` actor to an `ADMIN` only if the request is free or they are
  its responsible administrator; `SUPER_ADMIN` unchanged. `canReadRequest` gains an explicit rule « eligible
  administrator of the category reads », because today reading is derived from having an actor.
  `visibleRequestsWhere` (lists) is unchanged.
- **Rationale**: one place decides who acts; `allowedActions`, `canWriteInThread`, files and messages follow
  automatically.
- **Regression check**: with `adminOwnerId = null` (every existing row and every existing test) the result
  is identical to today's.

## R5 — Who is notified once a request is taken

- **Decision**: where the code targets « the category's administrators » (`transition-notifications.ts`,
  `messages.service.ts`, `overdue.job.ts`, `requests.service.ts`), the target becomes the responsible
  administrator when there is one, all of them otherwise.
- **Rationale**: the others are read-only on a taken request; notifying them is noise. Free requests behave
  as today, so « nouvelle demande disponible » is the existing `REQUEST_NEW`.

## R6 — Notifications and real time

- **Decision**: seven new `NotificationType` values (takeover requested, delegation requested, accepted,
  refused, cancelled, expired, owner reassigned), written with the existing `notifyInTx` and published after
  commit. « Demande prise en charge » is **not** a bell notification: the existing `request:updated` event,
  already sent to the category's administrators and the super administrators' room, refreshes the lists. One
  new event `transfer:updated` (identifiers only) refreshes the collaboration lists of the author, the
  recipient and the responsible administrator.
- **Rationale**: reuses the single Socket.IO gateway (rooms `user:{id}`, authenticated at handshake) and the
  « identifiers only, re-read by REST » rule. No push: `pushCategoryOf` returns no category for unknown
  types, so nothing is sent outside the bell.
- **Duplicates**: one notification per (event, recipient) is created inside the transaction that changes the
  state; a replayed call fails the conditional update and creates nothing.

## R7 — Audit

- **Decision**: reuse the audit action `REQUEST_MANAGED` with `details.action` ∈ `CLAIM`, `TRANSFER_PROPOSED`,
  `TRANSFER_ACCEPTED`, `TRANSFER_REJECTED`, `TRANSFER_CANCELLED`, `TRANSFER_EXPIRED`, `OWNER_REASSIGNED`,
  `OWNER_RELEASED`, plus `type`, `before`/`after` (`adminOwnerId`), `reasonGiven`, `transferId`. Two keys are
  added to the audit whitelist (`transferId`, `adminOwnerId`).
- **Rationale**: the existing audit screen already filters by action and shows details; no enum migration.
  The reason's text stays in the history and the proposal, never in the audit log (existing rule).

## R8 — Expiry and unavailable accounts

- **Decision**: `scheduler/transfer-expiry.job.ts`, same `@Interval(JOB_INTERVAL_MS)` and `JOBS_ENABLED`
  switch as the other jobs. Each pass: pending proposals past `expiresAt` → `EXPIRED`; pending proposals
  whose author, recipient or responsible administrator is no longer an active eligible administrator →
  `CANCELLED` with cause. An answer arriving on an overdue proposal expires it on the spot.
- **Rationale**: `users/` cannot import `requests/` without closing an import cycle
  (`requests → settings → users`), so account deactivation is handled by the sweep and by the checks at
  answer time rather than by a hook in `UsersService`.
- **Setting**: `transferResponseMinutes`, integer, 5 to 2880, default 120, in the existing `Setting` table
  and settings screen. `expiresAt` is computed when the proposal is created.

## R9 — Routes and guards

- **Decision**: administrators' routes under `/api/admin/requests/*` and `/api/admin/transfers/*` with
  `AdministrationGuard` (added to `ADMIN_ALLOWED` in `admin-routes-access.spec.ts`); super administrator's
  routes under `/api/super-admin/*` with `SuperAdminGuard` and their own access test. Acting routes
  additionally require the `ADMIN` role in the service: a super administrator can read the file commune but
  never becomes responsible.
- **Not built** (D5): `/super-admin/administrators` create / modify and `/super-admin/audit-logs` — served by
  the existing `/admin/users` and `/admin/audit`.

## R10 — Frontend placement

- **Decision**: a new menu entry « Espace de travail » (`/espace`) with its own sub-navigation, modelled on
  `AdminLayout`. The administrator's home (`/` → `RequestListPage`) and the existing « Mes demandes » entry
  are not changed.
- **Rationale**: 13 E2E files log in as the administrator and several rely on the current landing page and
  on the label « Mes demandes »; replacing either would force edits to tests that must stay valid (SC-007).
- **Super administrator**: one new section « Supervision » in the existing `/admin` space.

## R11 — Existing data and rollback

- **Decision**: no backfill. Existing requests keep `adminOwnerId = NULL`; those still waiting for
  validation appear in the file commune, those already approved get a responsible administrator at the
  first administration action (D4).
- **Rollback**: `down.sql` drops the two tables, the four enums and the two columns, deletes the
  notifications of the seven new types, then recreates `NotificationType` with its 43 previous values
  (PostgreSQL cannot drop an enum value, and leaving them would make the migration impossible to re-apply).

## R12 — Test data

- **Decision**: the E2E and integration seed (`backend/prisma/seed.ts`) gains one second administrator,
  responsible for the same categories as `admin`, by addition only. The demonstration data set
  (`seed-demo.ts`) is not touched.
- **To verify at implementation**: `seed.spec.ts` may count accounts; if so its expectation is extended, not
  loosened.
