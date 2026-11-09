# Tasks: Communication enseignant / parents (015)

Work on `master`, uncommitted (request of 2026-11-09). Tests first (constitution principle I): each test file
was written before its code; when a test was not run before the code existed, a mutation check (feature
module removed) confirmed it fails without the feature.

## Lot 1 — Models, permissions, backend

- [X] T001 Schema: role `PARENT`, permission `PARENT_COMMUNICATION_VALIDATE`, audit actions, notification types,
  `Guardian`, `GuardianStudent`, `TeacherClass`, `ParentCommunication`, `ParentCommunicationRevision`,
  `ParentCommunicationEvent`, `ParentCommunicationDelivery`, `OutboxEvent`; `Notification.requestId` optional +
  `communicationId`.
- [X] T002 Migrations `0020_parent_communications` (generated) and `0021_parent_communications_integrity`
  (notification target CHECK, append-only triggers on revisions and events, revision checks), each with `down.sql`.
  Note: the project hook applied 0020 as soon as its `down.sql` was written, before the integrity statements were
  added; per CLAUDE.md the applied migration was not modified and 0021 carries them.
- [X] T003 Existing code adapted to the optional `requestId` (socket publisher, push dispatcher — communication
  notifications are never pushed —, unread counts, demo simulation) and to the new role (default permissions).
- [X] T004 Domain rules `communication-workflow.ts` — `test/unit/parent-communication-workflow.spec.ts` (12).
- [X] T005 Service, DTOs, controllers: teacher (students of assigned classes, drafts, submit, cancel), validation
  (list with filters, detail, decision on the examined revision), parent (approved messages, first reading audited),
  administration (guardians, parent account, teacher classes) — `test/integration/parent-communications.spec.ts` (19).
- [X] T006 Parent scope: `@ParentAllowed()` (deny by default in `SessionGuard`); parent accounts excluded from
  account lists, employees, dashboard employees, category recipients; `PARENT` refused by the user DTOs.
- [X] T007 Voice files: standalone access hook in `FilesService`; orphan cleanup ignores communication voices.
- [X] T008 Bell: `NotificationsService.notifyCommunicationInTx`; `GET /api/notifications` returns `communication`.

## Lot 4 (backend) — n8n

- [X] T040 Config `N8N_WEBHOOK_URL`, `N8N_SHARED_SECRET`, `N8N_TIMEOUT_MS`, `PARENT_COMM_CHANNELS` — `config.spec.ts`.
- [X] T041 Protocol (signature, bearer, retries, delivery statuses) — `test/unit/n8n-integration.spec.ts`.
- [X] T042 Outbox written in the approval transaction; deliveries created per enabled channel with a contact.
- [X] T043 `OutboxDispatcher` + `OutboxJob`; `N8nController` (`@IntegrationRoute()`, `N8nGuard`) —
  `test/integration/parent-communications-n8n.spec.ts` (6).
- [X] T044 Docker Compose profile `n8n` (n8n 2.44.7 pinned by digest, dedicated PostgreSQL, `n8n-backup`, volumes,
  encryption key and secret checked at startup, health checks, resource limits), Caddy subdomain (IP allowlist,
  webhooks never public), `deploy/n8n/ljj-parent-communication.workflow.json`, `deploy.sh` backs up n8n,
  `.env.example`. Checked against a real n8n: `parent-communications-n8n-live.spec.ts` (opt-in) and the workflow
  harness (docs/validation/verification-015.md).

## Lots 2–3 — Interfaces

- [X] T020 Teacher « Communication avec les parents »: list, create (student, representative), remark, voice
  recording (reuse `useVoiceRecorder`), listen/re-record, draft, submit, statuses, reasons.
- [X] T021 Validation « Communications à valider »: filters, detail, audio player, approve / return / reject with
  confirmation, history, deliveries.
- [X] T022 Parent « Messages de l'école »: list, detail, audio, teacher, date, read state; parent navigation only.
- [X] T023 Administration: representatives (students, parent account) and teacher classes.
- [X] T024 Notification centre: communication notifications open the right page; permission label in settings;
  audit action labels; English dictionary.

## Lot 5 — End-to-end, documentation, verification

- [X] T050 E2E teacher → administration → parent — `e2e/parent-communications.spec.ts` (chromium).
- [X] T051 `docs/parent-communications.md` (operation, n8n, register record), README, `docs/validation/verification-015.md`.
- [X] T052 Full checks: lint, types, unit, integration, frontend, audit — docs/validation/verification-015.md.

## Recorded exceptions (existing expectations changed)

- `backend/test/unit/authorization.spec.ts`: the super administrator now has 7 permissions (was 6).
- Type-only adjustments for the optional `Notification.requestId`: `seed-demo.spec.ts`, `demo-seed.spec.ts`;
  `PARENT: []` added to the role fixtures of `access-policy.spec.ts` and `authorization.spec.ts`.
- Frontend `tests/admin/admin-pages.test.tsx`: two new administration sections (« Représentants », « Classes des
  enseignants »); `tests/admin/role-labels.test.tsx`: `PARENT: 'Parent'` added to the role labels.
- `tests/notifications/NotificationCenter.test.tsx`: the `Notif` fixture type allows `request: null` and
  `communication` (new test for communication notifications).
- Frontend tests of this feature written before the pages, corrected when first run against them (behaviour
  unchanged): wait for the data after the heading; wait for the created communication page before submitting;
  after a decision the action buttons disappear (the test expected « Rejeter » to remain); the reason dialog
  closes with « Retour ».

- Backend `admin-routes-access.spec.ts`: guardians and teacher-classes routes added to `ADMIN_ALLOWED` (open to
  ADMIN by decision); `notifications.spec.ts`: each item now has `communication: null` for a request.

## Deviations from principle I (tests first)

Recorded before merging PR #94; check 4 of docs/procedure-fusion.md left unticked for this reason.

1. Lot 1 (T001–T008) and the n8n backend (T040–T043): the tests were written before the code but not run, so
   not seen failing first. Compensated by a mutation check: without the module, 18 / 18 and 6 / 6 of these
   tests fail.
2. Notification routing (`notificationPath`, `eventPath`) and the display of a communication in the bell
   (`NotificationCenter`): coded before their test in `NotificationCenter.test.tsx`; only the live refresh
   (`SocketProvider`) was seen failing first.
3. n8n workflow, Compose profile, Caddy site, `deploy.sh`: no failing-first test is possible in the test
   suites; checked after writing against a real n8n 2.44.7 (harness and opt-in live test,
   docs/validation/verification-015.md).

## Defects found during verification

- A user without the right received 400 (invalid body or filter) instead of 403 on the validation and teacher
  routes, the check being done by the service after validation: found by `admin-routes-access.spec.ts`, covered
  by a new test in `parent-communications.spec.ts` (failing first), fixed by `CommunicationValidatorGuard` and
  `CommunicationTeacherGuard` (403 before reading the request, `ACCESS_DENIED` logged).

- Audit details of this feature were dropped by the audit allowlist (`event`, `revision`, `studentId`,
  `studentIds`, `guardianId`, `classIds`, `channels` were missing): found by the live n8n test, covered by
  `audit-sanitize.spec.ts` and `parent-communications.spec.ts` (failing first), fixed in `audit.service.ts`.
- n8n deduplication relies on the workflow's static data, saved at the end of an execution: two identical
  events a few milliseconds apart are both processed. The API never sends that (5-minute lease, 30 s minimum
  before a retry); a replay after the first execution is ignored (checked).
