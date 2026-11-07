# Data Model: Phase 1 – Work requests and voice messaging

**Date**: 2026-10-12 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Conventions: UUID identifiers; `timestamptz` timestamps in UTC; technical names in
English (code), business labels in French (interface). The `RequestEvent` and
`AuditLog` tables are append-only (PostgreSQL trigger against UPDATE/DELETE, research R6).

## Enumerations

| Enumeration | Values (code → label) |
|-------------|-----------------------|
| `Role` | `SUPER_ADMIN` → Super administrateur (super administrator); `MANAGER` → Administrateur/responsable (administrator/manager); `EMPLOYEE` → Employé (employee) |
| `Priority` | `NORMAL` → Normale (normal); `MEDIUM` → Moyenne (medium); `HIGH` → Haute (high); `URGENT` → Urgente (urgent) |
| `RequestStatus` | `DRAFT` → Brouillon (draft); `PENDING_ADMIN_VALIDATION` → En attente de validation administrative (awaiting administrative validation); `SENT` → Envoyée (sent); `ACCEPTED` → Acceptée (accepted); `IN_PROGRESS` → En cours (in progress); `DONE` → Terminée (completed); `PENDING_FINAL_VALIDATION` → En attente de validation finale (awaiting final validation); `TO_CORRECT` → À corriger (to correct); `CLOSED` → Clôturée (closed); `REJECTED` → Refusée (rejected); `CANCELLED` → Annulée (cancelled) |
| `Circuit` | `A_DIRECT`; `B_ADMIN_VALIDATION` |
| `ClosureMode` | `AUTO` (after a grace period); `REQUESTER`; `MANAGER` |
| `AssignmentMode` | `MANUAL`; `AUTO` (workflow B only) |
| `DeadlineStage` | `VALIDATION`; `TAKEOVER` (taking charge); `COMPLETION` (carrying out the work) |
| `MessageKind` | `TEXT`; `VOICE`; `SYSTEM` (mandatory comment on a rejection, a correction, etc.) |
| `FileKind` | `VOICE`; `PHOTO`; `DOCUMENT` |
| `Permission` | `REQUEST_CREATE`; `PRIORITY_CHANGE_OWN`; `PRIORITY_CHANGE_MANAGED`; `REQUEST_REASSIGN`; `AUDIT_READ`; `ADMIN_MANAGE` |

## Entities

### User

| Field | Type | Rules |
|-------|------|-------|
| id | UUID | |
| username | text | unique, case-insensitive, 3–64 characters |
| displayName | text | 1–100 characters |
| jobTitle | text ? | job title displayed (e.g. « Reprographie » (Reprographics)) |
| role | Role | required |
| passwordHash | text | Argon2id; never returned by the API |
| mustChangePassword | boolean | true at creation and after a reset |
| active | boolean | deactivation = sessions deleted; never physically deleted |
| createdAt, updatedAt | timestamp | |

### Session

| Field | Type | Rules |
|-------|------|-------|
| id | random text (256 bits) | cookie value, stored hashed |
| userId | → User | |
| createdAt, lastSeenAt, expiresAt | timestamp | inactivity > `sessionIdleMinutes` or age > `sessionMaxHours` → invalid |

### RolePermission

| Field | Type | Rules |
|-------|------|-------|
| role | Role | `SUPER_ADMIN` always has all permissions (not stored) |
| permission | Permission | unique key (role, permission) |

### Category

| Field | Type | Rules |
|-------|------|-------|
| id | UUID | |
| name | text | unique, 1–60 characters (e.g. « Photocopies » (Photocopies)) |
| active | boolean | an inactive category is no longer offered at creation |
| circuit | Circuit | |
| creatorRoles | Role[] | roles allowed to create in this category (FR-037) |
| closureMode | ClosureMode | |
| autoCloseAfterMinutes | integer ≥ 0 | if `closureMode = AUTO`; 0 = immediate |
| finalValidation | boolean | workflow B only |
| assignmentMode | AssignmentMode | workflow B only |
| autoAssigneeId | → User ? | required if `assignmentMode = AUTO` |
| photoRequired | boolean | photo required to move to "Terminée" (Completed) |

Relations:
- **CategoryRecipient** (categoryId, userId): possible recipients in workflow A and
  assignable employees in workflow B. Only these active users can be chosen
  (FR-004, constraint 7).
