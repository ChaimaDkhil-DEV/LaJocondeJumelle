# Quickstart: validate feature 013

## Prerequisites

- Local database (`npm run -w backend db:dev`, port 5433). No migration in this feature.
- Accounts from the test seed: `surveillant`, `admin`, `superadmin`, `enseignante`.
- Camera tests on a phone need HTTPS: use the online demo (`demo-en-ligne.bat`) or the production server.

## Automated checks

```text
npm run lint
npm run -w frontend typecheck
npm run -w frontend test
npm audit --audit-level=high
npx playwright test -c e2e/playwright.config.ts empty-class-qr attendance-qr coverage-class --project=chromium
```

(No backend file changes: backend suites run in the pull request's CI.)

## Manual scenarios

1. As `surveillant`, « Surveillance » → « Déclarer une classe vide »: the first action is « Scanner le QR code de
   la classe », the form is below ([contracts/ui.md](contracts/ui.md)).
2. On a phone (HTTPS): tap the scan button → the camera opens in the page, no other app. Point at a printed class
   QR code → the window closes, « Déclaration de la classe… », then the result naming the class.
3. As `admin`: the assignment appears in « Surveillance › Suivi des interventions › Prise en charge » with a QR
   presence in its history; an urgent notification was received.
4. Refuse camera access: the window says so; paste the QR link → same result as a scan.
5. Paste a revoked QR link (revoke it first in « Administrateur › Classes »): no declaration, the message asks
   for the current QR code.
6. Keep the camera on the QR code after the read: only one declaration (check « Suivi des interventions »).
7. Open a class QR link with the phone's own camera app: the class page asks for the « Déclarer cette classe
   vide » click; nothing is declared before.
8. As `enseignante`: no « Déclarer une classe vide » button (unchanged).
