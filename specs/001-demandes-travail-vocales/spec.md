# Feature Specification: Phase 1 – Work requests and voice messaging

> **Since feature 004, the role « Responsable » (Manager) is called « Admin »; the terminology of the
> current specification (`specs/004-retards-affectation-surveillants/spec.md`) prevails.**

**Feature Branch**: `001-demandes-travail-vocales`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "Phase 1: work requests and voice messaging for a private
school. Employees send work requests to other employees or to managers,
by speaking rather than writing, from a smartphone, a tablet or a computer; requests,
exchanges and decisions centralized and traceable; two workflows (direct / administrative
validation), tracked deadlines, real-time notifications, history, search and filters."

## Clarifications

### Session 2026-10-12

- Q: When a manager rejects a request submitted for administrative validation, what status
  does it take? → A: A new final status « Refusée » (Rejected), which keeps the reason; the requester
  can create a new request if they wish.
- Q: In the direct workflow, can the employee who receives a request reject it or pass it on to
  someone else? → A: They can reject it with a mandatory reason; the request becomes
  « Refusée » and the requester is notified. They cannot pass it on themselves.
- Q: Can the requester cancel a request that has already been sent, and until when? → A: Yes, as long
  as it has not been accepted (« Envoyée » (Sent) or « En attente de validation administrative » (Awaiting administrative validation));
  it moves to the new final status « Annulée » (Cancelled).
- Q: In addition to in-app notifications, should users be alerted when
  the application is closed? → A: No, in-app notifications only; no push and no
  email in this phase.
- Q: To whom can an employee send a request? → A: To the recipients defined for the
  chosen category (list configured by the super administrator).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and send a voice request (Priority: P1)

A teacher needs photocopies. From her phone, she chooses the recipient,
records a voice message, listens to it again, redoes it if needed, adds a title, chooses the
category « Photocopies » and a priority (« Normale » (Normal), « Moyenne » (Medium), « Haute » (High) or « Urgente » (Urgent)), then sends. The
request appears with the status « Envoyée » and its creation date and time. The recipient
sees it in their list of received requests and can listen to the voice message.

**Why this priority**: this is the product's reason for being. Employees must be able to phrase
a request by voice, quickly, without writing.

**Independent Test**: an employee creates a voice request in a direct-workflow category; the
recipient logs in, finds the request and listens to the voice message. This test works without the
other stories.

**Acceptance Scenarios**:

1. **Given** an employee logged in on a smartphone, **When** she records a voice message, listens
   to it again, fills in the title, category, a recipient among those of the category and the
   priority, then sends, **Then** the
   request is created with the status « Envoyée », timestamped and visible to the recipient.
2. **Given** a voice message recorded but not yet sent, **When** the employee listens to it again then
   chooses to redo it, **Then** the old recording is replaced and only the new one is
   sent.
3. **Given** a request without a title, category, recipient or priority, **When** the employee
   tries to send it, **Then** sending is blocked and each missing field is clearly
   flagged.
4. **Given** a loss of connection during sending, **When** sending fails, **Then**
   the employee is informed of the failure, her request and voice message are kept on the device and
   she can retry sending without redoing everything.
5. **Given** a device on which microphone access is refused, **When** the employee wants to record,
   **Then** a message explains how to allow the microphone, and she can still send
   a request with a written description.

---

### User Story 2 - Process a request in the direct workflow (Priority: P1)

The recipient receives the request, listens to it, accepts it, moves it to « En cours » (In progress), then
« Terminée » (Completed), attaching a proof photo if the category requires it. The requester reviews the
result: either the request is closed (automatically or by an authorized person depending on the
category), or she sends it back « À corriger » (To correct) with a comment.

**Why this priority**: without processing, a request has no value; together with story 1, it
forms the minimum viable end-to-end journey.

**Independent Test**: starting from a « Envoyée » request, the recipient takes it through to
« Terminée », then the requester closes it or sends it back « À corriger ».

**Acceptance Scenarios**:

1. **Given** a « Envoyée » request assigned to an employee, **When** they accept it, **Then** its
   status becomes « Acceptée » (Accepted) and the acceptance time is recorded.
2. **Given** an « Acceptée » request, **When** the assigned employee moves it to « En cours », then
   « Terminée », **Then** each change is timestamped and visible to the requester.
3. **Given** a category requiring a proof photo, **When** the employee tries to move the
   request to « Terminée » without a photo, **Then** the change is refused with a message
   explaining that a photo is required.
