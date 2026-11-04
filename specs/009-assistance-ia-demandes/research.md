# Research: Assistance IA à la création des demandes (socle) (AI assistance when creating requests (foundation))

Design decisions, each with its reason and the alternatives discarded.

## R1 — Interchangeable providers, no external call

- **Decision**: two server-side interfaces, `TranscriptionProvider` and `SuggestionProvider`,
  chosen by configuration (`ASSIST_TRANSCRIPTION_PROVIDER`, `ASSIST_SUGGESTION_PROVIDER`).
  This phase provides two implementations of each: `disabled` (default) and `demo`
  (deterministic, local, no network). `demo` is refused at startup when
  `NODE_ENV=production` (`ConfigError`): a fake transcription must never reach real
  users.
- **Why**: framing decision ("foundation first"); the application calls no third party
  today (`docs/ARCHITECTURE.md`) and this phase does not change that state (SC-009). A real
  provider will be added as a new implementation, without touching the flow (FR-020).
- **Alternatives discarded**: plugging in an online provider right now (GDPR decision not
  made); a local model (server load and heavy dependencies for a demonstration phase).

## R2 — Demonstration provider

- **`demo` transcription**: returns fixed text (`ASSIST_DEMO_TRANSCRIPT`, otherwise a default
  sentence flagged as a demonstration) after the real audio checks (R4). It proves the flow,
  not speech recognition.
- **`demo` suggestions** (pure function `demoSuggest`):
  - category: that of the best-ranked guideline attached to a category; otherwise a
    category with a word of its name (4 letters or more, without accents) in the text; otherwise
    none;
  - priority: the « Priorité : Normale | Moyenne | Haute | Urgente » mention of the first
    retained guideline that contains one; otherwise `URGENT` if the text contains « urgent »; otherwise
    none;
  - title: the first sentence of the text, cut at 120 characters on a word;
  - justification: « D'après la consigne « … ». » (According to the guideline "…".) or « D'après le
    nom de la catégorie « … ». » (According to the category name "…".);
  - missing information: « Décrivez le besoin en quelques mots. » (Describe the need in a few
    words.) under 4 words.
- **Why**: predictable results for unit, integration and e2e tests, with no cost
  or network; by construction it ignores any instruction contained in the text.

## R3 — Strict validation of responses (FR-005, FR-012)

- **Decision**: a pure function `sanitizeSuggestion(raw: unknown, allowed)` checks each
  field separately: `categoryId` ∈ categories allowed for this user, `priority` ∈
  `Priority` (Prisma), lengths (title 120, justification 500, 3 missing-information items of
  200 characters), `sourceIds` ⊂ guidelines actually transmitted. An invalid field is
  discarded and counted (`discarded`); if nothing remains, the response counts as "no
  reliable suggestion". The provider's response is typed `unknown`: no field is used without this
  check.
- **Why**: even a real provider that is compromised or fooled by an injection can only produce
  a bounded suggestion; nothing is executed.
- **Alternative discarded**: adding zod or ajv (new dependency for a single structure;
  class-validator serves request bodies, not internal responses).

## R4 — Transcription without a kept file (FR-008, FR-009)

- **Decision**: `POST /api/assist/transcriptions` receives the recording (multipart, like
  `POST /api/files`), applies the same checks (size `voiceMaxBytes`, signature, ffprobe,
  duration `voiceMaxSeconds`, conversion) thanks to a function extracted from `FilesService.upload`
  (`prepareVoice`), transcribes the converted file then erases it in a `finally`. No `File`
  row is created.
- **Why**: in the form, the voice message stays in the browser until submission
  (`submitRequest`, offline outbox); uploading it earlier would create one more temporary file
  and change the submission flow. The voice message is sent twice (under
  2 MB for 180 s at 64 kbit/s): cost accepted.
- **Alternative discarded**: uploading the voice message as temporary and transcribing by identifier
  (orphan files, double attachment to manage).

## R5 — Guidelines and PostgreSQL full-text search (FR-015 to FR-017)

- **Decision**: table `Guideline` (title, text, optional category, active, author of the
  last modification). Search by parameterized `$queryRaw`:
  - query built database-side from the lexemes of the text:
    `to_tsquery('simple', string_agg(quote_literal(lexeme), ' | '))` over
    `unnest(to_tsvector('french', $texte))` ("or" between words, no double stemming);
  - document: `to_tsvector('french', title || ' ' || body)`;
  - filters: `active = true` and (`categoryId IS NULL` or `categoryId = ANY($allowedCategories)`);
  - ranking `ts_rank`, rank > 0, 5 results at most; excerpt = first 200 characters.
