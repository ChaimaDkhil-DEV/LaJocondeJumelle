# Research: Phase 1 – Work requests and voice messaging

**Date**: 2026-10-12 | **Plan**: [plan.md](./plan.md)

The technology stack was imposed by the client. No entry in the technical context was left as
"NEEDS CLARIFICATION"; the points below set out how to use this stack to
meet the spec and the plan's eight constraints.

## R1. Overall architecture

- **Decision**: a React SPA served as static files by Caddy; a single NestJS API
  (REST under `/api`, Socket.IO under `/socket.io`) behind Caddy on the same domain;
  PostgreSQL in a container; private disk volume for files. A single API process.
- **Rationale**: same origin for the SPA, the API and the WebSocket: simple session cookies,
  no CORS, `<audio src="/api/files/…">` authenticated by cookie. A single process is enough at
  the scale of a school and avoids any coordination between instances (principle II).
- **Alternatives considered**: server-side rendering (Next.js) — pointless for an authenticated
  application without SEO; API and frontend on two domains — requires CORS and cross-domain
  cookies.

## R2. Recording and playing voice messages

- **Decision**:
  1. Recording with `MediaRecorder`; format chosen in order by
     `MediaRecorder.isTypeSupported`: `audio/webm;codecs=opus`, `audio/mp4` (AAC),
     `audio/ogg;codecs=opus`. The type retained is sent with the file.
  2. Local preview before sending, from the recorded Blob (the browser can always replay
     its own format). A « Refaire » (Redo) button that replaces the recording.
  3. Automatic stop at the maximum duration (setting), with a warning at 80% of the duration;
     sending refused if duration < 1 s.
  4. Server side: ffprobe checks that it is a valid audio stream and measures the duration
     (refused if above the maximum + 2 s tolerance); ffmpeg systematically converts to
     mono AAC at 64 kbit/s in an MP4 container (`audio/mp4`, extension `.m4a`), with
     `+faststart`. The original file is deleted after a successful conversion.
  5. Playback with a player based on the native `<audio>` element, wrapped in accessible
     MUI controls (play/pause, keyboard progress bar, duration read on screen); the
     server handles HTTP Range requests, which Safari needs to play and seek.
  6. Synchronous conversion within the sending request (a few hundred milliseconds for a
     voice message of a few minutes): no processing queue.
  7. Secure context mandatory: HTTPS in production (Caddy) and on a phone when testing
     (Caddy with an internal certificate, see quickstart). If `navigator.mediaDevices` or
     `MediaRecorder` is missing, or if microphone permission is refused, the interface
     explains how to allow it and offers the written description (FR-002, US1 scenario 5).
- **Rationale**: AAC/MP4 is the only format played natively by Safari (iOS and macOS), Chrome,
  Edge and Firefox on all target platforms; normalizing on arrival removes any
  playback compatibility matrix and any format logic on the client side.
- **Alternatives considered**: keep the original format (WebM playback uncertain on
  older iOS versions); convert to Opus/WebM (unplayable on some Safari versions);
  third-party recording library (recorder.js, WAV encoding) — heavy files, needless
  dependency; asynchronous conversion through a queue — complexity with no benefit at this volume.

## R3. File storage and access

- **Decision**:
  - Dedicated Docker volume mounted only in the API container (`/data/files`), never exposed
    by Caddy. Path `/{yyyy}/{mm}/{uuid}` without extension; the type, size, original
    name and author are in the database (`File`).
  - Upload as `multipart/form-data` by Multer with a size limit, then:
    detection of the real type by magic bytes (internal module `files/file-signature.ts`, which
    replaces the `file-type` library, ESM-only and not loadable by Jest; deviation decided
    during implementation on 2026-10-12); allow list of types;
    voice messages → ffprobe/ffmpeg (R2); photos → sharp (rotation according to EXIF, removal of all
    metadata, JPEG re-encoding at quality 85, long side ≤ 2560 px).
  - Formats allowed by default (adjustable): JPEG, PNG, WebP photos; PDF files. HEIC
    refused with a clear message: iOS already converts photos chosen through a web file field
    to JPEG, and sharp does not decode HEIC reliably.
  - Download only through `GET /api/files/:id`: session required, `canReadRequest` check
    on the parent request, sent by `res.sendFile` (handles Range/ETag),
    headers: stored `Content-Type`, `X-Content-Type-Options: nosniff`,
    `Cache-Control: private, no-store`, `Content-Disposition: inline` for images/audio and
    `attachment` for the others. Access denied → 404 and an audit entry.
  - Taking a photo: `<input type="file" accept="image/*" capture="environment">` for the
    camera, and the same field without `capture` for the gallery.
  - Request body limit also enforced by Caddy (`request_body max_size`).
