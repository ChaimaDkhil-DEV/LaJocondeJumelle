# Research — 007 Brouillons de demande de travail (Work request drafts)

The server already handles drafts (`asDraft` creation, `PATCH`, `DELETE`, `SUBMIT` action,
visibility to the author alone, `draftsEnabled` setting that blocks only creation). Decisions
fixed from `master` (`c0f16fb`).

## R1 — List: « Brouillons » tab, « Envoyées » without drafts (Clarification Q1, FR-004, FR-004b)

- **Decision**: on the server side, new scope `scope=drafts` (the user's requests with status
  `DRAFT`) and `scope=mine` **without** drafts (`status <> DRAFT`). On the UI side, a
  « Brouillons » tab (`?onglet=brouillons`) shown only if a `scope=drafts&limit=1` request
  returns at least one item.
- **Rationale**: the API's status filter is an inclusion list; excluding drafts
  on the client side would require enumerating all the other statuses (fragile when a status is added). The
  server change is minimal, tested, and touches no business rule.
- **Alternatives considered**: `scope=mine&status=DRAFT` (incompatible with « mine » without
  drafts); client-side filtering (fragile, and pagination skewed): rejected.

## R2 — Sorting and displayed date

- **Decision**: same sorting as the other lists (creation date descending, existing cursor
  pagination) and same displayed date.
- **Rationale**: sorting by last modification would require another pagination for a single
  tab; a draft is short-lived and an author has few (principle II). Specification aligned.

## R3 — Routes and form

- **Decision**:
  - the form of `CreateRequestPage.tsx` is extracted into a `RequestForm` component reused
    by « Nouvelle demande » and by a new `DraftPage` page (`/demandes/:id/brouillon`),
    pre-filled from `GET /api/requests/:id`;
  - a draft in the list leads to `/demandes/:id/brouillon`; a direct link to
    `/demandes/:id` of a draft redirects to this page;
  - page title: « Nouvelle demande » or « Brouillon de demande ».
- **Rationale**: a single form (fields, category rules, recipient, voice message,
  accessibility already verified); no duplication.

## R4 — Save as a draft (FR-001 to FR-003)

- **Decision**: secondary button « Enregistrer en brouillon » in « Nouvelle demande », shown
  if `draftsEnabled` (public settings, `useClientSettings`). Reduced validation: category and title;
  priority « Normale » by default if not chosen; description, voice message and recipient optional.
  Voice message uploaded then `POST /api/requests` with `asDraft: true`. Success: toast
  « Brouillon enregistré. » and opening of the draft (`/demandes/:id/brouillon`).
- **Rationale**: same calls as creation (the server requires title, category and priority).

## R5 — Resume, save, send, delete (FR-005 to FR-007, FR-009)

- **Decision**:
  - **Save the draft**: `PATCH /api/requests/:id` with the changed fields only; voice
    message: new recording uploaded then `voiceFileId`, deletion → `voiceFileId: null`.
  - **Send**: full validation (like creation); changes saved if there are
    any (`PATCH`), then `POST /api/requests/:id/actions` `{ action: 'SUBMIT', version }` with the
    returned version; success: toast « Votre demande a été envoyée. » and request detail.
  - **Delete the draft**: confirmation (existing `ConfirmDialog`), `DELETE`, toast « Brouillon
    supprimé. », return to « Mes demandes ».
  - `STATE_CHANGED` refusal or `404` (draft sent, deleted elsewhere): clear message and return to
    the list.
- **Existing voice message**: existing player (`VoicePlayer`, server file) with « Remplacer »
  (re-record) and « Supprimer »; a new recording is made with `VoiceRecorder` as at
  creation.

## R6 — Offline outbox

- **Decision**: the existing outbox (a submission kept in case of a network failure at creation)
  stays reserved for direct creation. A network failure when saving a draft or
  sending a draft displays a message; the form keeps its values, the draft stays
  on the server.
- **Rationale**: the draft is already kept on the server side; no double mechanism (principle II).

## R7 — Test strategy (principle I)

- **Backend integration**: `scope=drafts` (author only, drafts only), `scope=mine` without
  drafts, draft submission (status and notifications like a creation), disabled setting
  (creation refused, resume/send/delete allowed).
- **Frontend**: « Enregistrer en brouillon » (visible according to the setting, reduced validation, `asDraft`
  call), « Brouillons » tab (present/absent), draft page (pre-filling, existing voice
  message, save, send, delete with confirmation, errors).
- **e2e** (Chromium): save as a draft → tab → resume → send → recipient
  notified; 320 px and keyboard (V18).
