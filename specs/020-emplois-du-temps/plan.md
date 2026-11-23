# Implementation Plan: Teacher timetables linked to the QR attendance

**Branch**: `020-emplois-du-temps` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/020-emplois-du-temps/spec.md`

## Summary

Add a timetable (weekly series producing dated sessions) managed by the administration, a read-only
"Mon emploi du temps" for each teacher, and a "Attendus" tab in Surveillance that computes, for each session of a
day, a status (À venir, Attendu, Présent, En retard, Non arrivé, Absence justifiée, Séance annulée) from the facts
the attendance module already records (QR and manual arrivals, departures and returns of 019, announced
latenesses and absences with their substitute, empty-class declarations of 013). Statuses are computed on
reading by a pure function; nothing new is written when a teacher scans. Conflicts are prevented by PostgreSQL
exclusion constraints, with a readable pre-check. Two settings: lateness threshold (5) and tolerance delay (10).

## Technical Context

**Language/Version**: TypeScript 5.9 (backend and frontend), Node per `.nvmrc`

**Primary Dependencies**: NestJS 11, Prisma 6.19, class-validator 0.15, Socket.IO (existing `RealtimeService`);
React 19, MUI 9, TanStack Query 5, react-router (existing). No new dependency.

**Storage**: PostgreSQL 17; new tables `TimetableSeries`, `TeachingSession`; contrib extension `btree_gist`
(trusted, shipped with the `postgres:17` image) for exclusion constraints.

**Testing**: Jest 30 (backend unit + integration on a test database), Vitest 5 + Testing Library (frontend),
Playwright 1.64 with axe (`e2e/support/axe`).

**Target Platform**: Linux containers (deploy/docker-compose.yml); browsers from 320 px wide.

**Project Type**: web application (`backend/` NestJS API, `frontend/` React SPA, `e2e/`).

**Performance Goals**: expected list for a day (~300 sessions, ~100 teachers) answered in well under 1 s: five
indexed queries on the day + in-memory computation. Series creation for a school year (~40 sessions) in one
transaction.

**Constraints**: no second attendance record (FR-013); "Non arrivé" never before the tolerance delay and never
stored as an absence (FR-015); server time only; 404 + logged denial; WCAG 2.2 AA; no notification (D5).

**Scale/Scope**: one school; 2 tables, 1 migration, 1 new backend module, 1 new attendance service, 3 new screens
(admin timetable, teacher timetable, Attendus tab) and 3 small changes (QR page, settings page, teacher home link).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TDD | Status rules written first as unit tests on the pure `sessionStatus` (every row of R5, minute boundaries); conflicts, rights, locks and audit as integration tests before the services; each user story has acceptance tests (frontend + E2E) traced to its scenarios. | Pass |
| II. Simplicity | No new dependency; status computed, not stored (no job, no sync); reuse of `AttendanceGate`, settings, audit, realtime event, substitute model. New module and exclusion constraints justified below. | Pass (see Complexity Tracking) |
| III. Accessibility | Lists and tables, not an absolutely positioned calendar grid; statuses as text + icon, never colour alone; labelled form fields, error messages naming the conflict and how to fix it; filters in the URL; axe on each new screen at 320 px in E2E. | Pass |
| IV. Security | All inputs validated by DTOs (`forbidNonWhitelisted`), ids checked as UUID, ranges bounded (31 / 14 days); teacher identity only from the session; no new personal data (only ids already held); no secret. | Pass |
| V. Integrity | Session states finite (`SCHEDULED`, `CANCELLED`), transitions defined (data-model); every write audited `TIMETABLE_CHANGED` with before/after and reason; rows never deleted (triggers); RBAC on the server; denials logged, 404. | Pass |

Post-design re-check (after data-model, contracts): unchanged — Pass. The only point to confirm during
implementation is R3 (Prisma drift on exclusion constraints), with a documented fallback that stays within the
principles.

## Project Structure

### Documentation (this feature)

```text
specs/020-emplois-du-temps/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R12
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                         # + TimetableSeries, TeachingSession, TeachingSessionStatus, TIMETABLE_CHANGED
│   └── migrations/0031_timetable/{migration.sql,down.sql}
├── src/
│   ├── timetable/                            # NEW module
│   │   ├── timetable.module.ts               # imports AttendanceModule (gate), AuditModule, RealtimeModule
│   │   ├── timetable.controller.ts           # /timetable/sessions, /timetable/series, /timetable/mine
│   │   ├── timetable.dto.ts
│   │   ├── timetable.service.ts              # writes: create/update/cancel, conflicts, audit, realtime
│   │   ├── timetable.mapper.ts               # SessionView / OwnSessionView
│   │   └── domain/
│   │       ├── series.ts                     # pure: dates of a weekly series, local times → instants, validation
│   │       └── conflicts.ts                  # pure: overlap of proposed vs existing ranges (pre-check, messages)
│   ├── attendance/
│   │   ├── domain/session-status.ts          # NEW pure status rules (R5)
│   │   ├── expected-teachers.service.ts      # NEW: GET /attendance/expected (lines + counts)
│   │   ├── attendance.controller.ts          # + GET expected
│   │   ├── attendance.service.ts             # resolve/arrive: + session { current, next } (FR-019)
│   │   └── attendance.module.ts              # exports AttendanceGate; provides ExpectedTeachersService
│   ├── settings/settings.service.ts          # + 2 keys and rules
│   ├── settings/admin-settings.service.ts    # + cross-field rule threshold ≤ tolerance
│   ├── common/errors.ts                      # + TIMETABLE_CONFLICT, SESSION_LOCKED
│   └── app.module.ts                         # + TimetableModule
└── test/
    ├── unit/{session-status,timetable-series,timetable-conflicts}.spec.ts
    └── integration/{timetable,expected-teachers}.spec.ts   # + settings cross rule in existing settings spec

