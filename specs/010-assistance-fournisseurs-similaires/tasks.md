# Tasks: Assistance aux demandes — fournisseurs réels et demandes similaires (Request assistance — real providers and similar requests)

**Input**: Design documents from `/specs/010-assistance-fournisseurs-similaires/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: mandatory (constitution, principle I): each test is written and seen red before the code.
No test calls an external service (`fetch` and SDK simulated).

**Organization**: one phase per user story; US1 (similar requests) is the MVP.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 On `010-assistance-fournisseurs-et-similaires`, record the starting state (`npm run lint`, typechecks, `npm test -w backend`, `npm run -w backend test:integration`, `npm test -w frontend`) in a new `docs/validation/verification-010.md`, section « État initial » (Initial state)
- [X] T002 Add `@anthropic-ai/sdk` to the dependencies of `backend/package.json` (`npm install -w backend @anthropic-ai/sdk`), check `npm audit --audit-level=high` with no new vulnerability due to this package; note the version in `docs/validation/verification-010.md`

---

## Phase 2: Foundational (configuration)

- [X] T003 In `backend/test/unit/config.spec.ts` (red): `ASSIST_SUGGESTION_PROVIDER` accepts `disabled | demo | claude`; `claude` without `ANTHROPIC_API_KEY` → `ConfigError` (message without key value); `ASSIST_CLAUDE_MODEL` default `claude-opus-5-5`; `ASSIST_TRANSCRIPTION_PROVIDER` accepts `disabled | demo | whisper`; `whisper` without `ASSIST_WHISPER_URL` or with an invalid URL → `ConfigError`; "`https` in production, `http`/`https` otherwise"; `ASSIST_WHISPER_MODEL` default `Systran/faster-whisper-small`; `ASSIST_WHISPER_API_KEY` optional; `demo` still refused in production
- [X] T004 Implement T003 in `backend/src/config/config.ts` (`AssistConfig`: `claude?: { apiKey, model }`, `whisper?: { url, model, apiKey }`); document the variables, without secret values, in `backend/.env.example`

**Checkpoint**: configuration validated at startup

---

## Phase 3: User Story 1 - Similar requests (Priority: P1) 🎯 MVP

**Goal**: up to 3 close and visible requests displayed in the panel, sent to the provider reduced to title, category and priority

**Independent Test**: with `demo`, a close visible request appears; an invisible one, a draft or a shift never

### Tests for User Story 1 ⚠️

- [X] T005 [P] [US1] New `backend/test/integration/assist-similar.spec.ts` (red): `SimilarRequestsService.find(user, text)` returns at most 3 requests `{ id, reference, title, categoryName, priority, status }`, sorted by closeness then descending `createdAt`; never a non-visible request (other requester, other department), a draft, even their own, nor a shift; text with no common word → `[]`; text with `'`, `|`, `&`, `!`, `:`, `\` → no error; category admin: sees the requests of their category
- [X] T006 [P] [US1] In `backend/test/integration/assist-suggestions.spec.ts` (red): the response contains `similar` (visible only); the simulated provider receives `similar` in the form `[{ title, categoryName, priority }]` only, without description or identifier; no write
- [X] T007 [P] [US1] In `frontend/tests/assist/assist-panel.test.tsx` (red): « Demandes similaires » section (named list, link « reference · title » to `/demandes/:id` with `target="_blank"` and `rel="noopener"`, « nouvel onglet » mention, category, priority and status as labels); absent when `similar` is empty; form unchanged

### Implementation for User Story 1

- [X] T008 [US1] New `backend/src/assist/similar-requests.service.ts` (research R1): parameterized `$queryRaw` (`kind = 'WORK'`, `status <> 'DRAFT'`, `to_tsvector('french', title || ' ' || coalesce(description, ''))`, `ts_rank > 0`, 20 candidates), then `prisma.request.findMany` with `AND: [visibleRequestsWhere(user), { id: { in } }]`, first 3 in rank order; registered in `backend/src/assist/assist.module.ts`; T005 green
- [X] T009 [US1] `backend/src/assist/providers/assist-providers.ts`: `SuggestionInput.similar: Array<{ title; categoryName; priority }>`; `backend/src/assist/assist.service.ts`: `similar` computed, sent reduced (R7) and returned in `SuggestionResult`; T006 green
- [X] T010 [US1] `frontend/src/features/assist/api.ts` (`similar` in `SuggestionResult`) and `frontend/src/features/assist/AssistPanel.tsx` (section, contract `contracts/ui.md`); T007 green

**Checkpoint**: similar requests deliverable alone

---

## Phase 4: User Story 2 - Whisper connector (Priority: P2)

**Goal**: transcription by the school's server, ready to activate

**Independent Test**: connector on simulated `fetch`

### Tests for User Story 2 ⚠️

- [X] T011 [P] [US2] New `backend/test/unit/assist-whisper.spec.ts` (red): `POST {url}/v1/audio/transcriptions` (trailing slash of the URL tolerated); `FormData` with `file` (content of the converted voice message, type `audio/mp4`), `model`, `language=fr`, `response_format=json`; `Authorization: Bearer` only if a key is configured; `signal` passed; response `{ text }` returned; non-2xx status, invalid JSON, missing `text` → error whose message contains neither the address, nor the key, nor the body; no real network call (`fetch` simulated)

