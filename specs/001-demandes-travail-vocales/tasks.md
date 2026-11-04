---

description: "Task list for Phase 1 – Work requests and voice messaging"
---

# Tasks: Phase 1 – Work requests and voice messaging

**Input**: Design documents from `/specs/001-demandes-travail-vocales/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rest-api.md,
contracts/realtime-events.md, quickstart.md

**Tests**: MANDATORY. The constitution (principle I, non-negotiable) requires TDD: in
each phase, the test tasks are written first and MUST fail before the
corresponding implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `backend/src/`, `backend/test/unit/`, `backend/test/integration/`, `backend/prisma/`
- Frontend: `frontend/src/`, `frontend/tests/`
- End to end: `e2e/`; deployment: `deploy/`
- References: `data-model.md` (DM), `contracts/rest-api.md` (REST), `contracts/realtime-events.md` (RT), `research.md` (R1–R13), `quickstart.md` (V1–V18)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create the root `package.json` with npm workspaces `["backend", "frontend"]` and the scripts `lint`, `test`, `test:e2e`, `verify` (lint + tests + `npm audit --audit-level=high`), plus `.gitignore` (node_modules, dist, .env, data/), `.editorconfig` and `.nvmrc` (`24`) at the repository root
- [X] T002 [P] Initialize NestJS 11 in strict TypeScript in `backend/` (`backend/package.json`, `backend/tsconfig.json`, `backend/nest-cli.json`, `backend/src/main.ts`, `backend/src/app.module.ts`) with the dependencies: `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/websockets`, `socket.io`, `@nestjs/schedule`, `@nestjs/throttler`, `@nestjs/swagger`, `prisma`, `@prisma/client`, `class-validator`, `class-transformer`, `argon2`, `cookie-parser`, `file-type`, `sharp`; dev: `jest`, `ts-jest`, `supertest`, `socket.io-client`
- [X] T003 [P] Initialize Vite + React 19 + strict TypeScript in `frontend/` (`frontend/package.json`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`) with `react-router`, `@tanstack/react-query`, `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`, `socket.io-client`, `idb-keyval`; configure in `frontend/vite.config.ts` the proxy of `/api` and `/socket.io` (ws) to `http://localhost:3000`
- [X] T004 [P] Configure ESLint (typescript-eslint, React Hooks and jsx-a11y rules for the frontend) and Prettier in `eslint.config.mjs` and `.prettierrc` at the root
- [X] T005 [P] Configure Jest in `backend/jest.config.ts` (unit, `backend/test/unit/**`) and `backend/test/jest-integration.config.ts` (integration, `backend/test/integration/**`, serial execution); create `backend/test/utils/test-app.ts` (starts the Nest application on a test database) and `backend/test/utils/test-db.ts` (applies the migrations to `DATABASE_URL_TEST` and empties the tables between tests, except triggers)
- [X] T006 [P] Configure Vitest + React Testing Library + jsdom in `frontend/vitest.config.ts` and `frontend/tests/setup.ts` (jest-dom, cleanup, reusable fake `MediaRecorder` in `frontend/tests/mocks/media-recorder.ts`)
- [X] T007 [P] Configure Playwright in `e2e/playwright.config.ts`: projects `chromium`, `webkit`, `firefox`, `iPhone 13`, `Pixel 7` and a `mobile-320` project (viewport 320×640); Chromium options `--use-fake-ui-for-media-stream` and `--use-fake-device-for-media-stream`; for WebKit (including the `iPhone 13` profile), which has no simulated microphone, `e2e/support/fake-media-recorder.ts` injected by `page.addInitScript` replaces `navigator.mediaDevices.getUserMedia` and `MediaRecorder` with a simulation producing a real `audio/mp4` Blob taken from a fixture, playback remaining that of the real `<audio>` element; `webServer` that launches backend and frontend; create `e2e/support/axe.ts` (assertion `expectNoA11yViolations(page)` with @axe-core/playwright, tags wcag2a, wcag2aa, wcag21aa, wcag22aa) and `e2e/support/login.ts` (login with a demo account)
- [X] T008 [P] Create `deploy/docker-compose.dev.yml` (services `db` PostgreSQL 17 with databases `app` and `app_test`, `caddy` in internal HTTPS on port 8443) and `deploy/Caddyfile.dev` (`tls internal`, proxy `/api/*` and `/socket.io/*` to the API, the rest to Vite) to test the microphone on a phone (R2)
- [X] T009 [P] Create `backend/.env.example` (`DATABASE_URL`, `DATABASE_URL_TEST`, `SESSION_SECRET`, `FILES_DIR`, `APP_ORIGIN`, `PORT`, `FFMPEG_PATH`, `FFPROBE_PATH`) and `backend/src/config/config.ts` which validates these variables at startup and refuses to start if one is missing (principle IV: no secret in the code)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database

- [X] T010 Write the complete Prisma schema in `backend/prisma/schema.prisma` according to DM: enumerations `Role`, `Priority`, `RequestStatus` (11 values: `DRAFT`, `PENDING_ADMIN_VALIDATION`, `SENT`, `ACCEPTED`, `IN_PROGRESS`, `DONE`, `PENDING_FINAL_VALIDATION`, `TO_CORRECT`, `CLOSED`, `REJECTED`, `CANCELLED`), `Circuit`, `ClosureMode`, `AssignmentMode`, `DeadlineStage`, `MessageKind`, `FileKind`, `Permission`; models `User`, `Session`, `RolePermission`, `Category`, `CategoryRecipient`, `CategoryManager`, `DeadlineRule`, `Setting`, `Request`, `Message`, `File`, `RequestEvent`, `AuditLog`, `Notification`. Constraints to respect: `username` "unique, case-insensitive, 3–64 characters" (`citext` column or unique index on `lower(username)`); `Category.name` "unique, 1–60 characters"; `Request.title` "1–120 characters, required"; `description` and `Message.text` "≤ 4,000 characters"; `File.originalName` "≤ 255 characters"; uniques `(requesterId, clientId)` on `Request`, `(authorId, clientId)` on `Message`, `(categoryId, priority)` on `DeadlineRule`, `(role, permission)` on `RolePermission`; `Request.reference` unique; `Request.version` integer default 0; `rulesSnapshot` as `Json`; all the stage timestamps of DM `Request`; indexes on `Request`: `status`, `categoryId`, `assigneeId`, `requesterId`, `priority`, `createdAt`, `currentDueAt`
- [X] T011 Write the integration test `backend/test/integration/append-only.spec.ts` (V17): a raw `UPDATE` or `DELETE` on `AuditLog` and on `RequestEvent` raises an error and modifies no row; an `INSERT` succeeds
- [X] T012 Generate the initial migration `backend/prisma/migrations/0001_init/migration.sql` (`prisma migrate dev --create-only`) then add to it in SQL the function `forbid_modification()` and the `BEFORE UPDATE OR DELETE` triggers on `"AuditLog"` and `"RequestEvent"` (R6); make T011 pass
- [X] T013 [P] Create `backend/src/common/prisma.service.ts` (PrismaClient, connection at startup, clean shutdown) and export it in a global `PrismaModule`

