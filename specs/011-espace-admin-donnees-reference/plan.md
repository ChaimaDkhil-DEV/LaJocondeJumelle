# Implementation Plan: Espace Administrateur pour l'ADMIN — données de référence et liste des employés

**Branch**: `011-espace-admin-donnees-reference` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-espace-admin-donnees-reference/spec.md`

## Summary

Open the reference-data part of the « Administrateur » space (floors, levels, classes with their QR
codes, students with CSV import) to active `ADMIN` accounts, and give them a read-only « Employés »
list. Server side: one new role rule `canUseAdministrationSpace` and one `AdministrationGuard`
(same pattern as `SuperAdminGuard` / `MealServiceGuard`), applied to the floors, levels/students and
a split-out classes controller, plus a new `GET /api/admin/employees` projection. Everything else
under `/api/admin` keeps `SuperAdminGuard`. Interface side: `AdminLayout` and the menu filter
sections by role, reserved routes are wrapped so they never mount for an `ADMIN`, and a new
`EmployeesAdminPage`. No schema change. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: backend NestJS 11, Prisma 6, class-validator; frontend React 19, MUI 9,
React Router 7, TanStack Query 5, lucide-react

**Storage**: PostgreSQL (Prisma); no migration in this feature

**Testing**: Jest 30 (backend unit + integration with supertest, `--runInBand`), Vitest 5 + Testing
Library (frontend), Playwright + axe (e2e; the frontend unit tests have no axe tool)

**Target Platform**: web application, school-hosted Linux server (Docker, `deploy/`), modern
browsers, 320 px to desktop

**Project Type**: web application (`backend/` + `frontend/` npm workspaces)

**Performance Goals**: employee list rendered in under 1 s for up to 500 accounts (one query, no
pagination)

**Constraints**: least privilege; rights checked server side on every request; every refusal logged;
WCAG 2.2 AA; French UI strings via `t()`

**Scale/Scope**: one school, a few hundred accounts; 15 routes change guard, 1 new route, 1 new
page, 2 layouts changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TDD | Unit tests of `canUseAdministrationSpace`; integration tests of every widened and reserved route per role (`admin-routes-access` table), of `/api/admin/employees` fields, of audit authorship; frontend tests of sections per role and of the « Employés » page; e2e journey. Existing tests encoding the old rule (research R5) are changed first and must fail before the code. | ✅ |
| II. Simplicity / YAGNI | One rule, one guard, one controller split, one projection route. No new permission, no configurable rights, no schema change. | ✅ |
| III. Accessibility / UX | « Employés » page: list with column header on wide screens, stacked rows below, each value labelled, status as text, loading/error/empty states, axe checks (Playwright); reserved sections show a clear message. Existing pages unchanged. | ✅ |
| IV. Security / data | Employee projection limited to six fields (no username, password state, dates); input validation unchanged (existing DTOs). | ✅ |
| V. Workflow integrity / RBAC | Server-side guard per controller; `ACCESS_DENIED` logged with reason and route, generic 403 (no resource existence revealed); changes audited with the `ADMIN` as actor. | ✅ |

**Post-design re-check (after Phase 1)**: unchanged, all ✅. No item for Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/011-espace-admin-donnees-reference/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── http-api.md      # Phase 1: routes and access per role
│   └── ui.md            # Phase 1: menu, sections, « Employés » page
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── common/authorization.ts              # + canUseAdministrationSpace
│   ├── audit/administration.guard.ts        # new AdministrationGuard (NOT_ADMINISTRATION)
│   ├── coverage/coverage-admin.controller.ts # classes routes moved out; FloorsAdminController → AdministrationGuard
│   ├── coverage/classes-admin.controller.ts # new, admin/coverage/classes, AdministrationGuard
│   ├── coverage/coverage.module.ts          # register controller + guard
│   ├── students/students.controller.ts      # → AdministrationGuard
│   ├── students/students.module.ts          # register guard
│   ├── users/employees.controller.ts        # new, GET admin/employees
│   ├── users/users.service.ts               # + listEmployees() projection
│   └── users/users.module.ts                # register controller + guard
└── test/
    ├── unit/authorization.spec.ts           # + rule cases
    └── integration/
        ├── admin-routes-access.spec.ts      # table: allowed to ADMIN vs reserved
        ├── admin-employees.spec.ts          # new
        ├── admin-floors.spec.ts, admin-levels.spec.ts, csv-imports.spec.ts, coverage.spec.ts  # old rule updated
frontend/
├── src/
│   ├── app/AppLayout.tsx                    # menu entry for ADMIN
│   └── features/admin/
│       ├── access.ts                        # new: canUseAdministrationSpace (UI mirror)
│       ├── AdminLayout.tsx                  # sections per role, messages
│       ├── adminRoutes.tsx                  # SuperAdminOnly wrappers, role-based index, employes route
│       ├── EmployeesAdminPage.tsx           # new
│       └── api.ts                           # + useEmployees()
└── tests/admin/
    ├── admin-pages.test.tsx                 # access tests per role
    └── employees-list.test.tsx              # new
e2e/
├── us8-admin.spec.ts                        # admin: menu shown, Comptes still refused
└── admin-reference-admin.spec.ts            # new: ADMIN journey + a11y
```

**Structure Decision**: existing web-application layout (`backend/`, `frontend/`, `e2e/`); the
feature only adds files next to the code they extend.

## Complexity Tracking

No violation to justify.
