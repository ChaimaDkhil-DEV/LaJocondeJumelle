# Verification — end-to-end suite after the security audit fixes (19/11/2026)

Branch `fix-e2e-alignement-ui` (#148), created from `master` at `935d9fb`. That commit contains every fix of the
security audit of 18/11/2026 (#134 to #147). The commands ran on Windows, with sleep prevented for the duration of
the run.

## Results

| Step | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` | no errors |
| Types | `npm run -w frontend typecheck` | no errors |
| Frontend | `npm run -w frontend test` | 909 / 909 |
| Dependencies | `npm run audit:check` | no high or critical vulnerability outside exceptions |
| End-to-end | `npm run test:e2e` (7 profiles) | **244 passed, 2 failed, 237 skipped**, in 1 h 42 |
| Rerun of the 2 failures | see below | 2 passed |

The backend was not rerun, since this branch changes no backend file: the full CI passed on `935d9fb`.

The 237 skips come from conditions declared in the specs, for tests reserved to certain profiles.

As agreed with the school, only the failing tests were rerun, not the whole suite.

| Test | Profile | Cause | Outcome |
|------|---------|-------|---------|
| `communications.spec.ts:272`, administration at 320 px | mobile-320 | Stale expectation: since `f8cf4fe` (16/11) the page title is « Messages », not « Communications » | Expectation updated, rerun: passed |
| `us8-admin.spec.ts:21`, V16 | iPhone 13 | Intermittent: the tap on the « Action » list of the audit log selected another value instead of opening the list. The test passed on the 4 other profiles where it runs. | Rerun alone: passed. No change. |

## Failures of the earlier run of the same day and their causes

Earlier run on `935d9fb` (morning, from another session): 8 failures, then the run stopped at test 108 of 483. The
test server stopped when the computer ran out of free memory. None of the failures came from the security fixes.

| Test | Profiles | Cause | Fix in #148 |
|------|----------|-------|-------------|
| `auth` (login, then home) and `teacher-home` | chromium, firefox | **Application bug**: color contrast of the hints on the teacher home buttons (`aedb56a`). « Urgent »: 3.95:1; « normal »: 4.22:1, and 2.85:1 on hover. The threshold for small text is 4.5:1. | Hint colors darkened or set to white in `design/tokens.ts`. Test `frontend/tests/design/home-actions-contrast.test.ts` written first. |
| `admin-reference-admin` | chromium | Stale expectation: section « Emplois du temps » (020, `1fe44f2`) | Expectation updated |
| `surveillance` (admin) | chromium | Stale expectation: tab « Enseignants attendus » (020, `1fe44f2`) | Expectation updated |
| `drafts` | chromium | Stale expectation: no status badge on the row since « Mes demandes » was simplified (`66a816e`) | Checks the « Brouillons » tab and the link to `/brouillon` |
| `communications` (journey) | chromium | Stale expectation: no « Famille » label on the row since the redesign of the screens (`f8cf4fe`) | Checks guardian name, reply and « non lu » marker |
| `timetable` | chromium | Depended on the order of the files. `coverage-class` (scenario A) reports, then completes, an absence of « enseignante » on the current hour; the session of the test became « Absence justifiée ». | The scenario creates its own teacher |

## Notes

- The last full run recorded before this one was the run on `b74f3af` (017, `verification-017.md`). Several screen
  changes (#117, #120, #121, #130) were merged without a full end-to-end run. The out-of-procedure merges are recorded
  in `fusions-hors-procedure.md`.
- Only 2 to 3 GB of RAM were free on the computer. A one-off « Connexion impossible » failure (Vite proxy
  `ECONNABORTED`) was seen once in `coverage-class` (C, 768 px) during a targeted run, and the test passed when rerun
  alone. Close unused applications before a full run.
