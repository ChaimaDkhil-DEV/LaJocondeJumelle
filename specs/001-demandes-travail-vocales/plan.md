# Implementation Plan: Phase 1 – Work requests and voice messaging

**Branch**: `001-demandes-travail-vocales` | **Date**: 2026-10-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-demandes-travail-vocales/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Responsive web application (smartphone, tablet, computer) that lets school staff send voice
work requests to recipients defined per category, process them
according to a strict state machine (direct workflow A or workflow B with administrative
validation), exchange messages in a thread per request (text, voice, photos, files), track
three deadlines per request and be notified in real time within the application.

Technical approach: a React frontend (SPA) and a monolithic NestJS API on a single VPS,
PostgreSQL through Prisma, Socket.IO in a single process (no Redis), a scheduled in-process job
for delays and automatic closure, files stored on a private volume and served
only by the API after an access check, and voice messages normalized on the server to AAC/MP4
for identical playback in every browser. The state machine and the access policy
are pure functions tested before the code. Details and justifications: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 24 LTS, both server-side and client-side

**Primary Dependencies**: Backend: NestJS 11 (REST + WebSocket gateway), Socket.IO 4,
Prisma ORM, class-validator / class-transformer (DTO), @nestjs/schedule, @nestjs/throttler,
argon2, Multer, internal file-type detection, sharp (photos), ffmpeg/ffprobe (voice messages, system
binary). Frontend: React 19, Vite, React Router, TanStack Query 5, Material UI, Socket.IO
client, idb-keyval (local retention of failed sends). Exact versions pinned in
the lockfiles at initialization.

**Storage**: PostgreSQL 17 (data, history, audit, sessions); private disk volume for
voice messages, photos and files (outside any web root)

**Testing**: Backend: Jest + Supertest (unit and integration against a real test
PostgreSQL database). Frontend: Vitest + React Testing Library. End to end: Playwright (Chromium,
WebKit, Firefox; mobile profiles) with @axe-core/playwright for accessibility

**Target Platform**: Recent browsers: Safari iOS/iPadOS 17+, Chrome Android, Chrome, Edge,
Firefox, Safari macOS. Server: one Linux VPS, Docker Compose, Caddy (automatic HTTPS)

**Project Type**: Web application (SPA frontend + backend API)

**Performance Goals**: Notification visible in < 5 s for 95% of events (SC-003);
delay detected and notified in < 30 s (SC-006); filtered search < 2 s over 10,000 requests
(SC-009); creating a voice request < 60 s on the user's side (SC-001)

**Constraints**: HTTPS mandatory (MediaRecorder requires a secure context); a single VPS and
a single API process; no publicly accessible file; no push, no email, no
service worker; WCAG 2.2 AA; usable from 320 px wide

**Scale/Scope**: One school: about 50 to 300 accounts, a few dozen to a few hundred
requests per day, 10,000 to 100,000 requests over several years, 8 user stories,
about 15 screens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. TDD (non-negotiable) | The state machine, the access policy, the deadline calculation and the file validation are pure modules whose tests (exhaustive case tables) are written and fail before the code. Each user story has API integration tests and a Playwright journey traceable to its acceptance scenarios. No merge if the suite fails. | ✅ |
| II. Simplicity / YAGNI | A single API process, no Redis, no message queue, no microservices; in-process scheduled job; file storage on local disk; no automatic escalation (not specified). Two justified additions in Complexity Tracking: ffmpeg and sharp. | ✅ (with justifications) |
| III. Accessibility and UX | Material UI (accessible components), recording and playback controls usable with the keyboard and labelled, automated axe tests on every delivered screen, Playwright tests at 320 px, standardized loading/empty/error/success states. | ✅ |
| IV. Security and data | DTOs with an allow list and rejection of unknown fields; real file-type check (magic bytes + ffprobe); secrets through environment variables; Argon2id; HTTPS through Caddy (HSTS); EXIF metadata (including GPS) stripped from photos; blocking `npm audit` at high level. Purposes and retention periods documented in the spec (section "Personal data"): voice messages, photos and attachments 12 months after closure, history 5 years, audit 5 years. **These periods are provisional assumptions to be validated by the client before going into production.** | ⚠️ provisional periods to validate before production |
| V. Workflows and communications | Finite set of 11 statuses and a single transition table on the server; request history and audit log append-only, protected by PostgreSQL triggers against UPDATE/DELETE; RBAC + category membership checked on every REST request, every Socket.IO event and every file download; access denial logged and returned as 404. | ✅ |

**Result before Phase 0**: pass. **Result after Phase 1** (rechecked against
[data-model.md](./data-model.md) and [contracts/](./contracts/)): pass, subject to the
client validating the provisional retention periods before going into production.

## Handling of the imposed constraints

