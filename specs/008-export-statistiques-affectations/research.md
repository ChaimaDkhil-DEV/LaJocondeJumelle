# Research: Export des statistiques des affectations (Assignment statistics export)

Findings on the existing code (23/10/2026) and design decisions.

## R1 — Export produced by the server

- **Decision**: new route `GET /api/coverage/stats/export.csv`, same parameters as
  `GET /api/coverage/stats`. The service reuses `CoverageStatsService.stats` (same access
  check, same period checks, same computation), then formats the result with
  `toCsv` (`backend/src/common/csv.ts`).
- **Why**: logging every successful export (FR-009, clarification A) and the access check
  (FR-006) happen server-side; the two existing exports (dashboard, shift tracking) already
  follow this model (`@Get('export.csv')`, `toCsv`: ";" separator, UTF-8 with BOM, CRLF,
  formulas neutralized), which covers FR-004 with no new code.
- **Alternatives rejected**: file built in the browser from the data already loaded (identical
  values by construction, but a second call would be needed to log, with no guarantee that the
  export actually took place, and a second CSV format to maintain on the UI side); a
  `format=csv` parameter on `GET /api/coverage/stats` (mixes JSON and file on one route; the
  existing test rejects this parameter, R6).

## R2 — Values identical to the page (FR-003, SC-002)

- **Decision**: a pure function `statsToCsvRows` (domain, `backend/src/coverage/domain/`)
  turns the result of `computeCoverageStats` into rows, with the same display rules as the page:
  - average duration: same rule as `formatDuration` (`frontend/src/features/coverage/labels.tsx`) —
    « 45 min », « 1 h », « 1 h 05 »; empty cell when it cannot be computed (« — » on the page);
  - unfilled rate: `Math.round(rate * 100)` followed by « % », like `percent` in
    `CoverageStatsPage.tsx`;
  - row labels: those returned by `computeCoverageStats` (« Enseignant anonymisé » (Anonymized
    teacher), « Enseignant non précisé » (Unspecified teacher), « Semaine du JJ/MM/AAAA » (Week of
    DD/MM/YYYY), months spelled out), with no reprocessing.
- **Why**: the computation is already done once server-side; only the formatting is duplicated,
  and it is short and pinned by unit tests that reuse the `formatDuration` cases (R7).
- **Alternative rejected**: exporting raw minutes and the decimal rate (more convenient in a
  spreadsheet, but contrary to FR-003: values identical to the page).

## R3 — File layout

