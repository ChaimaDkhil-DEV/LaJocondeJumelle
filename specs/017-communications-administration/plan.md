# Implementation Plan: Communications centred on the administration (017)

**Branch**: `017-communications-administration` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-communications-administration/spec.md` (decisions D1–D7
validated 2026-11-11).

## Summary

Turn the 015 teacher ↔ guardian messaging into one « Communications » module where the administration is the
only bridge: `INTERNAL` conversations (teacher ↔ administration) and `PARENT` conversations (administration ↔
guardian), text and/or voice, direct sending everywhere except admin → parent, which is direct or submitted
for validation according to two new permissions. Technically: a new `Conversation` table, the existing
`ParentCommunication` rows become its messages (status `SENT` added), a pure access-policy module covering
the 12 rules, new teacher / parent / admin controllers in the existing module, and one React
`ConversationView` reused by the three interfaces. 015 data is wrapped, untouched, into read-only
`LEGACY_TEACHER_PARENT` archives. Details: [research.md](research.md), [data-model.md](data-model.md),
[contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (Node.js 24; backend NestJS, frontend React 19 + Vite)

**Primary Dependencies**: NestJS 11, Prisma 6.19, socket.io 4; React Router 7, TanStack Query 5; existing project
components (`ChatParts`, `CommunicationParts`, voice recorder). No new dependency.

**Storage**: PostgreSQL 17 (Prisma migrations `0025`, `0026` with `down.sql`); voice files in the existing private
files directory (`FILES_DIR`).

**Testing**: Jest (backend unit + integration on a real PostgreSQL), Vitest + Testing Library + axe (frontend),
Playwright (`e2e/`, desktop and phone projects).

**Target Platform**: Linux server (Docker, Caddy), browsers on phones, tablets and desktops.

**Project Type**: web application (`backend/` + `frontend/`, npm workspaces).

**Performance Goals**: lists and conversations open in under 1 s for a school (≈ 50 staff, ≈ 1 000 guardians,
≈ 10 000 messages per year); inbox query uses `(type, status, lastMessageAt)`.

**Constraints**: WCAG 2.2 AA, 320 px minimum width; no content to external services (n8n invites only);
migration without data loss; existing `down.sql` convention; never modify applied migrations.

**Scale/Scope**: one module (`backend/src/parent-communications`, `frontend/src/features/parent-communications`),
≈ 25 backend endpoints replaced, 5 screens; other modules untouched except the listed integration points.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. TDD (non-negotiable) | ✅ | Each task starts with a failing test: access policy (12 rules) and send mode as unit tests, state machine unit tests (existing `communication-workflow` extended), migration spec on a database seeded with 015 rows, HTTP integration specs per controller, frontend screen tests, E2E journeys. |
| II. Simplicity / YAGNI | ✅ (one justified addition) | One new table, justified below; no new module, no new dependency; read state stays one column; transcription not built. |
| III. Accessibility / UX | ✅ | One `ConversationView` for the three roles, axe tests per screen, keyboard tests for recorder and player, 320 px E2E project. |
| IV. Security / data protection | ✅ | Server-side policy on every read and send (FR-015–026), 404 for out-of-scope ids, audited refusals, DB triggers for archives and participants, n8n payload without content, OriginGuard unchanged. |
| V+ (project rules: audit, migrations, CI) | ✅ | Every action audited; migrations dev-only via `migrate dev`, `down.sql` for both; full CI locally before each PR. |

Post-design re-check: no new violation (the design adds no service beyond the policy file, which reduces the
current 1 557-line service).

## Project Structure

### Documentation (this feature)

```text
specs/017-communications-administration/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R11
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                                   # Conversation, enum values, message columns
│   ├── migrations/0025_communications_enums/           # migration.sql + down.sql
│   ├── migrations/0026_communications_conversations/   # table, backfill, CHECKs, triggers, ADMIN permission
│   └── demo/parents.ts, demo/reset.ts                  # demo data: INTERNAL + PARENT conversations
├── src/
│   ├── parent-communications/
│   │   ├── domain/conversation-access.ts      # NEW pure policy: read, visible messages, post, send mode
│   │   ├── domain/communication-workflow.ts   # + SENT, archive freeze, text-or-voice rule
│   │   ├── conversations.service.ts           # NEW: conversations (create, list, detail, post, close, assign, read)
│   │   ├── parent-communications.service.ts   # reduced to validation (submit, decide, cancel, edit) + n8n data
│   │   ├── communications.controller.ts       # NEW: teacher, parent, admin controllers (contracts/api.md)
│   │   ├── parent-communications.controller.ts# keeps /admin/guardians and /admin/teacher-classes only
│   │   ├── parent-communications.guards.ts    # + CommunicationAdminGuard
│   │   ├── communication-file-access.ts       # uses the policy
│   │   └── parent-communications.dto.ts       # new DTOs
│   ├── common/authorization.ts                # ALL_PERMISSIONS + 2 values
│   ├── settings/default-permissions.ts, admin-settings.service.ts  # ADMIN default: SUBMIT_FOR_APPROVAL
│   ├── integrations/n8n.controller.ts         # senderName, conversation link
│   └── realtime/realtime.service.ts|gateway.ts# ADMINS_ROOM, communication:updated
└── test/
    ├── unit/conversation-access.spec.ts, communication-workflow.spec.ts (extended)
    └── integration/communications-teacher|parent|admin|validation|files|migration.spec.ts, parent-communications-n8n.spec.ts (adapted)