- **Rationale**: same origin and session cookie: no need for signed URLs; the access check
  is the same code as for the request. The native file field is the most reliable
  and most accessible way to take a photo on mobile.
- **Alternatives considered**: time-limited signed URLs (useful only with external object
  storage); S3/MinIO storage (an extra service unjustified on a VPS);
  `getUserMedia` for the photo (camera interface to rewrite, less accessible).

## R4. Deadlines, delays and automatic closure

- **Decision**:
  - On each entry into a tracked stage, the service computes the due date from the durations
    copied into the request at creation (snapshot of the rules, FR-022) and records
    `currentStage`, `currentDueAt` and `warnAt` (due date − warning threshold).
    Stages: VALIDATION (from submission to the decision), TAKEOVER (from assignment to
    acceptance), COMPLETION (from acceptance to « Terminée » (Completed); restarts at each return
    to « À corriger » (To correct)).
  - `@Interval(15_000)` job (@nestjs/schedule): `UPDATE … WHERE currentDueAt < now() AND
    overdueStage IS DISTINCT FROM currentStage RETURNING …` to flag the delay
    idempotently; for each row: `OVERDUE` history event, notifications to the category
    managers and the assigned employee, Socket.IO emission.
  - The same job closes « Terminée » requests whose `autoCloseAt` has passed (categories with
    automatic closure), with the `SYSTEM` actor.
  - "Close to the due date" is computed at read time (`now ≥ warnAt`), without a job.
  - The remaining time displayed on the client side is a countdown computed from `currentDueAt`
    and corrected for the clock offset measured at connection (`serverTime` returned by the API).
- **Rationale**: a 15 s interval guarantees SC-006 (< 30 s); the conditional update
  avoids double notifications even if a tick is slow; the state in the database
  allows catch-up after a restart, with no queue or Redis.
- **Alternatives considered**: in-memory timer per request (lost on restart);
  `pg_cron` (business logic in the database, less testable); BullMQ queue (requires Redis).

## R5. State machine and concurrency

- **Decision**: pure module `request-state-machine.ts`: transition table
  `{from, action, to, actor, guards}` (see data-model) and function
  `applyAction(request, action, actor, context) → Result`. The service applies the transition in
  the database with optimistic locking: `updateMany({ where: { id, status: from, version } })`;
  0 rows → 409 `STATE_CHANGED`, the interface reloads the request and explains it to
  the user. The transition, the history event and the notifications are written in
  the same transaction; the Socket.IO emission happens after commit.
- **Rationale**: a single source of truth testable without a database; optimistic locking
  handles the edge case "two users change the status at the same time".
- **Alternatives considered**: state machine library (XState) — pointless for a
  20-row table; `SELECT … FOR UPDATE` lock — also works but keeps the row
  locked longer.

## R6. Non-modifiable history and audit log

- **Decision**: two append-only tables: `RequestEvent` (history of each request) and
  `AuditLog` (sensitive actions outside requests: logins, failures, access denials, accounts,
  roles, categories, settings). An SQL migration creates on both tables a
  `BEFORE UPDATE OR DELETE` trigger that raises an exception. No write route; reading of
  the audit reserved for the super administrator. Entries contain no password, no
  token, no message content (only identifiers and the before/after values of the
  business fields).
- **Rationale**: protection is provided by the database itself, even in case of an
  application bug (principle V).
- **Alternatives considered**: separate PostgreSQL role without UPDATE/DELETE rights (heavier to
  manage with Prisma and its migrations); cryptographic chaining of entries (not requested).

## R7. Authentication and sessions

- **Decision**: username + password; Argon2id hashing; accounts created by the super
  administrator with a temporary password to change at first login (no email
  in this phase). Server session stored in the database (`Session`), `HttpOnly`, `Secure`,
  `SameSite=Strict` cookie; expiry after 60 min of inactivity and 12 h at most (adjustable).
  `Origin` header check on all modifying requests and at the Socket.IO
  handshake. Login attempt limiting (@nestjs/throttler, 5 per minute and
  per username/IP). Deactivating an account deletes its sessions and disconnects its sockets.
- **Rationale**: immediately revocable sessions, identical authentication for REST and
  WebSocket, no sensitive data in browser storage.
- **Alternatives considered**: JWT in local storage (theft by XSS, hard to revoke);
  school SSO (not requested, to consider in a later phase).

## R8. Authorizations

