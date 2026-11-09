# Verification of feature 015 — teacher–parent communication and n8n

Working tree on `master` (base `6b44d1f`), changes not committed. Specification, plan and tasks:
[specs/015-communication-parents/](../../specs/015-communication-parents/). Operation:
[docs/parent-communications.md](../parent-communications.md).

## Automated checks (T052)

| Step | Result |
|---|---|
| `npm run lint` | green (0 error, 0 warning) |
| Type checks (backend, frontend) | green |
| Backend unit tests | 1103 / 1103 |
| Backend integration tests | 1010 passed, 2 skipped (`assist-whisper-live`, `parent-communications-n8n-live`: need a live service) |
| Frontend tests (Vitest) | 734 / 734 |
| `npm audit --audit-level=high` | 30 low/moderate, no high or critical (unchanged) |
| End to end, `e2e/parent-communications.spec.ts` (chromium) | 1 passed (run before and after the access guards were added) |
| Migrations `0020`, `0021` on the development database | applied; `prisma migrate status`: up to date (21 migrations) |

Not run: the full end-to-end suite on the 7 profiles (about 1 hour), and the other profiles for the new scenario
(it is skipped there by design: three users, simulated microphone).

## n8n workflow against a real n8n (T044)

n8n `2.44.7` (image pinned by digest, the one in `deploy/docker-compose.yml`), started with the same entry
guard and settings as the compose service, `deploy/n8n/ljj-parent-communication.workflow.json` imported with
`n8n import:workflow` and published with `n8n publish:workflow`. SMTP and WhatsApp replaced by local fake
servers (no message left the machine).

| Check | Result |
|---|---|
| Missing `N8N_ENCRYPTION_KEY` / secret shorter than 32 characters | container exits with code 1 and a clear message |
| Health check `wget http://127.0.0.1:5678/healthz` | `{"status":"ok"}` |
| Workflow import and publication | 1 workflow imported, published, active after restart |
| Event with a wrong signature / a timestamp older than 5 min | 401 `INVALID_SIGNATURE`, nothing sent |
| Valid event | 202; one data read with the bearer secret; one email (SMTP), one WhatsApp template message (3 variables, number in international format); two reports `SENT` with the provider id |
| Same event again after the first execution | 200 `duplicate`; nothing sent again |
| WhatsApp error containing the phone number | report `FAILED`, number replaced by « [numéro masqué] »; email still `SENT` |
| Content sent outside | guardian's first name, student's first name, teacher's name, link: never the remark nor the voice |
| Real chain API → n8n → API (`parent-communications-n8n-live.spec.ts`, opt-in) | approval, signed event accepted, outbox `SENT` after 1 attempt, both deliveries `SENT` with provider ids, audit `DATA_READ` + 2 `REPORT` |

Compose and Caddy: `docker compose config` valid with and without the `n8n` profile (`$$` escapes kept);
`caddy validate` (image `caddy:2`) valid with the default and with `N8N_DOMAIN` + several `N8N_ALLOWED_IPS`.

Not checked here: a real SMTP server, the real WhatsApp Business Platform (approved template, token), the
public subdomain certificate, `n8n-backup` on a server and a restore of n8n.

## Defects found and fixed during verification

1. Audit details of the feature were dropped by the audit allowlist (found by the live n8n test).
2. Users without the right received 400 instead of 403 on the validation and teacher routes (found by
   `admin-routes-access.spec.ts`).

Both are covered by tests written failing first; details in
[tasks.md](../../specs/015-communication-parents/tasks.md#defects-found-during-verification).

## Known limit

n8n deduplicates on the workflow's static data, saved at the end of an execution: two identical events a few
milliseconds apart would both be processed. The API never sends that (5-minute lease, at least 30 s before a
retry).

## Requirements and their checks

| Requirement | Checked by |
|---|---|
| FR-001, FR-002 statuses, author only, assigned classes | `parent-communication-workflow.spec.ts`, `parent-communications.spec.ts` (enseignant), `teacher.test.tsx` |
| FR-003 numbered versions, decision on the examined version | `parent-communications.spec.ts` (retour, approbation exécutée deux fois), `validation-parent.test.tsx` |
| FR-004 permission, never one's own, reason required, 403 before reading the request | `parent-communications.spec.ts` (validation), `admin-routes-access.spec.ts`, `authorization.spec.ts` |
| FR-005 parent sees approved messages for their children only | `parent-communications.spec.ts` (espace parent), `validation-parent.test.tsx`, e2e |
| FR-006 voice files: pipeline, access, never deleted as orphans | `parent-communications.spec.ts` (vocaux) |
| FR-007 bell notifications, never pushed | `parent-communications.spec.ts` (cloche), `push-category.spec.ts`, `NotificationCenter.test.tsx` |
| FR-008 audit of every action, details kept, never the text | `parent-communications.spec.ts`, `audit-sanitize.spec.ts` |
| FR-009 outbox, retries, n8n down | `parent-communications-n8n.spec.ts`, `n8n-integration.spec.ts`, live test |
| FR-010 n8n endpoints: secret, minimal data, idempotent reports | `parent-communications-n8n.spec.ts`, live test, workflow harness |
| FR-011 channels by configuration | `config.spec.ts`, `parent-communications-n8n.spec.ts` |
| FR-012 guardians, parent accounts, teacher classes | `parent-communications.spec.ts` (administration), `admin-nav.test.tsx` |
| FR-013 accessibility, states, confirmations | page tests (`teacher.test.tsx`, `validation-parent.test.tsx`, `admin-nav.test.tsx`), e2e |
| SC-001 nothing visible or sent before approval | `parent-communications.spec.ts`, e2e (parent sees nothing before approval) |
| SC-002 one approval, one outbox event | `parent-communications.spec.ts` (approbation exécutée deux fois) |
| SC-003 n8n down: approval and reading work, event sent later | `parent-communications-n8n.spec.ts` |
