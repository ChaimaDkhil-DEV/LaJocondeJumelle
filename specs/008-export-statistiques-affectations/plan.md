# Implementation Plan: Export des statistiques des affectations (Assignment statistics export)

**Branch**: `008-export-statistiques-affectations` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-export-statistiques-affectations/spec.md`

## Summary

An « Exporter en CSV » (Export as CSV) button on `/gardes/statistiques`, shown when the statistics
for the displayed filters have been computed. New route `GET /api/coverage/stats/export.csv`: reuses
`CoverageStatsService.stats` (access, period, computation), formats the result with the page's
display rules and `toCsv`, then logs the export (`COVERAGE_STATS_EXPORTED`, new enumeration value,
migration `0010`). Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6 (backend); React 19, MUI 7, TanStack Query
(frontend) — existing stack, no dependency added

**Storage**: PostgreSQL 17 — one value added to the `AuditAction` enumeration (migration
`0010_audit_coverage_stats_export`, with `down.sql`); no table or column

**Testing**: Jest (unit; integration with embedded PostgreSQL), Vitest + Testing Library,
Playwright + axe

**Target Platform**: recent browsers (desktop and mobile), Linux server (Docker)

**Project Type**: web application (monorepo `backend/` + `frontend/`)

**Performance Goals**: same cost as displaying the statistics (one on-demand computation, 400 days
at most) plus one audit write

**Constraints**: values identical to the page (FR-003); WCAG 2.2 AA, 320 px; admin and super
administrator access, checked server-side; no statistical data or name in the audit

**Scale/Scope**: 1 route, 1 formatting function, 1 audit value, 1 button, 1 label

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Before design | After design |
|-----------|---------------|--------------|
| **I. Tests first** | Each scenario has its red test before the code (R7). | ✅ Unit (formatting), integration (file = JSON, access, period, audit), UI (button, label), e2e (download, 320 px). |
| **II. Simplicity / YAGNI** | Existing computation reused; existing CSV format (`toCsv`). | ✅ One route, one pure function; no generation in the browser and no second format (R1); simple link without its own error handling (R6). |
| **III. Accessibility and UX** | Explicit button, keyboard, 320 px; no export of old filters. | ✅ Same component as the shift-tracking export; V18 extended to the screen with the button. |
| **IV. Security and data** | Access checked server-side (existing check in `stats`); parameters validated (`CoverageStatsQuery`); formulas neutralized. | ✅ No more columns than the page; file name derived from validated values; `Cache-Control: private, no-store`. |
| **V. Integrity and audit** | Denial logged (existing); successful export logged (clarification A). | ✅ `COVERAGE_STATS_EXPORTED`, details limited to the period and grouping; `down.sql` refuses to remove a value already in use. |

No violation: "Complexity Tracking" not applicable.

## Project Structure

### Documentation (this feature)

```text
specs/008-export-statistiques-affectations/
├── plan.md
├── research.md          # R1 to R7
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md      # GET /api/coverage/stats/export.csv
│   └── ui.md            # « Exporter en CSV » button, audit log label
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/schema.prisma                                  # AuditAction: COVERAGE_STATS_EXPORTED
├── prisma/migrations/0010_audit_coverage_stats_export/   # migration.sql + down.sql (new)
├── src/audit/audit.service.ts                            # ALLOWED_DETAIL_KEYS: from, to, groupBy, period
├── src/coverage/domain/coverage-stats-csv.ts             # statsToCsvRows, file name (new)
├── src/coverage/coverage-stats.service.ts                # exportCsv: stats → CSV → audit
├── src/coverage/coverage.controller.ts                   # GET stats/export.csv
├── test/unit/coverage-stats-csv.spec.ts                  # new
└── test/integration/supervision-stats-export.spec.ts     # new

frontend/
├── src/features/coverage/CoverageStatsPage.tsx    # « Exporter en CSV » button
├── src/features/admin/labels.ts                   # COVERAGE_STATS_EXPORTED label
├── tests/coverage/stats.test.tsx                  # button: presence, address, states
└── tests/admin/role-labels.test.tsx               # action label

e2e/
├── coverage-stats-export.spec.ts                  # download and log (new)
└── a11y-responsive.spec.ts                        # statistics at 320 px with the button

docs/superadmin-fonctionnalites.md                 # §2.2 and §4.3: export delivered
```

**Structure Decision**: existing monorepo; `coverage` module (server and UI), existing audit log.

## Complexity Tracking

Not applicable: no constitution violation.
