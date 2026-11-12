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
  its 7 tests fail. No other test-first deviation is recorded for the feature.
- The full diff review before the merge found a defect: the first activation subscribed before the service worker was
  active, which Chromium refuses. It was fixed in the pull request, test first (commit `4978e03`, recorded in
  [verification-014.md](verification-014.md)).
- Not verified at merge time: the full end-to-end run (T072) and the manual checks on real Android and iPhone devices
  in pre-production (T073), including the activation fix. Push stays off until the three `PUSH_VAPID_*` keys are set,
  which must wait for T073.

No fix or `git revert` needed.

### Reminder

Write the failing test before the code, including for a small change requested during a session.

## 09/11/2026 — pull request #94

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #94 (`015-communication-parents`) | Feature 015: teacher–parent communication validated by the administration, `PARENT` role, external notifications through n8n (off by default), migrations `0020` and `0021` | 16:09:58 | **4. Diff review**: three deviations from constitution principle I (tests seen failing before the code) |

Checks 1 to 3 were ticked in the description of the pull request; check 4 was left unticked, with the reason. The merge
was a deliberate decision of the repository owner, taken once these deviations had been reported and recorded.

### Findings after the fact

- Both runs on `75b9435` were green before the merge (42650050898 at 16:06:56, 42650056661 at 16:08:29), all steps
  executed, including the Docker image build and the dependency audit. The branch was up to date with `master`, and the
  merge was pinned to that commit.
- `master` green after the merge: run 42651973931 on `819e7e2`.
- The deviations are recorded in `specs/015-communication-parents/tasks.md` (« Deviations from principle I »):
  1. Lot 1 and n8n backend tests written first but not run before the code; a mutation check made 18 / 18 and 6 / 6 of
     them fail without the module.
  2. Notification routing and the display of a communication in the bell coded before their test; only the live refresh
     was seen failing first.
  3. n8n workflow, Compose profile, Caddy site and `deploy.sh` checked after writing, against a real n8n 2.44.7.
- The full diff review and verification before the merge found two defects, fixed in the pull request test first:
  audit details dropped by the allowlist, and 400 instead of 403 for users without the right
  ([verification-015.md](verification-015.md)).
- Not verified at merge time: the full end-to-end run (the new scenario ran on Chromium only), a real SMTP server, the
  real WhatsApp Business Platform, the public n8n subdomain and a restore of n8n on a server. External notifications stay
  off until `N8N_WEBHOOK_URL`, `N8N_SHARED_SECRET` and `PARENT_COMM_CHANNELS` are set.

No fix or `git revert` needed.

### Reminder

Write the failing test before the code, and run it to see it fail, including for a small change requested during a
session.

## 10/11/2026 — pull requests #97, #98 and #99

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #97 (`015-validation-messagerie`) | « Communications à valider » as a messaging view, per-message moderation, period filter; fix of the outdated end-to-end test of the Administrator space | 00:26:40 | **All four checkboxes missing**: the description had no checklist |
| #98 (`015-admin-valide-communications`) | The general supervisor (role ADMIN) validates parent communications by default; permission settable for ADMIN only; data migration `0022` | 05:32:22 | **1. CI**: both runs on `6aadb07` were still in progress (42762520999 green at 05:40:28, 42762559994 green at 05:40:38); **all four checkboxes missing** |
| #99 (`015-conversations-parents`) | Parent ↔ teacher conversations: the parent starts a conversation with a teacher of their child, every message validated in both directions; migration `0023` | 07:38:11 | **4. Diff review**: deviation from constitution principle I (tests written after the code for the main feature) |

#98 was not merged from the working session: it was merged while its CI was still running, and without a checklist in
its description. For #97, the merge did not skip CI: both runs on `85e68d4` had finished green before the merge
(42725537022 at 00:14:43, 42725586128 at 00:16:02).

