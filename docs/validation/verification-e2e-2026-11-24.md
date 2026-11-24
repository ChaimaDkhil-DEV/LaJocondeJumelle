# Verification — full end-to-end suite before going live (24/11/2026)

## Final result: `master` at `97031dc`

**262 passed, 0 failed, 249 skipped**, in 14 min 27 s. GitHub Actions run 45368532406, workflow « E2E » started by hand
(`gh workflow run E2E --ref master`), Ubuntu, one profile per machine with its own database, no retry. CI « Contrôles
qualité » is green on the same commit, which contains the fixes below (#159, #161) and the workflow (#162).

| Profile | Passed | Failed | Skipped | Test time |
|---------|--------|--------|---------|-----------|
| chromium | 64 | 0 | 9 | 12.4 min |
| firefox | 31 | 0 | 42 | 7.6 min |
| webkit | 31 | 0 | 42 | 4.9 min |
| iPhone 13 | 33 | 0 | 40 | 6.7 min |
| iPhone 17 Pro Max | 32 | 0 | 41 | 8.3 min |
| Pixel 7 | 32 | 0 | 41 | 4.0 min |
| mobile-320 | 39 | 0 | 34 | 8.4 min |

The same 7 profiles were also all green on `7da15cd` and on `f732abd`, before the merge of #162. Three earlier
attempts of the workflow did not finish: two because some machines were still installing packages (slow Ubuntu mirror,
no test started on them), one because of an invalid workflow file.

## Earlier full run: `master` at `99251f3`

Run on `master` at `99251f3` (merge of #159), on Windows 11, one worker, with sleep prevented for the duration of the
run. CI « Contrôles qualité » is green on this commit. About 4.2 GB of RAM were free when the run started. No project
file was changed during the run.

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

### The failure: `timetable.spec.ts:108` (chromium)

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

Fixed in #161 (tests only): `e2e/support/navigation.ts` waits for the menu button or the navigation before reading its
state, in `timetable` and in the six other specs with the same pattern (`admin-dashboard`, `admin-reference-admin`,
`empty-class-qr`, `multi-admin`, `surveillance`, `us8-admin`); `timetable` cancels its session even after a timeout.

| Check of #161, on the computer | Before | After |
|--------------------------------|--------|-------|
| `timetable` repeated in one run | 4 failures out of 4 | 6 passes out of 6 |
| First repetition blocked on purpose | the next ones were refused (409) | the next 2 pass |
| The 7 specs, 7 profiles | – | 40 passed, 0 failed, 30 skipped |

## First partial run of the day, and fixes of #159

A first, partial run on `f572d3f` (merge of #158), limited to `chromium` and `mobile-320` without traces: **96 passed,
7 failed, 43 skipped**, in 31 minutes. The full suite had not been run since 19/11, while several screens were redesigned
(#151 to #155).

| Test | Profiles | Cause | Fix in #159 |
|------|----------|-------|-------------|
| `student-situation` (desktop) | chromium | Stale expectation, then **application bug**: the « Élèves » page overflowed by 821 px | `visuallyHidden` |
| `admin-dashboard` | chromium, mobile-320 | Stale expectation, then **application bug** at 320 px: « Demandes » tab widened to 509 px, link not clickable | `position: relative` on the scrolling area |
| `timetable` | chromium | **Application bug**: the teacher or class list had no accessible name. Then a stale expectation | `labelId`; a session of the grid is a button |
| `admin-niveaux`, `import-csv`, `student-situation` (320 px) | chromium | Stale expectation: the student search field was renamed | Expectation updated |

All of them pass in the final run. The overflow of the « Demandes »
tab did not block the same click during the first partial run; that difference was not investigated.

## Not covered

- **Real devices**: the iPhone and Pixel profiles are emulated. `iphone-manuel.md` and the usability test remain to do.
- **The production stack**: no Docker, Caddy or HTTPS here (Ubuntu only as the machine of the final run), and the API runs with `NODE_ENV=test`. The production
  checks of #158 are covered by unit tests only, and the new Caddy configuration has not been validated by Caddy.
- **External services**: demonstration providers replace Whisper and Claude; n8n, push services and Cloudflare are not
  contacted.
- **Load**: one test at a time.

## Conclusion

Check 2 of `docs/procedure-fusion.md` requires this suite to be run by hand and recorded for a release: this is that
record, for `97031dc`. **The suite is entirely green on that commit.** The commit deployed on the server must be this
one, or a later one that changes only documentation; any change to the application needs a new run.
