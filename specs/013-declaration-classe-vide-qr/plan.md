# Implementation Plan: Déclaration d'une classe vide par QR code, caméra dans l'application

**Branch**: `013-declaration-classe-vide-qr` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-declaration-classe-vide-qr/spec.md`

## Summary

Frontend-only change. The « Déclarer une classe vide » page gets, above the unchanged form, a « Scanner le QR code
de la classe » button that opens the existing in-app QR reader (`QrScannerDialog`, camera inside the page, manual
paste fallback). On the first class QR code read, the page sends the existing `POST /api/coverage/empty-class`
with the class id read from the token, `teacherId: null` and the token as presence proof, then shows the
existing result with the class name as a heading and « Scanner une autre classe ». The phone-camera path and all
server rules are unchanged. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: React 19, MUI 9, React Router 7, TanStack Query 5, `jsqr` (already used by
`QrScannerDialog`)

**Storage**: N/A (no data change)

**Testing**: Vitest 5 + Testing Library (frontend), Playwright + axe (e2e, Chromium with fake camera); backend
suites unchanged, run by the pull request's CI

**Target Platform**: web application on phones and tablets (camera), HTTPS or localhost (browser requirement
for the camera), 320 px to desktop

**Project Type**: web application (`backend/` + `frontend/` workspaces); only `frontend/` and `e2e/` change

**Performance Goals**: one network request per declaration from the scan (no lookup before sending); scan to
result in under 10 s at the door (SC-001)

**Constraints**: no server change; one declaration per scanning session; camera optional (manual paste and
form); WCAG 2.2 AA; French strings through `t()` with English dictionary entries

**Scale/Scope**: 1 page changed (`EmptyClassPage`), 1 helper added (`classIdFromToken`), 1 component reused
unchanged (`QrScannerDialog`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TDD | Failing tests first: `classIdFromToken` unit tests; page tests for scan button order, automatic send after a pasted QR link (request body `{ clientId, classId, teacherId: null, qrToken }`), result with class name and « Scanner une autre classe », refused QR shows the server message and creates nothing, one request per scanning session, form unchanged; new e2e journey. | ✅ |
| II. Simplicity / YAGNI | Reuses the existing reader, request and result view; no new dependency, route or endpoint. | ✅ |
| III. Accessibility / UX | Camera optional (manual field, form); status and alerts announced; 320 px; axe in Playwright. | ✅ |
| IV. Security / data | The client reading of the token is a convenience; the server verifies signature, version, class and group. No new data. | ✅ |
| V. Workflow integrity / RBAC | Server rules, rights, notifications and history unchanged; same idempotent request. | ✅ |

**Post-design re-check (after Phase 1)**: unchanged, all ✅. No item for Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/013-declaration-classe-vide-qr/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── features/attendance/qrToken.ts            # + classIdFromToken
│   ├── features/attendance/QrScannerDialog.tsx   # doc comment generalised only
│   ├── features/coverage/EmptyClassPage.tsx      # scan block, automatic send, result heading
│   └── i18n/en/coverage.ts                       # new labels
└── tests/
    ├── attendance/qr-token.test.ts               # + classIdFromToken (file already testing tokenFromScan)
    └── coverage/empty-class.test.tsx             # scan path tests
e2e/
└── empty-class-qr.spec.ts                        # new: supervisor journey by pasted QR link, axe, 320 px
```

**Structure Decision**: existing web-application layout; only `frontend/` and `e2e/` change.

## Complexity Tracking

No violation to justify.
