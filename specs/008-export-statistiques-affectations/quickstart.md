# Quickstart: verify the assignment statistics export

Prerequisites: local development database (`localhost:5433`) migrated up to
`0010_audit_coverage_stats_export` (`npm exec -w backend -- prisma migrate status`: "Database
schema is up to date!"); demo data with assignments over the current month; application running
(`start.bat` or `npm run dev`).

Automated: `npm run -w backend test` (unit), `npm run -w backend test:integration`,
`npm run -w frontend test`, `npx playwright test e2e/a11y-responsive.spec.ts e2e/coverage-stats-export.spec.ts`.

## Scenario 1 — Export by teacher (US1, FR-001 to FR-005, SC-001 to SC-003)

1. Logged in as `admin`, open Gardes › Statistiques; keep the default period.
2. Click « Exporter en CSV » (Export as CSV).
3. Expected: file `statistiques-affectations-enseignant-<du>-au-<au>.csv`; opened in a
   spreadsheet, columns separated, accents correct; every row, the « Total de la période » row
   (Total for the period), the rate and the duplicates equal the page.

## Scenario 2 — Class, week, month (US1 scenarios 3 and 4)

Repeat scenario 1 with « Classe », then « Période › Semaine », then « Période › Mois »:
file name and rows match the page.

## Scenario 3 — Anonymized teacher and formula (US1 scenarios 5 and 6)

With an anonymized assignment and a teacher whose name starts with "=": the file contains
« Enseignant anonymisé » (Anonymized teacher) and the name is shown as text, with no formula
executed.

## Scenario 4 — Access and invalid period (US2 scenarios 1 and 2)

1. As `surveillant`, open `/api/coverage/stats/export.csv`: "not found" response; « Accès refusé »
   (Access denied) entry in the audit log.
2. As `admin`, open `/api/coverage/stats/export.csv?from=2026-10-23&to=2026-10-01`: "invalid
   period" error, no file, no export entry.

## Scenario 5 — Page states (US2 scenarios 3 and 4)

1. Clear the « Au » date: the button disappears; put it back: it returns after the computation.
2. Choose a period without assignments: button present; file with totals at zero.

## Scenario 6 — Audit log (US2 scenario 5, FR-009)

As `superadmin`, Administrateur › Journal d'audit, filter « Export des statistiques des
affectations »: one entry per export from the previous scenarios, with the author, date, period
and grouping, without any value or name.

## Scenario 7 — Accessibility (FR-010, SC-005)

At 320 px: button visible without horizontal scrolling, reached and activated by keyboard, focus
visible.
