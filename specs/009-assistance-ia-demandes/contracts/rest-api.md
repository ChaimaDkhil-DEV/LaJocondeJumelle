# REST API: AI assistance (foundation)

Common rules: session required (`SessionGuard`), origin check on writes
(`OriginGuard`), errors in the existing format `{ error: { code, message, fields? } }`.

## GET /api/settings/client (existing, extended)

Adds two booleans, derived from the server configuration:

```json
{ "...": "...", "assistSuggestions": false, "assistTranscription": false }
```

## POST /api/assist/transcriptions

- Access: user who can create a work request (at least one allowed category);
  otherwise `NOT_FOUND` (404) and `ACCESS_DENIED` logged.
- Body: `multipart/form-data`, field `file` (recording from the form).
- Checks: those of `POST /api/files` for a voice message (size, signature, duration, conversion).
- Call limit: shared with suggestions (research R7).
- `200`: `{ "text": "…" }` (at most 4,000 characters).
- Errors: `ASSIST_DISABLED` (404) if transcription is disabled; `FILE_TOO_LARGE` (413),
  `FILE_TYPE_NOT_ALLOWED` (415), `VOICE_TOO_SHORT` / `VOICE_TOO_LONG` (existing);
  `TRANSCRIPTION_EMPTY` (422); `ASSIST_RATE_LIMITED` (429); `ASSIST_UNAVAILABLE` (503).
- No file kept, no `File` row.

## POST /api/assist/suggestions

- Access and limit: as above.
- Body (JSON, class-validator):

```json
{ "text": "La photocopieuse du 1er étage ne marche plus" }
```

  `text`: required, trimmed, 1 to 4,000 characters (description and transcription combined by
  the browser).

- `200`:

```json
{
  "suggestion": {
    "title": "La photocopieuse du 1er étage ne marche plus",
    "categoryId": "…",
    "priority": "HIGH",
    "reason": "D'après la consigne « Pannes de reprographie ».",
    "missing": []
  },
  "sources": [{ "id": "…", "title": "Pannes de reprographie", "excerpt": "…" }],
  "noGuideline": false,
  "token": "…"
}
```

  Each field of `suggestion` is optional; `suggestion: null` and `token: null` when no
  reliable suggestion could be made. `noGuideline: true` when no guideline was
  found.

- Errors: `VALIDATION_ERROR` (400), `ASSIST_DISABLED` (404), `ASSIST_RATE_LIMITED` (429),
  `ASSIST_UNAVAILABLE` (503).
- No business write (FR-010).

## POST /api/requests (existing, extended)

`CreateRequestDto.assistToken?: string` (at most 4,000 characters). Ignored for a draft and
when it is invalid, expired or from another user; otherwise an `ASSIST_SUGGESTED` event
is written (data-model). All other checks and responses are unchanged.

## /api/admin/guidelines (super administrator, `SuperAdminGuard`)

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/api/admin/guidelines` | — | `200` list sorted by title: `{ id, title, body, categoryId, categoryName, active, updatedAt, updatedBy }` |
| POST | `/api/admin/guidelines` | `{ title, body, categoryId: string \| null, active }` | `201` guideline |
| PATCH | `/api/admin/guidelines/:id` | optional fields | `200` guideline |
| DELETE | `/api/admin/guidelines/:id` | — | `204` |

Errors: `VALIDATION_ERROR` (unknown category or of shift type: field `categoryId`),
`NOT_FOUND`. Each write: `GUIDELINE_CHANGED` in the audit log.
