# Research — 017 Communications centred on the administration

Each entry: **Decision**, **Rationale**, **Alternatives considered**. No open question remains.

## R1 — Where the conversation lives

- **Decision**: new table `Conversation`; `ParentCommunication` stays the message table (one row = one
  message) and gains `conversationId`. Type ↔ participants are enforced by CHECK constraints.
- **Rationale**: closure, responsible admin, link PARENT → INTERNAL and access checks all apply to the
  conversation; storing them on each message would duplicate them and let them diverge. D2.
- **Alternatives**: conversation = its first message (self reference) — every query needs the root, closure
  and assignment become updates of a message; rejected. Renaming `ParentCommunication` to `Message` — large
  churn (revisions, events, deliveries, notifications, n8n) for no behaviour; rejected (`@@map` not needed).

## R2 — Who is « the administration »

- **Decision**: a shared party. Any active `ADMIN` / `SUPER_ADMIN` reads and answers internal, parent and
  archive conversations (D5). Each admin message records its author (`authorId`). `responsibleAdminId` is
  informative (filter « Mes conversations », shown on lines), never an access restriction.
- **Rationale**: small school, one administrative team; the client asked for one inbox.
- **Alternatives**: per-admin conversations (an absent admin blocks a teacher); a dedicated permission to
  read internal conversations (D5 rejected it).

## R3 — Direct sending versus validation

- **Decision**: new message status `SENT` for every direct message (teacher, parent, admin with
  `PARENT_COMM_SEND_DIRECT`). Admin → parent with only `PARENT_COMM_SUBMIT_FOR_APPROVAL`: created and submitted
  in one step (`PENDING_ADMIN_VALIDATION`, revision 1), then the 015 cycle unchanged (approve / return / reject,
  correction then resubmission, cancel while returned). `SENT` and `APPROVED` are both « visible to the
  recipient ».
- **Rationale**: marking a direct message `APPROVED` would claim an approval by its author, which FR-010
  forbids. A server-side draft is not needed for direct messages (the UI composes, then sends once).
- **Alternatives**: `APPROVED` with `decidedById = author` (false history); keeping drafts for every message
  (useless steps, the client wants one « Envoyer » button).
- **Permission order**: if the author holds both permissions, the message is sent directly (the UI offers
  « Envoyer » only). `SUPER_ADMIN` holds everything (`permissionsFor`), hence sends directly.

## R4 — Legacy 015 data

- **Decision**: migration `0026` creates one `LEGACY_TEACHER_PARENT` conversation per distinct
  (teacherId, studentId, guardianId) of `ParentCommunication`, status `CLOSED`, `closedAt` = migration time,
  `closedById` null, and sets `conversationId` on each message. Nothing else of the message changes. A trigger
  forbids inserting a message into a legacy conversation and forbids changing a legacy conversation
  (type, participants, status). Decisions on legacy pending messages are refused by the service
  (`PARENT_COMM_ARCHIVED`). Read rules D3/D4 live in the access policy.
- **Rationale**: D3, D4, FR-035; database-level guard so no future code path can reopen an archive.
- **Alternatives**: converting legacy trios into INTERNAL + PARENT conversations (arbitrary, forbidden by the
  user); cancelling pending messages (modifies history; D4 chose freezing).

## R5 — Enum values and transactions

- **Decision**: two migrations. `0025_communications_enums` only adds enum values and permissions (and grants
  `PARENT_COMM_SUBMIT_FOR_APPROVAL` to `ADMIN`, like `0022`). `0026_communications_conversations` creates the
  table, constraints, triggers and backfill, using the new values.
- **Rationale**: PostgreSQL 17 accepts `ALTER TYPE … ADD VALUE` in a transaction but forbids using the new
  value before commit; splitting avoids depending on how a migration is wrapped. The `0025` INSERT into
  `RolePermission` uses a value added in the same file, so it goes in `0026` too.
- **Down scripts**: `0026/down.sql` drops triggers, constraints, `conversationId`, `authorId` and the table
  (legacy messages unchanged, so 015 code works again); `0025/down.sql` documents that enum values cannot be
  removed in PostgreSQL and only deletes the role permission rows (values stay, unused).

## R6 — Conversation-level history

