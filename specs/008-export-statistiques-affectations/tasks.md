---

description: "Task list for feature 008 — assignment statistics export"
---

# Tasks: Export des statistiques des affectations (Assignment statistics export)

**Input**: Design documents from `/specs/008-export-statistiques-affectations/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY — constitution, principle I (non-negotiable TDD). Each test task
placed before an implementation MUST be written and observed **red** before coding. Any existing
expectation that is modified is recorded in `docs/validation/verification-008.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an unfinished task)
- **[Story]**: US1 (export the displayed statistics, P1), US2 (restricted access, page state and log, P1)

---

## Phase 1: Setup

- [X] T001 On `008-export-statistiques-affectations`, record the starting state (reference to the final verification of 007 and to the green CI of `master` on `85ce9c5` if no code file has changed since, apart from `.github/workflows/ci.yml`) in a new `docs/validation/verification-008.md`, section « État initial » (Initial state)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: audit action `COVERAGE_STATS_EXPORTED` (enumeration, migration, allowed details, label)

**⚠️ CRITICAL**: no story starts before this phase is finished

- [X] T002 In `backend/prisma/schema.prisma`, add `COVERAGE_STATS_EXPORTED` to `enum AuditAction` (after `COVERAGE_MERGE_DECIDED`, under a comment « // Statistiques des affectations (008) »); create the migration **on the development database only**, per `CLAUDE.md`, in `backend/prisma/migrations/0010_audit_coverage_stats_export/migration.sql` (written in one go: comment header modeled on `0007_audit_request_actions/migration.sql`, then `ALTER TYPE "AuditAction" ADD VALUE 'COVERAGE_STATS_EXPORTED';`); refuse any "reset" proposal; `npm exec -w backend -- prisma migrate status` → "Database schema is up to date!"; Prisma client regenerated
- [X] T003 New `backend/prisma/migrations/0010_audit_coverage_stats_export/down.sql` modeled on `0008_supervision_schema/down.sql`: transaction; stop (`RAISE EXCEPTION`, message in French pointing to restoring the backup) if a row of `"AuditLog"` has `action = 'COVERAGE_STATS_EXPORTED'`; otherwise rename `"AuditAction"` to `"AuditAction_old"`, recreate `"AuditAction"` with all the values of `schema.prisma` except `COVERAGE_STATS_EXPORTED`, convert `"AuditLog"."action"`, drop the old type, remove the row `0010_audit_coverage_stats_export` from `"_prisma_migrations"`; usage in a comment (`npx prisma db execute --file … --schema prisma/schema.prisma`). Do not run it
- [X] T004 [P] In `frontend/tests/admin/role-labels.test.tsx` (red), the action `COVERAGE_STATS_EXPORTED` has the label « Export des statistiques des affectations »; then in `frontend/src/features/admin/labels.ts`, add `COVERAGE_STATS_EXPORTED` to `AUDIT_ACTION_LABELS`; test green
- [X] T005 [P] In `backend/src/audit/audit.service.ts`, add `from`, `to`, `groupBy`, `period` to `ALLOWED_DETAIL_KEYS`, under a comment « Statistiques des affectations (008) : période et regroupement exportés, jamais de valeur ni de nom »; verify with a case in `backend/test/unit/audit-sanitize.spec.ts` (red then green: `{ from, to, groupBy, period }` kept)

**Checkpoint**: the audit action exists in the database, server-side and in the log; `npm run -w backend typecheck` without errors

---

## Phase 3: User Story 1 - Export the displayed statistics (Priority: P1) 🎯 MVP

**Goal**: « Exporter en CSV » (Export as CSV) downloads a file identical to the page for the displayed period and grouping

**Independent Test**: with known assignments, export by teacher, by class, by week and by month; each value of the file equals the page (SC-002)

### Tests for User Story 1 ⚠️

- [X] T006 [P] [US1] New `backend/test/unit/coverage-stats-csv.spec.ts` (red), for `statsToCsvRows(stats)` and `statsCsvFilename(stats)` of `backend/src/coverage/domain/coverage-stats-csv.ts` (research R2 to R4, data-model "Export file"):
  - header: grouping label (« Enseignant », « Classe », « Période ») then « Événements », « Retards », « Absences », « Classes vides », « Non pourvues », « Annulées », « Durée moyenne »;
  - one row per element of `rows` in the order received, label kept as is (« Enseignant anonymisé », « Enseignant non précisé », « Semaine du 06/10/2026 », « octobre 2026 »);
  - « Total de la période » row from `totals`;
  - empty line, then « Du », « Au », « Fuseau », « Regroupement » (« Enseignant », « Classe », « Période »), « Période » (« Semaine » or « Mois », only if `groupBy = period`), « Taux de non pourvue », « Doublons non tranchés (comptés une fois) »;
  - average duration: `null` → empty cell; 45 → « 45 min »; 60 → « 1 h »; 65 → « 1 h 05 »; 125 → « 2 h 05 » (same cases as `formatDuration` of `frontend/src/features/coverage/labels.tsx`);
  - rate: 0.166 → « 17 % »; 0 → « 0 % » (like `percent` in `CoverageStatsPage.tsx`);
  - empty period (`rows = []`): header, total row at zero, context block;
  - name: `statistiques-affectations-enseignant-2026-10-01-au-2026-10-23.csv`, then `classe`, `semaine`, `mois`
- [X] T007 [P] [US1] New `backend/test/integration/supervision-stats-export.spec.ts` (red), modeled on the data and helpers of `backend/test/integration/supervision-stats.spec.ts` (contract `contracts/rest-api.md`):
  - `admin`, September, `groupBy=teacher`: `200`, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition` with `statistiques-affectations-enseignant-2026-09-01-au-2026-09-30.csv`, `Cache-Control: private, no-store`, body starting with the BOM;
  - for `teacher`, `class`, `period&period=week`, `period&period=month`: each row and the total row equal to `GET /api/coverage/stats` with the same parameters (SC-002);
  - a teacher named « =SOMME(A1) » comes out as `'=SOMME(A1)`; an anonymized teacher comes out as « Enseignant anonymisé »;
  - `superadmin` also gets the file
- [X] T008 [P] [US1] In `frontend/tests/coverage/stats.test.tsx` (red): after the computation, « Exporter en CSV » link (role `link`) with the `download` attribute and the address `/api/coverage/stats/export.csv?` followed by the same parameters as the statistics request (`from`, `to`, `groupBy`, and `period` only for « Période »); the address follows a change of grouping; empty period (`rows: []`): link present

### Implementation for User Story 1

- [X] T009 [US1] New `backend/src/coverage/domain/coverage-stats-csv.ts`: `statsToCsvRows` and `statsCsvFilename` (pure functions, header comment pointing to spec 008 FR-002 to FR-005 and to `formatDuration` on the UI side); T006 green
- [X] T010 [US1] In `backend/src/coverage/coverage-stats.service.ts`, `exportCsv(user, query, ctx)`: `const stats = await this.stats(user, query, ctx)` (access, period and computation unchanged), then `{ filename: statsCsvFilename(stats), body: toCsv(header, rows) }`; in `backend/src/coverage/coverage.controller.ts`, `@Get('stats/export.csv')` with `@Header('Content-Type', 'text/csv; charset=utf-8')`, `@Header('Cache-Control', 'private, no-store')` and `Content-Disposition: attachment; filename="…"` set via `@Res({ passthrough: true })`; update the « aucun export » ("no export") comments of the service and controller; T007 green
- [X] T011 [US1] In `frontend/src/features/coverage/CoverageStatsPage.tsx`, link-button « Exporter en CSV » (`Button component="a" href=… download`, `Download` icon from `lucide-react` with `aria-hidden`, like `CoverageDashboardPage.tsx:146`), above the totals, address built from the same `params` as the request; update the « aucun export dans ce lot » ("no export in this phase") comment (contract `contracts/ui.md`); T008 green
- [X] T012 [P] [US1] New `e2e/coverage-stats-export.spec.ts` (Chromium only, like `e2e/drafts.spec.ts`): `admin` opens `/gardes/statistiques`, clicks « Exporter en CSV »; `page.waitForEvent('download')`: name `statistiques-affectations-enseignant-<1st of the month>-au-<today>.csv` (school time zone); content: first line starting with « Enseignant;Événements;Retards » and « Total de la période » row present

**Checkpoint**: the export works for the three groupings (US1 alone deliverable; access and period already protected by the existing check in `stats`)

---

## Phase 4: User Story 2 - Restricted access, page state and log (Priority: P1)

**Goal**: export refused outside admin and super administrator or for an invalid period; button only on up-to-date statistics; each successful export recorded

**Independent Test**: request the export as `surveillant`, as `enseignante`, with a reversed period; check the log after a successful export

### Tests for User Story 2 ⚠️

- [X] T013 [P] [US2] In `backend/test/integration/supervision-stats-export.spec.ts` (red for the audit):
  - `surveillant` and `enseignante`: `404` `NOT_FOUND`, one more `ACCESS_DENIED` entry (reason `NOT_COVERAGE_ADMIN`, route `/api/coverage/stats/export.csv`), no `COVERAGE_STATS_EXPORTED` entry;
  - no session: `401`;
  - `admin`, `from=2026-09-30&to=2026-09-01`: `400` `INVALID_RANGE` (same code as `GET /api/coverage/stats`), no `COVERAGE_STATS_EXPORTED` entry; `groupBy=enseignant`: `400`;
  - successful export `groupBy=period&period=month`: exactly one `COVERAGE_STATS_EXPORTED` entry with the admin's `actorId`, `targetType: 'Request'`, `targetId: 'coverage-stats'`, `details` equal to `{ from, to, groupBy: 'period', period: 'month' }`; for `groupBy=teacher`, `details` without `period`; no teacher name or statistical value in `details`
- [X] T014 [P] [US2] In `frontend/tests/coverage/stats.test.tsx` (red): « Exporter en CSV » link absent while a date is incomplete (« Au » field cleared); absent during a recomputation after a filter change (old values still displayed, request pending); absent after an `INVALID_RANGE` error; present again once the computation of the new filters has succeeded

### Implementation for User Story 2

- [X] T015 [US2] In `CoverageStatsService.exportCsv` (`backend/src/coverage/coverage-stats.service.ts`), after the file is produced: `this.audit.log('COVERAGE_STATS_EXPORTED', { actorId: user.id, targetType: 'Request', targetId: 'coverage-stats', ip: ctx.ip, details: { from, to, groupBy, ...(groupBy === 'period' ? { period } : {}) } })` with the effective values (defaults applied) returned by `stats`; T013 green
- [X] T016 [US2] In `CoverageStatsPage.tsx`, show the link only if `complete && stats.data && !stats.isPlaceholderData && !stats.error` (research R6); T014 green, T008 still green
- [X] T017 [US2] In `e2e/coverage-stats-export.spec.ts`, after the export: `superadmin` opens Administrateur › Journal d'audit, filter « Export des statistiques des affectations »; an entry from the admin with the period and the grouping

**Checkpoint**: US1 and US2 complete (export, denial, states, log)

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T018 [P] In `backend/test/integration/supervision-stats.spec.ts`, remove « aucun export » from the title of the test « période par défaut ; paramètres invalides refusés ; aucun export » **without changing its expectations** (`format=csv` → `400`, `/api/coverage/stats/export` → `404`, still true); record this title change in `docs/validation/verification-008.md`
- [X] T019 [P] In `e2e/a11y-responsive.spec.ts`, V18 test (`mobile-320`) of the statistics screen: « Exporter en CSV » link visible, no horizontal scrolling, reached by keyboard, axe audit without violations (FR-010, SC-005)
- [X] T020 [P] Update `docs/superadmin-fonctionnalites.md`: §2.2 (detailed statistics: "CSV export" instead of "without export", route `GET /api/coverage/stats/export.csv`, logged); §4.3 remove « Statistiques des affectations (`/gardes/statistiques`) : sans export »; §2.7 (audit log): new action if the actions are listed there
- [X] T021 Run scenarios 1 to 7 of `specs/008-export-statistiques-affectations/quickstart.md` (automatic coverage and what remains to be done by hand) and record in `docs/validation/verification-008.md`
- [X] T022 Final verification: `npm run verify`, backend and frontend typecheck, `npm run test:e2e` (all profiles) with outputs kept; record the counts in `docs/validation/verification-008.md`; CI green on the last commit; pull request per `docs/procedure-fusion.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → **US1 (Phase 3)** → **US2 (Phase 4)** → **Polish (Phase 5)**
- Phase 2 blocks the stories: `COVERAGE_STATS_EXPORTED` must exist (Prisma client, typecheck) before `exportCsv`.

### User Story Dependencies

- **US1**: after phase 2.
- **US2**: extends `exportCsv` (T015 after T010) and US1's button (T016 after T011); shares `supervision-stats-export.spec.ts`, `stats.test.tsx` and `coverage-stats-export.spec.ts`: do US1 first.

### Within Each User Story

- Red tests before implementation (T006–T008 before T009–T011; T013–T014 before T015–T016).
- T013: the denial and invalid-period cases pass as of T010 (existing check in `stats`); only the export audit cases are red until T015.

### Parallel Opportunities

- Phase 2: T004 and T005 in parallel with T002–T003.
- US1: T006, T007, T008 in parallel; T012 in parallel with T011.
- US2: T013 and T014 in parallel.
- Polish: T018, T019, T020 in parallel.

---

## Parallel Example: User Story 1

```text
T006 backend/test/unit/coverage-stats-csv.spec.ts
T007 backend/test/integration/supervision-stats-export.spec.ts
T008 frontend/tests/coverage/stats.test.tsx
```

---

## Implementation Strategy

### MVP First

1. Phases 1 and 2 (T001–T005)
2. US1 (T006–T012): working export, already restricted to admin and super administrator
3. US2 (T013–T017): log and button states — required by clarification A, to be delivered with US1
4. **Stop and validate**: scenarios 1 to 6 of the quickstart

### Incremental Delivery

1. Foundation → audit action in the database and in the log
2. US1 → export identical to the page
3. US2 → verified denials, button only on up-to-date data, export recorded
4. Polish → existing test title, 320 px, documentation, final verification
