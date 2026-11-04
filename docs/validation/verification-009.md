# Verification of feature 009 — AI assistance for creating requests (foundation)

Specification, plan and tasks: `specs/009-assistance-ia-demandes/`.

## Initial state (T001)

Branch `009-assistance-ia-demandes`, created from `master` (`3124e78`, merge of PR #34).
Suites re-run on 27/10/2026, before any code change:

| Step | Result |
|-------|----------|
| Backend types (`tsc --noEmit`) | no errors |
| Backend unit tests | 608 / 608 (32 suites) |
| Backend integration tests | 642 / 642 (45 suites) |
| Frontend types (`tsc -b --noEmit`) | no errors |
| Frontend tests (Vitest) | 288 / 288 (37 files) |

## Final verification (T042)

Suites re-run on 28/10/2026 on branch `009-assistance-ia-demandes`, after T018 to T041.
Real results:

| Step | Command | Result | Before (T001) |
|-------|----------|----------|--------------|
| Backend types | `npm run -w backend typecheck` | no errors | no errors |
| Backend unit tests | `npm test -w backend` | 661 / 661 (36 suites) | 608 / 608 (32) |
| Backend integration tests | `npm run -w backend test:integration` | 687 / 687 (49 suites) | 642 / 642 (45) |
| Frontend types | `npm run -w frontend typecheck` | no errors | no errors |
| Frontend tests (Vitest) | `npm test -w frontend` | 317 / 317 (40 files) | 288 / 288 (37) |
| Assistance E2E | `npx playwright test -c e2e/playwright.config.ts assist.spec.ts` | chromium, mobile-320, firefox, webkit: 8 / 8 | — |
| 320 px and keyboard E2E (009) | `a11y-responsive.spec.ts`, scenario "009" | mobile-320: passed, no horizontal scrolling or axe violation | — |
| Existing E2E touching creation | `us1-create-voice-request`, `drafts`, `a11y-responsive`, `us8-admin` (chromium, mobile-320) | 15 passed, 7 skipped (scenarios specific to another profile) | — |

New tests: `assist-suggestions.spec.ts` (suggestions, permissions, untrusted responses,
deactivation, timeout, call limit, log without the text), `assist-transcriptions.spec.ts`
(no file or `File` row kept), `requests-create.spec.ts` (`ASSIST_SUGGESTED` event,
invalid, expired or other-user token, draft, resend, workflow B,
disabled category), `frontend/tests/admin/guidelines.test.tsx`,
`frontend/tests/assist/assist-panel.test.tsx`, `frontend/tests/requests/history-assist.test.tsx`,
`e2e/assist.spec.ts`.

### Deviations and limits

- **No real provider**: `disabled` by default, `demo` (local, deterministic, refused in
  production). The demonstration suggestions pick out words from the guidelines and category
  names; they prove the flow, not the quality of a model. Plugging in a real provider
  requires a decision by the school (data processing agreement, retention) and an update of the
  specification.
- **Demonstration transcription**: fixed text (`ASSIST_DEMO_TRANSCRIPT`), whatever the voice message.
- **Word search** (PostgreSQL full text in French), no semantic search
  (pgvector ruled out: research R5).
- **No confidence score** (FR-004); the suggested title serves as the summary.
- **In-memory call limit**: valid for a single API instance (current deployment).
- Out of scope: guards (class coverage) and resuming a draft.
- The full E2E suite (all files, all browsers) was not re-run: only the
  files above were.
