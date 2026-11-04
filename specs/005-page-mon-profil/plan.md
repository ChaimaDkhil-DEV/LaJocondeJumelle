# Implementation Plan: Page « Mon profil » (My profile page) and access to the password change

**Branch**: `005-page-mon-profil` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-page-mon-profil/spec.md`

## Summary

The menu's profile block becomes a link to a new `/profil` page that displays, read-only, the
name, identifier, job title, role and assignment groups of the signed-in account, and offers
« Changer mon mot de passe » (Change my password). The existing change page gains a voluntary
mode (cancel, return to the profile with a confirmation), chosen from the server state
`mustChangePassword`; the forced mode is unchanged. On the server side, only the
`GET /api/auth/me` response gains two fields (`username`, `jobTitle`). Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (backend and frontend), Node.js 24

**Primary Dependencies**: NestJS 11 and Prisma 6 (backend); React 19, React Router 7, MUI 7,
TanStack Query (frontend) — existing stack, no dependency added

**Storage**: PostgreSQL 17 — no schema change or migration (`User.jobTitle` exists)

**Testing**: Jest (backend unit and integration, embedded PostgreSQL), Vitest + Testing
Library (frontend), Playwright + axe (end to end, 6 profiles)

**Target Platform**: recent browsers (desktop, iOS Safari, Android Chrome), Linux server
(Docker) in production

**Project Type**: web application (monorepo `backend/` + `frontend/`)

**Performance Goals**: no additional request when opening the profile (`/api/auth/me` cache
reused); password change: current performance

**Constraints**: WCAG 2.2 AA; 320 px with no horizontal scrolling; forced flow and password
rules unchanged; no new data collected

**Scale/Scope**: 1 new page, 1 adapted page, 1 link, 2 fields added to an existing
response; a few dozen users (one school)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check before design | After design |
|-----------|---------------------|--------------|
| **I. Tests first** | Each acceptance scenario has a test that fails before the code (R6): unit and integration for `/me`, Vitest for the page and the flow, e2e for the full flow and accessibility. | ✅ R6 test plan tied to FR-001 to FR-013 (see quickstart). Existing tests of the forced flow stay unchanged (SC-005). |
| **II. Simplicity / YAGNI** | No new endpoint, dependency, migration or configuration. | ✅ Two fields on an existing response, one frontend route, one mode derived from server state. Nothing to record in "Complexity Tracking". |
| **III. Accessibility and UX** | Link with a complete accessible name, visible focus, errors tied to fields, announced confirmation, 320 px, axe in V18. | ✅ R3 (Label in Name), R4 (announced status), V18 extended. Loading and error states: those of `RequireAuth`, shared by all protected pages. |
| **IV. Security and data** | Server-side validation of the change unchanged; no new data; secrets: none. | ✅ `username` and `jobTitle` returned only to the signed-in account (session). Voluntary mode cannot be manipulated (server state, no URL). |
| **V. Integrity and audit** | No request or status touched; `PASSWORD_CHANGED` already logged; no new access to someone else's resource. | ✅ Unchanged; e2e test verifying that the other sessions are closed. |

No violation: "Complexity Tracking" section not applicable.

## Project Structure

### Documentation (this feature)

```text
specs/005-page-mon-profil/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1 to R6
├── data-model.md        # Phase 1: data read (no schema change)
├── quickstart.md        # Phase 1: validation scenarios
├── contracts/
│   ├── rest-api.md      # GET /api/auth/me (fields added), POST /api/auth/password (unchanged)
│   └── ui.md            # Route /profil, profile block link, modes of /mot-de-passe
├── checklists/
│   └── requirements.md  # Spec quality
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/auth/
│   ├── auth.types.ts            # AuthenticatedUser + MeResponse: username, jobTitle
│   └── session.service.ts       # toAuthenticatedUser: jobTitle
└── test/
    ├── unit/                    # toMeResponse
    └── integration/auth.spec.ts # GET /api/auth/me

frontend/
├── src/
│   ├── api/types.ts             # Me: username, jobTitle
│   ├── app/AppLayout.tsx        # profile block → /profil link
│   ├── app/routes.tsx           # /profil route
│   └── features/auth/
│       ├── ProfilePage.tsx      # new page
│       └── ChangePasswordPage.tsx # voluntary mode (cancel, return, confirmation)
└── tests/auth/
    ├── profile.test.tsx         # new suite
    └── change-password.test.tsx # voluntary and forced modes

e2e/
├── auth.spec.ts                 # flow profile → change → other sessions closed
└── a11y-responsive.spec.ts      # V18: « Mon profil » page at 320 px
```

**Structure Decision**: existing monorepo (`backend/`, `frontend/`, `e2e/`); the profile belongs
to the `auth` domain on both the frontend and the backend (no new domain folder).

## Complexity Tracking

Not applicable: no constitution violation.
