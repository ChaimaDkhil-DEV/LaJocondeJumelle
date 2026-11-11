# Feature Specification: Communications centred on the administration (refonte de la communication 015)

**Feature Branch**: `017-communications-administration`

**Created**: 2026-11-11

**Status**: Draft (decisions D1 to D7 validated, 2026-11-11)

**Input**: User description (summary): "Faire évoluer la feature 015 en un module unique « Communications »
centré sur l'administration, intermédiaire obligatoire entre enseignants et parents ; aucune communication
directe enseignant-parent. Deux types de conversations : INTERNAL (enseignant ↔ administration) et PARENT
(administration ↔ parent). Messages écrits et vocaux dans les deux. Envoi direct partout, sauf
administration → parent : validation facultative selon les permissions PARENT_COMM_SEND_DIRECT et
PARENT_COMM_SUBMIT_FOR_APPROVAL ; un auteur n'approuve jamais son propre message. Interfaces simples à
boutons, une seule entrée « Communications ». Historique, audit, notifications (n8n via l'outbox) et
sécurité conservés ; migration sûre des anciennes conversations enseignant-parent."

## Context

Since 015 (migrations 0020 to 0023), a teacher and a guardian exchange messages **directly** about a student;
every message, in both directions, waits for an administration validator before the recipient sees it. A
conversation is implicit (the trio teacher + student + guardian); the administration is never an author.

The school now wants the administration to be the only bridge: teachers report to the administration, the
administration talks to families. Existing data (direct teacher ↔ guardian messages) must be kept, untouched,
as a read-only archive.

## Clarifications (decisions validated by the user on 2026-11-11, all as proposed)

- **D1 — Branch**: `017-communications-administration`, created from `master`.
- **D2 — Conversation entity**: a new **Conversation** record carries the type (`INTERNAL`, `PARENT`, or
  `LEGACY_TEACHER_PARENT` for pre-017 data only), the student, the teacher (internal only), the guardian
  (parent only), the responsible administrator, the open/closed status and the optional link from a parent
  conversation to an internal one. The existing communication record becomes **one message** of a
  conversation (author `TEACHER`, `PARENT` or `ADMIN`; new status `SENT` for direct sending). Versions,
  events, deliveries, files and notifications are reused. The type ↔ participants rule is enforced by the
  database, not only by the service.
- **D3 — Legacy teacher ↔ parent conversations**: read-only archive. The administration sees all of it; the
  guardian keeps the approved messages addressed to them (and their own messages); the teacher keeps their own
  messages and the approved messages of the guardian. Nobody can add a message to an archive.
- **D4 — Legacy messages not yet validated** (draft, pending, returned): frozen as they are, visible to the
  administration in the archive, never sent; no decision can be taken on them any more.
- **D5 — Internal conversations**: every active `ADMIN` and `SUPER_ADMIN` can read and answer them (shared
  administration inbox).
- **D6 — Permissions**: `SUPER_ADMIN` always has every right. By default `ADMIN` has
  `PARENT_COMM_SUBMIT_FOR_APPROVAL` (and keeps `PARENT_COMMUNICATION_VALIDATE` as today); `PARENT_COMM_SEND_DIRECT`
  is granted per role in « Réglages > Permissions par rôle ». `PARENT_COMMUNICATION_VALIDATE` still governs the
  validation of submitted messages.
- **D7 — Names shown**: the teacher sees administration messages as « Administration (Prénom Nom) »; the
  parent sees them as « L'école » (never an administrator's name).
- **Closure** (proposed with D1–D7, accepted): a closed conversation is read-only for everyone; only the
  administration can reopen it; a parent can always start a new conversation.

## User Scenarios & Testing

### User Story 1 — The teacher reports to the administration (P1)

In « Communications », the teacher sees two large buttons: « Nouveau message » and « Mes conversations ».
« Nouveau message » asks for a student of their classes, then offers the voice recorder first (one tap to
record, listen, re-record) and an optional written text; « Envoyer » delivers it **directly** to the
administration. The teacher then follows the conversation (bubbles, statuses, unread marks) and answers.

**Independent test**: a teacher with one assigned class sends a voice message about a student of that class;
any administrator sees it in « Boîte de réception » without any validation step.

**Acceptance scenarios**:

1. **Given** a teacher assigned to class 3A, **When** they start a conversation about a student of 3A with a
   voice message only, **Then** it is sent immediately, the administration is notified, and the conversation
   is listed in « Mes conversations » as open.
