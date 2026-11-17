# Data Model: Multi-administrator handling of work requests (018)

Migration `0029_request_admin_owner_transfers` — additive, with `down.sql`. Identifiers are UUID, dates are
`timestamptz(3)` in UTC, as everywhere in the schema.

## Request (existing, two columns added)

| Field | Type | Rule |
|---|---|---|
| `adminOwnerId` | uuid, null, FK `User` (relation `RequestAdminOwner`, `ON DELETE RESTRICT`) | Responsible administrator. Null = free. Only for `kind = WORK` in a `VIA_ADMIN` category. |
| `adminOwnedAt` | timestamptz, null | When the current responsible administrator became so. |

- CHECK `Request_admin_owner_pair`: both null or both set.
- Index `(adminOwnerId, status)`.
- `assigneeId` / `assignedAt` (assigned **employee**) are untouched.
- Every change of `adminOwnerId` increments `version`.

## RequestAssignment (new, append-only)

History of the responsible administrator. `UPDATE`, `DELETE` and `TRUNCATE` are refused by the existing
`forbid_modification()` trigger function, as for `RequestEvent` and `AuditLog`.

| Field | Type | Meaning |
|---|---|---|
| `id` | uuid PK | |
| `requestId` | uuid FK `Request` | |
| `adminId` | uuid FK `User` (`RequestAssignmentAdmin`) | Administrator concerned: the new responsible administrator, or for `RELEASED` the one who was released |
| `previousAdminId` | uuid null FK `User` (`RequestAssignmentPrevious`) | Responsible administrator before the operation |
| `actorId` | uuid FK `User` (`RequestAssignmentActor`) | Author of the operation |
| `operation` | enum `RequestAssignmentOperation` | `CLAIMED`, `REASSIGNED`, `RELEASED`, `TRANSFERRED` |
| `reason` | varchar(500) null | Mandatory for `REASSIGNED` and `RELEASED`; copied from the proposal for `TRANSFERRED` |
| `transferId` | uuid null FK `RequestTransfer` | Set for `TRANSFERRED` |
| `createdAt` | timestamptz default now | |
| `seq` | bigint autoincrement | Write order |

Indexes: `(requestId, seq)`, `(adminId, createdAt)`, `(previousAdminId, createdAt)`.

| Operation | Written when | `adminId` | `previousAdminId` | `actorId` |
|---|---|---|---|---|
| `CLAIMED` | « Prendre en charge », or first administration action on a free request (D4) | taker | null | taker |
| `TRANSFERRED` | A proposal is accepted | new | old | the one who accepted |
| `REASSIGNED` | Super administrator reassigns | new | old (or null) | super administrator |
| `RELEASED` | Super administrator releases | released | released | super administrator |

## RequestTransfer (new)

