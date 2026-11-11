# Tasks: Communications centred on the administration (017)

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests first (constitution principle I)**: every task marked « test » is written and seen failing before the
task that implements it. Backend tasks belong to **PR 2**, interface tasks to **PR 3**, E2E / docs / demo to
**PR 4** (plan « Delivery in phases »); PR 2 includes T060 so `master` keeps a working app.

**Format**: `- [ ] Txxx [P?] [Story?] Description — file(s)`. `[P]`: different files, no dependency on an
unfinished task.

## Phase 1: Setup — schema and migrations (PR 2)

- [ ] T001 Test: migration spec that seeds 015 rows (every status, both authors, two trios, a voice file, events,
  a delivery, a notification) with the pre-017 schema, applies `0025` and `0026`, and asserts: `0` message
  without `conversationId`; counts per status unchanged; one `LEGACY_TEACHER_PARENT` conversation per distinct
  `(teacherId, studentId, guardianId)`, all `CLOSED` with `closedAt` set; `authorId` = `teacherId` (TEACHER) or
  `Guardian.userId` (PARENT); revisions, events, deliveries, notifications byte-identical; inserting a message
  into a legacy conversation fails — `backend/test/integration/communications-migration.spec.ts`
- [ ] T002 Schema: enums `ConversationType` (`INTERNAL`, `PARENT`, `LEGACY_TEACHER_PARENT`), `ConversationStatus`
  (`OPEN`, `CLOSED`); `ParentCommunicationAuthor` + `ADMIN`; `ParentCommunicationStatus` + `SENT`;
  `ParentCommunicationEventType` + `SENT`; `Permission` + `PARENT_COMM_SEND_DIRECT`, `PARENT_COMM_SUBMIT_FOR_APPROVAL`;
  `NotificationType` + `COMM_INTERNAL_NEW`, `COMM_ADMIN_REPLY`, `COMM_PARENT_NEW`; `AuditAction` +
  `COMMUNICATION_CONVERSATION_CHANGED`; model `Conversation` (fields of data-model.md: `teacherId` « INTERNAL:
  required; PARENT: null », `guardianId` « PARENT: required; INTERNAL: null », `linkedInternalId` « only for
  PARENT », `status` default `OPEN`, `lastMessageAt`, indexes `(type, status, lastMessageAt)`, `(teacherId, type)`,
  `(guardianId, type)`, `(studentId)`); `ParentCommunication` + `conversationId` (required), `authorId` (optional),
  `teacherId` / `studentId` / `guardianId` optional — `backend/prisma/schema.prisma`
- [ ] T003 Migration `0025_communications_enums` (enum values only) + `down.sql` (states that PostgreSQL cannot
  drop enum values; nothing else to undo) — `backend/prisma/migrations/0025_communications_enums/`
- [ ] T004 Migration `0026_communications_conversations`, written in one go: table, backfill (data-model
  « Backfill » steps 1–3), `SET NOT NULL` on `conversationId`, CHECKs `Conversation_participants_check`,
  `Conversation_link_check`, `Conversation_closed_check`, `ParentCommunication_sent_check`
  (`status <> 'SENT' OR "currentRevision" >= 1`), partial unique index for legacy trios, triggers
  `Conversation_guard` and `ParentCommunication_no_archive_insert`, `INSERT INTO "RolePermission" ('ADMIN',
  'PARENT_COMM_SUBMIT_FOR_APPROVAL') ON CONFLICT DO NOTHING`; `down.sql` dropping all of it in reverse order
  (015 data back to its exact pre-017 state) — `backend/prisma/migrations/0026_communications_conversations/`
- [ ] T005 Apply on the development database only (`prisma migrate dev`, then `migrate status` → up to date;
  refuse any reset and report drift); T001 green

## Phase 2: Foundational — policy, permissions, plumbing (PR 2, blocks every story)

- [ ] T006 [P] Test: access policy, one `describe` per rule FR-015 … FR-026 (teacher class, guardian link,
  parent only own PARENT, teacher only own INTERNAL, teacher never PARENT, parent never INTERNAL, admin all,
  recheck at send, past readable after class/link change, deactivated account reads nothing, voice follows the
  message, legacy visibility D3/D4) and `sendMode` (DIRECT if `PARENT_COMM_SEND_DIRECT`, else SUBMIT if
  `PARENT_COMM_SUBMIT_FOR_APPROVAL`, else FORBIDDEN; SUPER_ADMIN DIRECT; INTERNAL always DIRECT) —
  `backend/test/unit/conversation-access.spec.ts`
