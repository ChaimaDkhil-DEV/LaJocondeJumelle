# Quickstart: validating feature 018

Contracts: [contracts/api.md](contracts/api.md). Data: [data-model.md](data-model.md).

## Prerequisites

```text
npm install
npm run -w backend db:dev                         # embedded PostgreSQL on localhost:5433 (own terminal)
npm exec -w backend -- prisma migrate status      # expected: "Database schema is up to date!"
npm run -w backend prisma:seed                    # accounts: superadmin, admin, enseignante, …
npm run dev                                       # API :3002, interface :5173
```

`admin2` is not in the seed (existing tests depend on `admin` being the only administrator of the
demonstration categories). Create it as `superadmin` in « Administrateur > Comptes » (role Admin), then add
it to the administrators of a « via l'administration » category in « Catégories ».

## Automated checks

```text
npm run lint
npm run -w backend build && npm run -w frontend build        # TypeScript
npm run -w backend test                                      # unit
npm run -w backend test:integration                          # real PostgreSQL, includes the concurrency tests
npm run -w frontend test                                     # screens + axe
npm run test:e2e -- multi-admin.spec.ts                      # the 14 steps, desktop + phone
npm run test:e2e                                             # whole E2E suite (non-regression)
npm audit --audit-level=high
```

## Manual scenarios

### 1 — File commune and prise en charge (lot 1)

1. `enseignante` creates a request in a « via l'administration » category.
2. `admin` and `admin2`, in two browsers, open « Espace de travail > File commune »: both see it.
3. `admin` presses « Prendre en charge » and confirms. Expected: it leaves both lists without reloading;
   `admin`'s dashboard shows « Mes demandes : 1 ».
4. `admin2` opens the request by its address. Expected: read-only, « Responsable : (admin) », no approve /
   reject button.
5. Concurrency by hand: with a second free request, send the two `claim` calls together (two terminals, same
   `version`). Expected: one `200`, one `409 REQUEST_ALREADY_CLAIMED`; one row in the history.

### 2 — Takeover request and delegation (lot 2)

1. `admin2` opens `admin`'s request → « Demander la reprise », reason. `admin` receives the notification,
   opens « Collaboration > Reçues », accepts. Expected: `admin2` is responsible; the history shows
   « Transférée ».
2. `admin2` → « Proposer une délégation » to `admin`, reason. `admin` refuses. Expected: `admin2` still
   responsible and notified of the refusal.
3. `admin2` delegates again; `admin` accepts. Expected: `admin` responsible.
4. Expiry: set « Délai de réponse aux transferts » to 5 minutes, propose, wait. Expected: status
   « Expirée », both notified, responsible administrator unchanged.

### 3 — Supervision (lot 3)

1. `superadmin` → « Administrateur > Supervision »: filter by administrator, status, priority, period.
2. Reassign a request from `admin` to `admin2` with a reason. Expected: both notified, pending proposal on
   that request cancelled, an entry in « Journal d'audit » (`REQUEST_MANAGED`, `OWNER_REASSIGNED`).
3. Deactivate `admin2` in « Comptes ». Expected: their requests are flagged in the supervision; release or
   reassign them.

### 4 — Refusals

- `enseignante` calls `GET /api/admin/requests/available` → `403`, logged.
- `admin2` calls `POST /api/requests/:id/actions` on a request `admin` is responsible for → `403`, logged.
- `admin` calls `POST /api/super-admin/requests/:id/reassign` → `403`, logged.

## Rollback (development database)

Apply `backend/prisma/migrations/0029_request_admin_owner_transfers/down.sql`, then remove the migration row
as described at the top of that file. In production, restore the backup taken by `deploy/deploy.sh`.
