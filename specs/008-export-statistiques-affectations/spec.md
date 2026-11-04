# Feature Specification: Export des statistiques des affectations (Assignment statistics export)

**Feature Branch**: `008-export-statistiques-affectations`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Export of assignment statistics (/gardes/statistiques):
today the statistics page for supervisor assignments has no export (gap
§4.3 of docs/superadmin-fonctionnalites.md). Allow the administration to export these
statistics."

## Clarifications

### Session 2026-10-23

- Q: Must each successful export be logged in the audit log (author, date and time,
  period, grouping)? → A: **A**, yes; only for this export (the dashboard and
  shift-tracking exports remain unchanged).

## Context

- The « Statistiques des affectations » (Assignment statistics) page (Gardes › Statistiques)
  displays, for a period (« Du », « Au ») chosen in the school's time zone: the totals (delays and
  absences, delays, absences, empty classes, unfilled, unfilled rate, average duration), the
  items counted separately (cancelled, undecided duplicates) and a table grouped by teacher, by
  class or by period (week or month).
- It is restricted to admin and super administrator (statistics per teacher, spec 004
  FR-022 and FR-023). Spec 004 delivered it "without export"; exporting the statistics was
  out of scope there. This is the only remaining gap on this page (super administrator
  inventory, §4.3).
- The application already exports two other views in spreadsheet format: the request dashboard
  and the shift tracking. The files open directly in a common spreadsheet (separator,
  accents, protection against formulas).
- Need: hand these statistics to management or rework them in a spreadsheet, without
  copying them by hand.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export the displayed statistics (Priority: P1)

An admin opens « Statistiques des affectations », chooses the period and the grouping, then
clicks « Exporter en CSV » (Export as CSV). They get a file that contains exactly what the page
displays: the period, the totals, the items counted separately and the table of the chosen grouping.

**Why this priority**: this is the whole need; without it, the figures are copied by hand.

**Independent Test**: with known assignments over a period, export with the « Enseignant »
(Teacher) grouping, open the file in a spreadsheet and compare each value to the page.

**Acceptance Scenarios**:

1. **Given** an admin on the page, period from 1 to 23 October, « Enseignant » grouping,
   **When** they click « Exporter en CSV », **Then** a file is downloaded and its name
   indicates the grouping and the period (e.g. `statistiques-affectations-enseignant-2026-10-01-au-2026-10-23.csv`).
2. **Given** this file opened in a spreadsheet, **When** it is read, **Then** it contains the period
   and the school's time zone, one row per teacher with the same columns and the same values
   as the table (events, delays, absences, empty classes, unfilled, cancelled, average
   duration), then the totals for the period and the items counted separately, with the same values
   as the page.
3. **Given** the « Période » (Period) grouping by week (or by month), **When** they export, **Then**
   the file contains one row per week (or per month), with the same label as the page.
4. **Given** the « Classe » (Class) grouping, **When** they export, **Then** the file contains one
   row per class.
5. **Given** an anonymized teacher (after one school year, spec 004 FR-023a), **When** they
   export, **Then** the row carries the same anonymous label as the page, never the name.
6. **Given** accents, apostrophes or a name starting with "=", "+", "-" or "@",
   **When** the file is opened in a spreadsheet, **Then** the text is displayed identically and
   no formula runs.

---

### User Story 2 - Restricted access and page state (Priority: P1)

The export follows the same rules as the page: only admin and super administrator can
get it, and only for a valid period.

**Why this priority**: per-teacher statistics are restricted personal data
(spec 004 FR-023); an export open to other roles would be a leak.

**Independent Test**: request the export with a supervisor or teacher account, then with an
invalid period.

**Acceptance Scenarios**:

1. **Given** a user who is neither admin nor super administrator, **When** they request
   the export, even directly by its address, **Then** they are refused in the same way as the
   statistics page ("not found" response), and the denial is logged.
2. **Given** a period whose « Du » is after « Au », or longer than the page's limit,
   **When** the export is requested, **Then** it is refused with the same message as the page and no
   file is produced.
3. **Given** an incomplete date or one being typed, or a computation in progress or in error,
   **When** the page is displayed, **Then** « Exporter en CSV » is not offered.
4. **Given** a period without any assignment, **When** they export, **Then** the file contains
   the header, the period and totals at zero, with no detail row.