frontend/src/
├── app/AppLayout.tsx, app/routes.tsx          # « Communications » item, routes, redirects
├── features/notifications/api.ts              # new types, links to conversations
└── features/parent-communications/
    ├── api.ts                                 # new endpoints
    ├── CommunicationsHomePage.tsx             # NEW: role-aware buttons (teacher 2, admin 4)
    ├── ConversationView.tsx                   # NEW: bubbles, player, composer (reuses ChatParts)
    ├── NewMessagePage.tsx                     # NEW: student → (teacher | guardian) → record/write → send
    ├── ConversationsListPage.tsx              # NEW: inbox / conversations / mine, filters
    ├── ValidationInboxPage.tsx                # adapted: admin → parent messages only
    ├── ParentMessagesPage.tsx                 # adapted: conversations with « L'école », new conversation
    ├── GuardiansAdminPage.tsx, TeacherClassesAdminPage.tsx   # unchanged
    └── TeacherCommunicationsPage.tsx, CommunicationEditorPage.tsx, ParentMessagePage.tsx  # removed (replaced)

e2e/communications.spec.ts                     # replaces e2e/parent-communications.spec.ts
docs/parent-communications.md                  # rewritten for 017; n8n workflow JSON in deploy/n8n/
```

**Structure Decision**: existing web-application layout; the module keeps its folder name
(`parent-communications`) to avoid renaming 30 files and imports — the product name « Communications » is a UI
label. New code is split by responsibility (policy / conversations / validation) inside that module.

## Delivery in phases (one PR each, merged by the user)

1. **Docs** — spec, plan, research, data model, contracts, quickstart, tasks. *(this PR)*
2. **Backend** — migrations + schema (with migration spec), policy (unit), conversations service and
   controllers (integration), validation adapted, files, notifications, real time, n8n, permissions, demo seed.
   The 015 teacher/parent routes are removed in the same PR, so to keep `master` usable phase 2 also switches
   the frontend `api.ts` and the existing pages to the new endpoints with minimal changes: each PR leaves a
   working app.
3. **Frontend** — « Communications » home, `ConversationView`, new message, lists, validation, parent space,
   redirects, a11y tests.
4. **E2E, docs, demo** — `e2e/communications.spec.ts` (desktop + phone), docs rewrite, n8n workflow, demo
   rehearsal; out-of-procedure register entry if any merge happens without the four checks.

## Impacts outside the module

| Area | Change |
|---|---|
| `common/authorization.ts`, settings | two permissions, ADMIN default (data migration in `0026`) |
| `integrations/n8n.controller.ts`, `deploy/n8n/*.workflow.json` | `senderName`, link to the conversation |
| `realtime/*` | `ADMINS_ROOM`, `communication:updated` |
| `notifications` (backend enum, frontend labels/links) | three new types, links by conversation, old links redirected |
| `HomePage.tsx` (016) | parent home renders the new `ParentMessagesPage` |
| Requests, coverage, attendance, AI assistance (009/010), push (014) | **none** |

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Table `Conversation` | closure, responsible admin, PARENT → INTERNAL link and access are conversation facts (FR-003–006) | Storing them on every message duplicates and diverges; conversation = first message makes every query and update go through a message row (R1). |
| DB triggers on `Conversation` and message insert | archives and participants must stay immutable whatever the code path (D3, D4, FR-002) | Service-only checks can be bypassed by a future bug; CHECK constraints cannot see other rows. |
| Two migrations instead of one | new enum values cannot be used in the transaction that adds them (R5) | One file would depend on how the migration is wrapped. |
