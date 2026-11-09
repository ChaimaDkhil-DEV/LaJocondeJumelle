# Merges made outside the procedure

Register required by `docs/procedure-fusion.md` ("Fusion faite malgré un échec", i.e. merge made despite a failure): every
merge into `master` made without the four checks being satisfied, with its fix.

## 23/10/2026 — pull requests #28 and #29

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #28 (`docs-007-cocher-t021`) | `specs/007-brouillons-demandes/tasks.md`: T021 ticked, one line | 10:31:48 | **1. CI**: `pull_request` run 39937940094 failed (two attempts); the `push` run 39937933975 on the same commit `e874877` was green |
| #29 (`ci-timeout-ffmpeg-10min`) | `.github/workflows/ci.yml`: ffmpeg step limit raised from 5 to 10 min | 10:32:03 | **1. CI**: both runs on `0d9392c` were still in progress (39939434856 green at 10:32:09, 39939429091 green at 10:33:34) |

Procedure checkboxes were not ticked in the description of either pull request.

### Cause of the failure on #28

The step "Installer ffmpeg (conversion des vocaux)" (Install ffmpeg (voice message conversion)) exceeded its 5-minute limit on both
attempts of run 39937940094 (slow apt mirror: about 3 minutes for a single package).
All following steps were skipped; no lint, typecheck or test failed. Pull request #29
raises this limit to 10 minutes.

### Findings after the fact

- #28: documentation-only change, no code; the `push` run on the same commit ran
  all steps successfully.