### Pure domain (TDD)

- [X] T014 [P] Write the table-driven tests `backend/test/unit/request-state-machine.spec.ts`: each transition T1–T18 of DM §State machine is allowed for its actor and its guards (active recipient in the category, voice message or description, mandatory reason for `REJECT`/`DECLINE`, mandatory comment for `REQUEST_CORRECTION`, proof photo if `photoRequired`, choice of T1/T2 according to the workflow, T11/T12 automatic after `COMPLETE`, `CLOSE` according to `closureMode` `AUTO`/`REQUESTER`/`MANAGER`); for each of the 11 statuses, any action not listed is refused (`INVALID_TRANSITION`); any actor not provided for is refused (`FORBIDDEN`); `CLOSED`, `REJECTED`, `CANCELLED` accept no action; `CANCEL` refused from `ACCEPTED`
- [X] T015 Implement `backend/src/requests/domain/request-state-machine.ts`: transition table `{ from, action, to, actor, guards }` and pure function `applyAction(request, action, actor, context) → { ok: true, to, effects } | { ok: false, code }` with no database access; make T014 pass
- [X] T016 [P] Write the table-driven tests `backend/test/unit/access-policy.spec.ts` covering DM §Access matrix: `canReadRequest` (requester, current assignee, category manager, super admin → yes; former assignee after reassignment, category recipient not assigned, other employee → no; workflow B request before approval invisible to recipients), `allowedActions` (combines state machine, role, relationship and permissions `PRIORITY_CHANGE_OWN`/`PRIORITY_CHANGE_MANAGED`/`REQUEST_REASSIGN`), `canCreateInCategory` (`creatorRoles` + `REQUEST_CREATE`, active category), `canPickRecipient` (active user in `CategoryRecipient`), `canWriteInThread` (participant and non-final status)
- [X] T017 Implement `backend/src/requests/domain/access-policy.ts` (pure functions) and `backend/src/requests/domain/visibility.ts` (builds the Prisma `where` filter equivalent to `canReadRequest` for lists and search); make T016 pass

### API foundation

- [X] T018 [P] Create in `backend/src/common/`: `validation.pipe.ts` (global ValidationPipe `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`), `http-exception.filter.ts` (format `{ "error": { "code", "message", "details" } }`, messages in French, business codes from REST §Common rules), `server-time.interceptor.ts` (`X-Server-Time` header), `pagination.ts` (opaque cursor `createdAt`+`id`, `limit` default 25); wire everything together and Swagger (`/api/docs-json` outside production) in `backend/src/main.ts` with the `/api` prefix
- [X] T019 [P] Create `backend/src/audit/audit.service.ts` and `backend/src/audit/audit.module.ts`: `log(action, { actorId, targetType, targetId, details, ip })` insert-only, with an allow list of the `details` fields (never a password, token or message content); test `backend/test/unit/audit-sanitize.spec.ts` written first
- [X] T020 Write `backend/test/integration/auth.spec.ts`: successful login → `sid` cookie `HttpOnly`, `Secure`, `SameSite=Strict` and audit `LOGIN_SUCCESS`; failure → `401` generic message and audit `LOGIN_FAILURE`; 6th attempt within a minute → `429 RATE_LIMITED`; session expired after `sessionIdleMinutes` of inactivity or `sessionMaxHours` → `401`; `mustChangePassword` → every route outside `/auth/*` responds `403 PASSWORD_CHANGE_REQUIRED`; `POST /auth/password` refuses fewer than 12 characters; modifying request with a foreign `Origin` → `403`; deactivated account → sessions deleted; every `401` response (missing, invalid or expired session) produces an `ACCESS_DENIED` audit entry with `details.reason = "UNAUTHENTICATED"`, the route and the IP
- [X] T021 Implement `backend/src/auth/` (`auth.module.ts`, `auth.controller.ts`, `auth.service.ts`, `session.service.ts`, global `session.guard.ts`, `origin.guard.ts`, `current-user.decorator.ts`): Argon2id, random 256-bit session token stored hashed, expirations read from the settings, throttler 5/min per username+IP on `/auth/login`, routes `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` (REST §Authentication); log every refused authentication: login failure (`LOGIN_FAILURE`), login blocked by the throttler and every `401` response (`ACCESS_DENIED`, `details.reason = "UNAUTHENTICATED"`, route, IP); make T020 pass
- [X] T022 [P] Create `backend/src/settings/settings.service.ts`: typed reading of the settings of DM §Default values with fallback to the default values and a cache invalidated on write
- [X] T023 [P] Create `backend/src/notifications/notifications.service.ts`: `notifyInTx(tx, recipients[], { type, requestId, priority })` which writes the `Notification` rows within the transaction excluding the author of the action, then `flushAfterCommit()` which passes them to a `NotificationPublisher` interface; provide `NoopNotificationPublisher` (replaced in US4); test `backend/test/unit/notifications-recipients.spec.ts` written first (the author is never notified)
- [X] T024 Write the seed `backend/prisma/seed.ts`: settings of DM §Default values (`voiceMaxSeconds` 180, `voiceMaxBytes` 5 MB, `attachmentMaxBytes` 10 MB, `attachmentMaxPerMessage` 5, `allowedPhotoTypes` image/jpeg, image/png, image/webp, `allowedDocumentTypes` application/pdf, `draftsEnabled` true, `deadlineWarnPercent` 20, `sessionIdleMinutes` 60, `sessionMaxHours` 12); default permissions per role; category « Photocopies » (workflow A, `AUTO` closure after 1,440 min, photo not required, default deadlines, Urgent: takeover 1 min, completion 5 min); a demonstration category in workflow B with final validation and required photo; accounts `superadmin`, `responsable`, `enseignante`, `reprographie` with temporary passwords displayed and `mustChangePassword` true

### Frontend foundation

