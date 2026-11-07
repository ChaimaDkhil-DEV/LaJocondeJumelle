# Research: Espace Administrateur pour l'ADMIN (011)

No item of the Technical Context was left as NEEDS CLARIFICATION: the stack is the existing one and
the user's answers of 2026-11-07 settle the scope. The decisions below come from reading the code.

## R1 — Rule for "administration" access

- **Decision**: add one rule `canUseAdministrationSpace(user)` in `backend/src/common/authorization.ts`:
  account active **and** role `ADMIN` or `SUPER_ADMIN`. It is checked by one new guard,
  `AdministrationGuard` (`backend/src/audit/administration.guard.ts`), built like `SuperAdminGuard`
  and `MealServiceGuard`: on refusal it logs `ACCESS_DENIED` with reason `NOT_ADMINISTRATION`, route,
  method and channel, then answers `403 FORBIDDEN`.
- **Rationale**: same pattern as the two existing guards, so reviewers find nothing new. The user is
  read from the session on every request (`req.auth.user`), so a demoted or deactivated `ADMIN` loses
  access on her next request (same mechanism as the fix of #81). The reason `NOT_ADMINISTRATION` is
  already used by `MealServiceGuard` for the same population.
- **Alternatives considered**:
  - *Use the configurable permission `ADMIN_MANAGE`*: rejected. It is listed in `ALL_PERMISSIONS` but
    enforced nowhere, and it can be granted to `EMPLOYEE` from « Réglages », which would open
    reference data to any role. The user asked for a role rule.
  - *Widen `SuperAdminGuard`*: rejected, it protects accounts, settings, audit, etc. that stay
    reserved.
  - *Reuse `canManageMealServices`*: same truth table, but its name states another purpose; a future
    change to meal rights would silently change reference-data rights.

## R2 — Which server routes change guard

| Routes (unchanged URLs) | Controller today | Guard after |
|---|---|---|
| `GET/POST /api/admin/floors`, `PATCH /api/admin/floors/:id` | `FloorsAdminController` | `AdministrationGuard` |
| `GET/POST /api/admin/levels`, `PATCH /api/admin/levels/:id` | `StudentsController` | `AdministrationGuard` |
| `GET/POST /api/admin/students`, `PATCH /api/admin/students/:id`, `POST /api/admin/students/import` | `StudentsController` | `AdministrationGuard` |
| `GET/POST /api/admin/coverage/classes`, `PATCH …/:id`, `GET …/:id/qr`, `POST …/:id/qr/revoke` | `CoverageAdminController` (shared with dashboard, export, groups) | moved to a new `ClassesAdminController` with `AdministrationGuard` |
| `GET /api/admin/employees` (new) | — | `AdministrationGuard` |

- **Decision**: the class routes move out of `CoverageAdminController` into their own controller
  (`@Controller('admin/coverage/classes')`), so that dashboard, CSV export and groups keep
  `SuperAdminGuard` at class level. URLs do not change, so the frontend API layer does not change.
- **Rationale**: one guard per controller, as everywhere else in the project; no per-method guard that
  a later route could forget.
- **Alternatives considered**: method-level `@UseGuards` in the shared controller (rejected: a new
  route added there would inherit `SuperAdminGuard` or nothing depending on where it is written).
- **Checked**: the services behind these routes (`CoverageAdminService`, `StudentsService`,
  `StudentsImportService`) do not test the role again; the audit entries use `ctx.actor`, so an
  `ADMIN`'s changes are logged with her as author (FR-009) with no service change.
- **Checked**: the four reference screens call only these routes (floors, levels, classes, class QR,
  students, students import). None calls groups, dashboard or users, so no reserved data leaks
  through them.

## R3 — Employee list for the ADMIN

- **Decision**: new read-only route `GET /api/admin/employees` (users module), returning every
  account sorted by display name, with only `id`, `displayName`, `jobTitle`, `role`, `active`,
  `groups` (active employee groups the account belongs to: `id`, `name`) and `floor` (`id`, `name` or
  `null`). No pagination.
- **Rationale**: `GET /api/admin/users` returns `username`, `mustChangePassword`, `createdAt` and
  recipient categories, and serves account management: it stays reserved and unchanged
  (data minimisation, constitution IV). A school has at most a few hundred accounts, so one response
  is enough; a separate route keeps the narrow field list explicit and testable (SC-004).
- **Alternatives considered**: a `fields` filter on `/api/admin/users` by role (rejected: same route
  with two meanings, easy to widen by mistake); reusing the dashboard « Employés » data (rejected: it
  holds workload statistics, out of scope and super-admin only).

## R4 — Interface

- **Decision**:
  - `AppLayout`: the « Administrateur » entry is shown when `canUseAdministrationSpace` holds
    (frontend mirror in `features/admin/access.ts`); « Restauration » keeps its own rule.
  - `AdminLayout`: lets in `ADMIN` and `SUPER_ADMIN`; each section declares the roles that see it.
    `ADMIN` sees « Étages », « Niveaux », « Classes », « Élèves », « Employés »; the super administrator
    sees exactly today's sections (« Employés » is not added for him: he has « Comptes », SC-005).
    `EMPLOYEE` gets the message « Accès réservé à l'administration. ».
  - Reserved routes are wrapped in a `SuperAdminOnly` element that shows « Accès réservé au super
    administrateur. » without mounting the page, so no reserved request is sent.
  - `/admin` redirects to `comptes` for the super administrator, to `etages` for an `ADMIN`.
  - New page `EmployeesAdminPage` (`/admin/employes`): list in the « Comptes » page pattern (column header from `md`, stacked rows below) with the six fields,
    no action, reusing `ROLE_LABELS`, `EmptyState`, `LoadingState`, `ErrorState`.
- **Rationale**: keeps the reference pages untouched; hiding sections is a convenience, the server is
  the authority (FR-007, FR-010).
- **Alternatives considered**: a separate « Gestion » space for the `ADMIN` (rejected: duplicates
  navigation and pages).

## R5 — Tests that encode the old rule

These tests assert today that an `ADMIN` is refused on reference routes. They are updated **first**,
so they fail before the code changes (constitution I):

- `backend/test/integration/admin-routes-access.spec.ts`: becomes a table, with an explicit list of
  routes allowed to `ADMIN`; every other `/admin/*` route stays 403 for her, every route stays 403 for
  `enseignante` and 401 without a session. A route added later is reserved by default.
- `backend/test/integration/admin-floors.spec.ts` (≈l.154), `admin-levels.spec.ts` (≈l.141),
  `csv-imports.spec.ts` (≈l.429), `coverage.spec.ts` test 13 (≈l.906): `admin` moves from "refused"
  to "allowed" for reference routes; refusals stay for `surveillant` / `enseignante`, and for `admin`
  on dashboard, export and groups.
- Found by the full integration run (missed in this list at planning time):
  `backend/test/integration/supervision-permissions.spec.ts` (T081 matrix: `GET /admin/coverage/classes`,
  `…/classes/:id/qr`, `GET /admin/floors` now allowed to `ADMINS`; dashboard, export and groups unchanged)
  and `backend/test/integration/student-meal.spec.ts` (« l'administration n'accède toujours pas aux routes
  élèves » → the admin now gets 200 on `GET /api/admin/students`).
- `frontend/tests/admin/admin-pages.test.tsx` « refuse l'espace Administrateur à un admin »:
  replaced by role-based section tests.
- `e2e/us8-admin.spec.ts` (V16): the `admin` now sees the menu entry, but « Comptes » and
  `/api/admin/users` stay refused.
