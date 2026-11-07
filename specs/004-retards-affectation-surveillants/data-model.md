# Data Model — 004 Lateness and absences, supervisor assignment

**Date**: 2026-10-16 · Base: `backend/prisma/schema.prisma` (PostgreSQL 17, Prisma 6).
Decisions: [research.md](./research.md). Only additions and changes are described; the rest of
the schema is unchanged.

## 1. Enumerations

| Enum | Change | Values |
| --- | --- | --- |
| `Role` | value renamed (migration 0009) | `SUPER_ADMIN`, **`ADMIN`** (formerly `MANAGER`), `EMPLOYEE` |
| `RequestStatus` | addition | **`PENDING`** ("en attente", pending); `BROADCAST` kept but never set again |
| `CoverageSource` | **new** | `TEACHER_REQUEST`, `SUPERVISOR_REPORT`, `ADMIN_DIRECT` |
| `CoverageType` | **new** | `LATENESS`, `ABSENCE`, `EMPTY_CLASS` |
| `GroupSystemKey` | **new** | `TEACHERS`, `SUPERVISORS` |
| `CoverageReminderKind` | **new** | `TAKEOVER`, `TAKEOVER_ESCALATION`, `MORNING`, `END_OF_SLOT`, `END_OF_SLOT_ADMIN`, `SUPPORT_DECISION`, `SUPPORT_ESCALATION` |
| `MergeProposalStatus` | **new** | `PENDING`, `CONFIRMED`, `REJECTED` |
| `RequestEventType` | addition | `UPDATED`, `TEACHER_SET`, `SUPPORT_JOINED`, `SUPPORT_RELEASED`, `MERGE_PROPOSED`, `MERGE_DECIDED`, `REMINDER_SENT`, `ESCALATED`, `ANONYMIZED` |
| `NotificationType` | addition | `COVERAGE_REQUESTED`, `COVERAGE_EMPTY_CLASS`, `COVERAGE_TAKEOVER_EXPIRED`, `COVERAGE_ESCALATED`, `COVERAGE_MORNING_REMINDER`, `COVERAGE_CLOSE_REMINDER`, `COVERAGE_DUPLICATE`, `COVERAGE_SUPPORT_REMINDER`, `COVERAGE_DOUBLE_ASSIGNMENT`, `COVERAGE_LIFTED`, `COVERAGE_UPDATED` |
| `AuditAction` | addition | `FLOOR_CHANGED`, `COVERAGE_ANONYMIZED`, `COVERAGE_MERGE_DECIDED` |

## 2. New tables

### Floor

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid | PK |
| `name` | varchar(60) | unique, required (e.g. "1er étage", 1st floor) |
| `position` | int | display order |
| `active` | bool | default `true`; a deactivated floor stays linked to the history |
| `createdAt`, `updatedAt` | timestamptz | |

Creation, modification and deactivation: super administrator only (FR-006), audited as
`FLOOR_CHANGED`. The "étage sans surveillant" (floor without supervisor) warning is computed at
display time (FR-006a).

### CoverageSupport (backup)

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid | PK |
| `requestId` | uuid → Request | assignment being backed up |
| `userId` | uuid → User | supervisor on backup |
| `joinedAt` | timestamptz | server time |
| `releasedAt` | timestamptz? | release by the admin or switch to "terminée" (done) |
| `releasedById` | uuid? → User | null = system (end of the assignment) |

Partial unique index: only one active backup per `(requestId, userId)`. An active backup makes
the supervisor **busy** (FR-015i): it counts in the availability computation.

### CoverageMergeProposal (attachment proposal)

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid | PK |
| `sourceRequestId` | uuid → Request | the supervisor's report (teacher not specified) |
| `targetRequestId` | uuid → Request | existing request, same class, overlapping time range |
| `status` | `MergeProposalStatus` | `PENDING` → `CONFIRMED` \| `REJECTED`; can be changed after the fact (FR-015h) |
| `createdAt` | timestamptz | |
| `finalPresentedAt` | timestamptz? | last presentation when both assignments are final |
| `decidedAt`, `decidedById` | timestamptz?, uuid? | last decision |

