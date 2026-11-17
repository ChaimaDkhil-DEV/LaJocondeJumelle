# API Contract: Multi-administrator handling of work requests (018)

All routes are under `/api`, authenticated by the session cookie, protected by the global `OriginGuard` and
`SessionGuard`. Errors use the existing format `{ error: { code, message, details? } }`. Lists use the
existing cursor pagination (`limit`, `cursor` → `{ items, nextCursor }`). The acting account is always the
session's; no route accepts an administrator identifier to say who acts.

## Shared shapes

```text
AdminRef        { id, displayName, jobTitle }
RequestSummary  existing shape + adminOwner: AdminRef | null, adminOwnedAt: string | null
RequestDetail   existing shape + adminOwner, adminOwnedAt,
                ownership: { canClaim, canDelegate, canAskTakeover, pendingTransferId: string | null }
Transfer        { id, type, status, reason, responseReason, cancelCause,
                  request: { id, reference, title, priority, status },
                  initiator: AdminRef, recipient: AdminRef, currentOwner: AdminRef,
                  createdAt, respondedAt, expiresAt, cancelledAt,
                  canAccept, canReject, canCancel }
Assignment      { id, operation, request: { id, reference, title },
                  admin: AdminRef, previousAdmin: AdminRef | null, actor: AdminRef, reason, createdAt }
```

## Administrators — `AdministrationGuard` (active `ADMIN` or `SUPER_ADMIN`)

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /admin/requests/available` | File commune | `ADMIN`: free requests of their categories. `SUPER_ADMIN`: all free requests. Urgent first, then oldest. |
| `GET /admin/requests/mine?scope=all\|active\|finished` | Requests the caller is responsible for | Always empty for `SUPER_ADMIN`. |
| `GET /admin/requests/summary` | Six counts | `{ available, mine, active, finished, transfersReceivedPending, transfersSentPending }` |
| `POST /admin/requests/:id/claim` | Prendre en charge | Body `{ version }`. 200 `RequestDetail`. `ADMIN` only. |
| `GET /admin/requests/:id/assignments` | Ownership history of one request | Readers: eligible administrators, super administrator. |
| `GET /admin/requests/:id/transfer-candidates` | Colleagues who can receive a delegation | `AdminRef[]`, caller excluded. Responsible administrator only. |
| `POST /admin/requests/:id/transfers` | Propose a transfer | Body `{ type, reason, recipientId? }`. `recipientId` required for `DELEGATION_REQUEST`, forbidden for `TAKEOVER_REQUEST` (the server uses the responsible administrator). 201 `Transfer`. |
| `GET /admin/transfers/received?status=pending\|all` | Proposals addressed to the caller | Pending first. |
| `GET /admin/transfers/sent?status=pending\|all` | Proposals made by the caller | |
| `GET /admin/transfers/history` | The caller's non-pending proposals, sent or received | |
| `GET /admin/transfers/:id` | One proposal | Its participants, the administrators of the request's category, the super administrator; otherwise 404. |
| `POST /admin/transfers/:id/accept` | Accept | Recipient only. 200 `Transfer`. |
| `POST /admin/transfers/:id/reject` | Refuse | Body `{ responseReason? }`. Recipient only. |
| `POST /admin/transfers/:id/cancel` | Cancel | Initiator only. |
| `GET /admin/assignments/mine` | « Mon historique » | Assignments where the caller is `admin` or `previousAdmin`. |

## Super administrator — `SuperAdminGuard`

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /super-admin/requests` | All ownable work requests | Query: `ownership=free\|owned`, `state=active\|finished`, `adminId`, `status`, `priority`, `from`, `to`. Each item carries `adminOwner` and `adminOwnerUnavailable` (inactive or no longer eligible). |
| `GET /super-admin/administrators` | Administrators with their load | `{ id, displayName, jobTitle, active, ownedActive, ownedFinished, transfersPending, lastOperationAt }[]` |
| `POST /super-admin/requests/:id/reassign` | Reassign or release | Body `{ adminId: uuid \| null, reason }`. `null` releases. 200 `RequestDetail`. |
| `GET /super-admin/transfers?status=` | All proposals by status | `Transfer[]`, paginated. |