- [ ] T007 Implement `canReadConversation`, `visibleMessages`, `canPost`, `sendMode`, `authorLabel` (D7:
  teacher « Administration (Prénom Nom) », parent « L'école ») as pure functions —
  `backend/src/parent-communications/domain/conversation-access.ts`
- [ ] T008 [P] Test then implement workflow changes: `SENT` (visible, final), text **or** voice required for every
  author (`missingForSubmit` → `missingForSend`), legacy messages accept no transition (`PARENT_COMM_ARCHIVED`),
  decision refused when the conversation is closed (`PARENT_COMM_CLOSED`) —
  `backend/test/unit/parent-communication-workflow.spec.ts`, `backend/src/parent-communications/domain/communication-workflow.ts`
- [ ] T009 [P] Permissions: `ALL_PERMISSIONS` + 2 values; ADMIN default `PARENT_COMM_SUBMIT_FOR_APPROVAL`; labels in
  « Permissions par rôle » — `backend/src/common/authorization.ts`, `backend/src/settings/default-permissions.ts`,
  `backend/src/settings/admin-settings.service.ts`, existing settings tests updated
- [ ] T010 [P] `CommunicationAdminGuard` (active ADMIN / SUPER_ADMIN, audited 403) with its guard test —
  `backend/src/parent-communications/parent-communications.guards.ts`
- [ ] T011 [P] Real time: `ADMINS_ROOM` joined by active ADMIN / SUPER_ADMIN sockets, `communication:updated
  { conversationId }` publisher — `backend/src/realtime/realtime.service.ts`, `realtime.gateway.ts`,
  `backend/test/integration/realtime.spec.ts`
- [ ] T012 New error codes `PARENT_COMM_CLOSED`, `PARENT_COMM_ARCHIVED`, `PARENT_COMM_SEND_FORBIDDEN` (messages in
  French, corrective action stated) — `backend/src/common/errors.ts`
- [ ] T013 `ConversationsService` skeleton: load facts (teacher assignment, guardian link and account, viewer
  permissions), call the policy, 404 + `ACCESS_DENIED` audit (`COMMUNICATION_OUT_OF_SCOPE`) for out-of-scope ids;
  shared `postMessage` (revision 1, event `SENT` or `SUBMITTED`, `lastMessageAt`, notifications, outbox for
  visible admin → parent, real-time event) — `backend/src/parent-communications/conversations.service.ts`
- [ ] T014 Voice access through the policy (file visible ⇔ its message visible) —
  `backend/src/parent-communications/communication-file-access.ts`, test in
  `backend/test/integration/communications-files.spec.ts`

**Checkpoint**: unit suite green; the policy is the only place deciding access.

## Phase 3: User Story 1 — The teacher reports to the administration (P1) 🎯 MVP

**Goal**: a teacher starts and follows INTERNAL conversations; admins see and answer them.
**Independent test**: quickstart journey 1 and 2; API refuses a student outside the teacher's classes.

- [ ] T015 [US1] Test: teacher routes of contracts/api.md (students without guardians, create with voice only /
  text only / neither → 400, out-of-class student → `PARENT_COMM_RECIPIENT_INVALID` audited, list, detail marks
  admin messages read, post after class removed → refused, closed → `PARENT_COMM_CLOSED`, other teacher's id →
  404, PARENT conversation id → 404) — `backend/test/integration/communications-teacher.spec.ts`
- [ ] T016 [US1] Teacher controller + DTOs (`studentId` uuid, `text` 1–2000 trimmed, `voiceFileId` uuid) —
  `backend/src/parent-communications/communications.controller.ts`, `parent-communications.dto.ts`, module wiring
- [ ] T017 [US1] Notifications `COMM_INTERNAL_NEW` (to admins) and `COMM_ADMIN_REPLY` (to the teacher), bell only —
  `backend/src/notifications/notifications.service.ts` (+ test in T015)
- [ ] T018 [P] [US1] Interface test then build `CommunicationsHomePage` teacher variant (« Nouveau message »,
  « Mes conversations »), `NewMessagePage` (student → recorder first → optional text → « Envoyer »),
  `ConversationsListPage` (mine), `ConversationView` (bubbles per author, inline player, composer, unread, status,
  `canPost`), axe checks — `frontend/src/features/parent-communications/*.tsx` and `*.test.tsx`

**Checkpoint**: MVP — teachers report, admins can answer through T020's admin detail route (PR 2 ships T016 +
admin read/answer of T020).

## Phase 4: User Story 2 — The administration handles reports and answers (P1)

