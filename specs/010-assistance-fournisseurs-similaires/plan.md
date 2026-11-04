# Implementation Plan: Assistance aux demandes — fournisseurs réels et demandes similaires (Request assistance — real providers and similar requests)

**Branch**: `010-assistance-fournisseurs-et-similaires` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-assistance-fournisseurs-similaires/spec.md`

## Summary

Follow-up to 009 (`assist` module):

- **Similar requests**: `AssistService.suggest` searches for up to 3 close work requests
  (PostgreSQL French full-text on title and description, excluding drafts and shifts), filtered
  by the list's visibility rule (`visibleRequestsWhere`). They are returned in the
  response (`similar`) and sent to the provider reduced to title, category and priority.
- **Whisper connector** (`whisper`): the school's transcription server, OpenAI-compatible
  interface (`/v1/audio/transcriptions`), native `fetch`.
- **Claude connector** (`claude`): official SDK `@anthropic-ai/sdk`, structured output by JSON
  schema, then the existing check `sanitizeSuggestion`.
- Configuration: disabled by default; startup refused if a real connector is incomplete.
- Frontend: « Demandes similaires » section of the panel; test of the transcription replacement.

Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: existing stack (NestJS 11, Prisma 6, React 19, MUI 7); **backend addition:
`@anthropic-ai/sdk`** (see Complexity Tracking); native Node `fetch` and `FormData` for Whisper

**Storage**: PostgreSQL 17, **no migration**: `to_tsvector('french', …)` search on the fly
over `Request` (no GIN index in this phase, R2)

**Testing**: Jest (unit: connectors with simulated `fetch` and SDK, configuration; integration:
similar requests and rights on embedded PostgreSQL), Vitest + Testing Library, Playwright + axe

**Target Platform**: recent browsers; Linux server (Docker, one API instance)

**Project Type**: web application (monorepo `backend/` + `frontend/`)

**Performance Goals**: suggestions with similar requests in under 2 s with `demo` (SC-002);
real connector timeout bounded by `ASSIST_TIMEOUT_MS` (15 s by default)

**Constraints**: no network call in tests or with the default configuration; no
data from a non-visible request sent or displayed; key and address never logged;
HTTPS mandatory in production for the Whisper server; WCAG 2.2 AA, 320 px

**Scale/Scope**: 2 connectors, 1 search, 1 response field, 1 UI section, 6 environment
variables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Before design | After design |
| --- | --- | --- |
| **I. Tests first** | Each behavior has its red test: rights of similar requests, connector requests, errors, configuration. | ✅ Integration (visibility, drafts, shifts, special characters), unit (simulated connectors, configuration), UI (section, transcription replaced), e2e. |
| **II. Simplicity / YAGNI** | Existing search reused; no pgvector; no new table. | ✅ One justified dependency (Anthropic SDK, R3); Whisper by native `fetch` (no SDK); no index or migration. |
| **III. Accessibility and UX** | Optional section, never blocking; links in a new tab to keep the form. | ✅ Named list, links with « nouvel onglet » mention; same error messages; 320 px. |
| **IV. Security and data** | Keys server-side; minimization (title, category, priority of similar requests only); HTTPS in production. | ✅ Visibility filter reused (R1); delimited text and constrained output then filtered (R4); errors without key or address; activation conditional on the school's decision. |
| **V. Integrity and audit** | No write by the assistance; creation unchanged. | ✅ Unchanged since 009; denials and limit still logged. |

## Project Structure

### Documentation (this feature)

```text
specs/010-assistance-fournisseurs-similaires/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md      # similar field; outgoing Whisper and Claude requests
│   └── ui.md            # « Demandes similaires » section
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── package.json                                   # + @anthropic-ai/sdk
├── .env.example                                   # ASSIST_* and ANTHROPIC_API_KEY variables
├── src/config/config.ts                           # whisper / claude, completeness checks
├── src/assist/
│   ├── similar-requests.service.ts                # new: search + visibility
│   ├── assist.service.ts                          # similar in suggest
│   └── providers/
│       ├── assist-providers.ts                    # extended factory, SuggestionInput.similar
│       ├── whisper-transcription.ts               # new
│       └── claude-suggestion.ts                   # new
└── test/
    ├── unit/assist-whisper.spec.ts, assist-claude.spec.ts, config.spec.ts
    └── integration/assist-similar.spec.ts

frontend/
├── src/features/assist/{api.ts, AssistPanel.tsx}
└── tests/assist/assist-panel.test.tsx
```

**Structure Decision**: everything stays in the `assist` module (layer after `requests`, which provides
`visibleRequestsWhere`); one file per connector behind the existing interfaces.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| New dependency `@anthropic-ai/sdk` | Official API reference: SDK mandatory in a TypeScript project; typed errors, cancellation, headers and versions handled by Anthropic. | Raw `fetch`: headers, API versions and request shapes to maintain by hand, discouraged by the reference. |
| New service `SimilarRequestsService` | SQL query and access filter isolated and testable separately from `AssistService`. | Integrating into `AssistService`: mixes search, rights and provider call in an already long method. |