- **Why**: a few dozen guidelines; the PostgreSQL 17 `french` configuration
  is enough, with no extension or index (negligible scan). The access filters are in the
  query: an unauthorized guideline is never read (FR-016, SC-006).
- **Alternatives discarded**: pgvector (change of the `postgres:17` image, embeddings
  provider, hence external call or local model); in-memory search in Node (French accents and
  stems to redo).

## R6 — Link the suggestion to the created request without storing it (FR-023, FR-025)

- **Decision**: the response of `POST /api/assist/suggestions` contains a signed `token`
  (HMAC-SHA256, key derived from `SESSION_SECRET` with a prefix specific to this use, `node:crypto`)
  that carries the user, the issue time and the suggested values (title, category,
  priority, sources: identifier and title). `CreateRequestDto` accepts an optional
  `assistToken`. On submission (not for a draft), if the token is valid, from the same user and
  issued less than 24 h ago, `create` writes in the same transaction a `RequestEvent`
  `ASSIST_SUGGESTED`: `fromValue` = suggested values and sources, `toValue` = values actually
  saved. A missing, invalid or expired token is ignored: creation never depends on it.
- **Why**: no suggestion is kept until the request is submitted
  (abandoned form: no trace); the suggested values cannot be forged by
  the browser; 24 h covers deferred submission through the offline outbox.
- **Alternatives discarded**: suggestions table (data kept for abandoned forms);
  suggested values sent back in clear by the browser (forgeable history).

## R7 — Call limit per user (FR-014)

- **Decision**: `AssistRateLimiter`, in-memory sliding window per user, shared by
  transcription and suggestions: `ASSIST_RATE_LIMIT` (10 by default) calls per 5 minutes.
  Exceeded: `ASSIST_RATE_LIMITED` (429, message adapted to the 5-minute window) and `ACCESS_DENIED` logged with
  `reason: RATE_LIMITED`, like login.
- **Why**: the API runs in a single container (`deploy/docker-compose.yml`); the key is
  the user, not the IP address (school behind a single address).
- **Alternative discarded**: a second named throttler in `ThrottlerModule`: it would also apply
  to `LoginThrottlerGuard`, which goes through all declared throttlers.

## R8 — Timeout and errors (FR-021, FR-024)

- **Decision**: each provider call receives an `AbortSignal.timeout(ASSIST_TIMEOUT_MS)`
  (15,000 ms by default, bounded to 1,000 to 20,000 ms). Timeout exceeded or error:
  `ASSIST_UNAVAILABLE` (503, new error code, message « Les propositions ne sont pas
  disponibles pour le moment. Vous pouvez remplir la demande vous-même. » (Suggestions are not
  available at the moment. You can fill in the request yourself.)); empty transcription:
  `TRANSCRIPTION_EMPTY` (422). Application log: error type, provider and duration, never the
  text or the audio. Assistance disabled: `ASSIST_DISABLED` (404), and the form does not offer
  the action.
- **Why**: 15 s leaves margin under the 20 s of SC-005 (audio conversion included).

## R9 — UI

- **Decision**: `AssistPanel` (new, `features/assist/`) placed in `CreateRequestPage` under
  the fields, outside `RequestFields` (draft resumption stays unchanged). It reads
  `useClientSettings()` (`assistSuggestions`, `assistTranscription`, added to
  `GET /api/settings/client`) and `navigator.onLine`. The « Appliquer » actions call the
  existing setters of `useRequestForm`; only the most recent response is displayed (request
  counter); arrival of suggestions and errors announced by an `aria-live` region.
  `assistToken` is attached to `submitRequest` (and to the outbox).
- **Guidelines**: « Consignes » tab of the Administrator area (`/admin/consignes`), same
  model as « Catégories » (list, input dialog, deletion confirmation).

## R10 — Tests

- Unit (Jest): `sanitizeSuggestion`, `demoSuggest`, token (signature, expiry,
  user), `AssistRateLimiter`, configuration (`demo` refused in production, timeout
  bounds).
- Integration (Jest + embedded PostgreSQL): guideline search (access filters, inactive
  or deleted guidelines, no result), suggestions (unauthorized category never
  suggested, text with instructions, failing or too slow provider, malformed response),
  no business write, creation with token (event, kept values, administrative validation
  unchanged), invalid token ignored, draft without event, access denial,
  call limit, transcription (audio erased, empty voice message rejected), guideline CRUD and audit.
- UI (Vitest): panel (disabled, offline, loading, error, apply, does not replace
  the description without confirmation, last response only), guideline management.
- E2E (Playwright, `demo` providers in `e2e-server`): full flow and axe audit at
  320 px.
