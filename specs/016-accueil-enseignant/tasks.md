# Tasks: 016 — Teacher home page (Accueil de l'enseignant)

Tests first for each task (constitution principle I).

## Two business priorities

- [x] T001 Migration test `backend/test/integration/migration-0024.spec.ts` (conversion, history, audit, rollback, re-apply)
- [x] T002 `Priority` enum reduced to `NORMAL`, `URGENT`; migration `0024_two_priorities` and its `down.sql`
- [x] T003 Server rules: default deadlines, deadline rules DTO (one rule per priority), AI suggestions (demo, Claude schema, sanitizer), assist token, dashboard « par priorité » and CSV labels
- [x] T004 Seeds and demo data (`seed.ts`, `seed-demo`, `seed-volume`, `demo/lib/seed.ts`, guideline texts)
- [x] T005 Interface: `Priority` type, `PriorityBadge` (labels, styles, legacy labels for history), request form, priority dialog, filters (retired values ignored in the address), dashboard filters and colours, deadline rules table, guideline hints
- [x] T006 Outbox: entries saved offline before 016 converted when read

## Teacher home

- [x] T010 Tracking groups `backend/src/requests/domain/tracking.ts` (unit test)
- [x] T011 `GET /api/requests/tracking` and `tracking=` filter on `GET /api/requests` (integration test)
- [x] T012 `TeacherHomePage`: scan button (existing `QrScannerDialog`), urgent / normal request buttons, « Suivi de mes demandes »
- [x] T013 `TrackingListPage` (`/demandes/suivi/:groupe`), reusing `RequestRows` extracted from `RequestListPage`
- [x] T014 Home routing (`hasTeacherHome`) and « Accueil » navigation entry
- [x] T015 Create page: `?priorite=` preset, title and badge restating the priority, back to the home page
- [x] T016 English translations
- [x] T017 E2E `e2e/teacher-home.spec.ts`; existing e2e updated (teacher home heading, priorities)
