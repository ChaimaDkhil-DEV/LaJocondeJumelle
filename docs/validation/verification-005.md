# Verification of feature 005 — "Mon profil" (My profile) page

Specification, plan and tasks: `specs/005-page-mon-profil/`.

## Initial state (T001)

Branch `005-page-mon-profil`, created from `master` (`dafec78`). No file in `backend/`,
`frontend/`, `e2e/` or the dependencies has changed since `855961c`
(`git diff --stat 855961c HEAD -- backend frontend e2e package.json package-lock.json` empty):
the starting state is that of the 22 October verification on `855961c`
(`docs/validation/verification-003.md`).

| Step | Result |
|-------|----------|
| `npm run verify` | exit code 0 |
| Lint | no problems |
| Backend and frontend types | no errors |
| Backend unit tests | 572 / 572 (29 suites) |
| Backend integration tests | 599 / 599 (42 suites) |
| Frontend tests (Vitest) | 229 / 229 (32 files) |
| `npm audit --audit-level=high` | no high or critical vulnerabilities |
| End to end (6 profiles) | 143 passed, 0 failed, 73 deliberately skipped |

## Existing expectation modified (exception recorded)

`backend/test/integration/auth.spec.ts`, "renvoie le profil et les permissions de
l'utilisateur" (returns the user's profile and permissions): the strict equality (`toEqual`) on the response of `GET /api/auth/me` receives the
two fields added by spec 005 (`username`, `jobTitle: null`). This is the planned contract
change (`specs/005-page-mon-profil/contracts/rest-api.md`: addition only, no field removed or
renamed); no other existing expectation is modified. The tests for the forced change
(`frontend/tests/auth/login.test.tsx`, `e2e/auth.spec.ts`, `nouveau` account) are unchanged and
green (SC-005).

## Tightened e2e selectors (no change of expectation)

The profile block link is named "Mon profil : Super administrateur, Super administrateur"
for the super administrator. The selectors `getByRole('link', { name: 'Administrateur' })`,
which compare by substring, then found two links (strict mode violation, flagged by
the final verification): `exact: true` added in `e2e/admin-dashboard.spec.ts` (l. 51) and
`e2e/us8-admin.spec.ts` (l. 29 and 93). Same element targeted ("Administrateur" menu entry),
same expectations; both files are green again (Chromium).

## Tests added

| File | Tests | Covers |
|---------|-------|--------|
| `backend/test/unit/auth-me.spec.ts` | 3 | FR-003 (`toMeResponse`) |
| `backend/test/integration/auth.spec.ts` | 2 new (+1 expectation updated) | FR-002, FR-003 (`/me`, `/login`) |
| `frontend/tests/auth/profile.test.tsx` | 10 | FR-002 to FR-006, FR-013, edge case of the forced change |
| `frontend/tests/auth/change-password.test.tsx` | 5 | FR-007 to FR-010 |
| `frontend/tests/app/app-layout.test.tsx` | 3 | FR-001 (desktop, current page, mobile drawer) |
| `e2e/auth.spec.ts` | 1 (Chromium) | US1 end to end, SC-003 (other sessions closed) |
| `e2e/a11y-responsive.spec.ts` | V18 extended (2 screens, keyboard flow) | FR-011, FR-012, SC-001, SC-004 |

Finding during implementation (T007): the name and role of the profile block are two inline elements;
without a separator, the accessible name became "EnseignanteEmployé". A visually hidden comma
gives "Mon profil : Enseignante, Employé" (`contracts/ui.md` updated).

## Quickstart scenarios (T021)

| Scenario | Automated coverage | Left to do by hand |
|----------|------------------------|-------------------------|
| 1 — Menu link | `app-layout.test.tsx` (accessible name, desktop and drawer); V18 keyboard | listening with a real screen reader |
| 2 — Information | `profile.test.tsx` (roles, groups, missing values); video S01 (superadmin) | comparison with the administration for each demonstration account |
| 3 — Voluntary change | `e2e/auth.spec.ts` (other sessions closed, new password, restoring the old one) | audit log entry "Mot de passe changé" (Password changed) to be checked |
| 4 — Cancellation and errors | `change-password.test.tsx`; V18 ("Annuler" (Cancel)) | — |
| 5 — Forced change | `login.test.tsx`, `e2e/auth.spec.ts` (`nouveau` account), `profile.test.tsx` (redirect) | — |
| 6 — Server message | `profile.test.tsx` (exact label of the action) | refusal observed as superadmin |
| 7 — Accessibility | V18: axe with no violation and 320 px, keyboard flow | visual check of focus |

T021 stays open as long as the "by hand" column has not been completed.

## Final verification (T022) — 22 October 2026, branch `005-page-mon-profil`

`npm run verify`: exit code 0; backend and frontend types: no errors.

| Step | Start (T001) | Final |
|-------|---------------|-------|
| Lint (including `e2e/`) | no problems | no problems |
| Backend unit tests | 572 / 572 (29 suites) | **575 / 575** (30 suites) |
| Backend integration tests | 599 / 599 (42 suites) | **601 / 601** (42 suites) |
| Frontend tests (Vitest) | 229 / 229 (32 files) | **247 / 247** (35 files) |
| `npm audit --audit-level=high` | no high vulnerabilities | no high vulnerabilities (21 moderate, unchanged) |
| End to end (6 profiles, 222 tests) | 143 passed, 73 skipped | **143 passed, 1 intermittent failure, 78 deliberately skipped** (38.5 min) |

End to end: the new test "changement volontaire depuis « Mon profil »" (voluntary change from "Mon profil") (Chromium) and extended V18
(320 px: "Mon profil", voluntary change, keyboard flow) are green.

**Intermittent failure, unrelated to spec 005**: `coverage-class.spec.ts`, flow A at
768 px (Chromium) — "Affectation terminée." (Assignment completed.) not seen after "Terminer" (Finish), although the action
succeeded (supervisor page: "Aucune affectation en cours" (No assignment in progress)). The same step passed in the
8 other assignment flows of the same run and in the previous full run.
Re-run alone on a fresh database: **3 passes out of 3**. (With `--repeat-each=5` in a single
run, the repetitions interfere with each other: the "Mes signalements" (My reports) list keeps the previous requests
and the test reads the first one.) Race already met in 004 for other
confirmations ("confirmations perdues" (lost confirmations), commit `a8e01ea`): to be handled separately. Handled by
pull request #23 (commit `809b3d5`, merged on 22/10/2026): the toast was lost when the card
disappeared from "Mes affectations" (My assignments) before the action response.

GitHub CI: green on the last commit of pull request #22 (`972941e`), runs 39780144410 and
39780153264; pull request merged on 22/10/2026 (`21048bd`). T022 closed.