2. **Given** the same teacher, **When** they try (through the API) to write about a student of 4B, **Then**
   the server refuses (no conversation created, attempt audited).
3. **Given** an open internal conversation, **When** an administrator answers by text or voice, **Then** the
   teacher sees « Administration (Prénom Nom) » and an unread mark until they open it.
4. **Given** a text-only message (no voice), **Then** it is accepted: voice or text, at least one is required.

### User Story 2 — The administration handles reports and answers (P1)

The administration screen offers four buttons: « Boîte de réception » (new conversations and unread messages
from teachers and parents), « Nouveau message », « Conversations » (search and filters) and « À valider »
(only for users allowed to validate). Each line shows sender, type (Interne / Famille), student, class, date,
status. Opening a report plays the voice directly and answers in the same conversation. An administrator can
take responsibility for a conversation, close it and reopen it.

**Acceptance scenarios**:

1. **Given** a new internal message, **When** any active admin opens the inbox, **Then** it is listed with
   « Interne », the teacher's name, the student and class, and its voice can be played inline.
2. **Given** an internal conversation, **When** the admin chooses « Contacter le parent », **Then** a new
   parent conversation editor opens with the student and their guardian preselected, empty, linked to the
   internal conversation; no internal content is copied.
3. **Given** a conversation closed by an admin, **When** anyone tries to post, **Then** the server refuses;
   **When** an admin reopens it, **Then** posting works again.

### User Story 3 — The administration writes to a family (P1)

From « Nouveau message » (or « Contacter le parent »), an admin picks a student and one of the student's
guardians who has an active parent account, writes and/or records, then sends.

**Acceptance scenarios**:

1. **Given** an admin with `PARENT_COMM_SEND_DIRECT`, **When** they send, **Then** the message is `SENT`,
   the parent is notified in the app and one outbox event invites them (email/WhatsApp through n8n) to sign
   in, without text or voice.
2. **Given** an admin with only `PARENT_COMM_SUBMIT_FOR_APPROVAL`, **When** they send, **Then** the message
   is submitted (frozen version) and appears in « À valider » for other validators; the parent sees nothing
   until approval; on approval it is published, notified and handed to n8n exactly as in 015.
3. **Given** the author of a submitted message, **When** they try to approve it (UI or API), **Then** it is
   refused, even for a super administrator.
4. **Given** an admin with neither permission, **Then** they cannot write to a parent (button hidden, API 403).
5. **Given** a guardian without an active parent account, **Then** they cannot be chosen as recipient.

### User Story 4 — The parent writes to the school (P1)

The parent keeps a very simple « Messages de l'école »: list of conversations, « Nouvelle conversation »
button (choose the child, then write and/or record), bubbles signed « L'école », inline audio player, answer by
text or voice. The parent's messages reach the administration **directly**.

**Acceptance scenarios**:

1. **Given** a parent linked to two children, **When** they start a conversation, **Then** they must pick one
   of these two children; any other student id is refused by the server.
2. **Given** an internal conversation about their child, **Then** the parent can neither list it nor open it
   (not even by guessing its id), nor read its voice files.
3. **Given** a parent conversation, **Then** no teacher can list it, open it, or play its voice files.

### User Story 5 — Legacy conversations stay readable (P2)

After the migration, every pre-017 teacher ↔ guardian exchange is a read-only archive: the administration
sees all of it (including frozen drafts and pending messages, D4); the guardian keeps what they could already
read; the teacher keeps their own messages and the guardian's approved ones. No one can post into it.

**Acceptance scenarios**:

1. **Given** a database with 015 messages in every status, **When** the migration runs, **Then** every
   message is attached to exactly one archive conversation; text, versions, statuses, dates, voice files and
   history are unchanged.
2. **Given** a pending legacy message, **Then** it can no longer be approved, returned or rejected, and the
   parent never sees it.

### Edge Cases

- Teacher loses the class (or the student changes class) after a conversation started: past messages stay
  readable by the teacher, new messages are refused (rights are rechecked at every sending).
- Guardian unlinked from the student, guardian deactivated or parent account deactivated: same rule on the
  parent side; the administration keeps everything.
- Two admins answer at the same time: both messages are kept, in order; a decision on a message that changed
  meanwhile is refused (« La communication a changé… »), as in 015.
- A submitted admin → parent message whose conversation is closed before approval: approval is refused until
  the conversation is reopened.
