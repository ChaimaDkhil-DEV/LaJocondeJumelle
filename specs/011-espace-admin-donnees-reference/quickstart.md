# Quickstart: validate feature 011

## Prerequisites

- Local database running (`localhost:5433`, see `backend/.env`), migrations applied (the
  `SessionStart` hook does it). No new migration in this feature.
- Demo accounts from the test seed: `superadmin`, `admin`, `surveillant`, `enseignante`.

## Automated checks (same order as CI « Contrôles qualité »)

```text
npm run lint
npm run -w backend typecheck
npm run -w frontend typecheck
npm run -w backend test
npm run -w backend test:integration
npm run -w frontend test
npm audit --audit-level=high
```

Feature-focused runs:

```text
npm run -w backend test -- authorization
npm run -w backend test:integration -- admin-routes-access admin-employees admin-floors admin-levels csv-imports coverage
npm run -w frontend test -- tests/admin
npx playwright test -c e2e/playwright.config.ts us8-admin admin-reference-admin
```

Expected: all green. `admin-routes-access` shows `admin` allowed exactly on the routes of
[contracts/http-api.md](contracts/http-api.md) and refused everywhere else.

## Manual scenarios

1. Sign in as `admin`. The menu shows « Administrateur »; `/admin` opens « Étages »; the tabs are
   Étages, Niveaux, Classes, Élèves, Employés ([contracts/ui.md](contracts/ui.md)).
2. Create a floor, a level, a class on that floor, a student in that class; import a 2-line student
   CSV in check mode, then for real. Each action succeeds.
3. On « Classes », print a class QR code, revoke it; scanning the old QR as `surveillant` is refused.
4. Open « Employés »: six columns, no action button; resize to 320 px: cards, no horizontal scroll.
5. Type `/admin/comptes`, `/admin/journal`, `/admin/suivi`: « Accès réservé au super administrateur. ».
6. Sign in as `superadmin`, open « Journal d'audit »: the changes of steps 2–3 have `admin` as author;
   the refusals of `admin` on reserved API routes appear as « Accès refusé ».
7. Sign in as `enseignante`: no « Administrateur » entry; `/admin/etages` shows « Accès réservé à
   l'administration. ».
8. As `superadmin`, demote `admin` to employee while her session is open: her next save on
   « Étages » is refused.
