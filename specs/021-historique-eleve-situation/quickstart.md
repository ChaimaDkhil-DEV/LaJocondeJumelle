# Quickstart: validating student class history and situation

Run on the local development database only (`localhost:5433`, see `CLAUDE.md`). Never on production.

## Prerequisites

- `npm install` done; local database running; demo data loaded with `npm run db:seed:demo` (it provides pupils,
  classes, a timetable and attendance for the current week).
- Migration applied: `npm exec -w backend -- prisma migrate dev --name student_class_history`, then
  `npm exec -w backend -- prisma migrate status` must say "Database schema is up to date!". If Prisma offers a
  reset, refuse and report the drift.

## Test plan (written first, one group per story)

| Story | Test | Level |
|---|---|---|
| US1 | Create a pupil, move A → B → C: three rows, continuous, with authors; a phone change adds none | integration |
| US1 | CSV import of N pupils: N rows; import failure writes none | integration |
| US1 | Migration backfill: one `reconstructed` row per existing pupil; invariant over the whole database | integration (`migration-0032`) |
| US1 | `UPDATE`/`DELETE`/`TRUNCATE` on the history is refused | integration (add to `append-only.spec.ts`) |
| US1 | Audit entry shows before/after `classId`, never `parentPhone` | integration |
| US2 | `buildSituation` for the eight scenarios (on time, substitute, late arrival, supervisor window, no session, probable, before creation, cancelled) | unit, pure function |
| US2 | Same scenarios through the route with real rows | integration |
| US3 | Room change and a next-day arrival correction appear with `madeAfterMoment`; two substitute changes list both | integration |
| US4 | Teacher, supervisor, parent: 404, denial logged; unknown id: 404; future or malformed `at`: 422; consultation creates one audit entry | integration (+ `admin-routes-access`, `idor-matrix`) |
| All | History drawer: choose date and time, read sections, print; keyboard only; 320 px; axe finds no violation | Vitest + Playwright (`e2e/student-situation.spec.ts`) |

## Manual scenario (after implementation)

1. Sign in as an administrator, open **Élèves**, open a pupil's history. Expect one current class.
2. Change the pupil's class; reopen the history. Expect two rows, the old one ended at the change time, your name
   on the new one.
3. Pick a teacher with a session today (Emplois du temps). Scan or record their arrival (Présences).
4. Open the pupil's situation at a minute inside that session. Expect: class, planned session, teacher with the
   arrival time, other sections "none".
5. Record an announced absence and a substitute for that teacher, change the substitute once, ask again. Expect
   the substitute in force and the earlier one listed.
6. Ask for a minute before the arrival: expect "no teacher had arrived yet" and the arrival under "later".
7. Ask for a moment before today's migration for a pupil enrolled earlier: expect the class marked probable
   with the warning.
8. Open **Journal** for the pupil: expect your consultations and the class change.
9. Sign in as a teacher and request the same routes: expect 403 (refusal logged, nothing about the pupil revealed).

## Commands

```text
npm run -w backend test
npm run -w backend test:integration
npm run -w frontend test
npm run test:e2e -- student-situation
npm run lint
```

Per the project memory: run lint and the audit locally before any commit; rerun only failing tests after a
pass unless code changed.

## Done when

Every test above is red first and green at the end; the manual scenario passes; `prisma migrate status` is up to
date; lint and dependency audit are clean; the docs paragraph (admin guide, retention note) is written.
