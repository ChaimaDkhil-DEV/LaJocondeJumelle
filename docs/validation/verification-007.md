# Verification of feature 007 — work request drafts

Specification, plan and tasks: `specs/007-brouillons-demandes/`.

## Initial state (T001)

Branch `007-brouillons-demandes`, created from `master` (`c0f16fb`, merge of PR #25). Since
the final verification of 006 (`f753270`), only `.github/workflows/ci.yml` changed (5-minute
limit on ffmpeg); no file in `backend/`, `frontend/`, `e2e/` or the dependencies.

| Step | Result (final verification 006, `verification-006.md`) |
|-------|----------|
| CI on `c0f16fb` | green |
| Backend unit tests | 585 / 585 |
| Backend integration tests | 623 / 623 |
| Frontend tests (Vitest) | 262 / 262 |
| End to end (6 profiles) | 146 passed, 0 failed, 88 deliberately skipped |

## Quickstart scenarios (T020)

| # | Scenario | Automated coverage | Left to do by hand |
|---|----------|------------------------|-------------------------|
| 1 | Save as draft (US1, FR-001 to FR-003) | `drafts.test.tsx` ("Enregistrer en brouillon" (Save as draft): `asDraft`, priority "Normale" (Normal), voice message uploaded first); `requests-drafts.spec.ts` (no notification); `e2e/drafts.spec.ts` (the recipient sees nothing) | — |
| 2 | Reduced validation (US1 scenario 2) | `drafts.test.tsx` ("validation réduite" (reduced validation)) | — |
| 3 | Tab (US2, FR-004, FR-004b) | `drafts.test.tsx` (tab absent, present after "Envoyées" (Sent), link to resume); `requests-drafts.spec.ts` (`scope=drafts`, `scope=mine` without draft); `e2e/drafts.spec.ts` | — |
| 4 | Resume and send (US2, FR-005 to FR-007, SC-003) | `drafts.test.tsx` (pre-filling, only changed fields, `SUBMIT` with the version); `requests-drafts.spec.ts` (status and notifications of a direct creation, two workflows); `e2e/drafts.spec.ts` (full flow, recipient notified) | Replaying the voice message on a real phone (as T119) |
| 5 | Incomplete send (US2 scenario 4) | `drafts.test.tsx`; `requests-drafts.spec.ts` (server refusal, draft kept) | — |
| 6 | Delete (US3) | `drafts.test.tsx` (cancel, confirm); `e2e/drafts.spec.ts` | — |
| 7 | Setting disabled (FR-001, FR-008) | `drafts.test.tsx` (button absent); `requests-drafts.spec.ts` (creation refused, edit, send and delete allowed) | Toggling the setting in "Réglages" (Settings) then going back to "Nouvelle demande" (New request) |
| 8 | Accessibility (FR-010, SC-005) | `a11y-responsive.spec.ts` ("007" test, 320 px: keyboard recording, draft page, tab, delete dialog, axe); "creation" screen of the V18 test with the new button | Screen reader (NVDA) on the draft page |

Deviation from the plan: on mobile, the buttons are stacked in document order (no visual
reversal), so that keyboard order follows displayed order (WCAG 2.4.3).

## Final verification (T021)

On 22/10/2026, outputs kept.

| Step | Before (006) | After (007) |
|-------|-------------|-------------|
| `npm run lint` | no errors | no errors (after fixing an empty pattern in `e2e/drafts.spec.ts`, flagged on the first run) |
| Backend unit tests | 585 / 585 | **585 / 585** |
| Backend integration tests | 623 / 623 | **630 / 630** (+7: `requests-drafts.spec.ts`) |
| Frontend tests (Vitest) | 262 / 262 | **282 / 282** (+20: `drafts.test.tsx`) |
| Backend and frontend typecheck | no errors | no errors |
| `npm audit --audit-level=high` | no high vulnerabilities (21 moderate) | no high vulnerabilities; **2 moderate** (`js-yaml` via `@nestjs/swagger`, fix = breaking upgrade to `@nestjs/swagger` 12; advisory database changed, no dependency modified by 007) |
| End to end (6 profiles, 252 tests) | 146 passed, 88 skipped | **138 passed, 0 failed, 114 deliberately skipped** (36.3 min) |

The 114 skipped: the usual 88 (scenarios reserved for one profile), the 15 new ones outside their
profile (`drafts.spec.ts` outside Chromium: 10; 007 test of `a11y-responsive` outside `mobile-320`: 5),
and **11 time-of-day guards**: the run took place around 22:15 school time (the
machine clock is UTC+1, Paris is UTC+2 until 25/10), which skips the 9 assignment flows
(A, B, C at 360, 768 and 1,280 px, after 22:00) and the 2 of spec 006 (after 20:00). They do not touch
the 007 code; they were green at the 006 verification and remain so in CI.

New e2e tests passed: the two flows of `drafts.spec.ts` (Chromium) and the 007 test of
`a11y-responsive.spec.ts` (320 px: keyboard recording, draft page, tab, delete
dialog, axe).

Remaining: green CI on the branch, then merge following `docs/procedure-fusion.md`.
