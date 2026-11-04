# Real-time and notifications contract — 004

Mechanism unchanged: notification written inside the transaction (`notifyInTx`), published after
commit over Socket.IO (`notification:new`, per-user room); the author of an action is never
notified. No external channel. Refresh events: `coverage:updated` (unchanged);
`coverage:taken` is no longer emitted (no more broadcast).

"Admins" = active users with the `ADMIN` role; if no admin is active, the super
administrators. "SA" = active super administrators.

| Business event | Type | Priority | Recipients |
| --- | --- | --- | --- |
| Teacher request created | `COVERAGE_REQUESTED` | request | admins |
| Request modified (pending) | `COVERAGE_UPDATED` | request | admins |
| Request withdrawn by the teacher | `CANCELLED` | request | admins |
| Empty class reported | `COVERAGE_EMPTY_CLASS` | **URGENT** | admins |
| Assignment / reassignment | `ASSIGNED` | request | assigned supervisor; teacher author |
| Assignment lifted (cancellation, reassignment) | `COVERAGE_LIFTED` | request | former supervisor |
| Cancellation by the admin | `CANCELLED` | request | teacher author, supervisor |
| Pick-up deadline expired | `COVERAGE_TAKEOVER_EXPIRED` | **URGENT** | admins |
| Escalation (pick-up, backup, closing) | `COVERAGE_ESCALATED` | **URGENT** | SA |
| 7:00 reminder | `COVERAGE_MORNING_REMINDER` | request | admins |
| Closing reminder | `COVERAGE_CLOSE_REMINDER` | request | supervisor, then admins |
| Duplicate (already assigned, attachment, proposal) | `COVERAGE_DUPLICATE` | request | admins; the reporter gets the synchronous response |
| Decision reminder on a backup | `COVERAGE_SUPPORT_REMINDER` | **URGENT** | admins |
| Supervisor with two active assignments | `COVERAGE_DOUBLE_ASSIGNMENT` | **URGENT** | admins |
| Presence confirmed, handover, late arrival, extension, release | existing types | unchanged | admins instead of category managers |
| Unfilled | `COVERAGE_UNFILLED` (existing) | request | admins, teacher author |

Note: the teacher author is notified of the assignment and the reassignment (FR-017a): class, time
slot, supervisor name.

## Highlighting (FR-024a)

`priority = URGENT` triggers in `NotificationCenter` (existing): background and "Urgent" label,
`aria-live="assertive"` region, persistent `role="alert"` Snackbar. Addition: a short sound signal
(Web Audio API), **optional** (local preference, can be turned off), played only after a user
interaction; never the sole carrier of the information.