### Implementation for User Story 2

- [X] T012 [US2] New `backend/src/assist/providers/whisper-transcription.ts` (R5) and wiring in `transcriptionProviderFor` (`backend/src/assist/providers/assist-providers.ts`); T011 green

---

## Phase 5: User Story 3 - Claude connector (Priority: P3)

**Goal**: analysis by a Claude model, ready to activate, checked output

**Independent Test**: connector on a simulated SDK client

### Tests for User Story 3 ⚠️

- [X] T013 [P] [US3] New `backend/test/unit/assist-claude.spec.ts` (red): `beta.messages.create` request with configured `model`, `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`, `output_config.effort: 'low'`, `output_config.format.type: 'json_schema'` in which `categoryId` is an `enum` of the transmitted categories plus `null` and `priority` an `enum` `NORMAL | MEDIUM | HIGH | URGENT` plus `null`, `additionalProperties: false`; system instruction to treat as data; text between `<demande>` and `</demande>`; guidelines and similar requests (title, category, priority) in the message; `signal` passed; JSON response → object without the `null`s; `stop_reason: 'refusal'`, invalid JSON or missing text block → error without the key; client built with `maxRetries: 0`
- [X] T014 [P] [US3] In `backend/test/unit/assist-sanitize.spec.ts`: a simulated connector output with category outside the list, priority `CRITICAL` and unknown source is filtered (safeguard independent of the output constraint)

### Implementation for User Story 3

- [X] T015 [US3] New `backend/src/assist/providers/claude-suggestion.ts` (R3, R4, contract `contracts/rest-api.md`) and wiring in `suggestionProviderFor`; T013 and T014 green

---

## Phase 6: User Story 4 - Transcription replaced (Priority: P3)

- [X] T016 [US4] In `frontend/tests/assist/assist-panel.test.tsx`: after a transcription, redoing the voice message hides the previous transcription and the next click requests a new transcription (2 calls to `/api/assist/transcriptions`); fix `frontend/src/features/assist/AssistPanel.tsx` if the test fails

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T017 [P] `e2e/assist.spec.ts`: similar request visible in the panel (prior creation through the API, same account), link opening a new tab; axe audit without violations
- [X] T018 [P] Documentation: `docs/ARCHITECTURE.md` (section 14: connectors, similar requests, variables), `specs/009-assistance-ia-demandes/spec.md` unchanged except a pointer to 010 in "Assumptions"
- [X] T019 Final verification in `docs/validation/verification-010.md`: lint, typechecks, unit, integration, frontend, relevant e2e, `npm audit`; real results; limits (connectors not tried with a real service)

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1, US2, US3 (independent of each other) → US4 → Phase 7
- Within each story: red tests, then implementation
- US3 depends on T002 (SDK) and T004 (configuration); US2 on T004

### Parallel Opportunities

- T005, T006, T007 (distinct files); T011 and T013, T014; T017 and T018

## Implementation Strategy

1. MVP: Phases 1-3 (similar requests), useful without a decision by the school.
2. Connectors (US2, US3): delivered disabled.
3. US4 and finishing touches.

---

## Phase 8: 011 addition — without a subscription (US5, US6)

- [X] T020 [US5] `backend/test/unit/config.spec.ts`, new `backend/test/unit/assist-providers.spec.ts` (red): `rules` accepted in production for suggestions, refused for transcription; `demo` transcription refused in production; `rules` = `demoSuggest`, cancellable; then `backend/src/config/config.ts` and `backend/src/assist/providers/assist-providers.ts`
- [X] T021 [US6] Tests (red): `ASSIST_TRANSCRIPTION_TIMEOUT_MS` from 1,000 to 300,000 ms, default 120,000; simulated provider of 2 s: transcription succeeded (timeout 4 s), suggestions unavailable (timeout 1 s); then `config.ts` and `AssistService.callProvider` (timeout per call)
- [X] T022 [US6] Tests (red) then `ASSIST_WHISPER_CA_FILE`: certificate read on each call and passed to the TLS connection (verification never disabled); Node's native HTTP(S) transport verified against a local test server
- [X] T023 [US6] `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/.env.example`: `ASSIST_*` variables passed to the API; `whisper` service (pinned image, no port, models volume, profile disabled by default); internal Caddy block `:8444` `tls internal`; Caddy volume mounted read-only in the API
- [X] T024 [US6] `deploy/docker-compose.dev.yml`: `whisper` service (same image, profile), without changing the existing services
- [X] T025 [US6] Optional integration test `backend/test/integration/assist-whisper-live.spec.ts`, skipped without `ASSIST_WHISPER_TEST_URL`
- [ ] T026 [US6] Real measurement (Docker): transcription of a voice message without personal data, connector compatibility, calibration of the default timeout; `docs/validation/verification-011.md`
- [ ] T027 Documentation (`docs/ARCHITECTURE.md`, `quickstart.md`) and verifications (lint, typechecks, unit, integration, frontend, relevant E2E, `npm audit`)
