# Implementation Plan: Student class history and situation at a given moment

**Branch**: `021-historique-eleve-situation` (spec directory only; no git branch created yet) | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-historique-eleve-situation/spec.md`

## Summary

Record every class a pupil belongs to in an append-only history, and add a read-only "situation" service and
screen that assembles, for a pupil and a minute, the facts the application already stores: planned session,
actual teacher, announcement, substitute, supervisors, and later corrections.

Approach (details in [research.md](research.md)):

- One new table, `StudentClassHistory`, append-only: a row says "from this moment the pupil is in this class".
  A period ends when the next row starts, so periods cannot overlap and a pupil cannot have two current
  classes. Rows are written in the same transaction as every pupil create or class change (screen, CSV import,
  seeds). Existing pupils get one backfilled row flagged `reconstructed`.
- One pure function (`buildSituation`) turns the dated facts into the situation, with an availability
  (`KNOWN`, `PROBABLE`, `NONE`, `UNAVAILABLE`) on each section. A thin service reads the facts; a controller
  exposes three admin routes. No fact is copied; nothing is stored for the situation itself.
- One new audit action (`STUDENT_SITUATION_VIEWED`), before/after values on pupil changes (never the parent
  phone), and an index so the audit trail can be read by target.
- One admin screen reached from the pupil list: class history, date and time choice, situation, print.

## Technical Context

**Language/Version**: TypeScript 5.9 (backend and frontend), Node.js

**Primary Dependencies**: NestJS 11, Prisma 6.19, class-validator; React 19, Vite 8, TanStack Query 5, MUI (as in `StudentsAdminPage`)

**Storage**: PostgreSQL. One migration `0032_student_class_history` with `down.sql`. No new extension.

**Testing**: Jest 30 (unit and integration against a real database, `backend/test`), Vitest 5 (frontend), Playwright with axe (`e2e/`)

**Target Platform**: existing web application (API plus SPA), school time zone from `SCHOOL_TIMEZONE`

**Project Type**: web application (`backend/` and `frontend/` workspaces)

**Performance Goals**: situation for one pupil in under 3 seconds (SC-007); in practice a handful of indexed queries

**Constraints**: read-only situation; administration only; denied access answers 404 and is logged (existing gate pattern); no secret or contact data in the audit trail

**Scale/Scope**: several hundred pupils, one history row per class change (a few per pupil per year), one year of attendance and coverage records

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 below.*

| Principle | Status | How the plan complies |
|---|---|---|
| I. Test first | Pass | Each user story has failing tests first (see Test plan in [quickstart.md](quickstart.md)): pure-function unit tests for `buildSituation`, integration tests for the migration, the history writes, the routes and the access rules, a Playwright journey with an accessibility check. `tasks.md` will order tests before code. |
| II. Simplicity | Pass, with two justified choices | Append-only table with no `endedAt` (end is the next row's start). Situation is computed, not stored. No new role or permission. Two additions are tracked in Complexity Tracking. |
| III. Accessibility and UX | Pass | One screen, WCAG 2.2 AA, keyboard, 320 px, availability stated in words, loading/empty/error states, printable page. Axe check in Playwright. |
| IV. Security and data | Pass | Server-side validation of `at` and ids; parent phone never copied into the audit trail; situation consultations logged; purpose and retention documented in the spec assumptions; no secret introduced. |
| V. Integrity of workflows | Pass | History rows and consultation entries are append-only (trigger, like `AuditLog`); every class change is audited with before and after; denied access is logged and does not reveal the pupil (404, same as the attendance gate). |

Re-check after Phase 1: unchanged. The design adds no role, no external service and no stored copy of facts.

## Project Structure

### Documentation (this feature)

```text
specs/021-historique-eleve-situation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── student-situation.md
├── checklists/requirements.md
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                          # + StudentClassHistory, + AuditAction STUDENT_SITUATION_VIEWED, + AuditLog index
│   ├── migrations/0032_student_class_history/ # migration.sql (table, trigger, index, backfill) + down.sql
│   ├── seed.ts, seed-demo.ts, seed-volume.ts  # write a history row with each pupil
├── src/
│   ├── students/
│   │   ├── students.service.ts                # history row + before/after audit in the existing transactions
│   │   ├── students-import.service.ts         # history rows for imported pupils
│   │   ├── student-situation.controller.ts    # GET class-history, situation, audit (AdministrationGuard)
│   │   ├── student-situation.service.ts       # reads facts, logs consultation
│   │   ├── student-situation.dto.ts           # `at` validation
│   │   └── domain/situation.ts                # pure buildSituation + availability rules
│   ├── audit/audit.service.ts                 # allow the `at` detail key
│   └── students/students.module.ts
└── test/
    ├── unit/student-situation.spec.ts
    ├── integration/migration-0032.spec.ts
    ├── integration/student-class-history.spec.ts
    ├── integration/student-situation.spec.ts
    └── integration/student-situation-access.spec.ts   # also added to the IDOR/route-access matrices

frontend/
├── src/features/students/
│   ├── StudentHistoryDrawer.tsx               # history + situation, opened from the pupil row
│   ├── studentSituationApi.ts
│   └── SituationView.tsx                      # sections, availability labels, print stylesheet
└── tests (Vitest) next to the components

e2e/student-situation.spec.ts                   # journey + a11y + 320 px
docs/                                           # one paragraph in the admin guide; retention note
```

**Structure Decision**: existing web-application layout. The feature lives in the `students` module (it is
about a pupil and already holds the pupil routes and guard). It reads the timetable, attendance and coverage
tables through Prisma and does not import those modules' services, so those modules do not change.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Database trigger forbidding update and delete on `StudentClassHistory` | FR-006: history must not be rewritable, even by a bug or a script | Relying on code discipline alone: the project already uses this trigger for `AuditLog` and `RequestEvent`, and a tested invariant is cheaper than a later dispute about edited history. |
| Backfill of one `reconstructed` row per existing pupil inside the migration | FR-005: the situation must work for the pupils already enrolled, with the "probable" warning | Writing rows lazily at first read: it would date the "go-live" at the first read, differently per pupil, and make a read write data. |
