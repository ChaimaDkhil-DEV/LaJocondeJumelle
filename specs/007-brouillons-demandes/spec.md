# Feature Specification: Brouillons de demande de travail (Work request drafts)

**Feature Branch**: `007-brouillons-demandes`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Work request drafts: a screen to save a request
as a draft, find your drafts, complete them, send them or delete them. Existing on the
server side, complete and to reuse without changing it. On the UI side: nothing creates or resumes a
draft. Need: from « Nouvelle demande » (New request), save as a draft without sending; find
your drafts in « Mes demandes » (My requests); open a draft in the pre-filled form to
complete it, save it, send it or delete it (with confirmation). All roles that create
requests. WCAG 2.2 AA, 320 px. Out of scope: continuous automatic saving,
duty drafts, sharing a draft."

## Clarifications

### Session 2026-10-22

- Q1 (location of drafts) → **A**: a dedicated **« Brouillons »** tab in « Mes demandes »,
  shown only when the author has at least one draft; drafts **no longer appear**
  in « Envoyées », which lists only the requests that were actually sent.

## Contexte (Context)

- A work request is created and sent right away: an employee who is interrupted (class, call, meeting)
  loses what they started typing or recording by voice.
- The server already handles drafts end to end: creation, editing (title,
  description, voice message, category, recipient, priority), deletion, sending (to
  « Envoyée » in direct mode, « En attente de validation » through the administration). A draft
  is visible only to its author; it is excluded from dashboards, alerts and
  statistics. An administration setting (« Autoriser les brouillons de demande » (Allow request drafts)) prevents
  **creating** them; it does not prevent resuming, sending or deleting an existing draft.
- Drafts already appear in « Mes demandes › Envoyées » with the « Brouillon » badge,
  but nothing allows opening them to complete them: the feature is **UI-side
  only**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save a request as a draft (Priority: P1)

A teacher starts a photocopy request, chooses the category, gives a title and
records a voice message, then has to leave for class. She chooses « Enregistrer en brouillon »:
nothing is sent, nobody is notified, and she finds her request later.

**Why this priority**: this is the main value (losing nothing of a started request); without
it, the other flows have no purpose.

**Independent Test**: from « Nouvelle demande », save as a draft; verify that no
recipient or admin is notified and that the draft appears in the author's requests.

**Acceptance Scenarios**:

1. **Given** the « Nouvelle demande » form with at least a category and a title, **When**
   the author chooses « Enregistrer en brouillon », **Then** the request is saved with the status
   « Brouillon », a message confirms the save, and nothing is sent (no notification,
   no deadline started).
2. **Given** a missing title or category, **When** the author chooses « Enregistrer en
   brouillon », **Then** a clear message, tied to the field, says so and nothing is saved
   (description and voice message stay optional for a draft).
3. **Given** a voice message recorded in the form, **When** the author saves as a
   draft, **Then** the voice message is kept with the draft.
4. **Given** the setting « Autoriser les brouillons de demande » disabled, **When** the author opens
   « Nouvelle demande », **Then** the « Enregistrer en brouillon » action is not offered.

---

### User Story 2 - Find, complete and send a draft (Priority: P1)

Later, the teacher finds her draft in « Mes demandes » and opens it: the form is
pre-filled. She completes the description and chooses « Envoyer » (Send): the request goes out exactly as
if she had created it all at once (recipient or administration validation depending on the
category).

**Why this priority**: inseparable from US1 — a draft that can neither be found nor sent
is of no use.

**Independent Test**: with an existing draft, open it from « Mes demandes », complete it,
send it; verify the resulting status and notifications, identical to a direct creation.

**Acceptance Scenarios**:

1. **Given** drafts of the author, **When** they open « Mes demandes », **Then** a
   « Brouillons » tab lists them, each with the « Brouillon » badge, its title, its category and its creation
   date; « Envoyées » no longer shows them.
6. **Given** an author with no draft, **When** they open « Mes demandes », **Then** the
   « Brouillons » tab is not displayed; it appears as soon as the first draft is saved and disappears
   when the last one is sent or deleted.
2. **Given** a draft, **When** the author opens it, **Then** the request form is displayed
   pre-filled (category, recipient, priority, title, description, voice message) with the
   actions « Envoyer », « Enregistrer le brouillon » and « Supprimer le brouillon ».
3. **Given** the completed draft, **When** the author chooses « Envoyer », **Then** the request goes out
   according to its category's rules (« Envoyée » to the recipient in direct mode, « En attente de
   validation » through the administration), with the same notifications and deadlines as a direct
   creation, and the author is taken to the detail of the sent request.