- **Decision**: close, reopen, assign and link are written to the audit log (`AuditService`, new actions
  `COMMUNICATION_CONVERSATION_CHANGED` with details) and reflected on the conversation (`closedAt`,
  `closedById`, `responsibleAdminId`). Message-level actions keep `ParentCommunicationEvent` (new types
  `SENT`). The spec FR-011 is worded accordingly.
- **Rationale**: `ParentCommunicationEvent` is append-only and tied to a message; adding a nullable
  conversation column would need an UPDATE of append-only rows (backfill) through a disabled trigger.
- **Alternatives**: new `ConversationEvent` table (one more table for four actions, rejected by « ne pas
  multiplier les tables »).

## R7 — Read state

- **Decision**: keep `readAt` on the message = first read by the **recipient party**: the teacher for admin
  messages in an internal conversation, the guardian for admin messages in a parent conversation, « the
  administration » (any admin) for teacher and parent messages. Unread = visible to me as recipient and
  `readAt` null. Opening a conversation marks the visible messages of the other party as read (one
  transaction, event `READ`, audit as in 015).
- **Rationale**: one shared admin inbox (R2) means « read by one admin » is enough; no per-user table.
- **Alternatives**: per-user read receipts table (new table, not needed for a single team).

## R8 — Access policy as pure functions

- **Decision**: `domain/conversation-access.ts` — pure functions `canReadConversation`,
  `visibleMessages`, `canPost`, `sendMode` (direct / submit / forbidden), taking the viewer (role, teacher flag,
  permissions, guardian id), the conversation and the current links (teacher assigned to the student's class,
  guardian linked). The service loads the facts, the domain decides; every one of the 12 rules has unit tests,
  and integration tests cover them through HTTP with valid out-of-scope ids (FR-025).
- **Rationale**: constitution I (business rules covered by unit tests) and the size of the current service
  (1 557 lines) — the policy becomes readable and testable apart.
- **Out-of-scope reads**: answer `404 NOT_FOUND` (not 403) for a conversation, message or file the viewer may
  not see, and audit `ACCESS_DENIED` (`reason: COMMUNICATION_OUT_OF_SCOPE`); role-level refusals (a parent on
  an admin route) stay `403` from the guards, as in 015.

## R9 — Voice files

- **Decision**: unchanged pipeline (`POST /api/files`, kind `VOICE`, real type, limits from « Réglages »). A
  voice file is attached to one message only (`assertOwnVoice`: uploaded by the author, not yet attached).
  `CommunicationFileAccess.canRead` asks the access policy: the file belongs to a message visible to the
  viewer (D3 for archives). Transcription later: a nullable column on the revision can be added without
  touching existing rows; nothing added now (YAGNI).

## R10 — Notifications and n8n

- **Decision**: new notification types `COMM_INTERNAL_NEW` (to admins: teacher message), `COMM_ADMIN_REPLY`
  (to the teacher), `COMM_PARENT_NEW` (to admins: parent message); reused `PARENT_MESSAGE_NEW` (to the
  guardian's account), `PARENT_COMM_TO_VALIDATE`, `PARENT_COMM_RETURNED`, `PARENT_COMM_APPROVED`,
  `PARENT_COMM_REJECTED`. Bell and real time only (014: never pushed). Outbox: the existing
  `parent_communication.approved` event is written when an admin → parent message becomes visible (`SENT` or
  `APPROVED`), once per message. The n8n data route returns `senderName: "L'école"` instead of the teacher's
  name and the link `/messages-ecole/conversations/:conversationId`; the workflow JSON and the docs are updated
  (template variables unchanged: guardian first name, student first name, link).

## R11 — Interfaces and routes

- **Decision**: one menu item « Communications » (`/communications`) for teachers and admins, replacing
  « Parents » and « À valider »; the parent keeps « Messages de l'école » (`/messages-ecole`, also their home).
  One `ConversationView` component, role-aware, reusing `ChatParts` (bubbles, audio player, recorder) and
  `CommunicationParts` (status badges). The 015 validation screen keeps its decision panel inside
  « À valider ». Old addresses redirect: `/communications-parents*` → `/communications`,
  `/communications-a-valider/:id?` → `/communications/a-valider/:id?`, `/messages-ecole/:messageId` and the
  old trio route → the conversation holding the message (bell notifications created before 017 keep working).
- **Rationale**: FR-029 to FR-034, « éviter de multiplier les pages ».
