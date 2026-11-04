# Checks before merging into `master`

> **Manual procedure: it is not a technical safeguard.** GitHub does not prevent
> a merge whose tests fail, nor a direct push to `master`.

The GitHub repository is private, on the free plan: branch protection rules are not
available there (the API returns `403 Upgrade to GitHub Pro or make this repository public`,
observed on 15 October 2026). The constitution's rule, "No change may be
merged if the test suite fails", therefore relies on the person who merges
(decision D10, `specs/003-corrections-audit-technique/spec.md`).

## Rules

- Every change to `master` goes through a pull request. No direct push to
  `master`.
- Just before merging, the person who merges checks the four controls below
  on the **latest commit** of the pull request, and ticks them in its description (template
  `.github/pull_request_template.md`).
- A control that is unchecked or not satisfied forbids the merge.

## The four controls

| #   | Control                | How to check it                                                                                                                                                                                                                                                | Merge forbidden if                                                                        |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | CI result              | `gh pr checks <n°>` or the "Checks" tab: the "Contrôles qualité" (quality checks) job ran on the latest commit                                                                                                                                                 | missing, in progress, failed or cancelled                                                 |
| 2   | Required tests         | the job ran all its steps: lint, backend and frontend types, unit, integration and frontend tests, `npm audit --audit-level=high`. For a release, in addition: `npm run test:e2e` run by hand and recorded in `docs/validation/`                                | a step is missing or was skipped; end-to-end report missing for a release                 |
| 3   | No unresolved failure  | no test disabled or skipped (`.skip`, `.only`, `--testPathIgnorePatterns`) without a reason recorded in `docs/validation/`; branch up to date with `master` (otherwise merge `master` into it and wait for a new green CI); no open review discussion          | one of these conditions is not met                                                        |
| 4   | Diff review            | full read of `gh pr diff <n°>` ("Files changed" tab) following the constitution's code review: tests written first and green, existing test expectations unchanged except for a documented exception, no secret, no unexpected file                           | a point of the review is not satisfied                                                    |

## Merge done despite a failure

Fix it right away with a new pull request (a fix or `git revert`), and record
it in `docs/validation/`.

## If branch protection becomes available

If the repository moves to a plan that allows it, create on `master` (GitHub → Settings → Branches →
Branch protection rules): "Require a pull request before merging", "Require status checks
to pass before merging" with "Contrôles qualité", "Require branches to be up to date before
merging". Controls 2 to 4 still have to be checked by hand.