Unique constraint `(sourceRequestId, targetRequestId)`. "Doublon possible" (possible duplicate) =
`PENDING` proposal; "non tranché" (undecided) = `PENDING` and `finalPresentedAt` not null. Each
decision adds a `RequestEvent MERGE_DECIDED` on both assignments and a `COVERAGE_MERGE_DECIDED`
audit entry.

### CoverageReminder (due date)

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid | PK |
| `requestId` | uuid → Request | |
| `kind` | `CoverageReminderKind` | |
| `targetUserId` | uuid? → User | null = "the admins" or "the super administrators" depending on the type |
| `supportId` | uuid? → CoverageSupport | backup reminders |
| `dueAt` | timestamptz | next due date |
| `attempts` | int | sends already done (default 0) |
| `maxAttempts` | int | 1, except `SUPPORT_DECISION` (setting, 3) |
| `intervalMinutes` | int? | repetition (`SUPPORT_DECISION`) |
| `resolvedAt` | timestamptz? | set at the final send or when the condition goes away |
| `resolution` | varchar(30)? | `SENT`, `ASSIGNED`, `CANCELLED`, `CLOSED`, `DECIDED`, `OBSOLETE` |

Index `(resolvedAt, dueAt)`. A row is processed only if `resolvedAt` is null and
`dueAt <= now`; it is locked (`FOR UPDATE SKIP LOCKED`) and the send writes a
`RequestEvent REMINDER_SENT` or `ESCALATED`.

## 3. Modified tables

### CoverageDetail (assignment = enriched guard duty, FR-011)

| Field | Type | Rules |
| --- | --- | --- |
| `source` | `CoverageSource` | nullable in the database (old rows before 0009), required for any creation; 0009 sets `ADMIN_DIRECT` on existing guard duties |
| `type` | `CoverageType?` | required for any creation (FR-007a); null only for earlier guard duties |
| `teacherId` | uuid? → User | teacher concerned, member of the `TEACHERS` group; optional for an empty class (FR-015a); null after anonymization |
| `reason` | varchar(1000)? | detailed reason, visible to the admin and the super administrator only (FR-023c) |
| `floorId` | uuid? → Floor | **copy** of the class's floor at creation (stable history if the class changes floor) |
| `mergedIntoId` | uuid? → Request | assignment absorbed by a confirmed merge (R6) |
| `anonymizedAt` | timestamptz? | set by anonymization (R5) |
| `absentTeacher` | varchar(100)? | **existing**: free text of earlier guard duties, no longer filled in; emptied by anonymization |

Existing fields reused as they are: `classId`, `startAt`, `estimatedMinutes`,
`plannedEndAt` (end of the time slot; required for new assignments), `departedAt`,
`presenceAt` (start of the duration), `relievedAt`, `durationMinutes` (FR-021: `presenceAt` →
`relievedAt`), `extensionCount`, `cancelReason`, `reliefForId`. `broadcastAt` and `releaseCount`
are no longer filled in. `CoverageTarget`, no longer filled in or read, was dropped by migration `0017`.

Indexes added: `(teacherId)`, `(floorId)`, `(source, type)`.

### SchoolClass