4. **Given** a « Terminée » request, **When** the requester sends it back « À corriger » without a
   comment, **Then** the action is refused; with a comment, the request becomes « À
   corriger » and the assigned employee is notified.
5. **Given** a category with automatic closure, **When** the request becomes « Terminée » and
   the requester does not send it back « À corriger » within the category's grace period
   (24 h by default), **Then** it is closed automatically when that period expires and
   the closing time is recorded.
6. **Given** a « Envoyée » request assigned to an employee who cannot handle it, **When**
   they reject it with a reason, **Then** it becomes « Refusée » and the requester is notified
   with the reason; without a reason, the rejection is blocked.
7. **Given** a user without the required right, **When** they attempt a status transition
   (e.g. accepting a request that is not assigned to them), **Then** the transition is
   refused and the attempt is logged.

---

### User Story 3 - Exchange messages in the request thread (Priority: P2)

Each request has a discussion thread. The requester, the assigned employee and the authorized
managers reply there by text or voice, and attach photos (taken with the device
or from the gallery) or files in allowed formats.

**Why this priority**: clarifications and proofs are frequent, but the minimum journey
works without a discussion thread.

**Independent Test**: on an existing request, two participants exchange a text message,
a voice message and a photo; each item shows its author and date and time.

**Acceptance Scenarios**:

1. **Given** an open request, **When** a participant sends a text or voice message,
   **Then** it appears in the thread with the author and the date and time, and the other
   participants see it without reloading the page.
2. **Given** a participant on a smartphone, **When** they take a photo from the thread, **Then**
   it is attached to the request and visible to the authorized participants.
3. **Given** a file in a disallowed format or too large, **When** a participant
   tries to attach it, **Then** the addition is refused with a message stating the accepted
   formats and size.
4. **Given** a user not authorized on the request, **When** they try to access the thread,
   a voice message or an attachment (including through a direct link), **Then** access is refused
   without revealing the content or the existence of the request.

---

### User Story 4 - Receive real-time notifications (Priority: P2)

Each user is alerted, without reloading the page, of the events that concern them:
new request, new message, assignment, status change, urgent request, request to
correct, closure.

**Why this priority**: speed of reaction (notably for urgent requests) depends on
notifications, but processing remains possible by consulting the list of requests.

**Independent Test**: a user keeps the application open; another creates a request
for them; the notification appears without any action on their part.

**Acceptance Scenarios**:

1. **Given** a recipient with the application open, **When** a request is sent to them,
   **Then** a notification appears within a few seconds without reloading.
2. **Given** a request with priority « Urgente », **When** it is sent or assigned,
   **Then** the notification is visually distinct from ordinary notifications.
3. **Given** a user logged out at the time of an event, **When** they log back in,
   **Then** they find their unread notifications.

---

### User Story 5 - Workflow with administrative validation (Priority: P2)

For categories configured with workflow B, the request is first submitted to an authorized
manager. They approve or reject it (mandatory reason). After approval, the request is
assigned to an employee, manually or automatically depending on the category. If the category
requires it, a final validation is required after completion before closure.

**Why this priority**: essential for some categories, but the direct workflow already covers
the main scenario.

**Independent Test**: an employee creates a request in a workflow B category; a manager
approves and assigns it; the assigned employee carries it out; the manager performs the final
validation.

**Acceptance Scenarios**:

1. **Given** a workflow B category, **When** an employee sends a request, **Then** it
   becomes « En attente de validation administrative » and is visible to no executing employee.
2. **Given** a request awaiting validation, **When** a manager rejects it without a reason,
   **Then** the rejection is blocked; with a reason, the request moves to the final status « Refusée »
   and the requester is notified with the reason.
3. **Given** an approved request in a category with manual assignment, **When** the
   manager chooses the employee, **Then** the request is assigned to them with the status « Envoyée » and
   they are notified.
4. **Given** a category with automatic assignment, **When** the request is approved,
   **Then** it is assigned according to the category's rule, without manual action.
5. **Given** a category with final validation, **When** the request becomes « Terminée »,
   **Then** it becomes « En attente de validation finale » (Awaiting final validation); the validator closes it or sends it back
   « À corriger » with a comment.

---

### User Story 6 - Track deadlines and delays (Priority: P3)

Each request displays the time remaining for the current stage: administrative validation,
takeover or completion. Requests close to the due date or overdue are flagged.
When a deadline is exceeded, the request is marked « En retard » (Overdue) stating the stage, and the
manager concerned is notified.

