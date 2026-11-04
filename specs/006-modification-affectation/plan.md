# Implementation Plan: Modification d'une affectation par l'admin (classe, créneau) (Assignment edit by the admin: class, time slot)

**Branch**: `006-modification-affectation` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-modification-affectation/spec.md`

## Summary

Admins and the super administrator can change the class and time slot of an existing assignment
through a new `PATCH /api/coverage/:id` route, authorized by an admin `UPDATE` rule in the
state machine. The editable fields depend on the status (class and slot before
attendance, end only during attendance). The server re-checks the supervisor's availability
(named conflict, refusal), recomputes due dates and reminders, adds a detailed `UPDATED` event,
logs `COVERAGE_MANAGED` and notifies `COVERAGE_UPDATED`. The assignment detail gains a
« Modifier » (Edit) button and a dialog. No migration. Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (backend and frontend), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6, class-validator (backend); React 19, React Router 7,
MUI 7, TanStack Query (frontend) — existing stack, no dependency added

**Storage**: PostgreSQL 17 — no schema change or migration (`CoverageDetail.classId`,
`floorId`, `startAt`, `plannedEndAt` exist; `UPDATED` and `COVERAGE_UPDATED` types exist)

**Testing**: Jest (unit, integration with embedded PostgreSQL), Vitest + Testing Library,
Playwright + axe

**Target Platform**: recent browsers (desktop and mobile), Linux server (Docker)

**Project Type**: web application (monorepo `backend/` + `frontend/`)

**Performance Goals**: update visible to the supervisor in under 5 s (existing real time,
SC-002); one request per change

**Constraints**: WCAG 2.2 AA, 320 px; no forcing of availability; reason never logged or
recorded in history; school time zone; server-side access control

**Scale/Scope**: 1 route, 1 state machine rule, 1 domain function, 1 dialog; one
school (a few dozen assignments per day)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Before design | After design |
|-----------|---------------|--------------|
| **I. Tests first** | Each acceptance scenario has its red test before the code (R9). | ✅ Unit (domain), integration (route), frontend (dialog, history), e2e (flow, 320 px). |
| **II. Simplicity / YAGNI** | Reuse of `UPDATE`, `UPDATED`, `COVERAGE_UPDATED`, `availabilityFor`, `nextCoverageDeadline`. | ✅ No migration, dependency or new type; one route on the existing model. Nothing in "Complexity Tracking". |
| **III. Accessibility and UX** | Keyboard dialog, labels, tied errors, announced confirmation, 320 px. | ✅ R8; dialog added to the 004 axe 320 px test. |
| **IV. Security and data** | Server-side validation of all fields (DTO + per-status rule); reason excluded from traces. | ✅ R1 to R3; no new data collected. |
| **V. Integrity and audit** | Transition defined (`UPDATE`, status unchanged), optimistic version, audit `COVERAGE_MANAGED`, history `UPDATED`, refusals logged. | ✅ R1, R6, R7; conflicts refused with no write. |

No violation: "Complexity Tracking" not applicable.

## Project Structure

### Documentation (this feature)

```text
specs/006-modification-affectation/
├── plan.md
├── research.md          # R1 to R9
├── data-model.md        # changed fields, per-status rule, event, audit
├── quickstart.md        # validation scenarios
├── contracts/
│   ├── rest-api.md      # PATCH /api/coverage/:id; detail: modifiableFields
│   └── ui.md            # « Modifier » button, dialog, history, notification
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/common/errors.ts                          # (NOT_AVAILABLE with a message naming the conflict: message supplied at the call)
├── src/coverage/
│   ├── domain/coverage-state-machine.ts          # admin UPDATE rule
│   ├── domain/coverage-modification.ts           # modifiableFields(status) (new)
│   ├── domain/coverage-reminders.ts              # UPDATE on an assigned or in-progress assignment
│   ├── coverage.dto.ts                           # UpdateCoverageDto
│   ├── coverage.controller.ts                    # PATCH :id
│   ├── coverage.service.ts                       # updateCoverage; historyOf: className
│   └── coverage.mapper.ts                        # detail: modifiableFields
└── test/
    ├── unit/                                     # domain
    └── integration/supervision-update.spec.ts    # new

frontend/
├── src/features/coverage/
│   ├── api.ts                                    # useUpdateCoverage
│   ├── types.ts                                  # modifiableFields
│   ├── EditCoverageDialog.tsx                    # new
│   ├── CoverageDetailPage.tsx                    # « Modifier » button, history text
│   └── labels.tsx                                # labels
├── src/features/notifications/api.ts             # COVERAGE_UPDATED label
└── tests/coverage/edit-coverage.test.tsx         # new

e2e/
├── coverage-class.spec.ts                        # edit flow
└── a11y-responsive.spec.ts                       # dialog at 320 px
```

**Structure Decision**: existing monorepo; everything belongs to the `coverage` module (backend and
frontend), with no new domain folder.

## Complexity Tracking

Not applicable: no constitution violation.