| # | Constraint | Plan's response | Reference |
|---|------------|-----------------|-----------|
| 1 | Delay detection | `@Interval` job every 15 s in the API process: selects requests whose current stage due date has passed and has not yet been flagged, marks them « En retard » (Overdue) (stage specified) by an idempotent conditional update, writes the history event and notifies the category managers. The same job applies automatic closure. Natural catch-up after a restart (the job reads the state from the database). | research R4, data-model §Deadlines |
| 2 | Voice recording | Recording format chosen through `MediaRecorder.isTypeSupported` (WebM/Opus, then MP4/AAC, then Ogg/Opus); the raw file is sent; validation by ffprobe and systematic server-side conversion to mono AAC in an MP4 container (`.m4a`), played natively by all target browsers. Fallback to the written description if the microphone is refused or the API is missing. HTTPS everywhere, including when testing on a phone. | research R2 |
| 3 | Private files | Private volume, file names = UUID, no static route. Access only through `GET /api/files/:id` (session cookie, access check on the parent request, support for Range requests for Safari, `nosniff`, `Cache-Control: private`). Formats checked by magic bytes, sizes limited at Caddy, at Multer and according to the settings. | research R3, contracts/rest-api.md §Files |
| 4 | State machine and rights tested first | `request-state-machine.ts` and `access-policy.ts` are pure functions; table-driven tests covering each (status, action, role/relationship) pair — allowed and refused — written first. Statuses Refusée (Rejected) and Annulée (Cancelled) included. | data-model §State machine, §Access matrix |
| 5 | Non-modifiable audit log | `AuditLog` and `RequestEvent` tables append-only; PostgreSQL triggers raising an error on UPDATE/DELETE; no write route exposed; consultation reserved for the super administrator. | research R6 |
| 6 | In-app notifications | Notification persisted in the database then emitted by Socket.IO in the `user:{id}` room after the transaction commits; unread ones retrieved at (re)connection. No push, no email, no service worker. | contracts/realtime-events.md |
| 7 | Recipients per category | `CategoryRecipient` table; creation checks on the server that the recipient is an active user of the category (otherwise 422); the interface offers only that list. | data-model §Category |
| 8 | Configuration | Settings in the database (`Setting`, `Category`, `DeadlineRule`) editable by the super administrator, every change audited; provisional default values listed in data-model §Default values and loaded by the seed script. | data-model §Default values |

## Project Structure

### Documentation (this feature)

```text
specs/001-demandes-travail-vocales/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── rest-api.md          # REST routes, authorizations, errors
│   └── realtime-events.md   # Socket.IO events
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/            # versioned migrations (+ SQL of the append-only triggers)
│   └── seed.ts                # provisional default values, initial super admin account
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/                # session guard, error filters, validation pipes
│   ├── auth/                  # login, sessions, password change
│   ├── users/                 # accounts and roles (super admin)
│   ├── categories/            # categories, recipients, managers, deadline rules
│   ├── settings/              # global settings (voice messages, attachments, drafts…)
│   ├── requests/
│   │   ├── domain/
│   │   │   ├── request-state-machine.ts   # pure transitions
│   │   │   ├── access-policy.ts           # pure rights (read, actions)
│   │   │   └── deadlines.ts               # due date calculation
│   │   ├── requests.controller.ts
│   │   └── requests.service.ts
│   ├── messages/              # discussion thread
│   ├── files/                 # private storage, validation, ffmpeg, sharp, download
│   ├── notifications/         # persistence + Socket.IO gateway
│   ├── audit/                 # audit log (internal write, super admin read)
│   └── scheduler/             # delay job + automatic closure
└── test/
    ├── unit/                  # state machine, access policy, deadlines, file validation
    └── integration/           # API + test PostgreSQL database, per user story

frontend/
├── src/
│   ├── main.tsx
│   ├── app/                   # router, MUI theme, providers (Query, Socket)
│   ├── api/                   # HTTP client, types generated from the backend's OpenAPI
│   ├── features/
│   │   ├── requests/          # list, filters, creation, detail, status actions
│   │   ├── voice/             # recorder, player, format detection
│   │   ├── thread/            # thread, attachments, photo capture
│   │   ├── notifications/     # notification center, Socket.IO connection
│   │   ├── outbox/            # failed sends kept (IndexedDB) and retry
│   │   └── admin/             # accounts, categories, deadlines, settings, audit
│   └── components/            # shared components (states, countdown…)
└── tests/                     # Vitest + Testing Library

e2e/                           # Playwright + axe, one file per user story
deploy/
├── docker-compose.yml         # caddy, api, db, backup
├── Caddyfile
├── api.Dockerfile             # Node 24 + ffmpeg
└── backup/                    # pg_dump + archive of the files volume
```

**Structure Decision**: web application with two projects (`backend/`, `frontend/`) in a single
repository with npm workspaces, plus `e2e/` and `deploy/`. No shared package: the frontend
consumes types generated from the backend's OpenAPI, and the server returns for each
request the list of permitted actions (`allowedActions`), so that the state machine
exists in only one place.

## Complexity Tracking

| Addition | Why it is necessary | Simpler alternative rejected because |
|----------|---------------------|--------------------------------------|
| ffmpeg/ffprobe in the API image (converting voice messages to AAC/MP4) | Safari/iOS records in MP4/AAC, Chrome and Firefox in WebM/Opus or Ogg; cross-browser playback is not guaranteed on all target versions. ffprobe also serves to check that the file really is valid audio and to measure its real duration (FR-007). | Store and serve the original format: a voice message recorded in one browser may be unplayable in another, which breaks the main journey (US1). |
| sharp (photo processing) | Strip EXIF metadata, including the GPS position of photos taken on a phone (principle IV, GDPR minimization), and correct the orientation. | Store photos as they are: spreads employees' location to the other participants. |
| embedded-postgres (**development** dependency only, added during implementation on 2026-10-12) | The development machine has neither Docker nor PostgreSQL. embedded-postgres downloads a portable PostgreSQL 17: persistent development database (`npm run -w backend db:dev`) and a disposable database started automatically by the integration tests and e2e. Docker is still used for deployment (`deploy/docker-compose.yml`); `deploy/docker-compose.dev.yml` remains available for machines equipped with Docker. | Require Docker Desktop or a native PostgreSQL installation on every machine: blocked running the Phase 2 tests on the current machine. |
| Redis | **Not added.** A single API process on a single VPS: the in-memory Socket.IO adapter, the in-memory throttler and the in-process job are enough. To be reassessed only if the API moves to several instances. | — |