**Why this priority**: improves responsiveness, but processing works without deadline
tracking.

**Independent Test**: configure a short deadline for a category and a priority, create
a request without accepting it, and check the display of the remaining time then the marking « En
retard (prise en charge) » (Overdue (takeover)).

**Acceptance Scenarios**:

1. **Given** a request with a configured takeover deadline, **When** an authorized user
   displays it, **Then** they see the time remaining for the current stage.
2. **Given** a request whose current stage deadline is almost elapsed, **When** the list
   is displayed, **Then** the request is flagged as close to the due date.
3. **Given** a request whose deadline is exceeded, **When** the due date passes, **Then** it is
   marked « En retard » with the stage concerned, remains visible, and the manager concerned is
   notified.
4. **Given** an overdue request, **When** it is finally handled, **Then** the delay
   remains visible in its history and it is never deleted automatically.

---

### User Story 7 - Consult the history, search and filter (Priority: P3)

Each user finds the requests they have access to, filters them by status, priority,
category, recipient and period, and consults the complete history of a request.

**Why this priority**: useful as soon as volume grows, but not necessary for first use.

**Independent Test**: with a set of varied requests, a user applies combined filters
and sees only the matching requests they are entitled to.

**Acceptance Scenarios**:

1. **Given** several requests, **When** a user filters by status « En cours » and
   priority « Urgente », **Then** only the matching and authorized requests
   are displayed.
2. **Given** a processed request, **When** an authorized user opens its history,
   **Then** they see each action (status, priority, assignment, messages, attachments)
   with author, date and time.
3. **Given** a user, **When** they perform a search, **Then** no request to
   which they have no access appears in the results.

---

### User Story 8 - Administer accounts, roles and settings (Priority: P3)

The super administrator manages accounts, roles, permissions, categories (workflow,
final validation, required photo, closure mode, assignment mode), deadlines per
category and priority, and consults the audit logs.

**Why this priority**: necessary for deployment, but an initial configuration provided at go-live
allows the other stories to be tested independently.

**Independent Test**: the super administrator creates an account, gives it a role, creates a
workflow B category with a required photo, and checks that the new behavior
applies to new requests.

**Acceptance Scenarios**:

1. **Given** a super administrator, **When** they create an account with the role « Employé » (Employee),
   **Then** the user can log in and has only the rights of that role.
2. **Given** a super administrator, **When** they change the takeover deadline of a
   category and a priority, **Then** the change applies to requests created afterwards
   and is recorded in the audit log.
3. **Given** a user without the super administrator role, **When** they try to access the
   settings, **Then** access is refused and logged.

---

### Edge Cases

- Network loss while recording or sending a voice message: the content is kept
  locally and the user can retry sending; no partial send is presented as
  successful.
- Voice message exceeding the maximum duration or size: the recording stops at the limit and
  the user is warned.
- Empty or inaudible voice message (almost zero duration): sending is blocked with an explanatory message.
- Browser or device not allowing audio recording: the user is
  informed and can enter a written description instead.
- Two users change the status of the same request at the same time: only one
  transition is applied; the other user is informed that the state has changed.
- Recipient deactivated or having left the school while a request is assigned to them: the request
  remains visible and a manager can reassign it.
- Request sent to the wrong person in the direct workflow: the recipient rejects it with a
  reason (status « Refusée »); they cannot pass it on themselves. The requester creates a
  new request for the right recipient.
- Requester who wants to withdraw their request: they can cancel it (final status « Annulée ») as long as
  it is « Envoyée » or « En attente de validation administrative »; once accepted,
  they can no longer cancel it and must go through the discussion thread. The assigned employee or the
  manager is notified of the cancellation.
- Change to a category's configuration (workflow, deadlines) while requests are
  in progress: requests in progress keep the rules in force at their creation.
- Request sent back « À corriger » several times: each round trip is recorded in
  the history.

## Requirements *(mandatory)*

### Functional Requirements

**Creating requests**

- **FR-001**: The system MUST allow an authorized user to create a request with:
  title (required), written description (optional), voice message (optional if a
  description is provided), category, recipient, priority (Normale, Moyenne, Haute,
  Urgente). The creation date and time are recorded automatically.
- **FR-002**: The system MUST require at least a voice message or a written description in order to
  send a request.