- Voice file of one conversation referenced from another: refused (a voice file belongs to its author and to
  one message only).
- n8n down: the app works; outbox events wait (unchanged from 015).
- An admin who is also a teacher: in an internal conversation they act as the teacher of their classes when
  they started it, and they never validate their own outgoing parent message.

## Requirements

### Functional Requirements

**Conversations**

- **FR-001**: The system MUST manage two conversation types in one module: `INTERNAL` (one teacher ↔ the
  administration, about one student) and `PARENT` (the administration ↔ one guardian, about one student), plus
  the read-only `LEGACY_TEACHER_PARENT` archive type (pre-017 data only, never created afterwards).
- **FR-002**: There MUST be no way, in the interface or the API, for a teacher and a guardian to exchange
  messages directly.
- **FR-003**: Internal and parent conversations about the same student MUST remain distinct records; several
  conversations of each type may exist for the same student.
- **FR-004**: A parent conversation MAY reference one internal conversation (« Contacter le parent »); this
  link MUST never give the guardian access to anything of the internal conversation.
- **FR-005**: A conversation has a status (open / closed), an optional responsible administrator, creation,
  update and closure dates (with who closed it). Only the administration closes, reopens and assigns.
- **FR-006**: A closed conversation MUST refuse new messages from everyone; reopening restores posting.

**Messages**

- **FR-007**: Every message MUST carry a written text, a voice recording, or both (at least one), in both
  conversation types and for every author.
- **FR-008**: Teacher → administration, administration → teacher and parent → administration messages MUST be
  delivered directly (status « Envoyé »), without validation.
- **FR-009**: Administration → parent messages: an author holding `PARENT_COMM_SEND_DIRECT` sends directly; an
  author holding only `PARENT_COMM_SUBMIT_FOR_APPROVAL` submits the message, which follows the 015 validation
  cycle (submitted → approved / returned for correction / rejected, cancellable while draft or returned);
  without either permission, writing to a parent MUST be refused.
- **FR-010**: Only holders of `PARENT_COMMUNICATION_VALIDATE` (and the super administrator) MAY decide on a
  submitted message, and an author MUST never decide on their own message.
- **FR-011**: Each submission MUST freeze a numbered, immutable version; decisions apply to the version shown;
  every message action (create, edit, submit, send, decide, read) MUST be recorded in the message history and
  the audit log; every conversation action (close, reopen, assign, link) in the audit log and on the
  conversation itself (who and when).
- **FR-012**: The recipient side of every message MUST have a read date (first read by the recipient party:
  the administration, the teacher, or the guardian); unread counts derive from it.

**Voice messages**

- **FR-013**: Voice messages MUST reuse the existing upload pipeline: original file kept, real type checked,
  size and duration limits from « Réglages », storage outside the web root, served only through the
  application to people allowed to read that message.
- **FR-014**: A voice message MUST be playable and replayable inline in the conversation; the stored file and
  model MUST allow a transcription to be added later without changing existing messages.

**Access rules (all enforced server side, each covered by tests)**

- **FR-015** (rule 1): A teacher MAY start or post in an internal conversation only about an active student of
  a class currently assigned to them.
- **FR-016** (rule 2): A guardian MAY start or post only about a student linked to them.
- **FR-017** (rule 3): A guardian MAY access only parent conversations where they are the guardian, and the
  archive messages allowed by D3.
- **FR-018** (rule 4): A teacher MAY access only their own internal conversations and the archive messages
  allowed by D3.
- **FR-019** (rule 5): A teacher MUST never access a parent conversation.
- **FR-020** (rule 6): A guardian MUST never access an internal conversation.
- **FR-021** (rule 7): Active `ADMIN` and `SUPER_ADMIN` users access internal, parent and archive
  conversations; writing to parents and validating follow FR-009 and FR-010.
- **FR-022** (rule 8): Rights MUST be rechecked at every sending, submission and decision.
- **FR-023** (rule 9): Past conversations MUST stay readable under these rules after a class, link or account
  change, unless the reader lost their role entirely (deactivated account).
- **FR-024** (rule 10): Voice files MUST be served only to readers of the message that holds them.
- **FR-025** (rule 11): Knowing a conversation, message or file identifier MUST never be enough: every read
  checks the reader against the conversation; refusals look the same as « not found » for out-of-scope users
  and are audited.
- **FR-026** (rule 12): A guardian without an active parent account (none, or deactivated) MUST not be chosen
  as a recipient, cannot start or answer a conversation, and therefore receives no external invitation.

