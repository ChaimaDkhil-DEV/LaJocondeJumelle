---

description: "Task list for feature 007 — work request drafts"
---

# Tasks: Brouillons de demande de travail (Work request drafts)

**Input**: Design documents from `/specs/007-brouillons-demandes/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY — constitution, principle I (non-negotiable TDD). Each test task
placed before an implementation MUST be written and seen **red** before coding.
The form extraction (T005) is a refactoring: it MUST leave
`frontend/tests/requests/CreateRequestPage.test.tsx` green **without modification**. Any existing
expectation that is changed is recorded in `docs/validation/verification-007.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 (save, P1), US2 (find, resume, send, P1), US3 (delete, P2)

---

## Phase 1: Setup

- [X] T001 On `007-brouillons-demandes`, record the starting state (reference to the final verification of 006 and to the green CI of `master` if no code file has changed since) in a new `docs/validation/verification-007.md`, section « État initial » (Initial state)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `drafts` list scope, « Envoyées » without drafts, API calls on the UI side, reusable form

**⚠️ CRITICAL**: no story starts before this phase is finished

- [X] T002 New `backend/test/integration/requests-drafts.spec.ts` (red): `GET /api/requests?scope=drafts` returns only the drafts of the session's user (neither their sent requests, nor another user's drafts); `scope=mine` no longer returns any draft; `scope=drafts` without a session → 401
- [X] T003 In `backend/src/requests/requests.dto.ts`, add `'drafts'` to `REQUEST_SCOPES`; in `backend/src/requests/requests.service.ts` (`list`), `mine` → `{ requesterId: user.id, status: { not: 'DRAFT' } }`, `drafts` → `{ requesterId: user.id, status: 'DRAFT' }`; T002 green and `backend/test/integration/requests-create.spec.ts`, `requests-search.spec.ts` green (record any expectation touched)
- [X] T004 [P] Frontend: in `frontend/src/features/requests/types.ts`, `RequestScope` gains `'drafts'`; in `frontend/src/features/requests/api.ts`, `saveDraft(input)` (voice message upload then `POST` with `asDraft: true`), `updateDraft(id, changes)` (`PATCH`, `voiceFileId: null` to remove), `submitDraft(id, version)` (`POST …/actions` `SUBMIT`), `deleteDraft(id)` (`DELETE`)
- [X] T005 Extract the form from `frontend/src/features/requests/CreateRequestPage.tsx` into a new `frontend/src/features/requests/RequestForm.tsx` (fields, category and recipient rules, voice message, errors; initial values and actions supplied by the page); `CreateRequestPage` uses it with no change of behavior; `frontend/tests/requests/CreateRequestPage.test.tsx` green without modification

**Checkpoint**: the list distinguishes drafts from sent requests; the form is reusable

---

## Phase 3: User Story 1 - Save a request as a draft (Priority: P1) 🎯 MVP

**Goal**: « Enregistrer en brouillon » from « Nouvelle demande », without sending anything

**Independent Test**: save as a draft; no notification; the draft exists for its author alone

### Tests for User Story 1 ⚠️

- [X] T006 [P] [US1] New `frontend/tests/requests/drafts.test.tsx` (red), "save" block: « Enregistrer en brouillon » button present if `draftsEnabled` (public settings), absent otherwise; reduced validation (category « Choisissez une catégorie. », title « Saisissez un titre. »; description, voice message, recipient and priority not required); `POST /api/requests` call with `asDraft: true` and priority `NORMAL` by default; voice message uploaded first when there is one; success: toast « Brouillon enregistré. » and navigation to `/demandes/:id/brouillon`

### Implementation for User Story 1

- [X] T007 [US1] In `CreateRequestPage.tsx` (via `RequestForm`), secondary button « Enregistrer en brouillon » (if `draftsEnabled`), reduced validation, `saveDraft`, toast and navigation; network or server error: message, form kept (no outbox for a draft, R6); T006 green, `CreateRequestPage.test.tsx` green

