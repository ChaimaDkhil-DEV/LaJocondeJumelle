# API contract — 017 (prefix `/api`, session cookie, JSON)

Common rules: every modifying request passes `OriginGuard` (CSRF). Role guards answer `403 FORBIDDEN`
(audited) before reading the body. Out-of-scope conversation, message or file → `404 NOT_FOUND` (audited,
R8). Validation errors → `400 VALIDATION_ERROR`. Concurrency → `409 STATE_CHANGED`.

Message body (all « send » routes): `{ text?: string (1–2000, trimmed), voiceFileId?: uuid }`, at least one
(`PARENT_COMM_INCOMPLETE` otherwise). New error codes: `PARENT_COMM_CLOSED` (conversation closed),
`PARENT_COMM_ARCHIVED` (legacy conversation or message), `PARENT_COMM_SEND_FORBIDDEN` (no permission to write
to parents), `PARENT_COMM_RECIPIENT_INVALID` (kept: student / class / guardian / account rule).

## Shapes

```ts
ConversationSummary {
  id; type: 'INTERNAL' | 'PARENT' | 'LEGACY_TEACHER_PARENT'; status: 'OPEN' | 'CLOSED';
  student: { id; firstName; lastName; class: { id; name } };
  teacher?: { id; displayName };          // admin views and INTERNAL only
  guardian?: { id; firstName; lastName; relationship }; // admin views and PARENT only
  responsibleAdmin?: { id; displayName }; // admin views only
  lastMessage: { at; authorKind: 'TEACHER' | 'PARENT' | 'ADMIN'; hasVoice; excerpt? } | null;
  unread: number; createdAt; lastMessageAt;
}
Message {
  id; authorKind; authorLabel;  // D7: teacher sees « Administration (Prénom Nom) », parent sees « L'école »
  mine: boolean; status; text: string | null; voice: { fileId; durationMs } | null;
  createdAt; sentAt; readAt: string | null;
  validation?: { revision; decisionReason; decidedAt }  // admin views only
}
ConversationDetail = ConversationSummary & { messages: Message[]; canPost: boolean;
                                             linkedInternalId?: string /* admin only */ }
```

## Teacher — `CommunicationTeacherGuard` (Enseignants group), controller `communications/teacher`

| Method & path | Body / query | Result |
|---|---|---|
| `GET /communications/teacher/students` | — | students of my classes (`id, names, class`) — guardians **not** returned any more |
| `GET /communications/teacher/conversations` | — | my INTERNAL + my legacy archives, `ConversationSummary[]` |
| `POST /communications/teacher/conversations` | `{ studentId, text?, voiceFileId? }` | `201 ConversationDetail` (message `SENT`) |
| `GET /communications/teacher/conversations/:id` | — | `ConversationDetail`; marks admin messages read |
| `POST /communications/teacher/conversations/:id/messages` | message body | `201 Message` |

## Parent — `@ParentAllowed()` (role PARENT; the service resolves the active guardian), controller `parent/messages` (prefix kept)

| Method & path | Body / query | Result |
|---|---|---|
| `GET /parent/messages/children` | — | my linked active children (`id, firstName, lastName, class`) — teachers **not** returned any more |
| `GET /parent/messages/conversations` | — | my PARENT conversations + my legacy archives |
| `POST /parent/messages/conversations` | `{ studentId, text?, voiceFileId? }` | `201 ConversationDetail` |
| `GET /parent/messages/conversations/:id` | — | `ConversationDetail`; marks visible admin messages read |
| `POST /parent/messages/conversations/:id/messages` | message body | `201 Message` |
| `GET /parent/messages/by-message/:messageId` | — | `{ conversationId }` (old bell links, R11) |

## Administration — `CommunicationAdminGuard` (active ADMIN / SUPER_ADMIN), controller `admin/communications`