Existing routes reused, unchanged: `GET/POST/PATCH /admin/users` (administrator accounts), `GET /admin/audit`
(audit log), `GET/PUT /admin/settings` (new key `transferResponseMinutes`).

## Validation (class-validator DTOs)

| Field | Rule |
|---|---|
| `version` | integer ≥ 0 |
| `type` | `TAKEOVER_REQUEST` or `DELEGATION_REQUEST` |
| `reason` | trimmed string, 1 to 500 characters |
| `responseReason` | optional, trimmed, up to 500 characters |
| `recipientId`, `adminId`, `:id` | UUID |
| `scope`, `status`, `ownership`, `state` | listed values only |
| `from`, `to` | ISO 8601 date |

## Errors

| Situation | HTTP | Code |
|---|---|---|
| Request unknown or not readable by the caller | 404 | `NOT_FOUND` (audited `ACCESS_DENIED`) |
| Role not allowed on the route | 403 | `FORBIDDEN` (audited by the guard) |
| Readable but caller may not act (not responsible, not recipient, not initiator, super administrator claiming) | 403 | `FORBIDDEN` (audited) |
| Request already taken by a colleague | 409 | `REQUEST_ALREADY_CLAIMED` — « Un collègue vient de prendre cette demande en charge. » |
| Stale `version` | 409 | `STATE_CHANGED` (existing) |
| Request not transferable (free, finished) | 409 | `TRANSFER_NOT_POSSIBLE` |
| A proposal is already pending on the request | 409 | `TRANSFER_PENDING_EXISTS` |
| Proposal already answered, cancelled or expired | 409 | `TRANSFER_ALREADY_ANSWERED` |
| Responsible administrator changed since the proposal | 409 | `TRANSFER_OWNER_CHANGED` |
| Recipient / target is self, inactive or not eligible | 422 | `TRANSFER_RECIPIENT_INVALID` |
| Missing reason | 422 | `REASON_REQUIRED` (existing) |
| Invalid body | 400 | `VALIDATION_ERROR` (existing) |

## Real-time events (existing Socket.IO gateway, identifiers only)

| Event | Sent to | When | Client refreshes |
|---|---|---|---|
| `request:updated` (existing) | Requester, assigned employee, the category's administrators, super administrators' room | Claim, transfer accepted, reassign, release — in addition to today's cases | Request lists and detail, file commune, owned lists, counts |
| `transfer:updated` `{ transferId, requestId, status }` (new) | Initiator, recipient, responsible administrator, super administrators' room | Proposal created, accepted, refused, cancelled, expired | Collaboration lists, counts, request detail |
| `notification:new` (existing) | The recipient of each notification | See below | Bell |

## Notifications (stored, one per event and recipient, never to the author of the action)

| Type | Recipient |
|---|---|
| `REQUEST_NEW` / `URGENT` (existing) | Eligible administrators, when a request enters the file commune |
| `TRANSFER_TAKEOVER_REQUESTED` | Responsible administrator |
| `TRANSFER_DELEGATION_REQUESTED` | Chosen colleague |
| `TRANSFER_ACCEPTED`, `TRANSFER_REJECTED` | Initiator |
| `TRANSFER_CANCELLED` | The other party (recipient when the initiator cancels; both when the system cancels) |
| `TRANSFER_EXPIRED` | Initiator and recipient |
| `ADMIN_OWNER_REASSIGNED` | Previous and new responsible administrators |

## Unchanged

`/requests/*` (creation, list, detail, actions, priority, history, thread, files) keep their paths, bodies
and status codes. `RequestSummary` and `RequestDetail` only gain fields. `POST /requests/:id/actions` by an
eligible administrator on a free request now also makes them responsible (D4).
