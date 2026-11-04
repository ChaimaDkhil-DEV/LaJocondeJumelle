# Verification of feature 010 — real connectors and similar requests

Specification, plan and tasks: `specs/010-assistance-fournisseurs-similaires/`.

## Initial state (T001)

Branch `010-assistance-fournisseurs-et-similaires`, created from `master` (`7a55b83`, merge of #41). Reference: latest results measured on this code on 28/10/2026 — lint and types with no
errors, backend unit 661 / 661, integration 687 / 687 (before #39 to #41, no backend change
since), frontend 325 / 325. The run started at the beginning of this phase is not used: it
already included the new tests written in parallel.

## Dependency added (T002)

`@anthropic-ai/sdk` 1.3.0 (backend), the official SDK required by the API reference for a
TypeScript project. `npm audit --audit-level=high`: 16 vulnerabilities before and after the addition (none
in this package); the 4 existing "high" ones (`multer`, `body-parser`, `undici`) are pre-existing and
have been making the CI `npm audit` step fail since the end of October.

## Final verification (T019)

On 28/10/2026, real results:

| Step | Command | Result |
|-------|----------|----------|
| Lint | `npm run lint` | no errors |
| Backend and frontend types | `npm run -w backend typecheck`, `npm run -w frontend typecheck` | no errors |
| Backend unit | `npm test -w backend` | 679 / 679 (38 suites; +18: configuration, Whisper, Claude, check) |
| Backend integration | `npm run -w backend test:integration` | 693 / 693 (50 suites; +6: similar requests and permissions) — see "Écarts" (Deviations) |
| Frontend (Vitest) | `npm test -w frontend` | 328 / 328 (+3: section, absence, transcription replaced) |
| Assistance E2E | `assist.spec.ts` (chromium, mobile-320) | 6 / 6, including the similar request and the axe audit |
| 320 px and keyboard E2E | `a11y-responsive.spec.ts` (chromium, mobile-320) | 5 passed, 5 deliberately skipped |
| Dependencies | `npm audit --audit-level=high` | 4 pre-existing "high", none new |

### Deviations and limits

- **Integration**: a first full run counted 1 failure out of 693; two full re-runs
  are green (693 / 693). The test at fault was not identified (filtered output): to be monitored.
- **UI test T007** written before the code but run only afterwards: its red state was not
  observed. T016 passes without any code change (behavior already correct, now proven).
- **Connectors not tried with a real service**: verified only with simulated `fetch` and SDK
  (no network call, SC-004). A real trial requires the school's decision and a key.
- **Server fallback** `fallbacks: "default"` enabled on the Claude connector: in case of a
  safety refusal, the request is replayed on another Claude model; to be disabled if the school
  refuses it.
- Firefox, WebKit, iPhone 13 and Pixel 7 E2E not re-run.