**Notifications**

- **FR-027**: In-app notifications (bell, real time): to the administration for a new message from a teacher
  or a parent and for a message to validate; to the teacher for an administration answer; to the parent when
  an administration message becomes visible; to the author on return, approval or rejection.
- **FR-028**: When an administration → parent message becomes visible (sent directly or approved), exactly one
  outbox event MUST be written in the same transaction; n8n invites the guardian to sign in and MUST never
  receive the text or the voice; the sender shown is the school, not a teacher.

**Interfaces**

- **FR-029**: One menu entry « Communications » for teachers and administration (replacing « Parents » and
  « À valider »); the parent keeps « Messages de l'école ». Former addresses redirect to the new screens.
- **FR-030**: Teacher screen: « Nouveau message » and « Mes conversations » buttons; recorder reachable in one
  tap after choosing the student.
- **FR-031**: Administration screen: « Boîte de réception », « Nouveau message », « Conversations »,
  « À valider » (the last only for validators), and in an internal conversation the « Contacter le parent »
  action.
- **FR-032**: Parent screen: conversation list, « Nouvelle conversation » (child chosen first), inline audio,
  answer by text or voice.
- **FR-033**: Every message line and bubble MUST show sender (per D7), type, student, class, date and time,
  and status; the sender's own bubbles are visually distinct; unread items are marked.
- **FR-034**: All screens MUST meet WCAG 2.2 AA, work from 320 px to desktop without horizontal scrolling, and
  be fully usable with the keyboard and a screen reader (audio player and recorder included).

**Migration**

- **FR-035**: The migration MUST wrap every existing 015 message into one `LEGACY_TEACHER_PARENT` conversation
  per (teacher, student, guardian) trio, without deleting or altering any message, version, event, delivery,
  notification or file; it MUST come with a manual rollback script.
- **FR-036**: Legacy pending, draft and returned messages MUST be frozen (D4); legacy approved messages stay
  readable as in D3.

### Key Entities

- **Conversation**: type, student, teacher (internal), guardian (parent), responsible administrator, status,
  closure (date, by whom), optional linked internal conversation, dates.
- **Message** (former communication): conversation, author kind (teacher, parent, administration) and author,
  status (draft, sent, submitted, returned, approved, rejected, cancelled), working draft, versions, read date,
  decision (who, when, reason).
- **Message version**: immutable text and/or voice of one submission or sending.
- **Message event**: append-only history (created, updated, submitted, sent, approved, returned, rejected,
  cancelled, read, closed, reopened, assigned).
- **Permissions**: `PARENT_COMM_SEND_DIRECT`, `PARENT_COMM_SUBMIT_FOR_APPROVAL` (new),
  `PARENT_COMMUNICATION_VALIDATE` (kept).
- Unchanged and reused: guardian, guardian ↔ student link, teacher ↔ class assignment, file, notification,
  outbox event, external delivery.

## Success Criteria

- **SC-001**: A teacher sends a voice report about one of their students in at most 3 taps after opening
  « Communications » (student, record/stop, send).
- **SC-002**: 100 % of the 12 access rules (FR-015 to FR-026) have automated tests, including attempts with
  valid identifiers of out-of-scope conversations, messages and files.
- **SC-003**: After migration, 100 % of pre-017 messages are attached to an archive conversation, with
  identical content, and none is visible to someone who could not see it before.
- **SC-004**: No message from the administration reaches a parent without either the sender's direct-send
  right or an approval by another validator (verified by tests on every path).
- **SC-005**: No text or voice content ever leaves the application through external notifications.
- **SC-006**: The three interfaces pass the automated accessibility checks and the end-to-end journeys on a
  phone-sized and a desktop-sized screen.

## Assumptions

- « The administration » is a shared party: any active admin can answer an internal or parent conversation;
  the responsible administrator is informative (filter, « mine »), not an access restriction.
- Teachers are, as in 015, `EMPLOYEE` (or `ADMIN`) members of the « Enseignants » group with classes assigned in
  « Classes des enseignants ».
- Existing pages « Représentants » and « Classes des enseignants » are unchanged.
- Voice limits, n8n setup and channels (`PARENT_COMM_CHANNELS`), retention and backups are unchanged.
- Push notifications to phones stay disabled for communications (014 rule).
- Out of scope: transcription, attachments other than voice, group conversations, messages to several
  guardians at once, teacher ↔ teacher messages.