- **CategoryManager** (categoryId, userId): category managers; they approve,
  reject, assign, reassign, validate, close (depending on `closureMode`) and receive the
  delay alerts. Required role: `ADMIN` or `SUPER_ADMIN`; demoting a manager to `EMPLOYEE` removes these rows, and a leftover row grants nothing.

### DeadlineRule

| Field | Type | Rules |
|-------|------|-------|
| categoryId | → Category | unique key (categoryId, priority) |
| priority | Priority | |
| validationMinutes | integer > 0 ? | null = not tracked; workflow B only |
| takeoverMinutes | integer > 0 ? | null = not tracked |
| completionMinutes | integer > 0 ? | null = not tracked |

The "close to the due date" threshold is global (`deadlineWarnPercent`).

### Setting (global setting)

Typed key/value pairs, editable by the super administrator, every change
audited. Keys and default values: see [§Default values](#provisional-default-values).

### Request

| Field | Type | Rules |
|-------|------|-------|
| id | UUID | |
| reference | text | readable, unique, e.g. `D-2026-000123` |
| clientId | UUID | unique per (requesterId, clientId): idempotent resubmissions (R10) |
| title | text | 1–120 characters, required |
| description | text ? | ≤ 4,000 characters |
| voiceFileId | → File ? | at least `voiceFileId` or `description` on sending (FR-002) |
| categoryId | → Category | active category where the requester can create |
| priority | Priority | |
| requesterId | → User | |
| assigneeId | → User ? | set on sending in workflow A (chosen recipient), on approval in workflow B; must belong to `CategoryRecipient` |
| status | RequestStatus | |
| version | integer | optimistic locking (R5) |
| rulesSnapshot | object | copy taken at creation: circuit, closureMode, autoCloseAfterMinutes, finalValidation, assignmentMode, photoRequired, deadline durations (FR-022) |
| currentStage | DeadlineStage ? | tracked stage currently running |
| currentDueAt, warnAt | timestamp ? | |
| overdueStage | DeadlineStage ? | stage currently overdue; reset to null when the stage ends |
| autoCloseAt | timestamp ? | if "Terminée" (Completed) and automatic closure |
| rejectionReason | text ? | required if `REJECTED` |
| createdAt, submittedAt, approvedAt, rejectedAt, assignedAt, acceptedAt, startedAt, doneAt, finalValidatedAt, closedAt, cancelledAt | timestamp ? | timestamp of each stage (FR-028); the latest occurrence; the history keeps all occurrences |

Indexes: `status`, `categoryId`, `assigneeId`, `requesterId`, `priority`, `createdAt`,
`currentDueAt`.

### Message

| Field | Type | Rules |
|-------|------|-------|
| id | UUID | |
| requestId | → Request | |
| authorId | → User ? | author of the message; for a `SYSTEM` message (rejection reason, correction comment), the author of the action |
| clientId | UUID | unique per (authorId, clientId) |
| kind | MessageKind | |
| text | text ? | ≤ 4,000 characters; required if `TEXT` |
| voiceFileId | → File ? | required if `VOICE` |
| createdAt | timestamp | never modified or deleted (FR-012) |

### File (voice message, photo or document)

| Field | Type | Rules |
|-------|------|-------|
| id | UUID | also used as the name on disk |
| requestId | → Request | attachment required (inherited access control) |
| messageId | → Message ? | if attached to a message |
| uploaderId | → User | |
| kind | FileKind | |
| mimeType | text | type **after** processing (`audio/mp4`, `image/jpeg`, `application/pdf`, etc.) |
| originalName | text | sanitized, ≤ 255 characters |
| sizeBytes | integer | |
| durationSeconds | decimal ? | voice messages, measured by ffprobe |
| storagePath | text | never returned by the API |
| isCompletionProof | boolean | photo attached when moving to "Terminée" (Completed) |
| createdAt | timestamp | |

A file uploaded but not attached within 24 h (abandoned draft) is deleted by the
scheduled job.

### RequestEvent (history event – append-only)

| Field | Type | Rules |
|-------|------|-------|
| id | UUID | |
| requestId | → Request | |
| actorId | → User ? | null = `SYSTEM` (job) |
| type | text | `CREATED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`, `ASSIGNED`, `REASSIGNED`, `MESSAGE_ADDED`, `FILE_ADDED`, `OVERDUE` |
| fromValue, toValue | JSON ? | before/after values (status, priority, assignee, overdue stage, etc.) |
| comment | text ? | mandatory reason or comment where applicable |
| createdAt | timestamp | |

### AuditLog (audit log – append-only)

| Field | Type | Rules |
|-------|------|-------|
| id | UUID | |
| actorId | → User ? | null if unknown (failed login) |
| action | text | `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `ACCESS_DENIED`, `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `PASSWORD_RESET`, `ROLE_PERMISSIONS_CHANGED`, `CATEGORY_CHANGED`, `DEADLINE_RULE_CHANGED`, `SETTING_CHANGED` |
| targetType, targetId | text ? | |
| details | JSON ? | before/after values; never a password, token or message content |
| ip | text ? | |
| createdAt | timestamp | |

### Notification

| Field | Type | Rules |
|-------|------|-------|
| id | UUID | |
| userId | → User | recipient |
| type | text | `REQUEST_NEW`, `MESSAGE_NEW`, `ASSIGNED`, `STATUS_CHANGED`, `URGENT`, `TO_CORRECT`, `REJECTED`, `CANCELLED`, `OVERDUE`, `CLOSED` |
| requestId | → Request | |
| priority | Priority | copy, for the distinct display of urgent requests |
| readAt | timestamp ? | |
| createdAt | timestamp | |

## State machine

Actors: **R** = requester; **E** = assigned employee; **M** = category manager
(or super administrator); **S** = system (job or automatic rule).

| # | From | Action | To | Actor | Guards and effects |
|---|------|--------|----|-------|--------------------|
| T1 | DRAFT | SUBMIT | SENT | R | workflow A; recipient ∈ active CategoryRecipient; voice message or description; starts TAKEOVER |
| T2 | DRAFT | SUBMIT | PENDING_ADMIN_VALIDATION | R | workflow B; voice message or description; starts VALIDATION |
| T3 | PENDING_ADMIN_VALIDATION | APPROVE | SENT | M | assignee chosen (MANUAL) or `autoAssigneeId` (AUTO), ∈ active CategoryRecipient; starts TAKEOVER |
| T4 | PENDING_ADMIN_VALIDATION | REJECT | REJECTED | M | reason required |
| T5 | PENDING_ADMIN_VALIDATION | CANCEL | CANCELLED | R | |
| T6 | SENT | ACCEPT | ACCEPTED | E | starts COMPLETION |
| T7 | SENT | DECLINE | REJECTED | E | reason required |
| T8 | SENT | CANCEL | CANCELLED | R | |
| T9 | ACCEPTED | START | IN_PROGRESS | E | |
| T10 | IN_PROGRESS | COMPLETE | DONE | E | if `photoRequired`: at least one `isCompletionProof` photo; then T11 or T12 automatically |
| T11 | DONE | (auto) | PENDING_FINAL_VALIDATION | S | if `finalValidation` |
| T12 | DONE | (auto) | — | S | if `closureMode = AUTO`: sets `autoCloseAt` |
| T13 | DONE | CLOSE | CLOSED | R or M depending on `closureMode`; S if `AUTO` and `autoCloseAt` passed | |
| T14 | PENDING_FINAL_VALIDATION | VALIDATE_FINAL | CLOSED | M | |
| T15 | DONE | REQUEST_CORRECTION | TO_CORRECT | R | comment required; cancels `autoCloseAt` |
| T16 | PENDING_FINAL_VALIDATION | REQUEST_CORRECTION | TO_CORRECT | M | comment required |
| T17 | TO_CORRECT | RESUME | IN_PROGRESS | E | restarts COMPLETION |
| T18 | SENT, ACCEPTED, IN_PROGRESS, TO_CORRECT | REASSIGN | SENT | M | new assignee ∈ active CategoryRecipient; starts TAKEOVER |
| T19 | DRAFT | (deletion) | — | R | only case of deletion |

- `CLOSED`, `REJECTED`, `CANCELLED` are final (FR-016).
- Any other combination (status, action, actor) is refused (FR-015), logged as
  `ACCESS_DENIED` if the actor does not have the right, and returns `409 INVALID_TRANSITION` if the
  status does not allow the action.
- Priority change (outside the state machine): R with `PRIORITY_CHANGE_OWN` while the
  status is DRAFT, PENDING_ADMIN_VALIDATION or SENT; M with `PRIORITY_CHANGE_MANAGED` as long
  as the request is neither final nor DONE. The running deadline is recalculated and the
  snapshot's deadline durations are replaced (see §Deadlines, FR-022a); the `PRIORITY_CHANGED`
  event is recorded, with the due date before and after.
- Each transition writes a `STATUS_CHANGED` `RequestEvent`, updates the stage
  timestamp, manages `currentStage`/`currentDueAt`/`overdueStage` and creates the notifications.

## Access matrix

| Resource / action | Requester | Assigned employee | Category manager | Super admin | Others |
|-------------------|-----------|-------------------|------------------|-------------|--------|
| View the request, its thread, voice messages and files | ✅ | ✅ (current assignee) | ✅ | ✅ | ❌ 404 |
| View a workflow B request before approval | ✅ | — (no assignee yet) | ✅ | ✅ | ❌ 404 |
| Write in the thread, attach files | ✅ (non-final status) | ✅ (non-final status) | ✅ (non-final status) | ✅ | ❌ |
| Transitions | per the state machine | per the state machine | per the state machine | as M | ❌ |
| Manage accounts, roles, categories, deadlines, settings | ❌ | ❌ | ❌ | ✅ | ❌ |
| Read the audit log | ❌ | ❌ | ❌ | ✅ | ❌ |

- A reassigned employee loses access to the request (minimization); their actions remain in
  the history.
- All lists, search and counters apply the same visibility rule.

## Deadlines

| Stage | Starts at | Stops at | Duration taken from |
|-------|-----------|----------|---------------------|
| VALIDATION | T2 (submission in workflow B) | T3, T4 or T5 | `rulesSnapshot.validationMinutes` |
| TAKEOVER | T1, T3, T18 (assignment) | T6, T7, T8 or T18 | `rulesSnapshot.takeoverMinutes` |
| COMPLETION | T6 (acceptance), T17 (resumption after correction) | T10, T18 | `rulesSnapshot.completionMinutes` |

- `warnAt = currentDueAt − duration × deadlineWarnPercent / 100`.
- Delay: `overdueStage := currentStage` and an `OVERDUE` event (only once per
  stage occurrence); the request remains visible; when the stage ends `overdueStage := null`,
  and the delay remains visible in the history (FR-026).
- Flagging a delay by the job does not increment `version`: it does not conflict with
  user actions (optimistic locking is reserved for status changes).
- Priority change (FR-022a): `currentDueAt := stage start + new duration`, where the stage start
  is `currentDueAt − old duration`, so time already spent counts. `warnAt` follows. The duration
  comes from the category's current `DeadlineRule` for the new priority, and the snapshot's three
  durations are replaced with it, so later stages use it too; the other snapshot rules stay frozen.
  A due date still in the future clears `overdueStage`. A date already past keeps it, or lets the
  job flag the delay. A stage with no duration for the new priority stops being tracked; a stage
  that was not tracked and now has a duration starts at the time of the change.

## Provisional default values

Values loaded by the seed, **to be confirmed with the client** and editable by the super
administrator.

| Setting | Default value |
|---------|---------------|
| `voiceMaxSeconds` | 180 (3 min) |
| `voiceMaxBytes` | 5 MB (before conversion) |
| `attachmentMaxBytes` | 10 MB per file |
| `attachmentMaxPerMessage` | 5 |
| `allowedPhotoTypes` | image/jpeg, image/png, image/webp |
| `allowedDocumentTypes` | application/pdf |
| `draftsEnabled` | true |
| `deadlineWarnPercent` | 20 |
| `sessionIdleMinutes` | 60 |
| `sessionMaxHours` | 12 |

Default deadlines for any new category (minutes):

| Priority | Validation | Takeover | Completion |
|----------|-----------:|---------:|-----------:|
| Normal | 1 440 (24 h) | 1 440 (24 h) | 4 320 (72 h) |
| Medium | 480 (8 h) | 480 (8 h) | 2 880 (48 h) |
| High | 120 (2 h) | 120 (2 h) | 1 440 (24 h) |
| Urgent | 30 | 15 | 120 (2 h) |

Example category created by the seed: **Photocopies** — workflow A, automatic closure after
24 h, photo not required, Urgent: takeover 1 min and completion 5 min (example from
the spec, not final). Recipients and managers to be designated by the client.
Demonstration categories: **Petits travaux (démo photo)** (Small jobs, photo demo) — workflow A, proof photo
required, closure by the requester; **Intervention technique (démo circuit B)** (Technical intervention, workflow B demo) — administrative
validation and final validation, photo required.

Default permissions: `EMPLOYEE` → `REQUEST_CREATE`, `PRIORITY_CHANGE_OWN`;
`MANAGER` → `REQUEST_CREATE`, `PRIORITY_CHANGE_OWN`, `PRIORITY_CHANGE_MANAGED`,
`REQUEST_REASSIGN`.
