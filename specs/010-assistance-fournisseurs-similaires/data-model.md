# Data Model: real providers and similar requests (010)

No new table, column, enumeration or migration.

## Similar request (computed, never kept)

| Field | Source | Exposed to the user | Sent to the provider |
| --- | --- | --- | --- |
| `id` | `Request.id` | link only | no |
| `reference` | `Request.reference` | yes | no |
| `title` | `Request.title` | yes | yes |
| `categoryName` | `Category.name` | yes | yes |
| `priority` | `Request.priority` | yes | yes |
| `status` | `Request.status` | yes | no |

Rules: `kind = WORK`, `status ≠ DRAFT`, visible according to `visibleRequestsWhere(user)`; at most 3;
order: descending full-text rank, then descending `createdAt`. The description is used for the
search but is neither displayed nor sent.

## Configuration (`AppConfig.assist`, extended)

| Variable | Values | Default | Startup check |
| --- | --- | --- | --- |
| `ASSIST_SUGGESTION_PROVIDER` | `disabled`, `demo`, `claude` | `disabled` | `demo` refused in production; `claude` requires `ANTHROPIC_API_KEY` |
| `ASSIST_TRANSCRIPTION_PROVIDER` | `disabled`, `demo`, `whisper` | `disabled` | `demo` refused in production; `whisper` requires `ASSIST_WHISPER_URL` |
| `ANTHROPIC_API_KEY` | secret | — | non-empty if `claude`; never logged |
| `ASSIST_CLAUDE_MODEL` | model identifier | `claude-opus-5-5` | non-empty |
| `ASSIST_WHISPER_URL` | URL | — | `https` in production, `http`/`https` otherwise |
| `ASSIST_WHISPER_MODEL` | model name | `Systran/faster-whisper-small` | non-empty |
| `ASSIST_WHISPER_API_KEY` | optional secret | — | never logged |

`ASSIST_TIMEOUT_MS`, `ASSIST_RATE_LIMIT`, `ASSIST_DEMO_TRANSCRIPT`: unchanged (009).