frontend/
├── src/
│   ├── features/timetable/                   # NEW
│   │   ├── api.ts, types.ts, labels.ts
│   │   ├── TimetableAdminPage.tsx            # /admin/emplois-du-temps: by teacher or class, week navigation
│   │   ├── SessionFormDialog.tsx, SeriesFormDialog.tsx, CancelDialog.tsx, ConflictList.tsx
│   │   ├── MyTimetablePage.tsx               # /emploi-du-temps: day / week
│   │   └── SessionList.tsx                   # shared accessible list grouped by day
│   ├── features/attendance/
│   │   ├── ExpectedTeachersTab.tsx           # NEW tab: KPI row, filters (URL), table
│   │   ├── ArrivalPage.tsx                   # + current / next session line
│   │   └── api.ts, types.ts                  # + expected query, session in resolve
│   ├── features/coverage/{surveillanceTabs.ts,CoveragePage.tsx}   # + 'attendus'
│   ├── features/admin/{adminRoutes.tsx,AdminLayout.tsx,SettingsAdminPage.tsx,api.ts}
│   ├── app/AppLayout.tsx                     # + "Mon emploi du temps" section of the left menu (Teachers group)
│   ├── features/notifications/SocketProvider.tsx  # + timetable:updated invalidation
│   ├── app/routes.tsx                        # + /emploi-du-temps
│   └── i18n/en/{timetable.ts,attendance.ts}
└── tests/{timetable/*.test.tsx, attendance/expected.test.tsx, coverage/surveillance-tabs.test.ts}

e2e/timetable.spec.ts                         # journey of quickstart.md + axe at 320 px
docs/ARCHITECTURE.md                          # + section 17 (timetable, status rules, constraints)
```

**Structure Decision**: existing web application layout. Timetable writes live in a new `timetable` module
(their own controller, DTOs and audit actions); everything that reads attendance facts stays in `attendance`, so
the status rules sit next to `presence.ts` and `attendance-matching.ts` and there is a single place that knows
how presence is established.

## Delivery order (for /speckit-tasks)

1. Migration 0031 + schema + R3 drift check; settings keys.
2. Pure domains with their unit tests first: `series.ts`, `conflicts.ts`, `session-status.ts`.
3. US1/US2 backend (timetable service + controller, integration tests first), then admin page.
4. US3/US5 backend (`ExpectedTeachersService`, integration tests on real attendance rows), then Attendus tab.
5. US4 backend (`/timetable/mine`), then teacher page + home link; FR-019 on the QR page.
6. E2E, axe, docs, full local CI (lint, types, tests, audit).

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| New backend module `timetable` | Timetable writes have their own routes, DTOs, rules and audit; putting them in `attendance` would mix two responsibilities in an already 500-line service. | Extending `AttendanceService`: harder to read and to test; the module only adds a controller and a service. |
| Two tables (series + dated sessions) | Exceptional changes, conflicts and stable history need dated rows; "every Monday" changes need the series (R1, R2). | Sessions only: no way to change a weekly slot in one action (FR-005). Pattern + exceptions: every reader must merge them. |
| `btree_gist` + exclusion constraints | SC-002 requires refusing overlaps even for simultaneous saves; only the database guarantees it on every write path (R3). | Application check only: race between two admins. Advisory locks: every writer must remember them (kept as fallback). |
