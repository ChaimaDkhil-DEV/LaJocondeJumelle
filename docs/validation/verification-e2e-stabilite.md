# Verification — end-to-end suite stabilised (7 profiles)

Branch `fix-e2e-stabilite`, created from `master` (`69921ca`, merge of #73).

## Results of 06/11/2026 (executed)

The commands ran on Windows, on the uncommitted final state of this branch, with sleep prevented
for the duration of the run.

| Step | Command | Result |
|-------|----------|----------|
| Lint | `npm run lint` | no errors |
| Types | `npm run -w backend typecheck`, `npm run -w frontend typecheck` | no errors |
| Backend unit | `npm run -w backend test` | 814 / 814 |
| Backend integration | `npm run -w backend test:integration` | 848 passed, 1 skipped (real Whisper test, without `ASSIST_WHISPER_TEST_URL`) |
| Frontend | `npm run -w frontend test` | 474 / 474 |
| Dependencies | `npm audit --audit-level=high` | passed: 30 vulnerabilities (5 low, 25 moderate), none high or critical |
| End-to-end | `npm run test:e2e` (7 profiles) | 205 passed, 0 failed, 0 flaky, 159 skipped, in 57.6 min |

The 159 end-to-end skips come from conditions declared in the specs (tests reserved for certain
profiles). The run started at 10:00 school time, so the evening-only skip of
`coverage-class.spec.ts` did not apply.

## Failures of the previous run and their causes

Full run of the same day on `69921ca`: 197 passed, 8 failed, 159 skipped.

| Test | Profile | Cause | Fix |
|------|--------|-------|-----|
| V13 `us5-admin-validation` | mobile-320 | **Application bug**: the late response to "Commencer" (Start) closed the "Terminer la demande" dialog opened in the meantime and lost the photo; real time can show the new status before that response | `RequestActions.tsx`: a response only closes the dialog of its own action; regression test added |
| SC-001 `sc001-create-timing` | iPhone 13, iPhone 17 Pro Max, Pixel 7 | The check ran before the redirect, on the form, whose collapsed "Demandes similaires" list holds other "Envoyée" badges | Wait for the request page first |
| V14 `us6-deadlines` | iPhone 13 | The server marking adds the same label to the history, so the selector was ambiguous | `first()` |
| `assist`, V9 `us2-process-request` | firefox | `localhost` resolves to `::1` and `127.0.0.1`, Vite listened on `::1` only: connection refused | Test server and `baseURL` set to `127.0.0.1` |
| V12 `us4-notifications` | mobile-320 | The computer went to sleep during the test (04:41 to 05:58) | None needed: sleep prevented during the run |
