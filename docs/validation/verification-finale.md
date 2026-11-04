# Phase 1 final verification (T121)

- **Date**: 13 October 2026
- **Branch**: `001-demandes-travail-vocales`
- **Machine**: Windows 11, Node.js 24.21, embedded PostgreSQL 17 (embedded-postgres), local ffmpeg

## `npm run verify`

Exit code 0.

| Step | Result |
|-------|----------|
| Lint (ESLint, including jsx-a11y) | no problems |
| Backend unit tests | 321 / 321 |
| Backend integration tests (API + PostgreSQL) | 205 / 205 |
| Frontend tests (Vitest) | 107 / 107 |
| `npm audit --audit-level=high` | no high or critical vulnerabilities (21 moderate, development tooling) |

## End to end (`npm run test:e2e`)

6 profiles: Chromium, Firefox, WebKit, iPhone 13, Pixel 7, 320 px.
**127 passed, 0 failed, 23 deliberately skipped**:

- 9 tests reserved for a single profile, because they modify a shared account or depend on real
  delays: forced password change (`nouveau` account) and V14 (deadlines).
- 10 V18 tests reserved for the 320 px profile; 4 SC-001 measurements reserved for the phone profiles.

## Quickstart scenarios

| # | Scenario | Automated proof | Result |
|---|----------|--------------------|----------|
| V1 | Voice request | `e2e/us1-create-voice-request.spec.ts` | ✅ |
| V2 | Recipient outside category | `backend/test/integration/requests-create.spec.ts` | ✅ |
| V3 | Send failure, resend | `e2e/us1-…`, `requests-create.spec.ts` | ✅ |
| V4 | Microphone denied | `e2e/us1-create-voice-request.spec.ts` | ✅ |
| V5 | Workflow A processing | `e2e/us2-process-request.spec.ts` | ✅ |
| V6 | Mandatory photo | `e2e/us2-…`, `requests-actions-circuit-a.spec.ts` | ✅ |
| V7 | Refusal by the assignee | `e2e/us2-…`, `requests-actions-circuit-a.spec.ts` | ✅ |
| V8 | Cancellation | `e2e/us2-…`, `requests-actions-circuit-a.spec.ts` | ✅ |
| V9 | Concurrent transitions | `e2e/us2-…`, `requests-actions-circuit-a.spec.ts` | ✅ |
| V10 | Discussion thread | `e2e/us3-thread.spec.ts` | ✅ |
| V11 | Forbidden file | `e2e/us3-…`, `messages.spec.ts` | ✅ |
| V12 | Real-time notifications | `e2e/us4-notifications.spec.ts` | ✅ |
| V13 | Workflow B | `e2e/us5-admin-validation.spec.ts`, `requests-circuit-b.spec.ts` | ✅ |
| V14 | Deadlines and delays | `e2e/us6-deadlines.spec.ts`, `overdue-job.spec.ts` | ✅ |
| V15 | Search and history | `e2e/us7-search-history.spec.ts` | ✅ |
| V16 | Administration | `e2e/us8-admin.spec.ts`, `admin-*.spec.ts` | ✅ |
| V17 | Immutable audit | `backend/test/integration/append-only.spec.ts` | ✅ |
| V18 | Accessibility, 320 px, keyboard | `e2e/a11y-responsive.spec.ts` | ✅ |

**SC-001** (`e2e/sc001-create-timing.spec.ts`): 14.7 s on Pixel 7 and 16.5 s on iPhone 13
(WebKit profile with simulated MediaRecorder), including a 10 s recording; limit 60 s.

**SC-009** (`search-performance.spec.ts`): filtered search over 10,000 requests in under 2 s.

## Production configuration

- `deploy/Caddyfile` validated by `caddy validate` (Caddy 2.10).
- Production SPA served by this Caddyfile, with its headers (CSP, Permissions-Policy, HSTS),
  in front of the API; Chromium walkthrough with no CSP violation or JavaScript error: login,
  recording and replaying a voice message, sending, playback of the converted voice message, real time (Socket.IO),
  administration.
- Shell script syntax checked (`bash -n`).
- **Not verified on this machine (Docker absent)**: image builds, `docker compose up`,
  real backup and restore. To be done on the acceptance machine before going to
  production (see the quickstart, "Test de restauration" (Restore test)).

## Remaining before going to production

- T119: manual check on a real iPhone — [iphone-manuel.md](iphone-manuel.md).
- T120: usability test with 5 employees (SC-002) — [test-utilisabilite-lot1.md](test-utilisabilite-lot1.md).
- Docker deployment and restore test on the acceptance machine.
- Validation by the school of the provisional values (retention periods, permissions,
  deadlines, recipients) — see the README.