For #99, checks 1 to 3 were ticked in the description of the pull request; check 4 was left unticked, with the reason.
The merge was a deliberate decision of the repository owner, taken once the deviation had been reported.

### Findings after the fact

- #97: `master` green after the merge: run 42728346884 on `de18754`.
- #98: both runs finished green, all steps executed, including the Docker image build and the dependency audit.
  `master` green after the merge: run 42762761485 on `967b3f3`. The tests of #98 were written first and seen failing,
  except the navigation test (« À valider » menu), which passed at once because the menu already depended on the
  permission.
- #99: both runs on `c74e57f` were green before the merge (42773709116 at 07:21:35, 42773650006 at 07:22:12), all steps
  executed. The branch was up to date with `master` (`967b3f3`), and no review discussion was open. `master` after the
  merge: run 42776673961 on `ad7563b`, green at 07:47:29.
- #99 deviations, recorded in the description of the pull request (« Écarts à la procédure »):
  1. The domain rules, the service, the routes and the pages were coded before their tests; the tests were written
     afterwards and pass. Only the later change « optional voice message for a teacher reply » was done test first
     (tests seen failing, then code).
  2. Changed expectations of existing tests, because the pages they covered are replaced by the messaging view:
     `frontend/tests/parent-communications/teacher.test.tsx` (the teacher's list), `validation-parent.test.tsx` (three
     tests of the former « Messages de l'école » list and message page, now covered by `conversations.test.tsx`) and the
     parent part of `e2e/parent-communications.spec.ts`.
- #99 locally, before the merge: one run of the full backend integration suite had one failure in
  `parent-communications-n8n.spec.ts` (fake n8n server with 1 to 2 s timeouts). The failing test was not captured; the
  file passed 4 times out of 4 on its own, in the two previous full runs and in CI.
- Not verified at merge time for #99: the end-to-end run on the seven projects (the 015 scenario ran on Chromium only),
  and the refusal of `0023`'s `down.sql` when parent messages exist.

No fix or `git revert` needed.

### Reminder

Write the failing test before the code, and run it to see it fail, including when the request lists the tests after the
implementation. Add the checklist of `.github/pull_request_template.md` to every pull request description.

## 10/11/2026 — pull requests #100 and #102

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #100 (`docs-registre-fusion-99`) | Register entry for #97, #98 and #99 (documentation only) | 21:24:28 | **3. No unresolved failure**: the branch was 2 commits behind `master` (#101 missing); **all four checkboxes unticked** |
| #102 (`016-accueil-enseignant`) | Teacher home page (QR code scan, urgent / normal request, « Suivi de mes demandes »); two business priorities, URGENT and NORMAL; data migration `0024` | 21:24:55 | **1. CI**: both runs on `a225c20` were still in progress (42903715882 green at 21:27:24, 42903707588 green at 21:28:03); **4. Diff review**: deviation from constitution principle I recorded in the description; **all four checkboxes unticked** |

Neither pull request was merged from the working session; both were merged from the owner's account, 27 s apart. For
#100, the merge did not skip CI: both runs on `a9d8f04` had finished green in the morning (42777862468 at 07:58:33,
42777865423 at 07:59:09), but on a state of `master` without #101.

For #102, the owner had asked to merge « once CI is green », then chose to have the deviation checked first (tests run
against the code of `master`). At merge time, the description recorded the deviation with check 4 unticked, and that
check was still running in the working session.

### Findings after the fact

- #100: documentation only (the register this entry extends); #101 changed other files.
- #102: both runs on `a225c20` finished green 2 min 29 s and 3 min 08 s after the merge, all steps executed, including
  the Docker image build and the dependency audit. The branch was up to date with `master` (`68b98e1`), and no review
  discussion was open. The earlier commits of the pull request (`6f2cdc2`, `101b30c`) had green runs too.