| Method & path | Body / query | Result |
|---|---|---|
| `GET /admin/communications/inbox` | — | conversations with unread teacher/parent messages, newest first |
| `GET /admin/communications/conversations` | `type?, status?, studentId?, classId?, teacherId?, guardianId?, mine?, from?, to?, q?` | `ConversationSummary[]` (paginated: `cursor`, `limit ≤ 50`) |
| `GET /admin/communications/conversations/:id` | — | `ConversationDetail` (all messages); marks teacher/parent messages read |
| `POST /admin/communications/conversations` | `{ type: 'INTERNAL', studentId, teacherId, text?, voiceFileId? }` or `{ type: 'PARENT', studentId, guardianId, linkedInternalId?, text?, voiceFileId? }` | `201 ConversationDetail`; PARENT message `SENT` or `PENDING_ADMIN_VALIDATION` (R3) |
| `POST /admin/communications/conversations/:id/messages` | message body | `201 Message` (same send mode rule) |
| `POST /admin/communications/conversations/:id/close` | `{ version }`? — | `200` (audited) |
| `POST /admin/communications/conversations/:id/reopen` | — | `200` (legacy: `PARENT_COMM_ARCHIVED`) |
| `PUT /admin/communications/conversations/:id/responsible` | `{ adminId: uuid \| null }` | `200` (admin must be an active ADMIN/SUPER_ADMIN) |
| `GET /admin/communications/recipients?studentId=` | — | `{ teachers: [...teachers of the student's class], guardians: [...linked guardians with `hasActiveAccount`] }` |
| `GET /admin/communications/send-mode` | — | `{ toParents: 'DIRECT' \| 'SUBMIT' \| 'FORBIDDEN', canValidate: boolean }` (drives the UI) |
| `PATCH /admin/communications/messages/:id` | `{ version, text?, voiceFileId? }` | author only, `RETURNED_FOR_CORRECTION` only |
| `POST /admin/communications/messages/:id/submit` | `{ version }` | author only → `PENDING_ADMIN_VALIDATION` (new revision) |
| `POST /admin/communications/messages/:id/cancel` | `{ version }` | author only, from `RETURNED_FOR_CORRECTION` |

### « À valider » — `CommunicationValidatorGuard` (`PARENT_COMMUNICATION_VALIDATE`), same controller

| Method & path | Body / query | Result |
|---|---|---|
| `GET /admin/communications/to-validate` | `status?, authorId?, classId?, studentId?, from?, to?` | pending admin → parent messages (author ≠ me listed but not decidable) |
| `GET /admin/communications/messages/:id` | — | message + revisions + events + deliveries (015 detail) |
| `POST /admin/communications/messages/:id/decision` | `{ decision: 'APPROVE' \| 'RETURN' \| 'REJECT', revision, version, reason? }` | 015 rules: reason required for RETURN/REJECT, author never decides (`FORBIDDEN`), conversation must be open, legacy refused |

## Removed routes (015)

`/parent-communications/*` (teacher → parent), `/admin/parent-communications/*` (replaced above),
`/parent/messages/conversations/:teacherId/:studentId*`, `/parent/messages/:id/resubmit|cancel` (parent messages
are direct now). `/admin/guardians*` and `/admin/teacher-classes*` are **unchanged**.

## Files

`GET /api/files/:id` (existing): for a `VOICE` file attached to a message, `CommunicationFileAccess` allows
the viewer only if the message is visible to them (data-model « Visibility »); otherwise `404`.

## Integration (n8n) — `@IntegrationRoute`, bearer secret (unchanged auth)

`GET /api/integrations/n8n/parent-communications/:id` → `{ guardian: { firstName, lastName, email?, phone? },
studentFirstName, senderName: "L'école", link: "<APP_ORIGIN>/messages-ecole/conversations/<conversationId>",
channels }` (`teacherName` removed). `POST /api/integrations/n8n/deliveries` unchanged.

## Real time

Existing `notification:new` event; new `communication:updated { conversationId }` emitted to the participants'
rooms (teacher user room, guardian user room, new `ADMINS_ROOM` = active ADMIN and SUPER_ADMIN, next to the existing `SUPER_ADMIN_ROOM`) so open lists and conversations refresh.