- [X] T025 [P] Create `frontend/src/app/theme.ts` (MUI theme with verified AA contrast, visible focus, touch targets ≥ 44 px, French locale) and `frontend/src/app/providers.tsx` (QueryClient, ThemeProvider, CssBaseline, Router)
- [X] T026 [P] Create `frontend/src/api/client.ts`: `fetch` with `credentials: 'same-origin'`, parsing of the error format `{ error: { code, message, details } }` into `ApiError`, measurement of the clock offset from `X-Server-Time` and export of `serverNow()`; add the script `npm run -w frontend api:types` (openapi-typescript from `/api/docs-json` to `frontend/src/api/schema.d.ts`); test `frontend/tests/api/client.test.ts` written first
- [X] T027 [P] Create the shared state components `frontend/src/components/LoadingState.tsx`, `EmptyState.tsx`, `ErrorState.tsx` (message + corrective action), `StatusChip.tsx` (French labels of the 11 statuses, color + text, never color alone) and `PriorityChip.tsx` (Urgente: icon + text); tests `frontend/tests/components/chips.test.tsx` written first
- [X] T028 Create `frontend/src/features/auth/LoginPage.tsx`, `ChangePasswordPage.tsx`, `RequireAuth.tsx` (redirect to login on `401`, to password change on `PASSWORD_CHANGE_REQUIRED`) and `useCurrentUser.ts`; tests `frontend/tests/auth/login.test.tsx` written first
- [X] T029 Create `frontend/src/app/AppLayout.tsx` and `frontend/src/app/routes.tsx`: top bar and responsive navigation (drawer below 600 px), skip link « Aller au contenu » (Skip to content), protected routes, no horizontal scrolling at 320 px
- [X] T030 Write `e2e/auth.spec.ts`: login, forced password change, logout, axe check of the login and password change pages at 320 px

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Create and send a voice request (Priority: P1) 🎯 MVP

**Goal**: an employee creates a request (title, category, recipient from the category, priority, voice message and/or description) and sends it; the recipient finds it and listens to the voice message.

**Independent Test**: `enseignante` creates a voice « Photocopies » request for `reprographie`; `reprographie` sees it in « Reçues » (Received) and plays the voice message on Chromium, WebKit and Firefox (V1–V4).

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T031 [P] [US1] Add audio fixtures (`sample.webm` Opus, `sample.mp4` AAC, `sample.ogg` Opus, `silence-0.5s.webm`, `not-audio.webm` = renamed PNG, `too-long.webm` = `voiceMaxSeconds` + 5 s) in `backend/test/fixtures/audio/` and write `backend/test/unit/voice-processing.spec.ts`: each valid format produces an `audio/mp4` AAC mono file readable by ffprobe; duration < 1 s → `VOICE_TOO_SHORT`; duration > `voiceMaxSeconds` + 2 s → `VOICE_TOO_LONG`; non-audio file → `FILE_TYPE_NOT_ALLOWED`
- [X] T032 [P] [US1] Write `backend/test/integration/files-voice.spec.ts`: `POST /api/files` `kind=VOICE` → `201 { id, kind, mimeType: "audio/mp4", sizeBytes, durationSeconds }`; above `voiceMaxBytes` → `413 FILE_TOO_LARGE`; `GET /api/files/:id` by the author of a temporary file → `200` with `nosniff` and `Cache-Control: private, no-store`; `Range: bytes=0-99` header → `206`; without a cookie → `401`; other user → `404` and audit `ACCESS_DENIED`; the storage path appears in no response
- [X] T033 [P] [US1] Write `backend/test/integration/requests-create.spec.ts`: workflow A creation → `201`, status `SENT`, `assigneeId` = recipient, `reference` in the format `D-YYYY-NNNNNN`, `rulesSnapshot` copied, `submittedAt`/`assignedAt` filled in, `RequestEvent` `CREATED` and `STATUS_CHANGED`, notification `REQUEST_NEW` (or `URGENT`) for the recipient; recipient outside `CategoryRecipient` or inactive → `422 RECIPIENT_NOT_ALLOWED` and nothing is created (V2); neither voice message nor description → `422 CONTENT_REQUIRED`; empty title or > 120 characters → `400`; same `clientId` resent → `200` and a single request (V3); `asDraft: true` → `DRAFT`, editable by `PATCH` and deletable by `DELETE` by its author only; category outside `creatorRoles` → `403`; `GET /api/categories` and `GET /api/categories/:id/recipients` list only the authorized categories and recipients; `GET /api/requests?scope=assigned` of the recipient contains the request; `GET /api/requests/:id` by a third party → `404`
- [X] T034 [P] [US1] Write `frontend/tests/voice/recorder-format.test.ts` and `frontend/tests/voice/VoiceRecorder.test.tsx`: order of choice `audio/webm;codecs=opus` then `audio/mp4` then `audio/ogg;codecs=opus`; record → listen back → « Refaire » (Redo) replaces the recording; warning at 80% of `voiceMaxSeconds` and automatic stop at 100%; sending blocked under 1 s; permission refused or `MediaRecorder` missing → explanatory message and switch to the written description; buttons usable with the keyboard with accessible labels
- [X] T035 [P] [US1] Write `frontend/tests/requests/CreateRequestPage.test.tsx`: the category is chosen before the recipient and only the category's list is offered; each missing field is flagged (title, category, recipient, priority, content); network error → content placed in the outbox with a « Réessayer » (Retry) button
- [X] T036 [P] [US1] Write `e2e/us1-create-voice-request.spec.ts` covering V1 (voice creation on iPhone 13 profiles — recording simulated by `fake-media-recorder.ts` — and Pixel 7, real playback by the recipient on chromium, webkit and firefox), V3 (`context.setOffline(true)` during sending then retry, a single request created) and V4 (microphone permission refused → written description), with an axe check of the creation, list and detail screens

### Implementation for User Story 1

