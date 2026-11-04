# Data Model: AI assistance when creating requests (foundation)

Migration `0011_request_assist` (with `down.sql`). No existing data modified.

## Guideline (new table) — « Consigne » (Guideline)

| Field | Type | Rules |
|-------|------|-------|
| `id` | UUID | key |
| `title` | `VARCHAR(120)` | required, trimmed, 1 to 120 characters |
| `body` | `VARCHAR(4000)` | required, trimmed, 1 to 4,000 characters |
| `categoryId` | UUID, optional | `null` = general guideline; otherwise an existing category of type `WORK` (FK `Category`, `ON DELETE RESTRICT`) |
| `active` | boolean | `true` by default |
| `updatedById` | UUID | author of the last modification (FK `User`) |
| `createdAt`, `updatedAt` | `timestamptz(3)` | |

Index: `(active, categoryId)`. No personal data other than the author (FR-015).

Lifecycle: creation (active or not) → modifications → activation / deactivation → permanent
deletion. A deleted guideline disappears from the search; the request history keeps
its identifier and its title at the time of the suggestion, the audit log its title.

Search (research R5): only rows with `active = true` and (`categoryId IS NULL` or
`categoryId` ∈ categories the user can create) are read.

## RequestEventType — new value `ASSIST_SUGGESTED`

Event written by `RequestsService.create`, in the creation transaction, only for a
submission (not a draft) accompanied by a valid `assistToken` (research R6):

```text
actorId   = the requester
fromValue = { title?, categoryId?, categoryName?, priority?, sources: [{ id, title }] }   // suggested
toValue   = { title, categoryId, categoryName, priority }                                // saved
comment   = null
```

No transmitted text, transcription, justification or audio (FR-024). The history remains
append-only (existing trigger).

## AuditAction — new value `GUIDELINE_CHANGED`

Details: `action` (`CREATED` | `UPDATED` | `DELETED`), `guidelineId`, `title`, `categoryId`,
`fields` (names of the modified fields), `after: { active }` for an activation or a
deactivation. Never the text (`body`). Keys added to `ALLOWED_DETAIL_KEYS`: `guidelineId`,
`title`.

## Data not kept

- **Suggestion**: computed on demand, returned to the browser with its signed token; nothing in
  the database until the request is submitted.
- **Transcription and audio sent for transcription**: erased at the end of the call
  (FR-009).

## Suggestion token (not stored)

```text
base64url(JSON { v: 1, uid, iat, s: { title?, categoryId?, priority?, sources: [{ id, title }] } })
+ "." + base64url(HMAC-SHA256(key derived from SESSION_SECRET, payload))
```

Valid for 24 h, for user `uid` only; the suggested category is re-read from the database when
the event is written (current name).
