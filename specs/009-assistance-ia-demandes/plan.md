# Implementation Plan: Assistance IA à la création des demandes (socle) (AI assistance when creating requests (foundation))

**Branch**: `009-assistance-ia-demandes` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-assistance-ia-demandes/spec.md`

## Summary

New backend module `assist`:

- transcription of a recording (`POST /api/assist/transcriptions`, same audio checks as
  upload, nothing kept);
- suggestions (`POST /api/assist/suggestions`): PostgreSQL full-text search in the allowed
  guidelines, call to a configurable `SuggestionProvider`, strict field-by-field validation,
  signed token;
- guideline management by the super administrator (`/api/admin/guidelines`, audit
  `GUIDELINE_CHANGED`).

The existing creation accepts an optional `assistToken` and writes an `ASSIST_SUGGESTED` history
event (suggested and kept values). Providers `disabled` (default) and `demo`
(deterministic, local, refused in production); no external call. Frontend: « Propositions
automatiques » (Automatic suggestions) panel in « Nouvelle demande » (New request) and
« Consignes » (Guidelines) tab. Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6, class-validator, `node:crypto` (backend); React 19,
MUI 7, TanStack Query, lucide-react (frontend) — existing stack, **no dependency added**

**Storage**: PostgreSQL 17 — table `Guideline`, values `ASSIST_SUGGESTED` (`RequestEventType`) and
`GUIDELINE_CHANGED` (`AuditAction`); migration `0011_request_assist` with `down.sql`; search
`to_tsvector('french', …)` without extension

**Testing**: Jest (unit; integration with embedded PostgreSQL), Vitest + Testing Library,
Playwright + axe

**Target Platform**: recent browsers (desktop and mobile), Linux server (Docker, a single
API instance)

**Project Type**: web application (monorepo `backend/` + `frontend/`)

**Performance Goals**: suggestions in under 3 s with `demo`, under 20 s in all cases
(`ASSIST_TIMEOUT_MS` timeout = 15 s by default); search over a few dozen guidelines

**Constraints**: no business write by the assistance; creation checks unchanged;
no outgoing network call; no transcription, transmitted text or audio in the database or in the
logs; WCAG 2.2 AA, 320 px; 10 calls per 5 minutes per user

**Scale/Scope**: 1 backend module (3 public routes + 4 administration routes), 1 table, 2
enumeration values, 1 DTO field, 1 panel, 1 administration page, 1 history label

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Before design | After design |
| --- | --- | --- |
| **I. Tests first** | Each scenario has its red test before the code (R10); access and validation rules in unit tests. | ✅ Unit (validation, demonstration, token, limit, configuration), integration (access, guidelines, no write, event, draft, audit), UI, e2e and axe. |
| **II. Simplicity / YAGNI** | No vector database, no real provider, no new dependency. | ✅ PostgreSQL full-text search (R5); signed token rather than a table (R6); in-memory limit (R7); two interfaces justified by the framing decision (real provider later) — see "Complexity Tracking". |
| **III. Accessibility and UX** | Optional panel, never blocking; form unchanged without AI. | ✅ `aria-live` region, named « Appliquer » (Apply) buttons, confirmation before replacement, 320 px; error messages with a corrective action. |
| **IV. Security and data** | Inputs validated server-side; no key in the browser; minimization (nothing kept outside the history). | ✅ Provider response `unknown` then filtered (R3); guidelines filtered in the parameterized SQL query; audio erased (R4); `demo` refused in production; purpose documented (spec, "Assumptions"). |
| **V. Integrity and audit** | Creation only through the existing flow; denials logged; history append-only. | ✅ `ASSIST_SUGGESTED` in the creation transaction; `GUIDELINE_CHANGED` without text; `ACCESS_DENIED` for denials and the limit; `down.sql` refuses to remove a value already in use. |

## Project Structure

### Documentation (this feature)

```text
specs/009-assistance-ia-demandes/
├── plan.md
├── research.md          # R1 to R10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md      # assist/*, admin/guidelines, assistToken
│   └── ui.md            # panel, history, « Consignes » tab
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/schema.prisma                         # Guideline, ASSIST_SUGGESTED, GUIDELINE_CHANGED
├── prisma/migrations/0011_request_assist/       # migration.sql + down.sql (new)
├── scripts/e2e-server.ts                        # demo providers for e2e
├── .env.example                                 # ASSIST_* variables (no secret)
├── src/config/config.ts                         # assist: providers, timeout, limit
├── src/common/errors.ts                         # ASSIST_DISABLED, ASSIST_UNAVAILABLE, TRANSCRIPTION_EMPTY
├── src/audit/audit.service.ts                   # ALLOWED_DETAIL_KEYS: guidelineId, title
├── src/files/files.service.ts                   # prepareVoice extracted from upload (reused)
├── src/settings/admin-settings.service.ts       # clientSettings: assistSuggestions, assistTranscription
├── src/requests/requests.dto.ts                 # assistToken
├── src/requests/requests.service.ts             # ASSIST_SUGGESTED event in create
├── src/assist/                                  # new module
│   ├── assist.module.ts
│   ├── assist.controller.ts                     # transcriptions, suggestions
│   ├── assist.service.ts                        # orchestration, timeout, log without content
│   ├── assist.dto.ts
│   ├── assist-token.ts                          # token signing and reading
│   ├── assist-rate-limiter.ts
│   ├── guidelines.service.ts                    # CRUD, search, audit
│   ├── admin-guidelines.controller.ts
│   ├── domain/sanitize-suggestion.ts            # strict validation (pure)
│   ├── domain/demo-suggest.ts                   # demonstration suggestions (pure)
│   └── providers/                               # interfaces, disabled, demo, factory
└── test/
    ├── unit/assist/*.spec.ts
    └── integration/assist*.spec.ts

frontend/
├── src/api/settings.ts                          # assistSuggestions, assistTranscription
├── src/features/assist/AssistPanel.tsx          # new
├── src/features/assist/api.ts                   # new
├── src/features/requests/CreateRequestPage.tsx  # panel + assistToken
├── src/features/requests/api.ts                 # assistToken in submitRequest
├── src/features/outbox/*                        # assistToken kept offline
├── src/features/requests/HistoryTimeline.tsx    # ASSIST_SUGGESTED label
├── src/features/admin/GuidelinesAdminPage.tsx   # new
├── src/features/admin/GuidelineFormDialog.tsx   # new
├── src/features/admin/AdminLayout.tsx           # « Consignes » tab
├── src/features/admin/adminRoutes.tsx           # /admin/consignes
├── src/features/admin/labels.ts                 # GUIDELINE_CHANGED audit label
└── tests/assist/*.test.tsx, tests/admin/guidelines.test.tsx

e2e/assist.spec.ts                               # new; a11y-responsive.spec.ts extended
docs/ARCHITECTURE.md                             # assist module, no external call
```

**Structure Decision**: existing web application; one NestJS `assist` module groups
providers, guidelines and suggestions, like `coverage` or `dashboard`. No new
service or container.

## Increments

1. **Backend foundation**: migration, configuration, providers, validation, guidelines (CRUD and
   search), suggestions, limit, token; unit and integration tests.
2. **Creation and history**: `assistToken`, `ASSIST_SUGGESTED` event, creation invariants.
3. **Transcription**: `prepareVoice`, route, audio erasure.
4. **UI**: client settings, panel, history, « Consignes » tab; Vitest tests.
5. **E2E, accessibility, documentation**.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| `TranscriptionProvider` / `SuggestionProvider` interfaces with two implementations each | Framing decision: plug in a real provider later without changing the flow (FR-020), and disable the assistance by default (FR-019) | Calling a provider directly: impossible without the GDPR decision; hard-coding the demonstration: to be rewritten at the first real provider |
| Signed token in the suggestions response | Reliable history of suggested values without keeping a suggestion (FR-023, FR-025) | Suggestions table: data kept for abandoned forms; values sent back in clear: forgeable |
