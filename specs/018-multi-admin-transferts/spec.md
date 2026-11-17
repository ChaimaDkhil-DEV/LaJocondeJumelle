# Feature Specification: Multi-administrator handling of work requests (file commune, prise en charge, transferts)

**Feature Branch**: `feat-transcription-langue` (current branch, kept at the user's request — see D7)

**Created**: 2026-11-17

**Status**: Draft (decisions D1 to D7 validated, 2026-11-17)

**Input**: User description (summary): "Système multi-administrateurs : plusieurs comptes administrateurs
indépendants, chacun avec son espace de travail ; une file commune de demandes disponibles ; prise en charge
individuelle, impossible à deux en même temps ; demandes de reprise et de délégation entre administrateurs,
acceptées ou refusées par le destinataire ; supervision globale et réattribution par le super administrateur ;
traçabilité complète. L'évolution s'intègre au workflow actuel sans le remplacer."

## Context

Today a work request that goes through the administration (category in mode « via l'administration »,
circuit B) is visible to **every** administrator responsible for its category, and any of them can approve,
reject, reassign the employee or validate it. Nothing says which administrator is dealing with it: two
administrators can work on the same request without knowing, and nobody can tell who was in charge.

The school now has several administrators. Each one needs to know what is theirs, what is free, and to hand
work over to a colleague in a way that leaves a trace.

Vocabulary used in this document:

- **Administrator**: an active account with the existing role `ADMIN` (called MANAGER in the request).
- **Responsible administrator** (« responsable »): the administrator currently in charge of a request. Not
  to be confused with the **assigned employee** (« employé affecté »), who carries out the work and already
  exists.
- **Free request** (« demande libre »): a request with no responsible administrator.
- **Eligible administrator** for a request: an active administrator who is responsible for the request's
  category (existing category setting).

## Clarifications (decisions validated by the user on 2026-11-17, all as proposed)

- **D1 — Roles**: the role called MANAGER in the request is the existing `ADMIN` role. No new role and no new
  configurable permission: the rules rest on the role and on who is the responsible administrator.
- **D2 — Naming**: the responsible administrator and the date they took the request are stored under names
  distinct from the assigned employee's (`adminOwnerId`, `adminOwnedAt`), because `assignedAt` already means
  « employee assigned at ».
- **D3 — Content of the file commune**: work requests waiting for the administration's validation, with no
  responsible administrator, in the categories the administrator is responsible for. Administrators' existing
  access rights are not widened.
- **D4 — Acting is taking**: an administration action (approve, reject, reassign the employee, validate,
  send back for correction, close) on a free request makes its author the responsible administrator, in the
  same atomic operation. The existing circuit B keeps working without an extra step. Once a request is taken,
  the other administrators see it read-only.
- **D5 — Super administrator screens**: account management and the audit log already exist and are reused;
  only the supervision of requests by responsible administrator, the list of transfers and the reattribution
  are new.
- **D6 — Response time**: one setting, 120 minutes by default, counted in real time (no working-hours
  calendar).
- **D7 — Branch**: the work stays on the current branch `feat-transcription-langue`; no branch is created or
  switched.
- **Delivery in three lots**, each usable on its own: (1) responsible administrator, file commune, prise en
  charge, history; (2) transfers, expiry, notifications; (3) supervision and reattribution by the super
  administrator.

## User Scenarios & Testing

### User Story 1 — File commune and prise en charge (P1, lot 1)

An administrator opens « File commune » and sees the free requests of their categories, most urgent first:
title, description, priority, status, requester, creation date, category and deadline. They press « Prendre
en charge » on one. It leaves the file commune for everyone and appears in their « Mes demandes ». They
process it exactly as today (approve and assign an employee, reject, and later validate or send back for
correction). Colleagues can still open it, read-only, and see who is in charge.

**Why this priority**: it is the base of everything else — without a single responsible administrator, no
transfer or supervision makes sense.

**Independent Test**: two administrators of the same category and one submitted request; one takes it, the
other can no longer take or modify it, and the history shows who took it and when.

**Acceptance Scenarios**:

1. **Given** a request waiting for validation with no responsible administrator, **When** an eligible
   administrator opens « File commune », **Then** the request is listed with its title, description,
   priority, status, requester, creation date and a « Prendre en charge » button.
2. **Given** that request, **When** the administrator presses « Prendre en charge », **Then** they become
   its responsible administrator, it disappears from every administrator's file commune, it appears in their
   « Mes demandes », and the history records the operation (who, when).
3. **Given** two administrators pressing « Prendre en charge » on the same request at the same moment,
   **When** both requests reach the server, **Then** exactly one succeeds; the other is told clearly that a
   colleague has just taken the request, and the request has one responsible administrator and one history
   entry.
4. **Given** a request taken by administrator A, **When** administrator B (same category) opens it, **Then**
   B reads it and sees that A is in charge, but is offered no action; an attempt to act on it anyway is
   refused and logged.
5. **Given** a free request, **When** an eligible administrator approves or rejects it directly without
   pressing « Prendre en charge », **Then** the action succeeds as today and that administrator becomes the
   responsible administrator in the same operation.
6. **Given** an employee, a parent, or an administrator who is not responsible for the category, **When**
   they call the file commune or try to take the request, **Then** they are refused, the refusal is logged,
   and nothing reveals whether the request exists.
7. **Given** an administrator, **When** they open « Mes demandes », « Demandes en cours » or « Demandes
   terminées », **Then** they see only the requests they are currently responsible for (all / not finished /
   finished), whatever identifier the browser sends.

---

### User Story 2 — Delegating a request to a colleague (P2, lot 2)

Administrator A is busy and wants to hand one of their requests to B. From the request, A presses « Proposer
une délégation », chooses B among the eligible administrators and writes a reason. B is notified, sees the
proposal in « Collaboration » with A's name, the request title, the reason, the date and the time left, and
accepts or refuses. If B accepts, B becomes the responsible administrator and the request moves to B's
space. If B refuses (reason optional), A keeps the request and is told. Nothing changes until B answers.

**Why this priority**: delegation is the everyday way to rebalance work; it depends on story 1.

**Independent Test**: A delegates to B; B refuses and A is still responsible; A delegates again; B accepts
and B is responsible; every step is in the history.

**Acceptance Scenarios**:

1. **Given** A is responsible for a request that is not finished, **When** A proposes a delegation to B with
   a reason, **Then** the proposal is recorded as pending, B is notified, and A stays responsible and can
   keep working on the request.
2. **Given** a pending delegation, **When** B accepts, **Then** B becomes responsible, A no longer is, the
   request appears in B's « Mes demandes », the proposal is marked accepted, the history records the
   transfer and A is notified.
3. **Given** a pending delegation, **When** B refuses, with or without a reason, **Then** A stays
   responsible, the refusal and its reason are recorded, and A is notified.
4. **Given** a delegation without a reason, to oneself, to an inactive account or to an administrator who is
   not eligible for the category, **When** A submits it, **Then** it is refused with a message that says
   what to correct.
5. **Given** a request that already has a pending proposal, **When** anyone proposes another transfer on it,
   **Then** it is refused: one pending proposal per request.
6. **Given** a pending proposal, **When** its author cancels it, **Then** it is marked cancelled, the
   recipient is told, and nothing else changes.

---

### User Story 3 — Asking to take over a colleague's request (P2, lot 2)

Administrator B thinks they are better placed to handle a request that A has taken. From the request, B
presses « Demander la reprise » and gives a reason. A is notified and accepts or refuses. B never becomes
responsible without A's agreement.

**Why this priority**: same mechanism as delegation, in the other direction.

**Independent Test**: A takes a request; B asks to take it over; A accepts; B is responsible.

**Acceptance Scenarios**:

1. **Given** A is responsible for a request, **When** eligible administrator B asks to take it over with a
   reason, **Then** the proposal is pending, A is notified, and A stays responsible.
2. **Given** that pending request, **When** A accepts, **Then** B becomes responsible and the history
   records the transfer; **When** A refuses, **Then** A keeps the request and the refusal is recorded.
3. **Given** a pending proposal (either type), **When** two answers arrive at the same moment (double click,
   two tabs), **Then** exactly one is applied; the other is told the proposal has already been answered.
4. **Given** a pending proposal, **When** the responsible administrator has changed or the request has been
   finished before the answer, **Then** the proposal is cancelled with a recorded cause and an answer to it
   is refused.
5. **Given** a pending proposal, **When** the response time runs out, **Then** it is marked expired, both
   administrators are told, and the responsible administrator does **not** change.

---

### User Story 4 — The administrator's workspace (P2, lots 1 and 2)

A new menu entry « Espace de travail » opens the administrator's workspace. Its first page is a dashboard
with real counts: free requests, my requests, in progress, finished, transfers received and waiting,
transfers sent and waiting. The workspace offers: Tableau de bord, File commune, Mes demandes, Demandes en
cours, Demandes terminées, Collaboration, Mon historique. The existing home page and the existing « Mes
demandes » list (every request the account can see) are left as they are, so that nothing existing moves.
« Collaboration » has three sections — reçues, envoyées, historique — with the pending proposals first and
their accept / refuse / cancel actions. Lists and counts refresh by themselves when something changes.

**Why this priority**: it is how the administrator finds their work; it only presents what stories 1 to 3
produce.

**Independent Test**: with known data, each count equals the number of rows of the list it opens, and it
changes without reloading when a colleague takes a request.

**Acceptance Scenarios**:

1. **Given** an administrator with known requests and proposals, **When** they open the dashboard, **Then**
   each of the six counts equals the size of the corresponding list; no figure is invented.
2. **Given** an administrator looking at the file commune, **When** a colleague takes a request or a new
   request arrives, **Then** the list and the counts update without reloading the page.
3. **Given** an administrator, **When** they open « Mon historique », **Then** they see the operations that
   made them responsible or ended their responsibility (taken, transferred, reassigned, released), with
   date, author and reason.
4. **Given** any of these screens on a 320 px wide phone or with keyboard only, **When** the administrator
   uses it, **Then** everything is reachable, readable without horizontal scrolling, and « Accepter » and
   « Refuser » are clearly distinct by label, icon and position — not by colour alone.

---

### User Story 5 — Supervision and reattribution by the super administrator (P3, lot 3)

The super administrator sees all work requests with their responsible administrator, filters them (free /
taken / in progress / finished, by administrator, status, priority, period), sees each administrator's
requests and activity, and sees all transfer proposals by status. When an administrator is unavailable, the
super administrator reassigns a request to another eligible administrator, or releases it back to the free
requests, giving a reason. The two administrators are told and the operation is in the history and the audit
log.

**Why this priority**: an exceptional path; the daily flow works without it.

**Independent Test**: the super administrator reassigns a request from A to B with a reason; B is
responsible, A is told, a pending proposal on the request is cancelled, history and audit show it.

**Acceptance Scenarios**:

1. **Given** requests with various responsible administrators, **When** the super administrator filters by
   administrator, status, priority or period, **Then** only matching requests are listed.
2. **Given** a request A is responsible for, **When** the super administrator reassigns it to eligible
   administrator B with a reason, **Then** B is responsible, the history keeps A as the previous responsible
   administrator, any pending proposal on the request is cancelled with a recorded cause, A and B are
   notified, and the audit log records the operation.
3. **Given** a reattribution without a reason, or to an inactive or non-eligible administrator, **When** it
   is submitted, **Then** it is refused with an explicit message.
4. **Given** an administrator account that has been deactivated, **When** the super administrator opens the
   supervision, **Then** the requests that account is still responsible for are clearly flagged, so they can
   be reassigned or released.
5. **Given** an administrator or an employee, **When** they call a supervision or reattribution route,
   **Then** they are refused and the refusal is logged.

### Edge Cases

- **Request cancelled by its requester while free or taken**: it leaves the file commune; a pending proposal
  on it is cancelled with the cause recorded.
- **Responsible administrator deactivated or no longer an administrator**: they stay recorded as responsible
  (nothing is reassigned silently); every pending proposal they sent or received is cancelled; the super
  administrator is the one who reassigns or releases.
- **Administrator removed from a category's responsible administrators while in charge of its requests**:
  same treatment — flagged in the supervision, no silent change.
- **Recipient becomes inactive or non-eligible between proposal and answer**: the acceptance is refused and
  the proposal cancelled.
- **Request already past validation and still free** (requests in progress when the feature is installed):
  not in the file commune; the first eligible administrator who acts on it becomes responsible (D4).
- **Super administrator acting on a request**: keeps today's ability to act in « via l'administration »
  categories; doing so never makes them the responsible administrator and does not remove the current one.
- **Direct and teacher-to-teacher categories, class coverage (« gardes »)**: untouched; they never have a
  responsible administrator.
- **Proposal answered at the very moment it expires**: one outcome only, whichever is recorded first.
- **Same notification produced twice** (retry, double click): the recipient sees it once.

## Requirements

### Functional Requirements

**Responsible administrator and file commune (lot 1)**

- **FR-001**: A work request of a « via l'administration » category MUST have at most one responsible
  administrator at any time; all other requests MUST never have one.
- **FR-002**: The system MUST list, for an eligible administrator, the free requests waiting for validation
  in their categories, with title, description, priority, status, requester, category, creation date and
  current deadline.
- **FR-003**: An eligible administrator MUST be able to take a free request; taking MUST be atomic: of
  several simultaneous attempts exactly one succeeds and the others receive a conflict answer with an
  explicit message.
- **FR-004**: An administration action on a free request MUST make its author (if an administrator) the
  responsible administrator in the same atomic operation (D4).
- **FR-005**: Once a request has a responsible administrator, only that administrator MUST be able to
  perform administration actions on it, change its priority as administration, or write in its thread as
  administration; other eligible administrators keep read access only. The super administrator keeps the
  abilities they have today.
- **FR-006**: The system MUST list for the connected administrator the requests they are currently
  responsible for — all, not finished, finished — from the authenticated identity only.
- **FR-007**: Every change of responsible administrator MUST be recorded in a history that cannot be
  modified: request, responsible administrator concerned, author of the operation, type (taken, reassigned,
  released, transferred), date, reason if any. Earlier entries are never overwritten.
- **FR-008**: Existing statuses, transitions, circuits, priorities, deadlines and notifications of work
  requests MUST be unchanged; no status is added to represent the responsible administrator.

**Transfers (lot 2)**

- **FR-009**: The responsible administrator MUST be able to propose a delegation of a non-finished request
  to another eligible administrator, with a mandatory reason.
- **FR-010**: An eligible administrator who is not responsible MUST be able to ask to take over a
  non-finished request from its responsible administrator, with a mandatory reason.
- **FR-011**: A proposal MUST be answered only by its recipient (the colleague for a delegation, the
  responsible administrator for a takeover request): accept, or refuse with an optional reason.
- **FR-012**: Accepting MUST, atomically: check the proposal is still pending, the answerer is the
  recipient, the responsible administrator is still the one recorded when the proposal was made, the request
  is not finished, the new responsible administrator is still active and eligible; then change the
  responsible administrator, mark the proposal accepted, write the history and the audit entry. If any check
  fails nothing changes.
- **FR-013**: There MUST be at most one pending proposal per request, guaranteed by the data store itself and
  not only by the application.
- **FR-014**: A proposal to oneself, to an inactive account or to a non-eligible administrator MUST be
  refused.
- **FR-015**: The author of a pending proposal MUST be able to cancel it.
- **FR-016**: While a proposal is pending, the responsible administrator MUST keep full responsibility and
  ability to work on the request.
- **FR-017**: When the request is finished, or its responsible administrator changes by another path, the
  pending proposal MUST be cancelled with a recorded cause; an answer to an already answered, cancelled or
  expired proposal MUST be refused.
- **FR-018**: A pending proposal MUST expire after a configurable response time (120 minutes by default, set
  by the super administrator); expiry MUST record the status « expirée », notify both administrators and
  never transfer the request.
- **FR-019**: The system MUST list for the connected administrator the proposals received, the proposals
  sent, and the history of their past proposals, each with author, recipient, request title, type, reason,
  date sent and, while pending, time left.

**Notifications (lots 1 to 3)**

- **FR-020**: The system MUST notify, in real time and addressed to the persons concerned only: a new free
  request (eligible administrators — already the case today), a request taken (eligible administrators'
  lists refresh), a takeover request received, a delegation received, a proposal accepted, refused,
  cancelled, expired, and a reattribution by the super administrator.
- **FR-021**: These notifications MUST be stored so that an administrator who was offline finds them later,
  and MUST NOT be duplicated for one event.
- **FR-022**: After each of these events the lists, counts and dashboards concerned MUST refresh without a
  manual reload.

**Workspace (lots 1 and 2)**

- **FR-023**: The first page of the administrator's workspace MUST show six real counts — free, mine, in progress, finished,
  proposals received pending, proposals sent pending — each consistent with the list it opens.
- **FR-024**: The administrator's menu MUST gain one entry, « Espace de travail », whose workspace offers:
  Tableau de bord, File commune, Mes demandes, Demandes en cours, Demandes terminées, Collaboration, Mon
  historique. The existing entries and home page, and other roles' menus, are unchanged.
- **FR-025**: Every new screen MUST have loading, empty and error states, confirmation before taking,
  accepting, refusing, cancelling and reassigning, and MUST meet WCAG 2.2 AA from 320 px wide.

**Supervision (lot 3)**

- **FR-026**: The super administrator MUST be able to list all work requests with their responsible
  administrator and filter by free / taken / in progress / finished, administrator, status, priority and
  period.
- **FR-027**: The super administrator MUST be able to list all transfer proposals by status.
- **FR-028**: The super administrator MUST be able to reassign a non-finished request to an active eligible
  administrator, or release it, with a mandatory reason, without the administrators' agreement; the
  operation MUST keep the previous responsible administrator in the history, cancel the pending proposal,
  notify the administrators concerned and be written to the audit log. It MUST NOT change the request's
  status or bypass any validation rule.
- **FR-029**: Administrator accounts MUST be created, modified, deactivated and reactivated with the
  existing account management, and the global audit log consulted with the existing screen (D5).

**Security and traceability (all lots)**

- **FR-030**: Every right MUST be checked by the server on every call, from the authenticated session;
  an identifier of administrator sent by the browser is never trusted to decide who acts.
- **FR-031**: Every refusal MUST be logged and MUST NOT reveal the existence of a request the caller cannot
  read.
- **FR-032**: Taking, every answer to a proposal, cancellation, expiry and reattribution MUST be written to
  the audit log, without message content or personal data beyond the identifiers of the accounts and request
  concerned.
- **FR-033**: Lists of colleagues offered for a delegation MUST show only name and job title.

### Key Entities

- **Request (existing)**: gains its current responsible administrator and the date they became so.
- **Responsibility history entry**: one line per change of responsible administrator — request,
  administrator concerned, author, type (taken, reassigned, released, transferred), date, reason. Append-only.
- **Transfer proposal**: request, author, recipient, responsible administrator at the time of the proposal,
  type (takeover request, delegation), status (pending, accepted, refused, cancelled, expired), reason,
  answer reason, dates (created, answered, expires, cancelled).
- **Setting « délai de réponse aux transferts »**: minutes, default 120.

Personal data: no new personal data is collected; the new records hold account identifiers, dates and free
text reasons typed by administrators. They are kept as long as the request they belong to.

## Success Criteria

### Measurable Outcomes

- **SC-001**: When two administrators take the same request at the same moment, in 100 % of attempts exactly
  one becomes responsible and exactly one history entry exists.
- **SC-002**: When two answers to the same proposal arrive at the same moment, in 100 % of attempts exactly
  one is applied.
- **SC-003**: No request ever has a new responsible administrator without either their own action (taking,
  accepting) or a super administrator's reattribution — verified on every scenario of the test suite.
- **SC-004**: An administrator finds a free request and takes it in at most 4 actions from the home page (menu, file commune, prendre en charge, confirm).
- **SC-005**: A colleague's screen reflects a request taken, or a proposal received, within 2 seconds
  without reloading.
- **SC-006**: Every count shown on the administrator's dashboard equals the number of rows of the
  corresponding list, on every test data set.
- **SC-007**: All automated tests that existed before the feature still pass, unmodified in what they
  verify.
- **SC-008**: The automated accessibility checks report no violation on the new screens, on desktop and
  mobile sizes.

## Assumptions

- Only work requests of « via l'administration » categories are concerned; direct, teacher-to-teacher and
  class coverage requests are out of scope.
- « In progress » means not closed, rejected or cancelled; « finished » means closed, rejected or cancelled.
- A request stays with its responsible administrator after approval, for the later administration steps
  (employee reassignment, final validation, correction), until it is finished.
- Writing in the thread or changing the priority of a free request does not take it; only the actions listed
  in D4 do.
- The reason of a takeover request is mandatory, like the delegation's; reasons are limited to 500
  characters.
- A deactivated administrator's requests are not released automatically: the super administrator decides
  (flagged in the supervision). Their pending proposals are cancelled.
- The super administrator keeps today's ability to act on requests and is never recorded as responsible
  administrator.
- The workspace is a new menu entry rather than a replacement of the administrator's home page, so that
  existing journeys and their tests stay valid; making it the home page later is a one-line change.
- The response time is counted in real time (D6); there is no calendar of working hours in the application.
- The demonstration data set is not changed, except where a new screen needs an administrator pair to be
  demonstrable — and then only by additions agreed with the user.
- Push notifications follow the existing rules: the new events appear in the bell; none of them is added to
  push unless the existing categories already cover it.