- [X] T037 [P] [US1] Implement `backend/src/files/file-storage.service.ts`: writing under `FILES_DIR/{yyyy}/{mm}/{uuid}` (no extension), reading the path, deletion; no path exposed
- [X] T038 [P] [US1] Implement `backend/src/files/voice-processing.ts` (R2): ffprobe (audio stream present, duration), refusal `VOICE_TOO_SHORT` < 1 s and `VOICE_TOO_LONG` > `voiceMaxSeconds` + 2 s, ffmpeg conversion `-ac 1 -c:a aac -b:a 64k -movflags +faststart` to `audio/mp4`, deletion of the original file after success, cleanup of temporary files on error; make T031 pass
- [X] T039 [US1] Implement `backend/src/files/files.controller.ts`, `files.service.ts` and `files.module.ts`: `POST /api/files` (Multer, limit according to `kind`, real type by `file-type`, `kind=VOICE` → T038; temporary file if `requestId` is absent), `GET /api/files/:id` (`canReadRequest` check on the parent request or author of the temporary file, `res.sendFile` for Range/ETag, stored `Content-Type`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `Content-Disposition` `inline` for audio/image otherwise `attachment`, refusal → `404` + audit `ACCESS_DENIED`); make T032 pass
- [X] T040 [P] [US1] Implement `backend/src/categories/categories.controller.ts`, `categories.service.ts`, `categories.module.ts`: `GET /api/categories` (active ones where the user can create: `{ id, name, circuit, photoRequired }`) and `GET /api/categories/:id/recipients` (workflow A: active recipients `{ id, displayName, jobTitle }`; workflow B: `[]`)
- [X] T041 [US1] Implement creation in `backend/src/requests/requests.service.ts`: `canCreateInCategory` and `canPickRecipient` checks on the server (`422 RECIPIENT_NOT_ALLOWED`), `CONTENT_REQUIRED`, idempotency by `(requesterId, clientId)`, generation of `reference` `D-YYYY-NNNNNN` (PostgreSQL sequence), copy of `rulesSnapshot` (circuit, closureMode, autoCloseAfterMinutes, finalValidation, assignmentMode, photoRequired, `DeadlineRule` durations for the priority), draft if `asDraft` and `draftsEnabled`, otherwise transition T1 (workflow A) or T2 (workflow B) via `applyAction`, attachment of the temporary voice file, `RequestEvent`, notifications, all in one transaction
- [X] T042 [US1] Implement `backend/src/requests/requests.controller.ts` and `requests.module.ts`: `POST /api/requests`, `GET /api/requests` (visibility filter T017, `scope` `mine`/`assigned`/`managed`/`all`, `status[]`, pagination), `GET /api/requests/:id` (`RequestDetail` with `allowedActions`), `PATCH /api/requests/:id` and `DELETE /api/requests/:id` (draft, author only, T19); DTOs conforming to REST §Requests; make T033 pass
- [X] T043 [P] [US1] Implement `frontend/src/features/voice/recorderFormat.ts`, `useVoiceRecorder.ts` (states `idle`, `recording`, `recorded`, `denied`, `unsupported`; timer; automatic stop), `VoiceRecorder.tsx` (Enregistrer/Arrêter (Record/Stop), Écouter (Listen), Refaire, Supprimer (Delete), duration announced in `aria-live`) and `VoicePlayer.tsx` (native `<audio>` element with accessible MUI controls: play/pause, keyboard slider, duration); make T034 pass
- [X] T044 [P] [US1] Implement `frontend/src/features/outbox/outbox.ts` (idb-keyval storage of failed sends: fields, audio Blob, `clientId`) and `frontend/src/features/outbox/OutboxPanel.tsx` (list, « Réessayer », « Abandonner » (Abandon)); retry that resends the same `clientId`
- [X] T045 [US1] Implement `frontend/src/features/requests/CreateRequestPage.tsx` and `frontend/src/features/requests/api.ts` (TanStack Query hooks): order category → recipient → priority → title → voice message/description; upload of the voice message then creation with `clientId`; errors per field; network failure → outbox; usable at 320 px; make T035 pass
- [X] T046 [US1] Implement `frontend/src/features/requests/RequestListPage.tsx` (tabs « Reçues » and « Envoyées » (Sent), cards with `StatusChip`, `PriorityChip`, empty state) and `frontend/src/features/requests/RequestDetailPage.tsx` (title, category, priority, status, timestamps, `VoicePlayer`, description); wire the routes in `frontend/src/app/routes.tsx`; make T036 pass

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Process a request in the direct workflow (Priority: P1)

**Goal**: the assigned employee accepts, starts, completes (photo if required) or rejects with a reason; the requester closes, sends back « À corriger » (To correct) with a comment, or cancels as long as the request has not been accepted; deferred automatic closure.

**Independent Test**: starting from a « Envoyée » request, `reprographie` takes it to « Terminée » (Completed); `enseignante` sends it back « À corriger » then it is closed (V5–V9).

### Tests for User Story 2 ⚠️

- [X] T047 [P] [US2] Add the fixtures `backend/test/fixtures/images/` (`gps.jpg` with EXIF GPS and orientation 6, `photo.png`, `photo.webp`, `photo.heic`, `exe-renamed.jpg`) and write `backend/test/unit/photo-processing.spec.ts`: `image/jpeg` output at quality 85, long side ≤ 2560 px, orientation applied, no EXIF metadata left (including GPS); HEIC and renamed executable → `FILE_TYPE_NOT_ALLOWED`
- [X] T048 [P] [US2] Write `backend/test/integration/requests-actions-circuit-a.spec.ts`: `ACCEPT`, `START`, `COMPLETE` by the assignee with timestamps `acceptedAt`, `startedAt`, `doneAt`; `COMPLETE` without a photo when `photoRequired` → `422 PHOTO_REQUIRED`, with `proofFileIds` → `DONE` and `isCompletionProof` true; `DECLINE` without a reason → `422 REASON_REQUIRED`, with a reason → `REJECTED`, `rejectionReason` stored, notification `REJECTED`; `CANCEL` by the requester from `SENT` → `CANCELLED`, from `ACCEPTED` → `409 INVALID_TRANSITION`; `REQUEST_CORRECTION` without a comment → `422`, with one → `TO_CORRECT` and notification `TO_CORRECT`; `RESUME` → `IN_PROGRESS`; `CLOSE` according to `closureMode` `REQUESTER`/`MANAGER`; `closureMode AUTO` → `autoCloseAt` = `doneAt` + `autoCloseAfterMinutes` and cancelled by `REQUEST_CORRECTION`; action by a third party → `403` or `404` + audit `ACCESS_DENIED`; two simultaneous `ACCEPT` with the same `version` → one `200` and one `409 STATE_CHANGED` (V9); action on `CLOSED`/`REJECTED`/`CANCELLED` → `409`
- [X] T049 [P] [US2] Write `backend/test/integration/auto-close-job.spec.ts`: a `DONE` request whose `autoCloseAt` has passed becomes `CLOSED` with actor `SYSTEM` and `closedAt`; a request sent back `TO_CORRECT` is not closed; repeated execution without a double event
- [X] T050 [P] [US2] Write `frontend/tests/requests/RequestActions.test.tsx`: only the buttons of `allowedActions` are displayed with everyday-language labels; `DECLINE`, `REJECT`, `REQUEST_CORRECTION` open a dialog box whose reason is mandatory; `COMPLETE` with a required photo imposes a photo; `409 STATE_CHANGED` response → message « La demande a été modifiée entre-temps » (The request was modified in the meantime) and reload
- [X] T051 [P] [US2] Write `e2e/us2-process-request.spec.ts` covering V5, V6 (photo taken via `setInputFiles` on the `capture` field), V7, V8 and V9, with an axe check of the detail and the dialog boxes

### Implementation for User Story 2

