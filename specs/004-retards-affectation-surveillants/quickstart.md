# Quickstart — validation of 004

End-to-end verification guide. Model: [data-model.md](./data-model.md); API:
[contracts/rest-api.md](./contracts/rest-api.md); migration:
[contracts/migration.md](./contracts/migration.md).

## Prerequisites

- Node.js 24, dependencies installed (`npm ci` at the root).
- Development database: `npm run db:dev -w backend`, then `npm run prisma:deploy -w backend`
  and `npm run prisma:seed -w backend`.
- `SCHOOL_TIMEZONE` set (default `Europe/Paris`).
- Seed accounts: `superadmin`, **`admin`** (formerly `responsable`), `enseignante` (Enseignants
  group), `surveillant` and a second supervisor (Surveillants group, different floors),
  `reprographie` (no access to the module). Floors "1er étage" (1st floor) and "2e étage"
  (2nd floor); classes linked.
- Launch: `start.bat` (API on 3002 + interface).

## Automated tests

```text
npm test -w backend                    # unit (state machine, main status, due dates, time zone)
npm run test:integration -w backend    # journeys, rights, migration 0008/0009 + down, jobs, anonymization
npm test -w frontend                   # screens, accessibility, enum synchronization
npx playwright test -c e2e/playwright.config.ts   # 3 journeys at 360, 768 and 1280 px
```

Expected: all green, including the existing tests that were adapted (broadcast removed).

## Manual scenarios

| # | Journey | Steps | Expected |
| --- | --- | --- | --- |
| 1 | Teacher request (US1) | `enseignante` reports lateness tomorrow 08:00–09:00, 1st-floor class, reason "RDV médical" (medical appointment) | "en attente" (pending); `admin` notified; reminder scheduled at 07:00 |
| 2 | Assignment | `admin` opens the request; candidates: 1st-floor supervisors first, unavailable ones marked | assignment → "assignée" (assigned); `surveillant` notified; `enseignante` notified; the supervisor does **not** see the reason |
| 3 | Short notice | request for today in 30 min, do nothing for 2 min, then 5 min | URGENT alert to `admin`, then escalation to `superadmin`; request at the top of the list |
| 4 | Empty class (US2) | `surveillant` reports an empty class without a teacher | immediately "en cours" (in progress); highlighted alert for `admin` (visual, sound optional) |
| 5 | Duplicate | second supervisor reports the same class | attached as backup; `admin` decides; reminders every 10 min, 3 at most, then `superadmin` |
| 6 | Direct assignment (US3) | `admin` creates an assignment with a supervisor who is already busy | refusal "non disponible" (not available); with an available one: "assignée" |
| 7 | Reassignment in progress | `admin` reassigns the assignment from scenario 4 | handover assigned; the former supervisor is released only when the new one is present |
| 8 | Unfilled | request never assigned, time slot end passed | "non pourvue" (unfilled); counted separately in the statistics |
| 9 | Rights | `reprographie` opens `/gardes`; `surveillant` tries `ASSIGN` through the API | nothing visible; `404`/`403` logged |
| 10 | Role | `admin` logs in | label "Admin"; super administrator area labeled "Administrateur"; workflow B and categories unchanged |
| 11 | Statistics (US5) | `admin` opens the month's statistics | lateness by teacher/class, average duration, unfilled rate, cancelled and "non tranchés" (undecided) shown separately |

## Migration (pre-production)

1. Copy of the production database into pre-production.
2. `npm run preflight:supervision -w backend` → report; validations V1–V3 recorded.
3. Deployment (`deploy/deploy.sh`): backup, `0008`, `0009`.
4. Checks: `BROADCAST` guard duties now "en attente" for the admin; old finished guard duties
   shown "terminée" (done) with a badge; no history event disappeared (`RequestEvent` count
   before/after: only additions).
5. Dry-run rollback: `0009/down.sql`, `0008/down.sql`, check of the initial state.