- **FR-003**: The system MUST allow saving a request as « Brouillon » (Draft) before sending,
  if this option is enabled.
- **FR-004**: In the direct workflow, the system MUST NOT offer as recipients anyone other than the
  active users defined for the chosen category, and MUST refuse on the server side any
  other recipient. The category is therefore chosen before the recipient.

**Voice messages**

- **FR-005**: Users MUST be able to record a voice message, listen to it again,
  delete it or redo it before sending.
- **FR-006**: Authorized users MUST be able to listen to received voice messages on
  smartphone, tablet and computer, with play, pause and seeking within
  the recording.
- **FR-007**: The system MUST apply a maximum duration and a maximum size to voice messages,
  configurable by the super administrator, and warn the user as the
  limit approaches.
- **FR-008**: In case of a send failure (voice message, message, attachment or request), the system MUST
  report the failure to the user, keep the unsent content on the device and offer
  to retry sending.

**Discussion thread and attachments**

- **FR-009**: Each request MUST have a discussion thread holding text and voice
  messages; each message shows its author and date and time.
- **FR-010**: Authorized participants MUST be able to attach photos (taken with
  the device or from the gallery) and files in allowed formats, attached to the
  request.
- **FR-011**: The system MUST refuse attachments in a disallowed format or above
  the maximum size, with a message stating the accepted formats and size.
- **FR-012**: Messages, voice messages and attachments sent MUST NOT be modifiable
  or deletable by users; any correction goes through a new message.

**Statuses and transitions**

- **FR-013**: A request MUST always have exactly one status among: Brouillon, En attente
  de validation administrative, Envoyée, Acceptée, En cours, Terminée, En attente de validation
  finale, À corriger, Clôturée (Closed), Refusée, Annulée.
- **FR-014**: The system MUST allow only the following transitions, each reserved for the
  roles authorized by the configuration:

  | From | To | Trigger |
  |------|----|---------|
  | Brouillon | Envoyée | Requester (workflow A) |
  | Brouillon | En attente de validation administrative | Requester (workflow B) |
  | En attente de validation administrative | Envoyée | Authorized manager (approval + assignment) |
  | En attente de validation administrative | Refusée | Authorized manager, with mandatory reason |
  | Envoyée | Acceptée | Assigned employee |
  | Envoyée | Refusée | Assigned employee, with mandatory reason |
  | Envoyée / En attente de validation administrative | Annulée | Requester |
  | Acceptée | En cours | Assigned employee |
  | En cours | Terminée | Assigned employee (photo attached if the category requires it) |
  | Terminée | Clôturée | Automatic when the grace period expires, or authorized person, depending on the category |
  | Terminée | En attente de validation finale | Automatic (category with final validation) |
  | En attente de validation finale | Clôturée | Authorized validator |
  | Terminée / En attente de validation finale | À corriger | Requester or validator, with mandatory comment |
  | À corriger | En cours | Assigned employee |
  | Envoyée / Acceptée / En cours / À corriger | Envoyée | Authorized manager (reassignment to a recipient of the category) |

- **FR-015**: The system MUST refuse any other transition, as well as any transition attempted
  by an unauthorized user, and log the refused attempt.
- **FR-016**: A « Clôturée », « Refusée » or « Annulée » request MUST NOT be able to change
  status again; the rejection reason remains visible in the request and its history.
- **FR-016a**: The requester MUST be able to cancel their request as long as it is « Envoyée » or
  « En attente de validation administrative »; the assigned employee or the managers
  concerned are then notified. After acceptance, cancellation MUST NOT be offered any more.
- **FR-017**: Moving to « Terminée » MUST be blocked as long as no photo is attached, for
  the categories that require a proof photo.

**Workflows per category**

- **FR-018**: Each category MUST be configured with: workflow (A direct or B with
  administrative validation), list of possible recipients (workflow A) or of
  validating managers (workflow B), closure mode (automatic or by an authorized person;
  in automatic mode, the « Terminée » request is closed after a configurable grace period,
  24 h by default, during which the requester can send it back « À corriger »),
  final validation (yes/no, workflow B), assignment mode after approval (manual or
  automatic, workflow B), proof photo required (yes/no).
- **FR-019**: In workflow B, a request MUST NOT be visible to any executing employee before its
  approval.
- **FR-020**: The rejection of a request, by a manager in workflow B or by the assigned employee
  at the « Envoyée » status, MUST require a reason, move the request to the final status
  « Refusée » and notify the requester with that reason. The assigned employee MUST NOT be able to
  pass the request on to another employee themselves.