**Checkpoint**: a draft can be saved (US1 alone deliverable: the draft is visible in the author's data)

---

## Phase 4: User Story 2 - Find, complete and send a draft (Priority: P1)

**Goal**: « Brouillons » tab, pre-filled draft page, save and send

**Independent Test**: open a draft from the tab, complete it, send it; status and notifications identical to a direct creation

### Tests for User Story 2 ⚠️

- [X] T008 [P] [US2] In `backend/test/integration/requests-drafts.spec.ts` (observation, green expected on the existing system): a draft sent through `SUBMIT` gets the status and notifications of a direct creation (direct mode: `SENT`, recipient notified; through the administration: `PENDING_ADMIN_VALIDATION`); `draftsEnabled` setting disabled: `asDraft` creation refused (`400`), but `PATCH`, `SUBMIT` and `DELETE` of an existing draft accepted (FR-008)
- [X] T009 [P] [US2] In `frontend/tests/requests/drafts.test.tsx` (red), "list" block: « Brouillons » tab shown only if `scope=drafts` returns at least one item; its list comes from `scope=drafts`; a draft leads to `/demandes/:id/brouillon`
- [X] T010 [P] [US2] In `frontend/tests/requests/drafts.test.tsx` (red), "draft page" block: title « Brouillon de demande », pre-filled form (category, recipient, priority, title, description); existing voice message with « Remplacer le message vocal » and « Supprimer le message vocal »; « Enregistrer le brouillon » → `PATCH` of only the changed fields, toast « Brouillon enregistré. »; « Envoyer la demande »: full validation (description or voice message), `PATCH` if there are changes then `SUBMIT` with the returned version, toast « Votre demande a été envoyée. » and navigation to `/demandes/:id`; `409 STATE_CHANGED` or `404`: message then return to « Mes demandes »; `/demandes/:id` of a draft redirects to `/demandes/:id/brouillon`

### Implementation for User Story 2

- [X] T011 [US2] In `frontend/src/features/requests/RequestListPage.tsx`, « Brouillons » tab (`?onglet=brouillons`, after « Envoyées ») based on `scope=drafts&limit=1`; drafts link to `/demandes/:id/brouillon`; T009 green
- [X] T012 [US2] New `frontend/src/features/requests/DraftPage.tsx` (pre-filling from `useRequest`, `RequestForm`, existing voice message through `VoicePlayer`, actions « Envoyer la demande » and « Enregistrer le brouillon »); route `demandes/:id/brouillon` in `frontend/src/app/routes.tsx`; redirect from `RequestDetailPage.tsx` when the status is `DRAFT`; T010 green
- [X] T013 [P] [US2] New `e2e/drafts.spec.ts` (Chromium): `enseignante` saves a « Photocopies » draft → « Brouillons » tab → resume → description completed → send → « Envoyée » detail; `reprographie` sees the request; the draft was never visible to `reprographie`
- [X] T014 [US2] Run `npm run -w backend test:integration`, `npm run -w frontend test` and `e2e/drafts.spec.ts` (Chromium): all green

**Checkpoint**: US1 and US2 deliverable together (full draft → send cycle)

---

## Phase 5: User Story 3 - Delete a draft (Priority: P2)

**Goal**: delete a draft after confirmation

**Independent Test**: delete with confirmation; cancelling deletes nothing

### Tests for User Story 3 ⚠️

- [X] T015 [P] [US3] In `frontend/tests/requests/drafts.test.tsx` (red), "delete" block: « Supprimer le brouillon » opens « Supprimer ce brouillon ? »; « Annuler » → no `DELETE`; « Supprimer » → `DELETE`, toast « Brouillon supprimé. » and return to « Mes demandes »

### Implementation for User Story 3

- [X] T016 [US3] In `DraftPage.tsx`, « Supprimer le brouillon » action with the existing `ConfirmDialog`, `deleteDraft`, toast, navigation; T015 green
- [X] T017 [P] [US3] In `e2e/drafts.spec.ts`, deletion flow (cancel then confirm, draft absent from the tab; the disappearance of the tab with no draft is covered by `drafts.test.tsx`, since the e2e database may contain other drafts)

**Checkpoint**: the three stories work

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 [P] In `e2e/a11y-responsive.spec.ts`, V18 test (`mobile-320`): « Nouvelle demande » screen with the draft button, « Brouillons » tab and draft page (axe, no horizontal scrolling); reach « Enregistrer en brouillon » by keyboard (FR-010, SC-005)
- [X] T019 [P] Update `docs/superadmin-fonctionnalites.md` (§1.1 « Mes demandes »: « Brouillons » tab; §4.3 remove « Brouillons : réglage et API présents, aucun écran pour en créer » (Drafts: setting and API present, no screen to create any); §2.6 drafts setting: « Complète » (Complete))
- [X] T020 Run through scenarios 1 to 8 of `specs/007-brouillons-demandes/quickstart.md` (automatic coverage and what remains to do by hand) and record in `docs/validation/verification-007.md`
- [X] T021 Final verification: `npm run verify`, backend and frontend typecheck, `npm run test:e2e` (all profiles) with outputs kept; record the counts; CI green; pull request according to `docs/procedure-fusion.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → **US1 (Phase 3)** → **US2 (Phase 4)** → **US3 (Phase 5)** → **Polish (Phase 6)**
- Phase 2 blocks all the stories (scopes, API calls, `RequestForm`).

### User Story Dependencies

- **US1**: after phase 2.
- **US2**: needs an existing draft; its tests create their own drafts (independent of US1's UI), but it shares `drafts.test.tsx` and `RequestForm`: do US1 first.
- **US3**: on US2's draft page (T012 before T016).

### Within Each User Story

- Red tests before implementation (T006 before T007; T009–T010 before T011–T012; T015 before T016).
- T008 is an **observation** of the existing system (green expected as soon as it is written): it fixes the server behaviors the UI relies on.

### Parallel Opportunities

- Phase 2: T004 in parallel with T002–T003; T005 in parallel with T002–T004.
- US2: T008, T009, T010 in parallel; T013 in parallel with T011–T012.
- Polish: T018 and T019 in parallel.

---

## Parallel Example: User Story 2

```text
T008 backend/test/integration/requests-drafts.spec.ts
T009 frontend/tests/requests/drafts.test.tsx (list)
T010 frontend/tests/requests/drafts.test.tsx (draft page) — same file as T009: write one after the other
```

---

## Implementation Strategy

### MVP First

1. Phases 1 and 2 (T001–T005)
2. US1 (T006–T007) and US2 (T008–T014): the draft → resume → send cycle has value only as a whole
3. **Stop and validate**: quickstart scenarios 1 to 5 and 7

### Incremental Delivery

1. Foundation → scopes and reusable form
2. US1 + US2 → usable drafts (MVP)
3. US3 → deletion
4. Polish → 320 px accessibility, documentation, final verification