`floorId uuid? → Floor`. Required when a class is created or modified (DTO validation); nullable
in the database for existing classes until the super administrator links them (list of "classes
sans étage" (classes without a floor) in the administration).

### User

`floorId uuid? → Floor`: floor a supervisor is attached to (only one, FR-006). Editable by the
super administrator in the account sheet; ignored for a non-supervisor.

### EmployeeGroup

`systemKey GroupSystemKey?` unique. `SUPERVISORS` on the former "Surveillants/Remplaçants"
(renamed "Surveillants"), `TEACHERS` on the new "Enseignants" group. A group with a system key
cannot be deleted or deactivated (its name stays editable).

### Request

No column added. `requesterId` = teacher (request), supervisor (report) or admin (direct
creation). `assigneeId` = responsible supervisor. After anonymization of a teacher request:
`requesterId` = inactive technical account `enseignant-anonymise`, `description` = null.

### Setting (new keys, `SETTING_DEFAULTS` + `SETTING_RULES`)

| Key | Default | Bounds |
| --- | --- | --- |
| `coverageUrgencyThresholdMinutes` | 60 | 5–720 |
| `coverageEscalationMinutes` | 5 | 1–120 |
| `coverageMorningReminderTime` | `"07:00"` | `HH:MM` |
| `coverageCloseReminderMinutes` | 10 | 1–240 |
| `coverageCloseEscalationMinutes` | 10 | 1–240 |
| `coverageSupportReminderMinutes` | 10 | 1–120 |
| `coverageSupportReminderMax` | 3 | 1–10 |
| `coverageRetentionMonths` | 12 | 1–60 |

The pick-up deadline (2 min) stays `DeadlineRule.takeoverMinutes` of the guard category.

## 4. Statuses and transitions

Main status derived from `Request.status` (table R1). State machine transitions
(`coverage-state-machine.ts`), actors: `ADMIN` (admin or super administrator), `ASSIGNEE`
(responsible supervisor), `REQUESTER_TEACHER` (teacher author), `SUPERVISOR` (member of the
`SUPERVISORS` group), `SYSTEM`.

| From | Action | Actor | To | Notes |
| --- | --- | --- | --- | --- |
| — | `CREATE_TEACHER_REQUEST` | REQUESTER_TEACHER | `PENDING` | creates `TAKEOVER` and/or `MORNING` |
| — | `CREATE_DIRECT` | ADMIN | `ACCEPTED` | available supervisor required |
| — | `DECLARE_EMPTY_CLASS` | SUPERVISOR | `ON_DUTY` | except attachment (FR-015d to g); double assignment allowed (FR-015j) |
| `PENDING` | `UPDATE` | REQUESTER_TEACHER | `PENDING` | date, range, class, reason; due dates recomputed |
| `PENDING` | `WITHDRAW` | REQUESTER_TEACHER | `CANCELLED` | optional reason |
| `PENDING` | `ASSIGN` | ADMIN | `ACCEPTED` | resolves `TAKEOVER*`/`MORNING`; creates `END_OF_SLOT` |
| `PENDING` | `ATTACH_DECLARATION` | SYSTEM | `ON_DUTY` | report attached (FR-015d) |
| `PENDING` | `CANCEL` | ADMIN | `CANCELLED` | optional reason |
| `PENDING` | `EXPIRE_UNFILLED` | SYSTEM | `UNFILLED` | time slot end passed |
| `ACCEPTED`, `EN_ROUTE`, `LATE` | `REASSIGN` | ADMIN | `ACCEPTED` | former: `COVERAGE_LIFTED`; new: `ASSIGNED` |
| `ACCEPTED`, `EN_ROUTE`, `LATE` | `CANCEL` | ADMIN | `CANCELLED` | `COVERAGE_LIFTED` to the supervisor |
| `ACCEPTED` | `DEPART` | ASSIGNEE | `EN_ROUTE` | existing |
| `ACCEPTED`, `EN_ROUTE` | `EXPIRE` (arrival) | SYSTEM | `LATE` | existing |
| `ACCEPTED`, `EN_ROUTE`, `LATE` | `CONFIRM_PRESENCE` | ASSIGNEE | `ON_DUTY` | existing (QR/photo) |
| `ON_DUTY` | `REQUEST_RELIEF` | ASSIGNEE | `RELIEF_PENDING` | the handover created is born `PENDING` (assigned by the admin) |
| `ON_DUTY`, `RELIEF_PENDING` | `REASSIGN` | ADMIN | unchanged | creates a handover **assigned** to the new supervisor; the former is released when the new one is present (FR-008j) |
| `ON_DUTY`, `RELIEF_PENDING` | `RELIEVE` ("Terminer", Finish) | ASSIGNEE / SYSTEM | `DONE` | releases active backups |
| `ON_DUTY`, `RELIEF_PENDING` | `RELEASE_BY_MANAGER` | ADMIN | `DONE` | existing |
| `ON_DUTY`, `RELIEF_PENDING` | `CANCEL` | ADMIN | `CANCELLED` | new (FR-008h) |
| `RELIEF_PENDING` | `RELIEF_ABANDONED` | SYSTEM | `ON_DUTY` | existing |
| active | `EXTEND` | ADMIN / ASSIGNEE | unchanged | recomputes `END_OF_SLOT` |
| `DONE` | `VALIDATE` | ADMIN | `CLOSED` | existing |
| any status | `SET_TEACHER` | ADMIN | unchanged | FR-015c, `TEACHER_SET` event |
| active | `RELEASE_SUPPORT` | ADMIN | unchanged | releases a backup (FR-015i) |

**Removed**: `ACCEPT`, `WIDEN`, `RELEASE` (by the supervisor), `EXPIRE` `BROADCAST→UNFILLED`.
The supervisor has no accept, refuse or cancel action (FR-008f).
**Final statuses**: `DONE`/`CLOSED`, `CANCELLED`, `UNFILLED`.

## 5. Supervisor availability (FR-010, FR-015i)

Available for the range `[startAt, plannedEndAt)` if: active, member of `SUPERVISORS`,
declared availability `AVAILABLE`, and no active assignment (`ACCEPTED`, `EN_ROUTE`, `LATE`,
`ON_DUTY`, `RELIEF_PENDING`) nor active backup whose range overlaps (unknown end = +∞,
unchanged). List sorting: the class's floor first, then the others (FR-010). The only exception
to the overlap rule: the empty-class report (FR-015j).

## 6. Attachment and duplicates (FR-015d to FR-015h)

When an empty class is reported, search for a non-final assignment, same class, whose range
overlaps `[now, end of day)`:

| Situation | Effect |
| --- | --- |
| teacher specified, `PENDING` request from the same teacher | `ATTACH_DECLARATION`: the request goes `ON_DUTY` with the reporter |
| request `ACCEPTED`/`EN_ROUTE`/`LATE` (same teacher) | nothing modified; reporter informed of the assigned supervisor; admins notified (`COVERAGE_DUPLICATE`) |
| assignment `ON_DUTY`/`RELIEF_PENDING` on the class | reporter added as **backup** (`CoverageSupport`); `SUPPORT_DECISION` created; admins notified |
| teacher not specified, existing request | new `ON_DUTY` assignment + `CoverageMergeProposal PENDING` |
| no match | new `ON_DUTY` assignment |

## 7. Statistics (FR-022, FR-008i, FR-015b, FR-015h)

Computed on demand (no aggregate table) on `Request` + `CoverageDetail`, filtered by period
(`startAt`, school time zone):

- events = final assignments **without** `mergedIntoId`, excluding `CANCELLED`; counted by
  teacher (or "enseignant non précisé", teacher not specified), by class, by type;
- average duration = average of `durationMinutes` of `DONE`/`CLOSED`;
- unfilled rate = `UNFILLED` / (requests excluding cancelled);
- cancelled: separate counter;
- duplicates: the pairs of a `PENDING` proposal count as **one** event, in an "undecided"
  ("non tranché") section if `finalPresentedAt` is set; `REJECTED`: two; `CONFIRMED`:
  one (the absorbed one has `mergedIntoId`).

Per-teacher data visible to the admin and the super administrator only (FR-023).

## 8. Anonymization (FR-023a)

See R5. Fields erased: `CoverageDetail.teacherId`, `absentTeacher`, `reason`;
`Request.requesterId` (teacher request) → technical account, `Request.description` → null.
Kept: dates, class, floor, type, source, statuses, duration. Never modified: `RequestEvent`,
`AuditLog`, `Notification`.
