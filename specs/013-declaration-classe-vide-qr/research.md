# Research: Déclaration d'une classe vide par QR code (013)

No item of the Technical Context was left as NEEDS CLARIFICATION: the stack is the existing one and the
user's answers of 2026-11-08 settle the scope. Decisions come from reading
`frontend/src/features/attendance/QrScannerDialog.tsx`, `qrToken.ts`,
`frontend/src/features/coverage/EmptyClassPage.tsx`, `backend/src/coverage/coverage-declarations.service.ts`
and `backend/src/coverage/domain/qr-token.ts`.

## R1 — Reuse the in-app QR reader as is

- **Decision**: open the existing `QrScannerDialog` from the « Déclarer une classe vide » page; no change to the
  component's behaviour (only its doc comment, which says the scan opens a confirmation page, is generalised).
- **Rationale**: it already does what FR-002, FR-005 and FR-006 ask: camera inside the page
  (`getUserMedia`, `facingMode: 'environment'`, decoding with `jsqr`), clear messages when the camera is
  refused or absent, manual paste of the link or code, « Ce QR code n'est pas celui d'une classe » for other QR
  codes while scanning continues. It stops at the **first** valid class QR code (`found = true`), which gives
  one call per scanning session (FR-008, SC-004). It is in production for teachers' clock-in (« Mes
  présences »), so no new dependency (constitution II).
- **Alternatives considered**: the browser's `BarcodeDetector` (not available on Safari/iOS); a new scanning
  library (adds a dependency for no gain); a separate full-screen scanning page (more routes, same behaviour).

## R2 — Class taken from the QR token, verified by the server

- **Decision**: add `classIdFromToken(token)` next to `tokenFromScan` in
  `frontend/src/features/attendance/qrToken.ts`; it reads the class id from the token format
  `c1.<classId>.<qrVersion>.<signature>` (`backend/src/coverage/domain/qr-token.ts`). The page sends the
  existing `POST /api/coverage/empty-class` with `{ clientId, classId, teacherId: null, qrToken }`.
- **Rationale**: no extra request before the declaration (one network round trip at the door, SC-001); the
  server already checks everything: class active (`CLASS_INACTIVE`), signature and current version
  (`QR_INVALID`), class of the token equal to `classId` (`QR_CLASS_MISMATCH`), Surveillants group (FR-010). The
  client reading is a convenience, never trusted.
- **Alternatives considered**: calling `GET /api/coverage/qr?c=…` first to get the class name (an extra round
  trip, and a second place to keep in sync); a new endpoint taking only the token (server change, rejected by
  « règles serveur inchangées »).
- **Class name** for the result: looked up in the class list the page already loads (`useCoverageClasses`); if
  the class is not in the list (inactive), the server refuses anyway.

## R3 — Automatic send, idempotence, retry

- **Decision**: on `onToken`, the page closes the dialog and calls `declare.mutate` at once with the page's
  `clientId`. While sending, it shows « Déclaration de la classe… ». On success: the existing result view, with
  the class name in a heading (FR-004) and « Scanner une autre classe » next to « Déclarer une autre classe ».
  On refusal: the server message in an alert above the two choices, nothing created, the supervisor can scan
  again or use the form.
- **Rationale**: the same `clientId` is reused until a success (existing `again()` renews it), so a network
  retry or a double send returns the same declaration (server replay by `clientId`, FR-008). The dialog
  itself stops after the first read.
- **Alternatives considered**: confirm before sending (rejected by the user: automatic send).

## R4 — The phone-camera path stays unchanged

- **Decision**: no change to `PresencePage` (`/gardes/presence?c=…`) nor to its « Déclarer cette classe vide »
  link to the form; `EmptyClassPage` keeps reading `?c=` and `?classe=` for that path (class preselected, QR
  sent with the form).
- **Rationale**: FR-009; the same QR link confirms presence on an assignment.

## R5 — Tests

- Frontend (Vitest): the decoding loop needs a real camera and canvas, which jsdom does not have; the dialog
  calls the same `onToken` for a scan and for a pasted code, so the page is tested through the manual entry
  (paste a QR link → automatic send). Unit tests for `classIdFromToken`.
- The camera decoding loop itself is pre-existing code with no automated test (teachers' clock-in); it is
  checked by hand on a phone (quickstart).
- E2E (Playwright, Chromium with fake camera): the fake camera shows a test pattern, not a QR code; the e2e uses
  the paste path, like `e2e/attendance-qr.spec.ts`.
- Existing `frontend/tests/coverage/empty-class.test.tsx` expectations stay valid (form unchanged); a test is
  added that the scan button comes first.
