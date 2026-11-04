# Data Model — 007 Brouillons de demande de travail (Work request drafts)

**No schema change, no migration.**

## Work request with status `DRAFT` (existing)

| Field | Draft | Submission (`SUBMIT`) |
|-------|-------|-----------------------|
| `categoryId` | required, active work request category allowed to the author | same |
| `title` | required, 1 to 120 characters | same |
| `priority` | « Normale » (Normal) by default if not chosen | required |
| `description` | optional, 4000 characters max | description **or** voice message |
| `voiceFileId` | optional; replaceable; `null` to remove it | |
| `assigneeId` (recipient) | optional | required in direct mode or between teachers (category rules) |
| `status` | `DRAFT` | `SENT` (direct mode) or `PENDING_ADMIN_VALIDATION` (through the administration) |

Existing rules reused: visible only to its author; no history event or
notification while it is a draft; deletable by its author alone (`DELETE`, voice message
deleted with it); optimistic version.

## `draftsEnabled` setting (existing)

Blocks the **creation** of a draft (`asDraft`); affects neither the editing, nor the submission, nor the
deletion of an existing draft.

## List scopes (`GET /api/requests?scope=`)

| Scope | Before | After |
|-------|--------|-------|
| `mine` (« Envoyées » (Sent)) | the user's requests, drafts included | the user's requests **except** drafts |
| `drafts` (« Brouillons » (Drafts), new) | — | the user's drafts only |
| `assigned`, `managed`, `all` | unchanged | unchanged |