4. **Given** a draft with no description or voice message, **When** the author chooses « Envoyer »,
   **Then** a clear message says that a description or a voice message is needed, and nothing is
   sent (same rule as at creation).
5. **Given** changes, **When** the author chooses « Enregistrer le brouillon », **Then**
   they are saved and the draft stays a draft.

---

### User Story 3 - Delete a draft (Priority: P2)

The teacher settled her need another way: she deletes the draft after confirmation.

**Why this priority**: useful to keep a clean list, but a useless draft bothers
nobody else (it is visible only to its author).

**Independent Test**: delete a draft after confirmation; it disappears from « Mes demandes »;
cancelling the confirmation deletes nothing.

**Acceptance Scenarios**:

1. **Given** an open draft, **When** the author chooses « Supprimer le brouillon » and confirms,
   **Then** the draft is permanently deleted (with its voice message), a message confirms
   it, and the author returns to « Mes demandes ».
2. **Given** the confirmation prompt, **When** the author cancels, **Then** nothing is deleted.

---

### Edge Cases

- **Setting disabled after the fact**: existing drafts stay visible, editable,
  sendable and deletable; only the creation of a new draft is removed.
- **Category disabled** between saving and sending: sending is refused with a clear
  message (existing rule); the author can choose another active category and retry.
- **Recipient no longer valid** (disabled account, no longer a recipient of the category):
  refusal with a clear message on sending (existing rule); the author chooses another recipient.
- **Draft open in two tabs**: the second action on a draft already sent or
  deleted is refused with a clear message, then the page reloads.
- **Another user's draft**: never visible or reachable (existing rule).
- **Leaving the form without saving**: unsaved changes are lost
  (no automatic saving, out of scope).
- **Mobile, 320 px**: actions and list usable with no horizontal scrolling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The « Nouvelle demande » form MUST offer « Enregistrer en brouillon » next
  to sending, when the setting « Autoriser les brouillons de demande » is enabled, and only
  in that case.
- **FR-002**: A draft MUST be saveable as soon as a category and a title are
  set; description, voice message, recipient and priority stay optional for a
  draft (the default priority applies).
- **FR-003**: Saving a draft MUST NOT trigger any notification, deadline, or appearance
  for another user.
- **FR-004**: The author MUST find their drafts in a « Brouillons » tab of « Mes
  demandes », from most recent to oldest (creation date, like the other lists). The tab is shown only if
  the author has at least one draft.
- **FR-004b**: The « Envoyées » tab MUST list only sent requests (no drafts).
- **FR-005**: Opening a draft MUST display the request form pre-filled with all its
  values, voice message included (replayable, replaceable, deletable as at creation).
- **FR-006**: From an open draft, the author MUST be able to: save it (it stays a draft),
  send it (same rules, notifications and deadlines as a direct creation), delete it after
  confirmation.
- **FR-007**: Sending a draft MUST apply the existing checks (description or voice
  message, active category, allowed recipient) with clear messages tied to the fields.
- **FR-008**: Existing drafts MUST stay usable (open, save, send,
  delete) when the setting is disabled.
- **FR-009**: An action on a draft already sent, deleted or changed elsewhere MUST be
  refused with a clear message, followed by a reload of the list or the detail.
- **FR-010**: The actions and the list MUST comply with WCAG 2.2 AA (keyboard, labels, focus,
  announced confirmations and errors) and fit in 320 px width.

### Key Entities *(include if feature involves data)*

- **Work request with status « Brouillon »** (existing): category, recipient, priority,
  title, description, voice message, author, creation and modification dates. Visible only to its
  author. No new data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An interrupted author saves their request in progress in 1 action, losing nothing of
  what they entered (title, description, voice message).
- **SC-002**: A draft is found and opened in 2 actions at most from « Mes demandes ».
- **SC-003**: 100% of sent drafts get the same status, the same recipients and
  the same notifications as a request created and sent all at once in the same category.
- **SC-004**: 0 notifications, alerts or dashboard entries are produced by a draft
  as long as it is not sent.
- **SC-005**: No accessibility violation detected by the automated audit on the form
  (creation and draft resume) and the drafts list, at 320 px and on desktop.

## Assumptions

- No new business rule on the server side: draft creation, editing, deletion,
  sending, visibility and setting exist and are reused as is. Only the filtering of the
  « Envoyées » list (without drafts, FR-004b) may require an adjustment, settled in the plan.
- Drafts concern work requests only, not assignments (duty shifts).
- The roles that can create requests (all, depending on categories) can create
  drafts; the category rules (creator roles, routing mode) are those of
  direct creation.
- No continuous automatic saving, no sharing, no dedicated retention period
  (a draft stays until it is sent or deleted).
- No "unsaved changes" warning when leaving the form.
