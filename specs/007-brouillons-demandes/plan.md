# Implementation Plan: Brouillons de demande de travail (Work request drafts)

**Branch**: `007-brouillons-demandes` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-brouillons-demandes/spec.md`

## Summary

Drafts UI on an existing API: « Enregistrer en brouillon » (Save as draft) in « Nouvelle
demande » (if the setting allows it), « Brouillons » (Drafts) tab in « Mes demandes » (only if there
are any), `/demandes/:id/brouillon` page that resumes the pre-filled form to save, send
or delete. The only server change: `drafts` list scope, and `mine` (« Envoyées » (Sent)) without
drafts. Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6 (backend); React 19, React Router 7, MUI 7,
TanStack Query (frontend) — existing stack, no dependency added

**Storage**: PostgreSQL 17 — no schema change or migration

**Testing**: Jest (integration with embedded PostgreSQL), Vitest + Testing Library, Playwright + axe

**Target Platform**: recent browsers (desktop and mobile), Linux server (Docker)

**Project Type**: web application (monorepo `backend/` + `frontend/`)

**Performance Goals**: one more lightweight request on « Mes demandes » (presence of drafts,
`limit=1`)

**Constraints**: WCAG 2.2 AA, 320 px; no new business rule; `draftsEnabled` setting
respected (creation only)

**Scale/Scope**: 1 list scope, 1 page, 1 extracted form component, 1 tab

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Before design | After design |
|-----------|---------------|--------------|
| **I. Tests first** | Each scenario has its red test before the code (R7). | ✅ Integration (scopes, draft submission, setting), frontend (form, tab, page), e2e (flow, 320 px). |
| **II. Simplicity / YAGNI** | Existing API reused; form extracted rather than duplicated. | ✅ One server scope; no dedicated sorting or pagination (R2); no outbox for drafts (R6). |
| **III. Accessibility and UX** | Explicit actions, deletion confirmation, tied errors, 320 px. | ✅ Existing components (`ConfirmDialog`, `VoicePlayer`, `VoiceRecorder`); V18 extended. |
| **IV. Security and data** | Visibility to the author alone (existing); existing server validation. | ✅ `scope=drafts` limited to the session's user; no new data. |
| **V. Integrity and audit** | Existing transitions (`SUBMIT`); a draft has no history or notification (existing). | ✅ Submission through the existing state machine, optimistic version. |

No violation: "Complexity Tracking" not applicable.

## Project Structure

### Documentation (this feature)

```text
specs/007-brouillons-demandes/
├── plan.md
├── research.md          # R1 to R7
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md      # GET /api/requests?scope=drafts; scope=mine without drafts; reused calls
│   └── ui.md            # button, tab, draft page
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/requests/requests.dto.ts           # REQUEST_SCOPES: 'drafts'
├── src/requests/requests.service.ts       # list: 'mine' without DRAFT; 'drafts'
└── test/integration/requests-drafts.spec.ts   # new

frontend/
├── src/features/requests/
│   ├── types.ts                 # RequestScope: 'drafts'
│   ├── api.ts                   # saveDraft, updateDraft, submitDraft, deleteDraft
│   ├── RequestForm.tsx          # form extracted from CreateRequestPage (new)
│   ├── CreateRequestPage.tsx    # uses RequestForm; « Enregistrer en brouillon »
│   ├── DraftPage.tsx            # /demandes/:id/brouillon (new)
│   ├── RequestListPage.tsx      # « Brouillons » tab, drafts link
│   └── RequestDetailPage.tsx    # draft → redirect to the draft page
├── src/app/routes.tsx           # route demandes/:id/brouillon
└── tests/requests/drafts.test.tsx   # new

e2e/
├── drafts.spec.ts               # flow (new)
└── a11y-responsive.spec.ts      # draft page at 320 px
```

**Structure Decision**: existing monorepo; `requests` module on the server and in the UI.

## Complexity Tracking

Not applicable: no constitution violation.