- **Decision**: a single table, readable in a spreadsheet, fixed columns:

  1. header row: grouping label (« Enseignant », « Classe » or « Période »), then
     « Événements », « Retards », « Absences », « Classes vides », « Non pourvues », « Annulées »,
     « Durée moyenne » (same labels and same order as the page's table);
  2. one row per element, in the page's order;
  3. a « Total de la période » row with the same columns;
  4. an empty line, then « label ; value » lines: « Du », « Au », « Fuseau »,
     « Regroupement » (and « Période »: « Semaine » or « Mois »), « Taux de non pourvue »,
     « Doublons non tranchés (comptés une fois) ».

  The seven indicators of the page's totals are all present: « Retards et absences » is the
  « Événements » column of the total row, the rate and the duplicates are in the final block;
  « Annulées » appears in the total row.
- **Why**: the table starts at A1 (direct filtering and sorting in a spreadsheet); the final
  block gives the context without shifting the columns.
- **Alternative rejected**: context block at the top of the file (the table no longer starts at
  A1); three separate files (several downloads for a single action, SC-001).

## R4 — File name (FR-005)

- **Decision**: `statistiques-affectations-<regroupement>-<du>-au-<au>.csv`, with
  `<regroupement>` among `enseignant`, `classe`, `semaine`, `mois` (the granularity replaces
  "period"). The three headers (`Content-Type`, `Content-Disposition: attachment;
  filename="…"`, `Cache-Control: private, no-store`, same values as the existing exports) are
  set by the controller (`@Res({ passthrough: true })`) **after** the file is produced.
  Found during implementation (T013): `@Header` sets them before the call, and a denial or an
  invalid period then went out as JSON labeled `text/csv` (see `docs/validation/verification-008.md`).
- **Why**: only safe ASCII characters (validated `AAAA-MM-JJ` dates, grouping taken from a closed
  list): no `filename*` encoding needed.

## R5 — Logging (FR-009, clarification A)

- **Decision**: new value `COVERAGE_STATS_EXPORTED` of the `AuditAction` enumeration
  (migration `0010_audit_coverage_stats_export`), written by `AuditService.log` after the
  file is produced: `actorId`, `ip`, `targetType: 'Request'`,
  `targetId: 'coverage-stats'` (like the existing denial), `details`:
  `{ from, to, groupBy, period }` (`period` only for the « Période » grouping).
  Keys `from`, `to`, `groupBy`, `period` added to `ALLOWED_DETAIL_KEYS`
  (`backend/src/audit/audit.service.ts`); no statistical value, no name.
  Label « Export des statistiques des affectations » in `frontend/src/features/admin/labels.ts`
  (audit log filter and list).
- **Denials**: unchanged — `ACCESS_DENIED` (reason `NOT_COVERAGE_ADMIN`, export route) by the
  existing check in `stats`; an invalid period (`INVALID_RANGE`, `400`) writes nothing.
- **Migration**: enumeration value addition only (like `0007`, `0008`). `down.sql` modeled on
  `0008_supervision_schema/down.sql`: stops if a `COVERAGE_STATS_EXPORTED` entry
  exists (the audit log is not rewritten: restore the backup), otherwise recreates the
  enumeration without the value and removes the Prisma tracking row.
- **Alternative rejected**: reusing an existing action (`COVERAGE_MANAGED`) with an "export"
  detail (misleading audit log filter, wrong label).

## R6 — UI (FR-001, FR-008, FR-010)

- **Decision**: link-button « Exporter en CSV » (`Button component="a" href=… download`, `Download`
  icon, like `CoverageDashboardPage.tsx:146`) in the results header, shown
  only when `stats.data` matches the displayed filters (`!stats.isPlaceholderData`, complete
  dates, no error). The address reuses exactly the parameters of the displayed request.
- **Why**: same behavior as the shift-tracking export; a link is reachable and
  activable by keyboard with no code; hiding it during recomputation (`keepPreviousData`) avoids
  exporting old filters.
- **Errors**: the button only appears if the same request has just succeeded; a late denial
  (expired session) returns the server's JSON response, like the two existing exports.
  Accepted (YAGNI).

## R7 — Tests (principle I)

- **Unit** (`backend/test/unit/coverage-stats-csv.spec.ts`, new): `statsToCsvRows`
  for the three groupings and the two granularities; durations (`null`, < 60, exact hour,
  hour and minutes); rounded rate; anonymized / unspecified labels; empty period.
- **Integration** (`backend/test/integration/supervision-stats-export.spec.ts`, new):
  downloaded file (headers, name), values equal to `GET /api/coverage/stats` for the same
  parameters (SC-002), neutralized formula, BOM, `surveillant`/`enseignante` denial (404
  logged), `INVALID_RANGE` without an export entry, `COVERAGE_STATS_EXPORTED` entry with its
  details and without statistical value.
- **Existing test**: `supervision-stats.spec.ts` « période par défaut ; paramètres invalides
  refusés ; aucun export » (default period; invalid parameters rejected; no export) keeps its
  expectations (`format=csv` → `400`, `/api/coverage/stats/export` → `404`, still true); only its
  title loses "aucun export" (exception recorded in the verification).
- **UI** (`frontend/tests/coverage/stats.test.tsx`): button present with the right address
  after the computation, absent during an incomplete date, a recomputation or an error; action
  label in `frontend/tests/admin/role-labels.test.tsx` (which already covers the audit labels).
- **E2E**: `e2e/a11y-responsive.spec.ts` (statistics screen at 320 px: button visible, axe);
  `e2e/coverage-stats-export.spec.ts` (new, Chromium): download
  (`page.waitForEvent('download')`), file name, first line, audit log entry.
