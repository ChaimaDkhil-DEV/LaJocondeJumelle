# Quickstart — validate 020 Teacher timetables

## Prerequisites

- Local database on `localhost:5433` (`deploy/docker-compose.dev.yml`), `backend/.env` as for previous features.
- Migration applied: `npm exec -w backend -- prisma migrate dev --name timetable` (creates `0031_timetable`), then
  `npm exec -w backend -- prisma migrate status` → "Database schema is up to date!". Check that no drift is
  reported for the exclusion constraints (research R3).
- Demo data: `npm run -w backend db:seed:demo` (teachers, classes, levels, admin accounts).
- App: `PORT=3002 npm run dev` (shell has `PORT=3000`; see memory note on orphan processes).

## Automated checks

| Command | Covers |
|---|---|
| `npm run -w backend test -- session-status timetable` | status rules at the minute (R5), series generation, date/time validation |
| `npm run -w backend test:integration -- timetable expected-teachers` | rights and 404 + audit of denials, conflicts incl. two concurrent writes, locked sessions, audit entries, expected list against real attendance rows |
| `npm run -w frontend test -- timetable attendance/expected surveillance-tabs` | admin page, teacher views, expected tab (filters in URL, counts, text statuses, live refetch) |
| `npm run test:e2e -- timetable` | journey below + axe on the three new screens at 320 px |
| `npm run lint` and `npm audit --audit-level=high` | before any commit (memory: full CI locally) |

## Manual journey (matches the E2E)

1. **Admin** → `/admin/emplois-du-temps`: create a weekly series for a teacher today's weekday, starting
   15 minutes ago, 1 hour long, over 4 weeks → 4 sessions (today's included).
2. Create a second series for the same teacher overlapping it → refused, conflict listed with date and time.
   Same for the same class with another teacher.
3. Create a single session for another teacher starting 2 minutes ago.
4. **Surveillance → Attendus** (`/gardes?onglet=attendus`): first teacher **Non arrivé** (tolerance 10, started 15
   min ago); second teacher **Attendu**. Indicators: expected 2, not arrived 1.
5. **Teacher 1** scans a class QR (`/gardes/presence?...`) → arrival recorded as today; the page also shows
   the session in progress. Without reloading, the admin tab shows **En retard (15 min)** within a minute.
6. **Supervisor** declares teacher 2's class empty by QR → teacher 2 shows **En retard** (class declared empty)
   before the tolerance ends.
7. Admin cancels next week's session of teacher 1 with a reason → the teacher sees it "Séance annulée" in the
   week view; admin list for that day shows **Séance annulée**, never **Non arrivé**.
8. **Teacher 1** → `/emploi-du-temps`: day and week views, own sessions only. Try `/api/timetable/mine?teacherId=…`
   → 400 (unknown parameter). A supervisor opening `/emploi-du-temps` or `/api/timetable/sessions` → not found,
   `ACCESS_DENIED` in the audit log.
9. **Journal**: `TIMETABLE_CHANGED` entries for each creation, change and cancellation with before/after.

## Expected outcome

All steps behave as described; existing suites (`attendance`, `teacher-presence`, `surveillance`,
`attendance-qr`) still pass unchanged (SC-007).