- #29: both runs finished green, all steps executed.
- `master` green after both merges: run 39939755186 on `3e569e3` (merge of #28) and run
  39939785006 on `59a9b85` (merge of #29).

No fix or `git revert` needed.

### Reminder

Wait for **all** "Contrôles qualité" (quality checks) runs of the latest commit to finish (`gh pr checks <n°>`,
neither "pending" nor "fail") and tick the four checkboxes before merging. A run that failed for
an infrastructure reason is re-run (`gh run rerun <id> --failed`); it is not ignored.

## 23/10/2026 — pull request #33

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #33 (`008-export-statistiques-affectations`) | feature 008: CSV export of assignment statistics, migration `0010` | 13:04:45 | **1. CI**: both runs on `1835469` were still in progress (39958166585 green at 13:08:36, 39958174752 green at 13:08:47) |

Procedure checkboxes were not ticked in the description of the pull request.

### Findings after the fact

- Both runs finished green, all steps executed (lint, types, unit tests,
  integration and frontend tests, audit). End-to-end tests run by hand before the pull request and recorded:
  150 passed, 0 failed (`docs/validation/verification-008.md`).
- `master` green after the merge: run 39958260371 on `62694de`.

No fix or `git revert` needed. Second early merge of the day: see the
reminder above.

## 06/11/2026 — pull requests #73 and #75

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #73 (`feat-e2e-iphone-17-pro-max`) | iPhone 17 Pro Max end-to-end profile | 02:34:52 | **1. CI**: both runs on `9936719` were still in progress (42151040563 green at 02:39:32, 42151033416 green at 02:39:44) |
| #75 (`feat-preparation-deploiement`) | `.dockerignore` fix, Docker image build in CI, backup alerts and rotation, server change procedure | 11:33:02 | **1. CI**: both runs on `e8520b3` were still in progress (42210659213 green at 11:37:41, 42210652083 green at 11:38:12) |

Procedure checkboxes were not ticked in the description of either pull request.

### Findings after the fact

- All four runs finished green, all steps executed. On #75, this includes the first run of the new
  step "Construction des images Docker" (Docker image build).
- `master` green after both merges: run 42151231054 on `69921ca` (merge of #73) and run 42211085403 on
  `b816b88` (merge of #75).
- #73 changes the test configuration and the README only. The full end-to-end run on `69921ca` found
  8 failures, none caused by this change; they were fixed by #74
  ([verification-e2e-stabilite.md](verification-e2e-stabilite.md)).
- #75 changes no application code. Its local checks are recorded in
  [verification-deploiement-local.md](verification-deploiement-local.md).

No fix or `git revert` needed. Same cause as #29 and #33: see the reminder above.

## 06/11/2026 — pull request #77

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #77 (`feat-restauration-et-echeances`) | Meal service changes with per-student history, migration `0016`; deadline recalculated when the priority changes | 23:14:50 | **4. Diff review**: tests were written after the code, not first as required by constitution principle I |

Checks 1 to 3 were ticked in the description of the pull request; check 4 was left unticked, with the reason. The merge
was a deliberate decision of the repository owner, taken once this deviation had been reported.

### Findings after the fact

- Both runs on `c4c07d7` were green before the merge (42252588257 and 42252634208), all steps executed.
- `master` green after the merge: run 42310571547 on `b2fe9e5`.
- The tests exist and pass: `backend/test/integration/student-meal.spec.ts`, `frontend/tests/students/meal-services.test.tsx`,
  `e2e/restauration.spec.ts`, and additions to `backend/test/unit/deadlines.spec.ts` and
  `backend/test/integration/history-priority.spec.ts`. Only the order of writing did not follow the rule: no test was seen
  failing first against the unchanged code.
- Not verified at merge time: the full end-to-end run, `0016/down.sql`, the demo reset with existing history, and the page
  in English.

No fix or `git revert` needed.

### Reminder

Write the failing test before the code, including for a small change requested during a session.

## 07/11/2026 — pull request #79

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #79 (`chore-nettoyage-code-inutilise`) | Removal of the unused `CoverageTarget` table (migration `0017`) and `canReadAudit` | 00:13:01 | **All four checkboxes unticked**: the checks were not recorded in the description of the pull request |

The merge did not skip CI: both runs on `e04a87a` had finished all their steps (42315966584 at 00:12:00, 42315961126 at
00:13:01, the second in the same second as the merge). Whether the diff was reviewed and whether review discussions were
open at merge time is not recorded.

### Findings after the fact

- Both runs finished green, all steps executed, including the Docker image build and the dependency audit.
- `master` green after the merge: run 42316858051 on `6cc62cd`.
- The test `backend/test/integration/migration-0017.spec.ts` was written first and seen failing before the migration existed.
- No test was disabled. The only changed expectation is the removal of the `canReadAudit` assertions, documented in the pull
  request.
- Not verified at merge time: the full end-to-end run. Before deploying, `CoverageTarget` must be confirmed empty on the
  server, otherwise migration `0017` stops and the API does not start.

No fix or `git revert` needed. Same cause as #29, #33 and #73: see the first reminder above.

### Reminder

Tick the four checkboxes before merging, even when every run is already green.

## 07/11/2026 — pull request #82

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #82 (`011-espace-admin-donnees-reference`) | Feature 011: the admin manages floors, levels, classes (QR codes included) and students, and sees a read-only employee list; fix of the QR dialog after a revocation | 23:00:08 | **1. CI**: both runs on `fbc13ab` were still in progress (opened at 22:59:17, merged 51 s later); **all four checkboxes unticked**; **4. Diff review** not recorded |

The pull request run 42423130860 finished green at 23:04:53 and the push run 42423127389 at 23:07:44, both after the
merge.

### Findings after the fact

- Both runs finished green, all steps executed, including the Docker image build and the dependency audit.
- `master` green after the merge: run 42423194558 on `19aa3ba`.
- Before the pull request was opened, every CI step had been run locally on `fbc13ab` (842 unit, 885 integration with
  1 test already skipped on `master`, 503 frontend tests, audit with no high or critical), plus the end-to-end specs
  `admin-reference-admin`, `us8-admin` and `attendance-qr` on Chromium.
- Tests were written first and seen failing (`specs/011-espace-admin-donnees-reference/tasks.md`, implementation notes).
  The changed expectations are the tests that refused the admin on floors, levels, classes and students, documented in
  `research.md` (R5) and in the pull request.
- Not verified at merge time: the full end-to-end run, and the manual quickstart scenarios (T036).

No fix or `git revert` needed.

### Reminder

Wait for « Contrôles qualité » to finish on the latest commit, then tick the four checkboxes, before merging.

## 07/11/2026 and 09/11/2026 — pull requests #83 and #87

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #83 (`docs-registre-fusion-82`) | This register: entry for #82, documentation only | 07/11 23:31:41 | **1. CI**: both runs on `3f6fb9e` were still in progress (opened at 23:29:30; 42425476733 green at 23:36:17, 42425471513 green at 23:36:44); **all four checkboxes unticked** |
| #87 (`fix-scan-qr-classe`) | Built-in QR reader: QR read from a photo, more reliable reading, one camera message per cause, link field folded while the camera works; amendment of spec 013 | 09/11 09:01:15 | **All four checkboxes unticked**: the checks were not recorded in the description of the pull request |

#83 is recorded here rather than in an entry of its own: the repository owner decided on 08/11/2026 not to open a register
pull request for a register pull request, and to add #83 to the next entry.

For #87, the merge did not skip CI: both runs on `2727806` had finished all their steps before the merge (42589084288 at
08:58:58, 42589067728 at 09:00:57, 18 s before the merge). Just before the merge, the branch was up to date with `master`,
no review discussion was open, and the full diff had been read; none of this was ticked in the description.

### Findings after the fact

- #83: both runs finished green, all steps executed; documentation only. `master` green after the merge: run 42425649622
  on `a114e8b`.
- #87: both runs finished green, all steps executed, including the Docker image build and the dependency audit. `master`
  green after the merge: run 42590172963 on `49f2c10`.
- #87: tests were written first and seen failing (`frontend/tests/attendance/qr-scanner.test.tsx`,
  `frontend/tests/attendance/qr-reader.test.ts`). The only changed expectations are the two end-to-end steps that now
  unfold the link field when the simulated camera opens (`e2e/support/qr-scanner.ts`), documented in the pull request and
  in the spec 013 amendment.
- Not verified at merge time for #87: a real phone (iPhone, Android), the browser's native QR reader (`BarcodeDetector`,
  absent from Chrome on Windows), and the end-to-end scenarios on Firefox and WebKit (they run on Chromium only). Backend
  integration tests were not run locally (no backend file changed); CI ran them.

No fix or `git revert` needed. Same cause as #79: see its reminder.

## 09/11/2026 — pull request #90

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #90 (`014-notifications-push-preferences`) | Feature 014: push notifications and user preferences, migration `0019`, off by default (no `PUSH_VAPID_*` keys) | 10:40:59 | **4. Diff review**: one test was written after its code (T038, `usePushSync`), not first as required by constitution principle I |

Checks 1 to 3 were ticked in the description of the pull request; check 4 was left unticked, with the reason. The merge
was a deliberate decision of the repository owner's account, taken once this deviation had been reported.

### Findings after the fact

- Both runs on `4978e03` were green before the merge (42601286850 at 10:40:05, 42601293382 at 10:39:21), all steps
  executed, including the Docker image build and the dependency audit.
- `master` green after the merge: run 42602699015 on `82264cf`.
- The deviation is recorded in `specs/014-notifications-push-preferences/tasks.md` (T038): the test
  `frontend/tests/push/push-sync.test.tsx` passed at its first run; a mutation check (no request to the server) made 2 of
  its 7 tests fail. Every other test of the feature was written first.
- The full diff review before the merge found a defect: the first activation subscribed before the service worker was
  active, which Chromium refuses. It was fixed in the pull request, test first (commit `4978e03`, recorded in
  [verification-014.md](verification-014.md)).
- Not verified at merge time: the full end-to-end run (T072) and the manual checks on real Android and iPhone devices
  in pre-production (T073), including the activation fix. Push stays off until the three `PUSH_VAPID_*` keys are set,
  which must wait for T073.

No fix or `git revert` needed.

### Reminder

Write the failing test before the code, including for a small change requested during a session.
