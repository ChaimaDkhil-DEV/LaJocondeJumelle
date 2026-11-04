## Summary

<!-- What this pull request changes, and why. -->

## Checks before merging

Manual procedure: `docs/procedure-fusion.md`. GitHub does not block
the merge; an unchecked box forbids merging.

- [ ] **1. CI**: "Contrôles qualité" (quality checks) passed on the latest commit (`gh pr checks <n°>`); not
      missing, not in progress, not failed, not cancelled
- [ ] **2. Required tests**: all CI steps ran; for a release,
      `npm run test:e2e` run by hand and recorded in `docs/validation/`
- [ ] **3. No unresolved failure**: no test disabled or skipped without a recorded reason;
      branch up to date with `master`; no open review discussion
- [ ] **4. Diff reviewed** (`gh pr diff <n°>`): tests written first and green, existing expectations
      unchanged except for a documented exception, no secret, no unexpected file