**Goal**: shared inbox, search, answer, close / reopen, responsible admin, « Contacter le parent ».
**Independent test**: quickstart journeys 2, 3 (link) and 5.

- [ ] T019 [US2] Test: admin routes inbox, conversations (filters `type, status, studentId, classId, teacherId,
  guardianId, mine, from, to, q`, `limit ≤ 50`, cursor), detail marks teacher/parent messages read, answer INTERNAL
  → `SENT`, close / reopen / responsible (audited, `COMMUNICATION_CONVERSATION_CHANGED`), legacy reopen →
  `PARENT_COMM_ARCHIVED`, non-admin → 403, `recipients?studentId=` (teachers of the class, guardians with
  `hasActiveAccount`), `send-mode` — `backend/test/integration/communications-admin.spec.ts`
- [ ] T020 [US2] Admin controller (read, answer, close, reopen, responsible, recipients, send-mode) —
  `backend/src/parent-communications/communications.controller.ts`, `conversations.service.ts`
- [ ] T021 [P] [US2] Interface: admin home (« Boîte de réception », « Nouveau message », « Conversations »,
  « À valider » if `canValidate`), lines showing sender, type (Interne / Famille / Archive), student, class, date,
  status; conversation actions close / reopen / « Prendre en charge » / « Contacter le parent » (opens
  `NewMessagePage` with student and guardian preselected and `linkedInternalId`, empty text) —
  `frontend/src/features/parent-communications/*.tsx` and tests

## Phase 5: User Story 3 — The administration writes to a family (P1)

**Goal**: admin → parent messages, direct or submitted for validation; validation inbox kept.
**Independent test**: quickstart journey 3 (both permission sets, self-approval refused).

- [ ] T022 [US3] Test: create PARENT conversation (guardian linked, active account required; `linkedInternalId`
  must be an INTERNAL conversation of the same student), send with SEND_DIRECT → `SENT` + `PARENT_MESSAGE_NEW` +
  one outbox event; with SUBMIT only → `PENDING_ADMIN_VALIDATION`, parent sees nothing, `PARENT_COMM_TO_VALIDATE`
  to other validators; neither → `PARENT_COMM_SEND_FORBIDDEN`; approve by another validator → visible + outbox
  once; author approval → 403 even for SUPER_ADMIN; return → edit → submit (revision 2); cancel; decision on a
  closed conversation → `PARENT_COMM_CLOSED`; concurrent change → `STATE_CHANGED` —
  `backend/test/integration/communications-validation.spec.ts`
- [ ] T023 [US3] Adapt validation service (submit, decide, edit, cancel) to messages with `author = ADMIN`, outbox
  for `SENT` and `APPROVED` — `backend/src/parent-communications/parent-communications.service.ts`
- [ ] T024 [US3] Validation routes `to-validate`, `messages/:id`, `messages/:id/decision|submit|cancel`, `PATCH
  messages/:id` — `communications.controller.ts`
- [ ] T025 [P] [US3] n8n: `senderName: "L'école"`, link `/messages-ecole/conversations/:conversationId`,
  `teacherName` removed; workflow JSON updated — `backend/src/integrations/n8n.controller.ts`,
  `backend/test/integration/parent-communications-n8n.spec.ts`, `deploy/n8n/ljj-parent-communication.workflow.json`
- [ ] T026 [P] [US3] Interface: send button labelled from `send-mode` (« Envoyer » / « Envoyer pour validation »),
  « À valider » screen adapted from `ValidationInboxPage` (decision panel kept, own messages not decidable),
  correction of a returned message — `frontend/src/features/parent-communications/ValidationInboxPage.tsx` and tests

## Phase 6: User Story 4 — The parent writes to the school (P1)

**Goal**: parent conversations with « L'école », started by the parent or by the school.
**Independent test**: quickstart journey 4; internal ids answer 404 to a parent.

- [ ] T027 [US4] Test: parent routes (children without teachers, create for own child only, other student → 
  `PARENT_COMM_RECIPIENT_INVALID`, message `SENT` directly + `COMM_PARENT_NEW` to admins, list only own PARENT +
  archives, detail marks admin messages read and shows « L'école », INTERNAL id → 404, other guardian's id → 404,
  voice of an internal message → 404, deactivated account → 401/403, `by-message/:messageId`) —
  `backend/test/integration/communications-parent.spec.ts`
- [ ] T028 [US4] Parent controller (prefix `parent/messages` kept; 015 trio, resubmit and cancel routes removed) —
  `communications.controller.ts`, `parent-communications.controller.ts`