- #102 deviation, recorded in the description of the pull request (« Écarts à la procédure ») and checked after the
  merge:
  1. Tests written after the code, never seen failing first: refusal of the retired priorities by the API
     (`history-priority.spec.ts`, `requests-search.spec.ts`, `admin-categories.spec.ts`) and automatic suggestions
     (`assist-sanitize.spec.ts`, `assist-demo-suggest.spec.ts`, `assist-claude.spec.ts`); the end-to-end tests were
     written and run after the implementation.
  2. Check: these tests of the branch were run against the code of `master` (worktree `origin/master` at `68b98e1`,
     four-value schema, Prisma client regenerated). They all fail there — 8 unit cases, 3 integration cases (priority
     change to `HIGH` and search `priority=HIGH` accepted, 200 instead of 400; deadline rules: the two-rule set refused,
     400 instead of 200) — and pass on the branch.
  3. Changed expectations of existing tests, only where they encoded the retired priorities or the former home page of
     the teacher account: listed in the description of the pull request.
- #102 locally, before the merge: lint, types, backend unit tests (1143), backend integration tests (1048, 2 skipped:
  real Whisper and n8n, as on `master`), frontend tests (769, then 26 / 26 for `tests/app` after the last change) and
  `npm audit --audit-level=high` green; migration `0024` applied to the development database, its `down.sql` tested by
  `migration-0024.spec.ts` (rollback, then migration applied again).
- Not verified at merge time for #102: the end-to-end run on the seven projects (the targeted files ran on Chromium and
  at 320 px only), and migration `0024` on a copy of production data.
