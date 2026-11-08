# Implementation Plan: Section « Surveillance » — renommage et trois onglets pour l'administration

**Branch**: `012-section-surveillance` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-section-surveillance/spec.md`

## Summary

Frontend-only change. The « Gardes » section is renamed « Surveillance » (menu, title, back links,
English « Supervision ») without changing any address. For admins and the super administrator, the six
tabs become three: « Absences et retards » (the former « Présences » component, unchanged),
« Affectation des surveillants » (new `AssignmentTab` stacking « Nouvelle affectation », the waiting queue,
the duplicates and the team) and « Suivi des interventions » (new `TrackingTab`: a three-button filter on
the existing `pending` / `active` / `finished` list scopes). Tab and filter live in `?onglet=` / `?filtre=`;
former tab keys are mapped. Teacher and supervisor tabs are untouched. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: React 19, MUI 9 (`Tabs`, `ToggleButtonGroup`), React Router 7, TanStack Query 5

**Storage**: N/A (no data change)

**Testing**: Vitest 5 + Testing Library (frontend), Playwright + axe (e2e); backend suites run unchanged
as regression

**Target Platform**: web application, modern browsers, 320 px to desktop

**Project Type**: web application (`backend/` + `frontend/` workspaces); only `frontend/` and `e2e/` change

**Performance Goals**: no new request: each tab loads what its former tab loaded

**Constraints**: addresses `/gardes/...` unchanged (printed QR codes); rights, statuses and server
unchanged; WCAG 2.2 AA; French strings through `t()` with English dictionary entries

**Scale/Scope**: 1 page reorganised (`CoveragePage`), 2 new small tab components, ~6 label changes,
1 internal link updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. TDD | Frontend tests first for: menu and title labels, admin tab list and order, content of each tab, filter → query mapping (`mainStatus` params), address keys and former-key mapping, teacher and supervisor tabs unchanged. Existing tests on the former tab names are changed first (research R6), and must fail before the code. E2E updated and a new journey added. | ✅ |
| II. Simplicity / YAGNI | Reuses the existing list scopes, queue, duplicates, team and attendance components; no server change, no new route, no status change. | ✅ |
| III. Accessibility / UX | Tabs unchanged mechanism; filter as `ToggleButtonGroup` with `aria-pressed`; `h2` per part of the assignment tab; 320 px checked; axe in Playwright. | ✅ |
| IV. Security / data | No new data shown, no new route; same queries as before. | ✅ |
| V. Workflow integrity / RBAC | Rights unchanged and still checked by the server; statuses and history untouched. | ✅ |

**Post-design re-check (after Phase 1)**: unchanged, all ✅. No item for Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/012-section-surveillance/
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
│   ├── app/AppLayout.tsx                         # menu label « Surveillance »
│   ├── features/coverage/
│   │   ├── CoveragePage.tsx                      # title, 3 admin tabs, former-key mapping, header actions
│   │   ├── AssignmentTab.tsx                     # new: « Affectation des surveillants »
│   │   ├── TrackingTab.tsx                       # new: « Suivi des interventions » + filter
│   │   ├── surveillanceTabs.ts                   # new: tab/filter keys and former-key mapping (pure, unit-tested)
│   │   ├── ManagerViews.tsx                      # export SCOPES type if needed; no behaviour change
│   │   ├── CoverageDetailPage.tsx                # back label; duplicates link → ?onglet=affectation#doublons
│   │   ├── CoverageStatsPage.tsx, CreateCoveragePage.tsx  # back label
│   └── i18n/en/coverage.ts, shared.ts            # « Supervision » and new labels
└── tests/
    ├── coverage/surveillance-tabs.test.ts(x)     # new
    ├── coverage/admin-queue.test.tsx, admin-duplicates.test.tsx, coverage.test.tsx   # former tab names
    ├── attendance/attendance.test.tsx            # « Présences » → « Absences et retards »
    └── app/home.test.tsx                         # menu label
e2e/
├── surveillance.spec.ts                          # new: admin journey, filters, former key, axe, 320 px
├── coverage-class.spec.ts, attendance-qr.spec.ts, a11y-responsive.spec.ts   # former tab names / label
```

**Structure Decision**: existing web-application layout; the feature only touches `frontend/` and `e2e/`.

## Complexity Tracking

No violation to justify.