- [ ] T029 [P] [US4] Interface: `ParentMessagesPage` (conversation list, « Nouvelle conversation » → choose the child
  → record / write → send, `ConversationView` with « L'école »), parent home (016 `HomePage.tsx`) —
  `frontend/src/features/parent-communications/ParentMessagesPage.tsx`, `frontend/src/features/home/HomePage.tsx`, tests

## Phase 7: User Story 5 — Legacy conversations stay readable (P2)

**Goal**: 015 data as read-only archives with D3/D4 visibility.
**Independent test**: quickstart journey 6 and the migration check queries.

- [ ] T030 [US5] Test: archive visibility per viewer (admin every status; teacher own messages + approved guardian
  messages; guardian approved teacher messages + own; no `canPost`; decision on a legacy pending message →
  `PARENT_COMM_ARCHIVED`) — `backend/test/integration/communications-archive.spec.ts`
- [ ] T031 [US5] Archives in lists and detail of the three audiences — `conversations.service.ts`
- [ ] T032 [P] [US5] Interface: « Archive » badge and read-only notice instead of the composer — `ConversationView.tsx`

## Phase 8: Integration of the existing app (PR 2 and PR 3)

- [ ] T060 (PR 2) Minimal frontend switch: `api.ts` to the new endpoints, existing pages compile and work on them —
  `frontend/src/features/parent-communications/api.ts`, existing pages
- [ ] T061 [P] (PR 3) Menu « Communications » for teachers and admins replacing « Parents » and « À valider »;
  routes `/communications`, `/communications/nouveau`, `/communications/conversations/:id`,
  `/communications/a-valider/:id?`; redirects `/communications-parents*`, `/communications-a-valider/:id?`,
  `/messages-ecole/:messageId`, old trio route — `frontend/src/app/AppLayout.tsx`, `frontend/src/app/routes.tsx`, tests
- [ ] T062 [P] (PR 3) Notification labels and links for the new types, old links redirected —
  `frontend/src/features/notifications/api.ts` and tests
- [ ] T063 (PR 3) Remove replaced pages `TeacherCommunicationsPage.tsx`, `CommunicationEditorPage.tsx`,
  `ParentMessagePage.tsx` and their tests once nothing imports them
- [ ] T064 (PR 3) Live refresh on `communication:updated` — `frontend/src/features/notifications/SocketProvider.tsx`

## Phase 9: Polish — E2E, demo, docs (PR 4)

- [ ] T070 E2E: teacher report → admin answer → « Contacter le parent » → submitted → approved by a second admin →
  parent reads and answers; direct send with the permission; closure; archive; cross-access attempts by address;
  desktop and phone projects; axe on each screen — `e2e/communications.spec.ts` (replaces
  `e2e/parent-communications.spec.ts`)
- [ ] T071 [P] Demo data: INTERNAL and PARENT conversations with voices, one pending admin → parent message, one
  archive — `backend/prisma/demo/parents.ts`, `backend/prisma/demo/reset.ts`
- [ ] T072 [P] Docs: rewrite `docs/parent-communications.md` (roles, permissions, lifecycle, archive, n8n payload,
  rollback order `0026/down.sql` then `0025/down.sql`); README feature list
- [ ] T073 Full CI locally (lint, typechecks, unit, integration, frontend, audit) and `npm run test:e2e` recorded in
  `docs/validation/verification-017.md`; quickstart journeys 1–7 checked by hand

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. US1 first (MVP). US2 depends on US1's service (`postMessage`). US3 depends on US2
  (admin controller). US4 needs Phase 2 only (parallel with US2/US3 on the backend). US5 needs Phase 1 + 2.
- Interface tasks of a story need that story's backend routes; T061–T064 need T018, T021, T026, T029.
- T060 is the last task of PR 2; T070–T073 last.

## Parallel Examples

- Phase 2: T006 + T008 + T009 + T010 + T011 together (different files), then T007, T013, T014.
- After Phase 2: US4 backend (T027–T028) in parallel with US1–US3 backend; T025 with T022–T024.
- PR 3: T018, T021, T026, T029, T032 interface work in parallel once their routes exist.

## Implementation Strategy

1. **MVP** = Phases 1–3 backend + T020 admin read/answer: the administration receives and answers teachers'
   reports; validated by T015/T019.
2. Add US3 and US4 (families), then US5 (archives) — PR 2 complete with T060.
3. PR 3: interfaces; PR 4: E2E, demo, docs. Each PR: full CI locally, then the user merges.
