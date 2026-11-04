# REST API: real providers and similar requests (010)

## POST /api/assist/suggestions (extended)

Access, limit, errors and body unchanged (spec 009). `200` response: added field `similar`
(always present, possibly empty).

```json
{
  "suggestion": { "...": "unchanged" },
  "sources": [],
  "noGuideline": false,
  "token": "…",
  "similar": [
    {
      "id": "…",
      "reference": "D-2026-000042",
      "title": "Photocopieuse du 1er étage en panne",
      "categoryName": "Photocopies",
      "priority": "HIGH",
      "status": "IN_PROGRESS"
    }
  ]
}
```

`similar`: at most 3, only work requests visible to the user, excluding
drafts. No additional field (neither description nor people).

## Outgoing requests (real connectors, disabled by default)

### Whisper (the school's server)

`POST {ASSIST_WHISPER_URL}/v1/audio/transcriptions`, `multipart/form-data`:
`file` (audio/mp4), `model`, `language=fr`, `response_format=json`. Header
`Authorization: Bearer {ASSIST_WHISPER_API_KEY}` if the key is defined.
Expected response: `{ "text": "…" }`. Any other case: `ASSIST_UNAVAILABLE`.

### Claude (Anthropic Messages API, via the official SDK)

Beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`, model `ASSIST_CLAUDE_MODEL`,
`output_config.format` of type `json_schema`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["title", "categoryId", "priority", "reason", "missing", "sourceIds"],
  "properties": {
    "title": { "type": ["string", "null"] },
    "categoryId": { "enum": ["<ids of the allowed categories>", null] },
    "priority": { "enum": ["NORMAL", "MEDIUM", "HIGH", "URGENT", null] },
    "reason": { "type": ["string", "null"] },
    "missing": { "type": "array", "items": { "type": "string" } },
    "sourceIds": { "type": "array", "items": { "type": "string" } }
  }
}
```

Content sent: request text (between `<demande>`), allowed categories (id, name),
allowed guidelines found (id, title, text), similar requests (title, category,
priority). The `null` values are removed before `sanitizeSuggestion`.
