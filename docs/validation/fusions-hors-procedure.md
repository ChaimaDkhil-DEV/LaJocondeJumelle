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
