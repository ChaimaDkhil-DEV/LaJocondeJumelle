# Quickstart: validating the technical audit fixes

Verification guide, scenario by scenario. Design details are in
[research.md](./research.md), [data-model.md](./data-model.md) and [contracts/](./contracts/).

## Prerequisites

- Windows 11 or Linux, Node.js 24, ffmpeg in the `PATH`.
- `npm install` at the root.
- For scenarios 5 and 6: a staging server with Docker Compose and a domain name over HTTPS.

## Scenario 1 — Startup on port 3002 (US1, FR-001 to FR-003, SC-001, SC-003)

```bash
cp backend/.env.example backend/.env       # fill in SESSION_SECRET only
npm run -w backend db:dev                  # dedicated terminal
npm run -w backend prisma:migrate && npm run -w backend prisma:seed
npm run dev                                # or start.bat on Windows
```

Expected: the API responds on `http://localhost:3002/api/health`; the interface on
`http://localhost:5173` shows the login and the demo login succeeds; editing a file in
`backend/src` restarts the API without a manual build.
Time the whole path, from `cp` to the successful login (excluding downloads): under
10 minutes (SC-001).

API stopped, interface running: an action shows « Une erreur inattendue est survenue.
Réessayez plus tard. » (An unexpected error occurred. Try again later.) (502 response from
the Vite proxy), with no blank screen; also verified by
`frontend/tests/api/client.test.ts`.

```bash
git grep -nE "localhost:3000|host\.docker\.internal:3000|^PORT=3000" -- README.md backend/.env.example deploy/Caddyfile.dev frontend/vite.config.ts
```

Expected: no result.

## Scenario 2 — Configuration rejected at startup (US2, FR-004)

```bash
npm run -w backend test -- config.spec
```

Expected: green, including the invalid `TRUST_PROXY` and invalid port cases. Manual check:
`TRUST_PROXY=nimporte npm run -w backend start:dev` stops with the message from
[contracts/configuration.md](./contracts/configuration.md).

## Scenario 3 — Traced reset of the super administrator (US2, FR-007, FR-010, SC-004)

1. Log in as `superadmin` in two browsers.
2. `npm run -w backend build && node backend/dist/cli/bootstrap.js --reset-password superadmin`
3. Expected: a temporary password is shown once; in both browsers, the
   session is closed on the next request (real time: at most 60 s); logging in again requires
   a password change; the audit log (Administration → Journal screen) shows
   `PASSWORD_RESET`, target `superadmin`, reason `CLI`, no actor.
4. `node backend/dist/cli/bootstrap.js --reset-password inconnu` → code 1, no write.
5. `backend/scripts/reset-superadmin-password.ts` no longer exists.

Automated tests: integration test of `resetSuperAdminPassword` (transaction, sessions,
audit).

## Scenario 4 — Assignment frozen at submission (US3, FR-008 to FR-011, SC-005)

With the demo category in workflow B, automatic assignment to employee E1:

| Step | Expected |
|---|---|
| Submit a request D1, then designate E2 in the category, then approve D1 | D1 assigned to E1; history: source `SNAPSHOT` |
| Submit D2, switch the category to manual assignment, approve D2 without choosing an employee | D2 assigned to E1 (no more `ASSIGNEE_REQUIRED` block, finding N1) |
| Submit D3, deactivate E1, approve D3 | `AUTO_ASSIGNEE_UNAVAILABLE` refusal, the selector appears; approve with E3 → assigned to E3, source `MANAGER_CHOICE` |
| Submit D4, remove E1 from the category recipients (account active), approve D4 | same behavior as D3: refusal then choice by the manager (EXC-2, D8) |
| Old request (snapshot without `autoAssigneeId`) | assigned according to the current category, source `CATEGORY_CURRENT` (EXC-1, D9) |

In each request's history, the line « Affectée à <nom> » (Assigned to <name>) is followed by
the source: « (personne prévue à la soumission) » (person planned at submission),
« (selon la catégorie actuelle, demande antérieure) » (according to the current category,
earlier request) or « (choix du responsable) » (manager's choice).

Automated tests: integration test written **before** the fix (red on the first two
rows), then green; see [contracts/rest-api.md](./contracts/rest-api.md). Display
of the source: `frontend/tests/requests/HistoryTimeline.test.tsx`.

## Scenario 5 — Dependencies and cleanup (US4, FR-012 to FR-016, SC-006, SC-007)

```bash
npm run -w backend test -- architecture-layers
npm run -w frontend test -- enums-sync
```

Expected: green. Counter-test: temporarily add in `backend/src/files/` an import of
`../requests/...`, rerun → failure naming the file; undo. Add a value to
`RequestStatus` in `schema.prisma` without adding it to the interface → `enums-sync` fails;
undo.

Non-regression: full `npm test`, with no change to the expectations of the file access
and request tests.

## Scenario 6 — Going to production (US5, FR-017 to FR-021, SC-002, SC-008)

On staging:

1. **Mandatory backup**: add an empty test migration, run
   `docker compose … up -d --build` **without** `deploy/deploy.sh` → the API refuses to start
   with « Migration en attente sans sauvegarde récente… » (Pending migration without a
   recent backup…); run `deploy/deploy.sh` → a dated archive is created and then the
   migration is applied. The cases are also covered
   automatically by `backend/test/unit/api-entrypoint.spec.ts`.
   Then `docker compose … ps`: the `api` service is `healthy` (the healthcheck queries port
   3000, set explicitly in production, FR-002).
2. **Restore**: on a blank server, `deploy/backup/restore.sh <timestamp>`;
   check the login, a request with a voice message and a photo, the audit log; note the duration
   in `docs/validation/restauration.md`.
3. **Headers**: `curl -sI https://<domain>/` and `/api/health` → presence of
   `Content-Security-Policy` and `Strict-Transport-Security`; upload of a 27 MB file →
   rejected; record in `docs/validation/en-tetes-securite.md`.
4. **Quality checks**: the GitHub CI is green on the branch; `npm run test:e2e` run by
   hand, result recorded in `docs/validation/`.
5. **Pre-merge check** (D10): on the pull request into `master`, tick the
   four checks of `docs/procedure-fusion.md`: `gh pr checks <n°>` shows « Contrôles
   qualité » (quality checks) passed on the latest commit; all CI steps ran; no test
   ignored without a recorded reason, branch up to date, no open discussion; diff read
   (`gh pr diff <n°>`). **Manual** procedure: on the private repository, GitHub lets a red
   pull request be merged; nothing technically prevents it.

## Closure (FR-024, SC-009)

`docs/ARCHITECTURE.md`: each CT finding marked fixed with its commit reference; A04,
A11, A20, A23 to A26 re-marked [VERIFIED] (confirmed or refuted); N1 to N3 added.