5. **Given** a successful export, **When** the super administrator opens the audit log, **Then**
   they find an entry « Export des statistiques des affectations » (Assignment statistics export)
   with the author, the date and time, the period and the grouping, without any statistical value
   or teacher name.

---

### Edge Cases

- Average duration not computable (no completed assignment): empty cell, like the "—" on the
  page.
- Unfilled rate: exported as a whole-number percentage, like on the page (e.g. "12 %").
- Filters changed after the last computation: the export always covers the displayed filters,
  never a previous result (no export during recomputation).
- Data modified between display and export (an assignment completed in the meantime): the
  file reflects the state at the time of the export, like reloading the page.
- 320 px screen: the button stays visible and reachable by keyboard, without horizontal scrolling
  of the page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The « Statistiques des affectations » page MUST offer an « Exporter (CSV) » action
  that downloads a statistics file for the displayed period and grouping
  (and, for « Période », the week or month granularity).
- **FR-002**: The file MUST contain: the period (« Du », « Au ») and the school's time zone; one
  row per element of the grouping, with the page table's columns in the same order and
  with the same labels; the totals for the period (the page's seven indicators); the
  items counted separately (cancelled, undecided duplicates).
- **FR-003**: Each exported value MUST be identical to the one displayed by the page for the
  same filters at the same time (same computation rules, same time zone, same labels, including the
  label of anonymized teachers and of assignments without a teacher).
- **FR-004**: The file MUST follow the format of the application's existing exports: direct
  opening in a common spreadsheet, accents preserved, and neutralization of values that could
  be interpreted as formulas.
- **FR-005**: The file name MUST indicate the grouping and the period.
- **FR-006**: The export MUST be restricted to admin and super administrator, with the same
  server-side check as the statistics page; any other user MUST receive the
  same response as for the page ("not found") and the denial MUST be logged.
- **FR-007**: The export MUST apply the same period checks as the page (« Du » no later
  than « Au », maximum length) and refuse an invalid request with the same message.
- **FR-008**: The export action MUST be offered only when the statistics for the displayed
  filters are computed and displayed (not while an incomplete date is being typed, nor during a
  computation, nor after an error).
- **FR-009**: Each successful export MUST be recorded in the non-modifiable audit log: author,
  date and time, period (« Du », « Au »), grouping and, for « Période », the granularity;
  without any statistical value or teacher name. The entry MUST be viewable in the
  administration's audit log with an explicit label (e.g. « Export des
  statistiques des affectations »). A refused export (FR-006, FR-007) is not recorded as a
  successful export. The dashboard and shift-tracking exports do not change.
- **FR-010**: The action MUST respect the project's accessibility rules (explicit label,
  reachable and activable by keyboard, visible focus) and remain usable at 320 px.

### Key Entities *(include if feature involves data)*

- **Statistics export**: file produced on demand, not kept by the application;
  contains the period, the grouping, the table rows, the totals and the items counted
  separately. No new data: it reuses the page's statistics (spec 004, FR-022).
- **"Statistics export" audit entry**: new action of the existing audit log;
  author, date and time, period, grouping (and granularity); no statistical data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin gets the file of the displayed statistics in 1 action from the page.
- **SC-002**: 100% of the file's values (rows, totals, items counted separately) are identical to
  those of the page for the same filters, for each of the three groupings and the two
  period granularities.
- **SC-003**: The file opens in a common spreadsheet without manipulation (columns separated,
  accents correct) and no value runs there as a formula.
- **SC-004**: 0 exports obtained by a user who is neither admin nor super administrator; 100%
  of refused attempts and 100% of successful exports are logged.
- **SC-005**: No accessibility violation detected by the automated audit on the statistics
  page with the export action, at 320 px and on desktop.

## Assumptions

- Same audience as the page: admin and super administrator (spec 004 FR-022, FR-023); no
  new role or setting. The audit log remains viewable by the super administrator
  only, as today.
- CSV format only, like the two existing exports; no PDF or native spreadsheet workbook.
  Printing the page remains the browser's.
- One file exports the displayed view (one grouping); no combined export of the three
  groupings nor detailed list of assignments (the shift tracking already exports it).
- No new computation rule: the export reuses the page's statistics as is.
- The file is not kept by the application; keeping it is up to whoever
  downloads it. The exported data is what the same user can already see
  (minimization: no more columns than the page, no detailed reason).
