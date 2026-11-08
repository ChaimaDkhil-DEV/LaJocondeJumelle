# Quickstart: validate feature 012

## Prerequisites

- Local database running (`npm run -w backend db:dev`, port 5433). No migration in this feature.
- Accounts from the test seed: `admin`, `superadmin`, `enseignante`, `surveillant`.

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
npm run -w frontend test -- tests/coverage tests/attendance tests/app tests/i18n
npx playwright test -c e2e/playwright.config.ts surveillance coverage-class attendance-qr a11y-responsive --project=chromium
```

## Manual scenarios

1. As `admin`: the menu reads « Surveillance »; the page title too; tabs « Absences et retards »,
   « Affectation des surveillants », « Suivi des interventions » ([contracts/ui.md](contracts/ui.md)).
2. « Absences et retards »: clock-ins, announced lateness and absences, state of the classes — as the former
   « Présences ».
3. « Affectation des surveillants »: « Nouvelle affectation », « À assigner » (same order as before),
   « Doublons possibles », « Équipe ».
4. « Suivi des interventions »: switch the three filters; reload: same tab and filter.
5. Open `/gardes?onglet=terminees`: lands on « Suivi des interventions », filter « Terminée »; the address
   now reads `onglet=suivi&filtre=terminee`.
6. As `enseignante` and `surveillant`: same tabs and buttons as before, title « Surveillance ».
7. Scan (or open) a printed class QR link `/gardes/presence?c=…`: the presence page opens.
8. English interface: « Supervision ». 320 px: no horizontal scroll.
