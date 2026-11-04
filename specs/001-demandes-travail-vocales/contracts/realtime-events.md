# Real-time contract (Socket.IO) – Phase 1

**Path**: `/socket.io` (same origin). **Transport**: WebSocket, long-polling fallback
allowed. Notifications are **in-app only**: no push, no email, no service
worker.

## Connection

- Authentication at handshake through the `sid` session cookie and a check of the
  `Origin` header. Missing or expired session → `connect_error` with
  `{ code: "UNAUTHENTICATED" }`; the client redirects to the login page.
- The server puts the socket in the `user:{userId}` room and, for an active super administrator,
  in the `role:super-admin` supervision room (updated live when a role
  changes). The client cannot join any room itself and emits no
  business event: all writes go through REST.
- Logout, session expiry or account deactivation → the server sends
  `session:ended` then closes the sockets concerned. The sessions of open connections are
  rechecked every minute (expiry, inactivity, deactivated account).
- A user who still has to change their password cannot connect to the real-time channel.
- On every `connect` (including reconnection), the client calls
  `GET /notifications?unread=true` and invalidates its cached queries, which catches up on any
  missed event.

## Server → client events

All events are emitted **after** the database transaction is committed and contain
only identifiers and metadata; the client rereads the data through REST
(same access control).

| Event | Payload | Emitted to | Client-side effect |
|-------|---------|------------|--------------------|
| `notification:new` | `{ id, type, priority, requestId, reference, title, createdAt }` | notification recipient | badge and list updated; `aria-live` announcement; distinct style if `priority = URGENT` |
| `request:updated` | `{ requestId, status, version, overdueStage }` | requester, assignee, category managers; super administrators (except drafts, including at submission) | invalidates the list, the request detail and the dashboard |
| `message:new` | `{ requestId, messageId }` | authorized participants except the author | invalidates the thread; new message displayed without reloading |
| `session:ended` | `{ reason: "LOGOUT" \| "EXPIRED" \| "DEACTIVATED" \| "PASSWORD_RESET" }` | the user's sockets | back to the login page |

Notification types (`type`): `REQUEST_NEW`, `MESSAGE_NEW`, `ASSIGNED`, `STATUS_CHANGED`,
`URGENT`, `TO_CORRECT`, `REJECTED`, `CANCELLED`, `OVERDUE`, `CLOSED`.

## Who is notified

| Business event | Notified |
|----------------|----------|
| Request sent (workflow A) | assignee (`REQUEST_NEW`, or `URGENT` if urgent) |
| Request submitted (workflow B) | category managers |
| Approval / assignment / reassignment | requester (`STATUS_CHANGED`), new assignee (`ASSIGNED` or `URGENT`) |
| Rejection (T4, T7) | requester (`REJECTED`, with the reason in the request) |
| Cancellation | assignee or managers (`CANCELLED`) |
| Acceptée, En cours, Terminée, En attente de validation finale (Accepted, In progress, Completed, Awaiting final validation) | requester (`STATUS_CHANGED`); managers if final validation |
| À corriger (To correct) | assignee (`TO_CORRECT`) |
| Closure | requester and assignee (`CLOSED`) |
| New message | other direct participants: requester and assigned employee; while no employee is assigned, the category managers (`MESSAGE_NEW`) |
| Delay | category managers and assignee (`OVERDUE`, stage specified) |

The author of an action is never notified of their own action.

## Guarantees

- Order: per user, in the order the transactions are committed (a single process).
- Persistence: each notification exists in the database before emission; nothing is lost if
  the user is offline (FR-033).
- Target latency: < 5 s between the action and the display (SC-003), < 30 s for delays
  (SC-006).