- [X] T052 [P] [US2] Implement `backend/src/files/photo-processing.ts` with sharp (`rotate()`, metadata removal, JPEG quality 85, resizing long side ≤ 2560 px, refusal of types outside `allowedPhotoTypes`) and accept `kind=PHOTO` in `backend/src/files/files.service.ts`; make T047 pass
- [X] T053 [US2] Implement `applyTransition(requestId, action, actor, { version, reason, assigneeId, proofFileIds })` in `backend/src/requests/requests.service.ts`: call to `applyAction`, conditional update `updateMany({ where: { id, status: from, version } })` (0 rows → `409 STATE_CHANGED`), `version + 1`, stage timestamp, `rejectionReason`, attachment of proof photos, automatic transitions T11/T12 (sets `autoCloseAt`), `SYSTEM` message carrying the reason or comment, `STATUS_CHANGED` `RequestEvent`, notifications according to RT §Who is notified, `ACCESS_DENIED` audit on authorization refusal, all in one transaction
- [X] T054 [US2] Add `POST /api/requests/:id/actions` in `backend/src/requests/requests.controller.ts` (DTO `{ action, version, reason?, assigneeId?, proofFileIds? }`, `reason` ≤ 1,000 characters); make T048 pass
- [X] T055 [US2] Implement `backend/src/scheduler/scheduler.module.ts` and `backend/src/scheduler/auto-close.job.ts` (`@Interval(15_000)`: closure of `DONE` requests whose `autoCloseAt` ≤ now, via `applyTransition` with the `SYSTEM` actor); make T049 pass
- [X] T056 [P] [US2] Implement `frontend/src/features/thread/PhotoCapture.tsx`: button « Prendre une photo » (Take a photo) (`<input type="file" accept="image/*" capture="environment">`) and button « Choisir dans la galerie » (Choose from the gallery) (without `capture`), preview, `kind=PHOTO` upload, format and size error messages
- [X] T057 [US2] Implement `frontend/src/features/requests/RequestActions.tsx` and `frontend/src/features/requests/ReasonDialog.tsx` (mandatory reason or comment, managed focus): one button per action of `allowedActions`, `PhotoCapture` for `COMPLETE` if `photoRequired`, sending of `version`, handling of `STATE_CHANGED`; integrate into `RequestDetailPage.tsx`; make T050 and T051 pass

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Exchange messages in the request thread (Priority: P2)

**Goal**: thread per request with text and voice messages, photos and allowed files, accessible only to authorized participants.

**Independent Test**: on an existing request, two participants exchange a text message, a voice message and a photo; a non-participant cannot read anything (V10, V11).

### Tests for User Story 3 ⚠️

- [X] T058 [P] [US3] Add `backend/test/fixtures/docs/sample.pdf` and `big.pdf` (> 10 MB) and write `backend/test/unit/document-validation.spec.ts`: PDF accepted; type outside `allowedDocumentTypes` or renamed executable → `FILE_TYPE_NOT_ALLOWED`; original name sanitized and truncated to 255 characters
- [X] T059 [P] [US3] Write `backend/test/integration/messages.spec.ts`: `POST /api/requests/:id/messages` text (≤ 4,000 characters), voice message (`voiceFileId`) and attachments (≤ `attachmentMaxPerMessage` = 5) → `201` with author and `createdAt`; idempotency by `clientId`; final status → `403`; `RequestEvent` `MESSAGE_ADDED` and `FILE_ADDED`; notification `MESSAGE_NEW` to the other participants only; `GET` of messages and `GET /api/files/:id` of an attachment by a non-participant → `404` + audit `ACCESS_DENIED` (V10); no route to edit or delete a message (FR-012); 20 MB PDF → `413` (V11)
- [X] T060 [P] [US3] Write `frontend/tests/thread/ThreadPanel.test.tsx`: messages with author and date/time, `SYSTEM` messages distinguished, text/voice/photo/file composer, format and size errors displayed, failed send placed in the outbox
- [X] T061 [P] [US3] Write `e2e/us3-thread.spec.ts` covering V10 and V11 with an axe check of the thread

### Implementation for User Story 3

- [X] T062 [P] [US3] Accept `kind=DOCUMENT` in `backend/src/files/files.service.ts` (magic bytes, `allowedDocumentTypes`, `attachmentMaxBytes`, sanitized name); make T058 pass
- [X] T063 [US3] Implement `backend/src/messages/messages.service.ts`, `messages.controller.ts`, `messages.module.ts`: `GET` and `POST /api/requests/:id/messages` (REST §Discussion thread), `canWriteInThread` check, attachment of the temporary files to the request and to the message, `RequestEvent`, `MESSAGE_NEW` notifications, in one transaction; make T059 pass
- [X] T064 [P] [US3] Implement `frontend/src/features/thread/AttachmentList.tsx` (image thumbnails with alternative text, download link for documents, `VoicePlayer` for voice messages)
- [X] T065 [US3] Implement `frontend/src/features/thread/MessageComposer.tsx` (text, `VoiceRecorder`, `PhotoCapture`, file selection, `clientId`, outbox on failure) and `frontend/src/features/thread/ThreadPanel.tsx` (paginated list, loading of older messages); integrate into `RequestDetailPage.tsx`; make T060 and T061 pass

**Checkpoint**: User Stories 1–3 work independently

---

## Phase 6: User Story 4 - Receive real-time notifications (Priority: P2)

**Goal**: in-app notifications, without reloading, persisted and retrieved at reconnection; urgent requests visually distinct. No push, no email, no service worker.

**Independent Test**: a user keeps the application open; another sends them an urgent request; the notification appears in under 5 s (V12).

### Tests for User Story 4 ⚠️

- [X] T066 [P] [US4] Write `backend/test/integration/realtime.spec.ts` (socket.io-client): handshake without a cookie or with a foreign `Origin` → `connect_error` `UNAUTHENTICATED` and `ACCESS_DENIED` audit entry (`details.reason`, `channel = "socket"`, IP); a socket receives only the events of its `user:{id}` room; `notification:new`, `request:updated`, `message:new` emitted after the transaction commits (none emitted if the transaction fails); payload limited to the identifiers and metadata of RT; logout or account deactivation → `session:ended` then closure; emission latency < 1 s locally
- [X] T067 [P] [US4] Write `backend/test/integration/notifications.spec.ts`: `GET /api/notifications?unread=true` returns only the user's own, with `unreadTotal`; `POST /api/notifications/read` `{ ids }` and `{ all: true }` → `204`
- [X] T068 [P] [US4] Write `frontend/tests/notifications/NotificationCenter.test.tsx`: badge with the number of unread, `aria-live="polite"` announcement (and `assertive` for an urgent request), urgent style with icon and text, catch-up of unread on reconnection, invalidation of the queries of the request concerned
- [X] T069 [P] [US4] Write `e2e/us4-notifications.spec.ts` (V12): two browsing contexts, urgent request sent, notification visible in < 5 s without reloading; closing then reopening → unread notification present

### Implementation for User Story 4