| Field | Type | Meaning |
|---|---|---|
| `id` | uuid PK | |
| `requestId` | uuid FK `Request` | |
| `initiatorId` | uuid FK `User` (`RequestTransferInitiator`) | Author of the proposal |
| `recipientId` | uuid FK `User` (`RequestTransferRecipient`) | Who answers |
| `currentOwnerId` | uuid FK `User` (`RequestTransferOwner`) | Responsible administrator when the proposal was made |
| `type` | enum `RequestTransferType` | `TAKEOVER_REQUEST`, `DELEGATION_REQUEST` |
| `status` | enum `RequestTransferStatus` default `PENDING` | `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `EXPIRED` |
| `reason` | varchar(500) | Mandatory |
| `responseReason` | varchar(500) null | Optional, on refusal |
| `cancelCause` | enum `RequestTransferCancelCause` null | Set with `CANCELLED` |
| `createdAt` | timestamptz default now | |
| `respondedAt` | timestamptz null | Accepted or refused |
| `expiresAt` | timestamptz | `createdAt` + setting `transferResponseMinutes` |
| `cancelledAt` | timestamptz null | Cancelled or expired |

`RequestTransferCancelCause`: `INITIATOR`, `REQUEST_FINISHED`, `OWNER_CHANGED`, `REASSIGNED_BY_SUPER_ADMIN`,
`PARTICIPANT_UNAVAILABLE`.

Constraints and indexes:

- Unique partial index `RequestTransfer_one_pending` on `(requestId) WHERE status = 'PENDING'` (FR-013).
- Indexes `(requestId, status)`, `(recipientId, status)`, `(initiatorId, status)`.
- CHECK `initiatorId <> recipientId`.
- CHECK by type: `TAKEOVER_REQUEST` ⇒ `recipientId = currentOwnerId`; `DELEGATION_REQUEST` ⇒
  `initiatorId = currentOwnerId`.

Who becomes responsible on acceptance: the **initiator** for a takeover request, the **recipient** for a
delegation.

### Status transitions

```text
PENDING ── recipient accepts ───────────────► ACCEPTED   (Request.adminOwnerId changes, RequestAssignment TRANSFERRED)
PENDING ── recipient refuses ───────────────► REJECTED
PENDING ── initiator cancels ───────────────► CANCELLED  (INITIATOR)
PENDING ── request finished ────────────────► CANCELLED  (REQUEST_FINISHED)
PENDING ── responsible administrator changed ► CANCELLED  (OWNER_CHANGED | REASSIGNED_BY_SUPER_ADMIN)
PENDING ── a participant inactive/ineligible ► CANCELLED  (PARTICIPANT_UNAVAILABLE)
PENDING ── expiresAt reached ───────────────► EXPIRED
```

Every other status is final. Each transition is a conditional update on `status = 'PENDING'`.

## Rules (pure functions, table-tested)

| Rule | Definition |
|---|---|
| Ownable request | `kind = WORK`, category `routingMode = VIA_ADMIN`, status not `DRAFT` |
| Eligible administrator | active, role `ADMIN`, listed in the category's `CategoryManager` |
| In the file commune | ownable, `status = PENDING_ADMIN_VALIDATION`, `adminOwnerId` null, viewer eligible (super administrator: all) |
| May take | eligible, request in the file commune |
| Administration actor (`MANAGER`) | `SUPER_ADMIN` as today; `ADMIN` eligible **and** (request free **or** responsible) |
| May read | unchanged, plus explicitly: eligible administrator of the category |
| Transferable | ownable, has a responsible administrator, status not `CLOSED` / `REJECTED` / `CANCELLED`, no pending proposal |
| May propose delegation | responsible administrator; recipient eligible and ≠ self |
| May ask takeover | eligible, not responsible; recipient = responsible administrator |
| May answer | recipient, proposal pending and not overdue |
| May cancel | initiator, proposal pending |
| May reassign / release | `SUPER_ADMIN`; request ownable and not finished; target eligible; reason given |
| In progress / finished | not in / in `CLOSED`, `REJECTED`, `CANCELLED` |

## Enum additions

- `NotificationType`: `TRANSFER_TAKEOVER_REQUESTED`, `TRANSFER_DELEGATION_REQUESTED`, `TRANSFER_ACCEPTED`,
  `TRANSFER_REJECTED`, `TRANSFER_CANCELLED`, `TRANSFER_EXPIRED`, `ADMIN_OWNER_REASSIGNED`. All attached to a
  `requestId` (the existing CHECK « request or communication, exactly one » is satisfied).
- No change to `Role`, `Permission`, `RequestStatus`, `RequestEventType`, `AuditAction`.

## Setting

`transferResponseMinutes` — integer, 5 to 2880, default 120.

## Existing data

No row is rewritten. `adminOwnerId` is null everywhere after the migration (research R11).

## Rollback (`down.sql`)

Order: delete notifications of the seven new types → drop `RequestAssignment` (its triggers first) → drop
`RequestTransfer` → drop the two `Request` columns, their CHECK and index → drop the four new enum types →
delete the `Setting` row → recreate `NotificationType` with its 43 previous values. Nothing has to be
rolled back first: `0029` is the latest migration.
