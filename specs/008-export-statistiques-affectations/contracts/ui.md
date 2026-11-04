# UI contract: statistics export

## « Statistiques des affectations » page (`/gardes/statistiques`)

- New link-button **« Exporter en CSV »** (Export as CSV; download icon, `aria-hidden`), placed
  above the totals, right-aligned on desktop, possibly full width at 320 px without horizontal
  scrolling.
- Address: `/api/coverage/stats/export.csv?` + exactly the parameters of the displayed request
  (`from`, `to`, `groupBy`, and `period` if « Période »), `download` attribute.
- Shown only when the statistics for the displayed filters are loaded:
  - absent while a date is incomplete (the request is not sent);
  - absent during a recomputation (the old values stay displayed, but cannot be exported);
  - absent after an error (`INVALID_RANGE` or other);
  - present for an empty period (the file then contains totals at zero).
- Accessibility: accessible name « Exporter en CSV », reachable and activable by keyboard, focus
  visible (existing components); axe audit without violations at 320 px and on desktop.
- Header comment of `CoverageStatsPage` (« aucun export dans ce lot », "no export in this phase")
  updated.

## Audit log (Administrateur › Journal d'audit)

- « Action » filter: new entry **« Export des statistiques des affectations »** (Assignment
  statistics export).
- Row of an entry: author, date and time, the label above, details
  `from`, `to`, `groupBy`, `period` (existing generic display of details).