- **FR-021**: In workflow B with automatic assignment, the system MUST assign the request according to
  a rule configured for the category (for example a designated employee or manager).
- **FR-022**: A change to a category's configuration MUST apply only to
  requests created after the change.

**Deadlines**

- **FR-023**: The system MUST track three deadlines separately: administrative validation
  (from submission to the decision), takeover (from assignment to acceptance) and
  completion (from acceptance to the move to « Terminée »).
- **FR-024**: Deadlines MUST be configurable per category and per priority by an
  authorized person; a category and priority without a configured deadline are not tracked.
- **FR-025**: The system MUST display the time remaining for the current stage and flag
  requests close to the due date (configurable threshold) or overdue.
- **FR-026**: When a deadline expires, the system MUST mark the request « En retard »
  stating the stage concerned, notify the manager concerned, and MUST NEVER delete or
  hide the request automatically.
- **FR-027**: The system MUST allow an authorized manager to reassign a « Envoyée »,
  « Acceptée », « En cours » or « À corriger » request, overdue or not, to another
  recipient of the category; the request goes back to « Envoyée » for the new assigned employee
  and a new takeover deadline starts. Automatic escalation rules are outside the
  initial scope until they are defined.

**Timestamps and history**

- **FR-028**: The system MUST timestamp each stage: creation, submission, approval or
  rejection, assignment, acceptance, start, end, sending back for correction, final validation,
  closure.
- **FR-029**: The system MUST keep for each request a complete and non-modifiable
  history: author, action, date and time, value before and after (status, priority,
  assignment, messages, attachments).
- **FR-030**: The system MUST keep a global audit log (logins, access denials,
  changes to accounts, roles, permissions and settings), viewable by the
  super administrator only.

**Notifications**

- **FR-031**: The system MUST notify in real time, in the application only (no push and no
  email in this phase) and without a page reload, the
  users concerned by: new request, new message, assignment, status
  change, urgent request, request to correct, rejection, cancellation, delay, closure.
- **FR-032**: Notifications related to « Urgente » requests MUST be visually
  distinct.
- **FR-033**: Unread notifications MUST be kept and presented to the user
  at their next login.

**Search and filters**

- **FR-034**: Users MUST be able to search (by title) and filter requests
  by status, priority, category, recipient, period and delay indicator, with
  filters combinable.
- **FR-035**: Search results MUST contain only requests the
  user has access to.

**Roles, access and confidentiality**

- **FR-036**: The system MUST manage three roles: super administrator (accounts, roles,
  permissions, settings, audit logs), administrator/manager (view,
  approve/reject, assign, reassign, close, within their scope), employee (create
  requests, receive and process those assigned to them).
- **FR-037**: Detailed permissions (who can create in which categories, change the
  priority, close, validate) MUST be configurable by the super administrator, without
  changing the product; "who can contact whom" is determined by the recipients of
  each category (FR-004).
- **FR-038**: A request, its thread, its voice messages and its attachments MUST be accessible
  only to the requester, the assigned employee, the managers and validators of the category and the
  super administrator, with a server-side check on every access, including through a direct
  link.
- **FR-039**: A denied access MUST NOT reveal the existence or the content of the resource, and
  MUST be logged.
- **FR-040**: Access to the application MUST require authentication; sessions MUST
  expire after a period of inactivity.

**Usability**

- **FR-041**: All the functions of this phase MUST be usable on smartphone, tablet
  and computer, without loss of essential function.
- **FR-042**: Recording a voice message, listening to it, taking a photo and changing a status MUST
  be accessible in a single action from the request screen, with labels in
  everyday language.
- **FR-043**: The interface MUST comply with WCAG 2.2 level AA, including text
  alternatives to the audio controls and complete keyboard operation.
- **FR-044**: Voice messages are user-generated content and
  have no text alternative in this phase (no transcription). The mandatory title
  of each request (FR-001) gives its subject in text form, and a
  partial WCAG conformance statement MUST indicate that the audio content of voice messages has
  no text alternative.

### Key Entities *(include if feature involves data)*

- **User**: a person at the school with an account; name, job title, role, state
  (active or deactivated).
- **Role and permission**: set of rights assigned to a user; determines who can
  contact whom and which actions are allowed per category.
- **Category**: type of request (e.g. « Photocopies »); workflow, possible recipients,
  closure mode, final validation, assignment mode, required photo, associated managers and
  validators.
