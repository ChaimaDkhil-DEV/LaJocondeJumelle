# REST Contract — 007 Brouillons de demande de travail (Work request drafts)

## Changed: `GET /api/requests?scope=…`

| `scope` | Content |
|---------|---------|
| `mine` | requests the user authored, **except** those with status `DRAFT` |
| `drafts` (**new**) | requests the user authored, with status `DRAFT` only |

Other parameters (filters, `limit`, `cursor`) and response shape (`{ items, nextCursor }`)
unchanged. Unknown `scope`: `400 VALIDATION_ERROR` (unchanged).

## Reused without change

| Call | Use |
|------|-----|
| `POST /api/requests` with `asDraft: true` | save as a draft; `400` on `asDraft` if `draftsEnabled` is disabled |
| `GET /api/requests/:id` | open a draft (author only; `404` otherwise) |
| `PATCH /api/requests/:id` | save a draft (changed fields; `voiceFileId: null` removes the voice message) |
| `POST /api/requests/:id/actions` `{ action: "SUBMIT", version }` | submit; content, category, recipient checks |
| `DELETE /api/requests/:id` | delete (author only, draft only) → `204` |
| `POST /api/files` (`kind: VOICE`) | upload a voice message before `POST`/`PATCH` |