- **Decision**: pure module `access-policy.ts` combining the global role (SUPER_ADMIN, MANAGER,
  EMPLOYEE), the permissions configurable per role (`RolePermission`) and category
  membership (`CategoryRecipient`, `CategoryManager`). Functions: `canReadRequest`,
  `allowedActions`, `canCreateInCategory`, `canPickRecipient`. Lists and search
  apply the same filter in SQL (visibility `WHERE`). Any denial: 404 for a
  resource (does not reveal its existence) or 403 for an action on a visible resource;
  in both cases an `ACCESS_DENIED` entry is written to the audit.
- **Rationale**: a single policy, tested by an exhaustive case table, applied to
  REST routes, files and Socket.IO rooms.
- **Alternatives considered**: CASL library — powerful but superfluous for three roles
  and a few relationships.

## R9. Real time and notifications

- **Decision**: Socket.IO gateway authenticated by the session cookie at the handshake;
  each socket joins only `user:{userId}`. Every notification is first written to the
  database (`Notification`), then emitted after the transaction commits. The client, on each
  connection or reconnection, retrieves the unread ones through REST, then invalidates the relevant
  TanStack Query queries on each event. Urgent requests carry
  `priority: URGENT` for a distinct display (color + icon + text, not color
  alone). In-memory Socket.IO adapter (single process).
- **Rationale**: no notification lost if the user is offline (FR-033); the
  data always goes through REST, with the same access check.
- **Alternatives considered**: broadcast the full data over WebSocket (two access-control
  paths); Server-Sent Events (imposed stack: Socket.IO).

## R10. Failed sends and local retention

- **Decision**: each request or message creation gets a `clientId` (UUID generated
  on the client side). On a network failure, the content (fields + audio Blob + photos) is kept
  in IndexedDB (idb-keyval) in a visible "outbox" with a « Réessayer » (Retry) button.
  The server makes creation idempotent through a unique constraint `(authorId, clientId)`:
  a new attempt at a send already received returns the existing resource.
- **Rationale**: meets FR-008 and SC-007 without a service worker (forbidden in this phase) and without
  creating duplicates.
- **Alternatives considered**: background synchronization (Background Sync, requires a
  service worker); keep nothing (contrary to the spec).

## R11. Search and performance

- **Decision**: SQL filters with indexes on `(status)`, `(categoryId)`, `(assigneeId)`,
  `(requesterId)`, `(priority)`, `(createdAt)`, `(currentDueAt)`; title search with
  `ILIKE`; cursor pagination (`createdAt`, `id`), 25 items per page.
- **Rationale**: more than enough for 100,000 rows (SC-009) without a search engine.
- **Alternatives considered**: `pg_trgm` extension or full-text search (to add if
  search becomes slow); external engine (unjustified).

## R12. Deployment, backups and operations

- **Decision**: Docker Compose on the VPS: `caddy` (Let's Encrypt HTTPS, HSTS, strict CSP,
  serves the SPA), `api` (Node 24 + ffmpeg, non-root user, applies
  `prisma migrate deploy` at startup), `db` (PostgreSQL 17, port not exposed), `backup`
  (every night: compressed `pg_dump` + archive of the files volume, 14-day retention,
  off-VPS copy to be configured). Secrets in a `.env` file outside the repository. JSON logs on
  standard output, without sensitive personal data. Restore tested and described in
  the quickstart.
- **Rationale**: matches the imposed stack, a single machine, simple restore.
- **Alternatives considered**: Kubernetes, object storage, managed database — disproportionate.

## R13. Product decisions made for this plan (to confirm with the client)

- **Deferred automatic closure**: for a category with automatic closure, the
  « Terminée » request is closed after a grace period (`autoCloseAfterMinutes`, default 1,440 min,
  i.e. 24 h) and not immediately, so that the requester can still send it back « À
  corriger » (US2). Adjustable per category; 0 = immediate closure.
- **Reassignment**: a category manager can reassign a request that is « Envoyée » (Sent),
  « Acceptée » (Accepted), « En cours » (In progress) or « À corriger »; it then goes back to « Envoyée » for the new
  employee and a new takeover deadline starts (FR-027).
- **Automatic assignment (workflow B)**: one employee designated per category
  (`autoAssigneeId`).
- **Drafts**: enabled by default (global setting); a draft can be deleted by its
  author, which is the only case of deletion.
- **Time zone**: timestamps stored in UTC, displayed in the browser's time zone.
- **Data retention**: provisional periods documented in the spec (section
  "Personal data"), to be validated before going into production; no automatic purge
  in this phase.
