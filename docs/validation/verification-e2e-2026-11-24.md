# Verification — full end-to-end suite before going live (24/11/2026)

Run on `master` at `99251f3` (merge of #159), on Windows 11, one worker, with sleep prevented for the duration of the
run. CI « Contrôles qualité » is green on this commit. About 4.2 GB of RAM were free when the run started. No project
file was changed during the run.

## Result

**261 passed, 1 failed, 249 skipped**, in 1 h 37 (511 tests, 73 scenarios, 7 profiles).

```text
npx playwright test -c e2e/playwright.config.ts --reporter=list,html,json
```

Same configuration as `npm run test:e2e`; only a JSON report was added.

| Profile | Passed | Failed | Skipped | Test time |
|---------|--------|--------|---------|-----------|
| chromium | 63 | 1 | 9 | 19.8 min |
| firefox | 31 | 0 | 42 | 17.2 min |
| webkit | 31 | 0 | 42 | 13.7 min |
| iPhone 13 | 33 | 0 | 40 | 13.4 min |
| iPhone 17 Pro Max | 32 | 0 | 41 | 12.8 min |
| Pixel 7 | 32 | 0 | 41 | 9.0 min |
| mobile-320 | 39 | 0 | 34 | 9.9 min |

The 249 skips all come from conditions declared in the specs, for scenarios reserved to certain profiles. **Every
scenario was executed on at least one profile.**

## The failure: `timetable.spec.ts:108` (chromium)

**Intermittent, and a fault of the test: no application bug was identified.** This scenario only runs on chromium.

| Run | Result |
|-----|--------|
| Full suite | failed (120 s timeout) |
| Alone, 1st rerun | failed (details not kept) |
| Alone, 2nd rerun | passed |
| Repeated 4 times in one run | 4 failed |

- **Cause, read in the traces of the full run and of the 1st repetition.** After `goto('/')` the test reads
  `isVisible()` on the « Ouvrir le menu » button, which does not wait. The button was not displayed yet, so the menu was
  not opened. The test then waited for the link « Mon emploi du temps », hidden in the closed menu, until the timeout.
- **Repetitions 2 to 4 are a consequence of the 1st.** When the test times out, its cleanup can no longer reach the API:
  the session it created stays in the timetable. The next repetitions share the same database and class: the API
  answered 409 (conflict) to their first session, read in the traces, and the form « Nouvelle séance » stayed open.
- The whole scenario passed in the 2nd rerun above, and on the branch of #159 before it was merged.

The test is not fixed by this report. To do: wait for the menu button before reading its state, and cancel the session
even after a timeout. The same `if (await menu.isVisible())` pattern exists in `admin-dashboard`,
`admin-reference-admin`, `empty-class-qr`, `multi-admin`, `surveillance` and `us8-admin`; those passed in this run.

## Earlier run of the same day, and fixes of #159

A first, partial run on `f572d3f` (merge of #158), limited to `chromium` and `mobile-320` without traces: **96 passed,
7 failed, 43 skipped**, in 31 minutes. The full suite had not been run since 19/11, while several screens were redesigned
(#151 to #155).

| Test | Profiles | Cause | Fix in #159 |
|------|----------|-------|-------------|
| `student-situation` (desktop) | chromium | Stale expectation, then **application bug**: the « Élèves » page overflowed by 821 px | `visuallyHidden` |
| `admin-dashboard` | chromium, mobile-320 | Stale expectation, then **application bug** at 320 px: « Demandes » tab widened to 509 px, link not clickable | `position: relative` on the scrolling area |
| `timetable` | chromium | **Application bug**: the teacher or class list had no accessible name. Then a stale expectation | `labelId`; a session of the grid is a button |
| `admin-niveaux`, `import-csv`, `student-situation` (320 px) | chromium | Stale expectation: the student search field was renamed | Expectation updated |

All of them pass in the full run above, except `timetable`, for the reason given there. The overflow of the « Demandes »
tab did not block the same click during the first partial run; that difference was not investigated.

## Not covered

- **Real devices**: the iPhone and Pixel profiles are emulated. `iphone-manuel.md` and the usability test remain to do.
- **The production stack**: no Docker, Caddy, HTTPS or Ubuntu here, and the API runs with `NODE_ENV=test`. The production
  checks of #158 are covered by unit tests only, and the new Caddy configuration has not been validated by Caddy.
- **External services**: demonstration providers replace Whisper and Claude; n8n, push services and Cloudflare are not
  contacted.
- **Load**: one test at a time.

## Conclusion

Check 2 of `docs/procedure-fusion.md` requires this suite to be run by hand and recorded for a release: this is that
record, for `99251f3`. **It is not entirely green.** The `timetable` test must be made reliable, then rerun, before
the box « Tests de bout en bout » of `docs/mise-en-production.md` is ticked. Any later change to the application needs a
new run.