- [X] T070 [US4] Implement `backend/src/notifications/notifications.gateway.ts` (authentication by `sid` cookie and `Origin` check at the handshake, each refused handshake logged as `ACCESS_DENIED` with `details.reason` and `channel = "socket"`, `user:{userId}` room only, no client event accepted, closure on end of session) and `SocketNotificationPublisher` in `backend/src/notifications/socket-notification.publisher.ts` replacing `NoopNotificationPublisher`; emit `request:updated` and `message:new` from `requests.service.ts` and `messages.service.ts` after commit; make T066 pass
- [X] T071 [US4] Implement `backend/src/notifications/notifications.controller.ts` (`GET /api/notifications`, `POST /api/notifications/read`); make T067 pass
- [X] T072 [P] [US4] Implement `frontend/src/features/notifications/SocketProvider.tsx`: Socket.IO connection, on each `connect` rereading of unread ones and cache invalidation, targeted invalidation on `request:updated`/`message:new`, return to login on `session:ended`
- [X] T073 [US4] Implement `frontend/src/features/notifications/NotificationCenter.tsx` and `NotificationBadge.tsx` (notification menu, mark as read, link to the request, `aria-live` region, distinct visual alert for `URGENT`); integrate into `AppLayout.tsx`; make T068 and T069 pass

**Checkpoint**: User Stories 1–4 work independently

---

## Phase 7: User Story 5 - Workflow with administrative validation (Priority: P2)

**Goal**: for workflow B categories, approval or reasoned rejection by a manager, manual or automatic assignment, optional final validation.

**Independent Test**: workflow B request submitted, rejected with a reason; new request approved and assigned, carried out, validated (V13).

### Tests for User Story 5 ⚠️

- [X] T074 [P] [US5] Write `backend/test/integration/requests-circuit-b.spec.ts`: submission → `PENDING_ADMIN_VALIDATION`, invisible to the category's recipients and visible to managers (`scope=managed`); `REJECT` without a reason → `422`, with a reason → `REJECTED` and notification `REJECTED` to the requester; `APPROVE` without `assigneeId` in `MANUAL` assignment → `422`, with an assignee outside `CategoryRecipient` → `422 RECIPIENT_NOT_ALLOWED`, valid → `SENT`, `approvedAt`/`assignedAt`, notification `ASSIGNED`; `AUTO` assignment → `autoAssigneeId` without input; `CANCEL` by the requester while awaiting validation → `CANCELLED`; final validation: `COMPLETE` → `PENDING_FINAL_VALIDATION` (T11), `VALIDATE_FINAL` → `CLOSED`, `REQUEST_CORRECTION` by the manager → `TO_CORRECT`; an employee who is not a manager can neither approve nor validate (`403` + audit)
- [X] T075 [P] [US5] Write `frontend/tests/requests/ApprovalPanel.test.tsx`: « À valider » (To validate) list, approval with choice of the assignee among the category's recipients (hidden in automatic assignment), rejection with mandatory reason, final validation actions
- [X] T076 [P] [US5] Write `e2e/us5-admin-validation.spec.ts` covering V13 with an axe check

### Implementation for User Story 5

- [X] T077 [US5] Complete `backend/src/requests/requests.service.ts` for `APPROVE` (manual assignee checked by `canPickRecipient`, or `autoAssigneeId`), `REJECT`, `VALIDATE_FINAL` and `REQUEST_CORRECTION` by a manager, with notifications to managers on submission (RT §Who is notified) and `scope=managed` in `GET /api/requests`; make T074 pass
- [X] T078 [US5] Implement `frontend/src/features/requests/ApprovalPanel.tsx` (approve with choice of the assignee, reject with `ReasonDialog`) and the « À valider » tab in `RequestListPage.tsx` for managers; final validation actions via `RequestActions.tsx`; make T075 and T076 pass

**Checkpoint**: User Stories 1–5 work independently

---

## Phase 8: User Story 6 - Track deadlines and delays (Priority: P3)

**Goal**: time remaining per stage, "close to the due date" flag and « En retard (étape) » (Overdue (stage)), notification of managers, manual reassignment, no automatic deletion.

**Independent Test**: Urgent rule with a 1 min takeover; request sent and not accepted → countdown, alert, then « En retard (prise en charge) » (Overdue (takeover)) in < 30 s after the due date (V14).

### Tests for User Story 6 ⚠️

- [X] T079 [P] [US6] Write `backend/test/unit/deadlines.spec.ts` according to DM §Deadlines: VALIDATION starts at T2 and stops at T3/T4/T5; TAKEOVER starts at T1/T3/T18 and stops at T6/T7/T8/T18; COMPLETION starts at T6/T17 and stops at T10/T18; `null` duration → stage not tracked; `warnAt = currentDueAt − duration × deadlineWarnPercent / 100`; end of stage → `overdueStage := null`; durations read from `rulesSnapshot` and not from the current configuration
- [X] T080 [P] [US6] Write `backend/test/integration/overdue-job.spec.ts`: request whose `currentDueAt` has passed → `overdueStage` = current stage, a single `OVERDUE` `RequestEvent` even after several runs, `OVERDUE` notifications to the category managers and the assignee; catch-up of due dates passed during a shutdown; no request deleted or hidden; flagging in < 30 s after the due date (SC-006)
- [X] T081 [P] [US6] Write `backend/test/integration/reassign.spec.ts`: `REASSIGN` by a manager with `REQUEST_REASSIGN` from `SENT`, `ACCEPTED`, `IN_PROGRESS`, `TO_CORRECT` → `SENT` for the new assignee (must belong to `CategoryRecipient`), new takeover deadline, `RequestEvent` `REASSIGNED`, former assignee without access (`404`); refused for an employee
- [X] T082 [P] [US6] Write `frontend/tests/components/Countdown.test.tsx`: remaining time computed with `serverNow()`, "close to the due date" state from `warnAt`, state « En retard (validation | prise en charge | réalisation) » (Overdue (validation | takeover | completion)), text readable by screen readers without an announcement every second
- [X] T083 [P] [US6] Write `e2e/us6-deadlines.spec.ts` covering V14

### Implementation for User Story 6