- **Deadline rule**: validation, takeover and completion deadline for a
  category × priority pair; warning threshold.
- **Request**: title, description, category, priority, requester, recipient or assigned
  employee, status, timestamps of each stage, delay indicators per stage.
- **Message**: element of a request's thread; author, date and time, text or voice message.
- **Voice message**: audio recording attached to a request or a message; duration.
- **Attachment**: photo or file attached to a request or a message; name, type,
  size, author, date; can serve as proof of completion.
- **History event**: non-modifiable record of an action on a request; author,
  action, date and time, values before and after.
- **Notification**: notice addressed to a user for an event; type, linked request,
  read or unread state.
- **Audit log entry**: non-modifiable record of a sensitive action outside requests
  (login, access denial, setting change).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee creates and sends a complete voice request in under 60 seconds
  from a smartphone.
- **SC-002**: In a usability test, at least 90% of non-technical employees
  record, listen back to and send their first voice request without help.
- **SC-003**: In 95% of cases, a recipient with the application open sees the
  notification of a new request or a status change in under 5 seconds, without
  reloading the page.
- **SC-004**: 100% of status transitions, assignments, messages and attachments
  appear in the request's history, with author, date and time.
- **SC-005**: 100% of unauthorized access attempts to a request, a voice message or an
  attachment are blocked and logged during security tests.
- **SC-006**: A request past its deadline is marked « En retard » and the manager is
  notified within 30 seconds after the due date.
- **SC-007**: No request is lost: 100% of requests whose sending failed can
  be resent without re-entering them.
- **SC-008**: The main journeys (create, listen, take a photo, change a status)
  can be done on smartphone, tablet and computer, and pass the WCAG 2.2 AA
  accessibility checks.
- **SC-009**: A filtered search returns its results in under 2 seconds for a volume
  of 10,000 requests.

## Assumptions

- Users are only school staff members; the Parent role is
  out of scope.
- The school has an internet connection; fully offline operation is not
  planned, only local retention of unsent content is.
- The interface content is in French.
- In workflow B, the requester does not choose the executing employee: they choose the category, and the
  request is submitted to the managers of that category.
- The takeover deadline runs from assignment to acceptance; the completion deadline
  runs from acceptance to the move to « Terminée ». After a « À corriger » send-back, a new
  completion deadline starts.
- Voice messages are not transcribed; automatic transcription is out of scope.
- An initial configuration (accounts, categories, deadlines) is provided at go-live.
- Notifications in this phase are displayed in the application only. A user who
  does not have the application open sees requests, including urgent ones, only at their next
  opening; deadline tracking and the « En retard » flag cover this risk.
- Out of scope: absence management, timetables, complaints, statistics and
  dashboards, import/export, voice message transcription, Parent role.

## Personal data

**Purposes** (principle IV of the constitution):

- **Authentication**: username, name, job title, role, hashed password, sessions and
  login IP address, to control access to the application.
- **Processing requests**: request content, text messages, voice messages, photos and
  attachments, to phrase, carry out and track work requests.
- **Traceability**: request history and audit log (author, action, date and time,
  values before and after), to make decisions verifiable and detect unauthorized
  access.

**Retention periods** — *provisional assumptions to be validated by the client before
going into production*:

| Data | Retention period |
|------|------------------|
| Voice messages, photos and attachments | 12 months after the request is closed (or rejected or cancelled) |
| Request history | 5 years |
| Audit logs | 5 years |

Automatic deletion at expiry is not implemented in this phase.

## Open points (to be handled in clarification)

The client asked that the following points not be decided in this specification. They are
covered above by configurable requirements and will be handled by `/speckit-clarify`:

- Detailed permissions (who creates in which categories, who changes the priority, who
  closes, who validates); "who contacts whom" is settled by the category recipients.
- Categories requiring administrative validation and/or final validation.
- Deadline values per category and priority (non-final example: urgent photocopies,
  takeover in 1 minute, completion in 5 minutes) and the "close to the due date" threshold.
- Action on a missed deadline: escalation or reassignment rules.
- People to designate as recipients of the « Photocopies » category (configuration).
- Proof photo required or not, per category.
- Who closes (automatic, requester, manager), per category.
- Maximum duration, format and size of voice messages; formats and size of attachments.
- Read or listen receipts for messages and voice messages.
- Validation of the provisional retention periods (section "Personal data").
