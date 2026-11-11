# Data model — 017

Prisma schema `backend/prisma/schema.prisma`; migrations `0025_communications_enums` and
`0026_communications_conversations` (each with `down.sql`). Unchanged models are only listed.

## Enums

| Enum | Change |
|---|---|
| `ConversationType` (new) | `INTERNAL`, `PARENT`, `LEGACY_TEACHER_PARENT` |
| `ConversationStatus` (new) | `OPEN`, `CLOSED` |
| `ParentCommunicationAuthor` | + `ADMIN` |
| `ParentCommunicationStatus` | + `SENT` (direct, no validation) |
| `ParentCommunicationEventType` | + `SENT` |
| `Permission` | + `PARENT_COMM_SEND_DIRECT`, + `PARENT_COMM_SUBMIT_FOR_APPROVAL` |
| `NotificationType` | + `COMM_INTERNAL_NEW`, + `COMM_ADMIN_REPLY`, + `COMM_PARENT_NEW` |
| `AuditAction` | + `COMMUNICATION_CONVERSATION_CHANGED` |

## Conversation (new)

| Field | Type | Rule |
|---|---|---|
| `id` | uuid | |
| `type` | `ConversationType` | immutable (trigger) |
| `studentId` | uuid → `Student` | required, immutable |
| `teacherId` | uuid? → `User` | `INTERNAL`: required; `PARENT`: null; `LEGACY…`: required |
| `guardianId` | uuid? → `Guardian` | `PARENT`: required; `INTERNAL`: null; `LEGACY…`: required |
| `createdById` | uuid? → `User` | who started it (teacher, guardian's account, admin); null for legacy |
| `responsibleAdminId` | uuid? → `User` | informative (R2) |
| `linkedInternalId` | uuid? → `Conversation` | only for `PARENT`; target must be `INTERNAL` with the same student (service + trigger) |
| `status` | `ConversationStatus` | default `OPEN`; legacy rows `CLOSED` |
| `closedAt`, `closedById` | timestamptz?, uuid? | `closedAt IS NOT NULL` ⇔ `status = 'CLOSED'` |
| `lastMessageAt` | timestamptz | sorting of lists; set at each visible message |
| `createdAt`, `updatedAt` | timestamptz | |

Constraints (`0026`):

- `Conversation_participants_check`:
  `(type='INTERNAL' AND "teacherId" IS NOT NULL AND "guardianId" IS NULL) OR
   (type='PARENT' AND "guardianId" IS NOT NULL AND "teacherId" IS NULL) OR
   (type='LEGACY_TEACHER_PARENT' AND "teacherId" IS NOT NULL AND "guardianId" IS NOT NULL)`
- `Conversation_link_check`: `"linkedInternalId" IS NULL OR type = 'PARENT'`
- `Conversation_closed_check`: `("status" = 'CLOSED') = ("closedAt" IS NOT NULL)`
- Unique partial index on `(teacherId, studentId, guardianId)` where `type = 'LEGACY_TEACHER_PARENT'`.
- Trigger `Conversation_guard` (BEFORE UPDATE): refuses any change of `type`, `studentId`, `teacherId`,
  `guardianId`; refuses any update of a legacy row; refuses a `linkedInternalId` pointing to a non-internal
  conversation or another student.
- Indexes: `(type, status, lastMessageAt)`, `(teacherId, type)`, `(guardianId, type)`, `(studentId)`.

## ParentCommunication (= message)

| Field | Change |
|---|---|
| `conversationId` | **new**, uuid → `Conversation`, NOT NULL after backfill |
| `authorId` | **new**, uuid? → `User`: the user who wrote it (teacher, guardian's account, admin). Backfilled: `TEACHER` → `teacherId`, `PARENT` → `Guardian.userId` |
| `author` | + `ADMIN` |
| `status` | + `SENT` |
| `teacherId`, `studentId`, `guardianId` | become nullable; kept as they are on legacy rows; **null on new rows** (the conversation is the source of truth) |
| `readAt` | meaning widened: first read by the recipient party (R7) |
| others | unchanged (draft, revisions, versioning, decision, dates) |

Constraints (`0026`): `ParentCommunication_sent_check`: `status <> 'SENT' OR "currentRevision" >= 1`.
Trigger `ParentCommunication_no_archive_insert` (BEFORE INSERT): refuses a message whose conversation is
`LEGACY_TEACHER_PARENT`, or whose conversation is `CLOSED`.

### Message state machine

```
author TEACHER / PARENT                : (create) → SENT
author ADMIN, INTERNAL                 : (create) → SENT
author ADMIN, PARENT, SEND_DIRECT      : (create) → SENT                              → outbox + notification
author ADMIN, PARENT, SUBMIT only      : (create) → PENDING_ADMIN_VALIDATION
     PENDING_ADMIN_VALIDATION → approve (other validator) → APPROVED              → outbox + notification
                              → return (reason)           → RETURNED_FOR_CORRECTION → edit + submit → PENDING…
                              → reject (reason)           → REJECTED
     RETURNED_FOR_CORRECTION  → cancel → CANCELLED
legacy messages                        : frozen, no transition (service refuses: PARENT_COMM_ARCHIVED)
```

Visible to the recipient: `SENT` or `APPROVED` (the approved revision for `APPROVED`, revision 1 for `SENT`).

## Visibility (access policy, R8)

| Viewer | INTERNAL | PARENT | LEGACY_TEACHER_PARENT |
|---|---|---|---|
| Active ADMIN / SUPER_ADMIN | all messages | all messages (pending included) | all messages, every status (D4) |
| Teacher (Enseignants group) | own conversations (`teacherId` = me), all messages | never | `teacherId` = me: my messages (every status I could see before) + guardian messages `APPROVED` |
| Guardian's account (PARENT) | never | `guardianId` = my guardian: my messages + admin messages `SENT`/`APPROVED` | `guardianId` = my guardian: teacher messages `APPROVED` + my messages |

Posting additionally requires: conversation `OPEN` and not legacy; teacher still assigned to the student's
class (INTERNAL); guardian active, account active and still linked to the student (PARENT); admin → parent
send mode from the permissions (R3).

## Unchanged, reused

`ParentCommunicationRevision` (append-only), `ParentCommunicationEvent` (append-only), `ParentCommunicationDelivery`,
`Notification` (`communicationId` → the message), `OutboxEvent`, `File`, `Guardian`, `GuardianStudent`, `TeacherClass`,
`RolePermission` (+ row `ADMIN / PARENT_COMM_SUBMIT_FOR_APPROVAL` inserted by `0026`).

## Backfill (0026, in order)

1. `INSERT INTO "Conversation"` one row per distinct `(teacherId, studentId, guardianId)` of
   `ParentCommunication`: type legacy, status `CLOSED`, `closedAt = now()`, `createdAt` = first message,
   `lastMessageAt` = last message update.
2. `UPDATE "ParentCommunication"` set `conversationId`, `authorId` (no append-only trigger on this table).
3. `ALTER … SET NOT NULL` on `conversationId`; constraints and triggers created last.
4. Check query in `quickstart.md`: zero message without conversation, counts per status unchanged.