- [X] T084 [US6] Implement `backend/src/requests/domain/deadlines.ts` (pure functions for starting and stopping a stage from the transition and `rulesSnapshot`); make T079 pass
- [X] T085 [US6] Wire `deadlines.ts` into `applyTransition` and the creation of `backend/src/requests/requests.service.ts` (update of `currentStage`, `currentDueAt`, `warnAt`, `overdueStage`) and add the `REASSIGN` action (T18); make T081 pass
- [X] T086 [US6] Implement `backend/src/scheduler/overdue.job.ts` (`@Interval(15_000)`: `UPDATE … WHERE "currentDueAt" < now() AND "overdueStage" IS DISTINCT FROM "currentStage" RETURNING …`, then `RequestEvent` `OVERDUE` and notifications, R4) and register it in `scheduler.module.ts`; make T080 pass
- [X] T087 [P] [US6] Implement `frontend/src/components/Countdown.tsx` and the delay indicators in `RequestListPage.tsx` and `RequestDetailPage.tsx`; make T082 pass
- [X] T088 [US6] Implement `frontend/src/features/requests/ReassignDialog.tsx` (choice among the category's recipients) accessible from `RequestActions.tsx`; make T083 pass

**Checkpoint**: User Stories 1–6 work independently

---

## Phase 9: User Story 7 - Consult the history, search and filter (Priority: P3)

**Goal**: search by title and combined filters (status, priority, category, recipient, period, delay), complete history per request, priority change recorded.

**Independent Test**: on a varied data set, combined filters returning only authorized requests; complete history of a processed request (V15).

### Tests for User Story 7 ⚠️

- [X] T089 [P] [US7] Write `backend/test/integration/requests-search.spec.ts`: filters `status[]`, `priority[]`, `categoryId[]`, `assigneeId`, `requesterId`, `from`, `to`, `overdue`, `q` (ILIKE on the title) combined; no unauthorized request in the results or in the totals; stable cursor pagination
- [X] T090 [P] [US7] Write `backend/test/integration/history-priority.spec.ts`: `GET /api/requests/:id/history` lists chronologically all the `RequestEvent` with the actor's name or « Système » (System); `PATCH /api/requests/:id/priority` by the requester with `PRIORITY_CHANGE_OWN` in `DRAFT`/`PENDING_ADMIN_VALIDATION`/`SENT` → `200` and `PRIORITY_CHANGED` event (before/after); after acceptance → `403`; by a manager with `PRIORITY_CHANGE_MANAGED` as long as not final and not `DONE` → `200`; deadlines already running not recalculated
- [X] T091 [P] [US7] Write `backend/test/integration/search-performance.spec.ts`: with 10,000 requests generated by `backend/prisma/seed-volume.ts`, a combined filtered search responds in < 2 s (SC-009)
- [X] T092 [P] [US7] Write `frontend/tests/requests/RequestFilters.test.tsx` and `frontend/tests/requests/HistoryTimeline.test.tsx`: filters synchronized with the URL, reset, empty state; readable history (author, action in French, date and time, before → after)
- [X] T093 [P] [US7] Write `e2e/us7-search-history.spec.ts` covering V15

### Implementation for User Story 7

- [X] T094 [P] [US7] Write `backend/prisma/seed-volume.ts` (10,000 requests spread over categories, statuses, priorities and 24 months)
- [X] T095 [US7] Complete the filters of `GET /api/requests` in `backend/src/requests/requests.controller.ts` and `requests.service.ts` (REST §Requests); make T089 and T091 pass
- [X] T096 [US7] Add `GET /api/requests/:id/history` and `PATCH /api/requests/:id/priority` in `backend/src/requests/requests.controller.ts` and `requests.service.ts`; make T090 pass
- [X] T097 [P] [US7] Implement `frontend/src/features/requests/RequestFilters.tsx` (filters collapsible on mobile, URL parameters) and integrate it into `RequestListPage.tsx`
- [X] T098 [US7] Implement `frontend/src/features/requests/HistoryTimeline.tsx` and `PriorityDialog.tsx` and integrate them into `RequestDetailPage.tsx`; make T092 and T093 pass

**Checkpoint**: User Stories 1–7 work independently

---

## Phase 10: User Story 8 - Administer accounts, roles and settings (Priority: P3)

**Goal**: the super administrator manages accounts, permissions per role, categories (workflow, recipients, managers, modes, photo), deadlines and settings, and consults the audit log.

**Independent Test**: creation of an account, of a workflow B category with a required photo and change of a deadline, applied to new requests only; a manager cannot access administration (V16).

### Tests for User Story 8 ⚠️

- [X] T099 [P] [US8] Write `backend/test/integration/admin-users.spec.ts`: creation (temporary password returned only once, `mustChangePassword` true), role change, deactivation (sessions deleted, sockets closed), password reset, `username` duplicated except for case → `409`; audit `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `PASSWORD_RESET`; every `/api/admin/*` route by a non-super-admin → `403` + audit `ACCESS_DENIED`
- [X] T100 [P] [US8] Write `backend/test/integration/admin-categories.spec.ts`: category creation and modification (`name` unique 1–60 characters; `autoAssigneeId` required if `assignmentMode = AUTO`; `finalValidation` and `assignmentMode` ignored or refused in workflow A), `PUT` recipients and managers (managers with role `MANAGER` or `SUPER_ADMIN` only), deadline rules (integers > 0 or `null`), permissions per role, settings (typed values); each write produces an `AuditLog` before/after; a request created before the change keeps its `rulesSnapshot` (FR-022)
- [X] T101 [P] [US8] Write `backend/test/integration/admin-audit.spec.ts`: `GET /api/admin/audit` filtered by `actorId`, `action`, period; read-only; no sensitive data in `details`
- [X] T102 [P] [US8] Write `frontend/tests/admin/admin-pages.test.tsx` (validated forms, temporary password displayed only once with a copy button, confirmation before deactivation) and `e2e/us8-admin.spec.ts` covering V16 with an axe check

### Implementation for User Story 8

- [X] T103 [US8] Implement `backend/src/users/admin-users.controller.ts`, `users.service.ts`, `users.module.ts` (REST §Administration: users and reset) with a `SuperAdminGuard` guard in `backend/src/common/super-admin.guard.ts`; make T099 pass
- [X] T104 [US8] Implement `backend/src/categories/admin-categories.controller.ts` (categories, recipients, managers, deadlines) and `backend/src/settings/admin-settings.controller.ts` (settings, permissions per role) with before/after audit; make T100 pass
- [X] T105 [US8] Implement `backend/src/audit/admin-audit.controller.ts` (`GET /api/admin/audit`, pagination, filters); make T101 pass
- [X] T106 [P] [US8] Implement `frontend/src/features/admin/UsersAdminPage.tsx` and `UserFormDialog.tsx`
- [X] T107 [P] [US8] Implement `frontend/src/features/admin/CategoriesAdminPage.tsx`, `CategoryFormDialog.tsx` (workflow, modes, photo, recipients, managers) and `DeadlineRulesTable.tsx` (4 priorities × 3 deadlines)
- [X] T108 [P] [US8] Implement `frontend/src/features/admin/SettingsAdminPage.tsx` (settings and permissions per role) and `AuditLogPage.tsx` (filters, read-only)
- [X] T109 [US8] Add the `/admin/*` routes reserved for the super administrator in `frontend/src/app/routes.tsx` and the administration menu in `AppLayout.tsx`; make T102 pass

**Checkpoint**: All user stories should now be independently functional

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T110 [P] Write `backend/test/integration/orphan-files-job.spec.ts` then implement `backend/src/scheduler/orphan-files.job.ts`: deletion (disk and database) of temporary files not attached for more than 24 h
- [X] T111 [P] Write `e2e/a11y-responsive.spec.ts` (V18): creation, processing and thread journeys at 320 px, keyboard only, no horizontal scrolling, axe check on every delivered screen (list, detail, creation, notifications, administration)
- [X] T112 [P] Create `deploy/api.Dockerfile` (Node 24, ffmpeg installed, multi-stage build, non-root user, `prisma migrate deploy` at startup) and `deploy/web.Dockerfile` or a build step of the SPA copied into the Caddy image
- [X] T113 [P] Create `deploy/docker-compose.yml` (services `caddy`, `api`, `db` with no exposed port, `backup`; volumes `pgdata`, `files` mounted only in `api`, `caddy_data`) and `deploy/.env.example`
- [X] T114 [P] Create `deploy/Caddyfile`: automatic HTTPS, HSTS, strict CSP (`default-src 'self'`, `media-src 'self' blob:`, `img-src 'self' blob: data:`, `connect-src 'self' wss:`), `Permissions-Policy` allowing `microphone=(self)` and `camera=(self)`, `request_body max_size` aligned with `attachmentMaxBytes`, SPA with fallback to `index.html`, proxy `/api/*` and `/socket.io/*`
- [X] T115 [P] Create `deploy/backup/backup.sh` (compressed pg_dump + archive of the `files` volume, 14-day rotation, configurable off-VPS copy) and `deploy/backup/restore.sh`; document a restore test
- [X] T116 [P] Check logging in `backend/src/main.ts`: JSON logs on standard output, without password, token, cookie or message content (test `backend/test/unit/log-redaction.spec.ts`)
- [X] T117 Write the root `README.md` (overview, links to `specs/001-demandes-travail-vocales/quickstart.md`, main commands, reminder of the open points and of the retention period to be set before production)
- [X] T118 [P] Write `e2e/sc001-create-timing.spec.ts` (SC-001): on the Pixel 7 and iPhone 13 profiles, measure the complete journey of creating a voice request (opening the form, category, recipient, priority, title, 10 s recording, listening back, sending, confirmation « Envoyée ») and fail if it exceeds 60 s
- [ ] T119 Manual verification on a real iPhone (Safari iOS 17 or later, over HTTPS): microphone permission, recording, listening back, redo, sending, playback of a voice message recorded on Chrome Android, taking a photo with the camera and from the gallery; record the model, the iOS version and the result in `docs/validation/iphone-manuel.md`
- [ ] T120 Organize a usability test session with 5 non-technical employees (SC-002): protocol (tasks: create a voice request, listen back to it, send it; process a request with a photo), observation without help, measurement of the success rate and durations; record the protocol and results in `docs/validation/test-utilisabilite-lot1.md` (with 5 participants, the 90% target requires 5 successes out of 5)
- [X] T121 Run `npm run verify` then all the scenarios V1–V18 of `specs/001-demandes-travail-vocales/quickstart.md` and record the result

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on phase 1 — BLOCKS all user stories
- **User Stories (Phases 3–10)**: depend on phase 2
- **Polish (Phase 11)**: after the desired user stories (T112–T115 can start as early as phase 2)

### User Story Dependencies

- **US1 (P1)**: after phase 2; no other dependency
- **US2 (P1)**: after phase 2; relies on the request creation of US1 (T041–T042) for its test data and on `RequestDetailPage.tsx` (T046)
- **US3 (P2)**: after US1 (files T039, `VoiceRecorder` T043); uses `PhotoCapture` from US2 (T056)
- **US4 (P2)**: after phase 2 (`NotificationsService` T023); plugs the emission into the existing US1/US2/US3 services
- **US5 (P2)**: after US2 (`applyTransition` T053)
- **US6 (P3)**: after US2 (T053); modifies `requests.service.ts`
- **US7 (P3)**: after US1 (T042); the history is fed by all the stories
- **US8 (P3)**: after phase 2; independent of the others (the seed provides the initial configuration)

### Within Each User Story

- Tests MUST be written and fail before implementation (principle I)
- Pure domain → services → controllers → interface
- Story completed and validated before the next one in priority

### Parallel Opportunities

- Phase 1: T002–T009 in parallel after T001
- Phase 2: T013, T014, T016, T018, T019, T022, T023, T025, T026, T027 in parallel; T015 after T014; T017 after T016
- Within each story, all the [P] test tasks in parallel
- After phase 2: US1 and US8 in parallel; after US2: US5 and US6 in parallel (caution: shared `requests.service.ts` file, to be merged carefully); US4 in parallel with US3
- Phase 11: T110–T116 and T118 in parallel; T119 and T120 after delivery to acceptance testing; T121 last

---

## Parallel Example: User Story 1

```bash
# US1 tests (to be written first, they must fail):
Task: "T031 voice-processing.spec.ts in backend/test/unit/"
Task: "T032 files-voice.spec.ts in backend/test/integration/"
Task: "T033 requests-create.spec.ts in backend/test/integration/"
Task: "T034 VoiceRecorder.test.tsx in frontend/tests/voice/"
Task: "T035 CreateRequestPage.test.tsx in frontend/tests/requests/"
Task: "T036 us1-create-voice-request.spec.ts in e2e/"

# Parallel implementation:
Task: "T037 file-storage.service.ts"
Task: "T038 voice-processing.ts"
Task: "T040 categories.controller.ts"
Task: "T043 VoiceRecorder and VoicePlayer"
Task: "T044 IndexedDB outbox"
```

## Parallel Example: User Story 2

```bash
Task: "T047 photo-processing.spec.ts"
Task: "T048 requests-actions-circuit-a.spec.ts"
Task: "T049 auto-close-job.spec.ts"
Task: "T050 RequestActions.test.tsx"
Task: "T051 us2-process-request.spec.ts"
# then
Task: "T052 photo-processing.ts"
Task: "T056 PhotoCapture.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Phase 1: Setup
2. Phase 2: Foundational (blocking)
3. Phase 3: US1 → **validate V1–V4**
4. Phase 4: US2 → **validate V5–V9**: the main scenario (photocopies) works end to end
5. Deploy to acceptance testing (T112–T115) and have a few employees test it (SC-002)

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 + US2 → MVP (voice request and direct processing)
3. US3 (thread) and US4 (real time) → exchanges and responsiveness
4. US5 (workflow B) → categories with validation
5. US6 (deadlines), US7 (search, history), US8 (administration in the interface)
6. Each increment is tested independently and does not alter the previous ones

### Open points to settle before going into production

- Provisional retention periods (spec, section "Personal data") to be validated by the client; no automatic purge in this phase
- Final values of the settings (deadlines, limits on voice messages and attachments, workflow B categories, required photo, closure mode): editable without code through US8

---

## Notes

- [P] = different files, no dependency on an unfinished task
- The [Story] label links each task to its user story
- Check that each test fails before implementing
- Validate each story at its checkpoint
- `requests.service.ts` is modified by US1, US2, US5, US6 and US7: avoid doing these stories in parallel on this file