- `master` green after the merges: run 42904748740 on `d3ef352` (merge of #100) at 21:33:55, run 42904821809 on `6ab2ee6` (merge of
  #102) at 21:35:52.

No fix or `git revert` needed.

### Reminder

Wait for CI on the latest commit of the pull request, then tick the four checks, before merging — including when the
remaining step is only the Docker image build.

## 11/11/2026 — pull request #104

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #104 (`demo-en-ligne-origine`) | Online demo: login also possible from `http://127.0.0.1:4173` (new `APP_LOCAL_ORIGINS`, loopback addresses only, refused in production; `OriginGuard` and the realtime gateway accept `APP_ORIGIN` plus these origins); warning when a `cloudflared` process is already running | 16:02:34 | **1. CI**: both runs on `1436be5` were still in progress (43053730490 green at 16:11:39, 43053675259 green at 16:16:34); **all four checkboxes unticked** |

The pull request was opened at 15:58:57 and merged from the owner's account 3 min 37 s later, while the working
session was waiting for CI before reporting.

### Findings after the fact

- Both runs on `1436be5` finished green 9 min 05 s and 14 min 00 s after the merge, all steps executed, including the
  Docker image build and the dependency audit.
- The branch was up to date with `master` (`a6a1803`), and no review discussion was open.
- Locally, before opening: lint, types, backend unit tests (1161), backend integration tests (1048, 2 skipped: real
  Whisper and n8n, as on `master`), frontend tests (770; one earlier run had 1 failure, a clean rerun passed, no
  frontend file changed) and `npm audit --audit-level=high` green. Tests written first: `config.spec.ts`,
  `origin.spec.ts` and `demo-tunnel.spec.ts` failed (8 cases) before the implementation.
- Manual check: through `vite preview`, login requests from `http://127.0.0.1` and `http://localhost` passed the origin
  check, other origins got 403; the owner confirmed login on `http://127.0.0.1:4173` with the restarted demo.
- Not verified at merge time: the end-to-end run (`npm run test:e2e`), not required for a change outside a release.
- `master` green after the merge: run 43054337672 on `8d1a5df` at 16:13:18.

No fix or `git revert` needed.

### Reminder

Wait for CI on the latest commit of the pull request, then tick the four checks, before merging.

## 11/11/2026 — pull requests #105 and #106

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #105 (`017-communications-administration`) | Feature 017 design documents: spec, plan, research, data model, API contract, quickstart, tasks (documentation only) | 17:36:55 | **all four checkboxes unticked** |
| #106 (`docs-registre-fusion-104`) | Register entry for #104 (documentation only) | 17:37:31 | **all four checkboxes unticked** |

Both pull requests were merged from the owner's account, 36 s apart, while the working session was writing the
017 code on another branch.

### Findings after the fact

- CI had finished green before each merge: #105 runs 43061365956 (16:55:43) and 43061312212 (16:57:41) on
  `b7ef693`; #106 runs 43061997467 (17:02:59) and 43061914698 (16:59:17) on `5706ea7`, all steps executed.
- Both branches were up to date with `master` when merged (#106 one merge commit behind, no file in common); no
  review discussion was open. Documentation only: no code, no test changed.
- `master` green after the merges: run 43069876205 on `135dced` (merge of #105) at 17:48:00, run 43069971060 on
  `b321c69` (merge of #106) at 17:48:11.

No fix or `git revert` needed.

### Reminder

Tick the four checks before merging, including for a documentation-only pull request whose CI is already green.

## 11/11/2026 — pull request #107

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #107 (`017-backend`) | Feature 017: communications centred on the administration (conversations `INTERNAL` / `PARENT`, archives, migrations `0025` to `0027`, « Communications » screens, E2E, docs) | 20:32:19 | **1. CI**: the three runs on the branch were shown in progress (43094383486, 43094313077 on `1ef43c2`, 43094228218 on `43cee2b`); **4. Diff review**: deviation from constitution principle I recorded in the description; **all four checkboxes unticked** |

The pull request was opened at 20:12:51 and merged from the owner's account 19 min 28 s later, while the working
session was waiting for CI.

### Findings after the fact

- GitHub Actions had a major outage that evening (githubstatus.com, component « Actions »). Every step of the three
  branch runs had finished successfully by 20:22:21, ten minutes before the merge, but GitHub only marked the runs
  completed (success) at about 21:00: lint, types, backend unit and integration tests, frontend tests, Docker image
  build, dependency audit.
- The `master` run on `bea0d1b` (43096646287, merge of #107) stayed queued after the outage; GitHub refused both to
  cancel it (« completed ») and to rerun it (« already running »). The CI of this pull request, opened from
  `bea0d1b` with documentation only, checks the code of `master` after the merge.
- The branch was up to date with `master` (`b321c69`); no review discussion was open.
- #107 deviation, recorded in the description of the pull request (« Écarts à la procédure ») and in
  `docs/validation/verification-017.md`: the HTTP integration suites `communications-*.spec.ts` were written before
  the services but first run after them; mutation check (visibility always granted): 3 of 4 suites fail. Domain,
  migration and frontend tests were seen failing before the code.
- #107 locally, before opening: lint, types, backend unit (1201) and integration tests (1093, 2 skipped: real
  Whisper and n8n), frontend tests (762), `npm audit --audit-level=high` green; `e2e/communications.spec.ts` on
  `chromium` and `mobile-320` (2 passed); migrations `0025` to `0027` applied to the development database, their
  `down.sql` tested by `communications-migration.spec.ts`.
- Not verified at merge time: the end-to-end suite on the seven projects, n8n against a real n8n, the migrations on a
  copy of production data.

No fix or `git revert` needed so far; `master` CI after the merge: see the CI of this pull request.

### Reminder

Wait for CI on the latest commit of the pull request, then tick the four checks, before merging; with a recorded
deviation, check 4 stays unticked and the merge is the owner's explicit decision.

## 11/11/2026 — pull request #108

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #108 (`docs-registre-fusion-107`) | Register entry for #107 (documentation only) | 21:16:46 | **1. CI**: both runs on `19a4ad1` were in progress (43101173475, 43101164807); **all four checkboxes unticked** |

The pull request was opened at 21:13:13 and merged from the owner's account 3 min 33 s later.

### Findings after the fact

- Both branch runs on `19a4ad1` finished with success, at 21:21:03 and 21:24:13.
- `master` CI after the merge: run 43101669588 on `b74f3af`, success (21:26:06). It also checks the code merged by #107,
  whose own `master` run (43096646287) stayed queued after the GitHub Actions outage.
- Full end-to-end suite on `b74f3af` (7 profiles), run afterwards: 208 passed, 4 failed, none caused by #107 or #108
  (see `docs/validation/verification-017.md`); the three WebKit failures are fixed by the pull request that carries
  this entry.

No fix or `git revert` needed.

### Reminder

Wait for CI on the latest commit of the pull request, then tick the four checks, before merging.

## 12/11/2026 — pull requests #111 and #112

| Pull request | Content | Merged at (UTC) | Check not satisfied at merge time |
|---------|---------|-------------------|-----------------------------------------------|
| #111 (`017-communications-admin-page-unique`) | Administration "Communications" as a single page (frontend, `e2e/communications.spec.ts`; no backend file) | 23:08:41 | **All four checkboxes unticked** in the description (CI itself was green, see below) |
| #112 (`chore-gitignore-playwright-report`) | `.gitignore`: ignore `/playwright-report/` (configuration only) | 23:09:02 | **3. Branch up to date with `master`**: merged 21 s after #111, from a branch based on `ba393a4`, without `f34e52e`; **all four checkboxes unticked** |

Both pull requests were opened at 22:35:25 and 22:36:59 and merged from the owner's account about 33 minutes later.

### Findings after the fact

- The branch runs finished with success before the merge: #111 on `a464edb` (`push` 43321272025 at 22:43:17,
  `pull_request` 43321312193 at 22:47:00); #112 on `e9da3c5` (`push` 43321532140 at 22:44:37, `pull_request` 43321556472
  at 22:45:26). Check 1 was therefore satisfied in substance; the boxes were simply not ticked.
- #111 records its deviation for check 4 in its description: the expectations of the administration tests in
  `communications.test.tsx` were changed on purpose (single page instead of four sub-pages). Tests were written first
  (`communications-view.test.ts`, then the page), frontend suite green (82 files, 784 tests), `npm audit
  --audit-level=high` green. `e2e/communications.spec.ts` on `chromium` and `mobile-320`: 3 passed after fixing a bug in the new
  320 px test (the "Nouveau message" panel is a modal, so the page title is hidden from assistive technology while it is
  open); the other five projects were not run.
- `master` CI after the merge failed on both runs: 43326302988 on `f34e52e` (23:13:45) and 43326352374 on `71814d6`,
  attempt 1 (about 23:16). The only failing test is `push-dispatch.spec.ts`, case (d) "enseignant arrivé"
  (`COVERAGE_TEACHER_ARRIVED` notification count: expected 1, received 0); 1092 backend integration tests passed. Neither pull
  request changes a file under `backend/` (the diff `ba393a4..71814d6` touches `.gitignore`, `e2e/` and `frontend/` only).
  Both runs started at 23:08 and 23:09 UTC, i.e. 00:08 and 00:09 in Paris; the test creates its coverage request at
  "now minus 20 minutes", which falls on the previous day then. This is a hypothesis.
- Attempt 2 of run 43326352374 (on `71814d6`, started at 23:18 UTC, no code change) finished with **success** at
  23:30:20: backend integration 1093 passed, 2 skipped (real Whisper and n8n), `push-dispatch.spec.ts` passed at
  23:22:14 UTC (00:22 in Paris, two minutes after the window described above), unit tests 1201 passed. `master` is
  therefore green on `71814d6`; the run on `f34e52e` (43326302988) stays failed, it was not rerun. One passing
  run after 00:20 is consistent with the hypothesis but does not prove it: the test itself was not changed or
  investigated, and it can fail again for the first 20 minutes after midnight in Paris.

No fix or `git revert` needed for the code of #111 and #112.

### Reminder

Wait for CI on the latest commit of the pull request, then tick the four checks, before merging.
