# Feature Specification: Modification d'une affectation par l'admin (classe, créneau) (Assignment edit by the admin: class, time slot)

**Feature Branch**: `006-modification-affectation`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Edit of an assignment by an admin (or the super
administrator): change the class and/or time slot (date, start time, end time) of an
existing assignment, instead of cancelling it then recreating one. Today: only the
extension, the teacher's correction and reassignment exist; the teacher can
correct their own report only while it is « En attente » (Pending). Constraints: the proof of
attendance is tied to the class (QR code); a supervisor cannot be on two slots that
overlap; every admin action is logged and adds an event to the history;
slots in the school time zone, between 12 h before and 7 days after now; real-time
updates. Out of scope: changing the type, changing the supervisor (reassignment),
deletion (reasoned cancellation)."

## Clarifications

### Session 2026-10-22

- Q1 (editable statuses) → **B**: the **class** is editable only in the statuses « En
  attente », « Assignée », « En route » and « En retard ». During attendance (« En cours »,
  « Relève demandée »), **only the time slot** is editable, never the class; the start time
  then stays unchanged and the new end time cannot be earlier than the current time.
- Q2 (supervisor unavailable in the new slot) → **A**: if the new slot overlaps
  another assignment of the same supervisor, the change is **refused** with a clear message that
  **names the conflicting assignment**. The admin reassigns first, then edits. No reassignment
  in the same form.
- Q3 (class changed during « En route ») → **A**: the status **stays « En route »**. The supervisor
  receives a notification that **highlights the new class**, with no additional step on their
  part.

## Contexte (Context)

- A class or time error on an assignment (badly entered report, moved class,
  absence shorter than planned) today forces the admin to **cancel** the assignment then
  **recreate** one: the supervisor receives a cancellation then a new assignment, the history
  is split in two, and the teacher's report is no longer linked to the actual assignment.
- Existing to reuse, without changing it: extension (later end), reassignment (other
  supervisor, availability re-checked), correction by the teacher concerned, correction by the
  teacher of their own report while it is « En attente ».
- Statuses of an assignment: En attente (no supervisor yet); Assignée, En route, En
  retard (supervisor designated, attendance not yet confirmed); En cours, Relève demandée
  (supervisor present in class); then Terminée, Clôturée, Annulée, Non pourvue (final).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct an assignment's time slot (Priority: P1)

The admin learns that the absent teacher will arrive at 10:30 and not 11:00. They open the assignment,
choose « Modifier » (Edit), change the end time and save. The assigned supervisor is told of the
new slot; the assignment's history keeps the old and the new slot.

**Why this priority**: this is the most frequent case (misestimated duration, shifted class); the
extension covers only lengthening, not shortening or shifting.

**Independent Test**: change the start and end of an assigned assignment, verify the slot
displayed to the admin and the supervisor, the notification, the history and the audit log.

**Acceptance Scenarios**:

1. **Given** an editable assignment (see FR-002), **When** the admin changes the date, start
   time and/or end time and saves, **Then** the new slot is displayed everywhere (detail,
   lists, the supervisor's « Mes affectations »), with no change of supervisor or status
   (except FR-008).
2. **Given** the saved change, **Then** the assigned supervisor (if any) receives
   a notification giving the old and new slot, and the teacher who originated the
   report (if any) sees the new slot in « Mes signalements ».
3. **Given** the change, **Then** the assignment's history contains an
   « Affectation modifiée » event with the before and after values, and the audit log an entry
   « Affectation gérée par un admin » with the author, date and before and after values.
4. **Given** a new slot that overlaps another assignment of the same supervisor, **When**
   the admin saves, **Then** the change is refused, nothing is changed, and a clear message
   names the conflicting assignment (class and slot); the admin reassigns first, then edits
   (no reassignment in the edit form).
5. **Given** an invalid slot (end before the start, start outside the window 12 h before / 7 days
   after, end already past), **When** the admin saves, **Then** a clear message, tied to the field,
   says so and nothing is changed.
6. **Given** an assignment during attendance (« En cours », « Relève demandée »), **When** the admin
   opens « Modifier », **Then** only the end time is editable (class, date and start time
   read-only) and an end time earlier than the current time is refused.

---

### User Story 2 - Change an assignment's class (Priority: P2)

The report said « 2e année Bleu » by mistake: the class concerned is « 1ère année
Violet ». The admin changes the class; the supervisor is told of the new class and
attendance is now confirmed with the new class's QR code.

**Why this priority**: less frequent than the slot, but today only a report still
« En attente » can be corrected (by the teacher); after assignment, nothing is possible.

**Independent Test**: change the class of an assigned assignment; the supervisor sees the new
class; the old class's QR code is refused, the new one's accepted.

**Acceptance Scenarios**:

1. **Given** an editable assignment whose attendance is not yet confirmed, **When** the admin
   chooses another active class and saves, **Then** the new class (and its floor)
   is displayed everywhere and the supervisor is notified.
2. **Given** the changed class, **When** the supervisor scans the **old** class's QR code,
   **Then** attendance is refused with a clear message; with the **new** class's one,
   it is accepted.
3. **Given** an assignment whose attendance is already confirmed (En cours, Relève demandée),
   **Then** the class is not editable (the supervisor is already in the class); only the end
   time is (US1 scenario 6).
4. **Given** the class change of an « En route » assignment, **Then** the assignment stays
   « En route » and the supervisor receives a notification that highlights the new class;
   no additional step is asked of them.

---

### Edge Cases

- **Finished, closed, cancelled or unfilled assignment**: no change possible.
- **No change** (same class and slot): saving has no effect, with no
  notification or event.
- **Concurrent change** (two admins, or the supervisor acting at the same time): the
  second action is refused with a message explaining that the assignment has changed, and the page
  reloads (current behavior of the other actions).
- **Disabled class**: not offered; an existing assignment in a disabled class keeps
  its class as long as it is not changed.
- **« En attente » assignment** (report not yet assigned): editable by the admin; no
  supervisor availability to check; the teacher keeps their own correction while it
  is « En attente ».
- **Assignment late to be taken over** (deadlines, reminders, escalation): the deadlines are
  recomputed from the new slot.
- **Duplicates and reinforcements**: a change neither merges nor splits assignments; the reinforcements
  present stay attached (only possible before attendance for the class, hence with no reinforcement
  on site).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Only admins and the super administrator MUST be able to change an assignment;
  the check MUST be done by the server for each request, with a logged refusal.
- **FR-002**: What is editable depends on the status:
  - « En attente », « Assignée », « En route », « En retard »: class, date, start time and
    end time;
  - « En cours », « Relève demandée » (attendance confirmed): **end time only**; the class,
    date and start time stay unchanged, and the new end time MUST NOT be
    earlier than the current time;
  - « Terminée », « Clôturée », « Annulée », « Non pourvue »: no change.
- **FR-003**: Within the limits of FR-002, the admin MUST be able to change, together or separately:
  the class (among the active classes), the date, the start time and the end time, in the
  school time zone.
- **FR-004**: The changed slot MUST respect the creation rules: end after the start, end
  not yet past, start between 12 h before and 7 days after the moment of the change.
- **FR-005**: The class MUST be editable only in the statuses « En attente », « Assignée »,
  « En route » and « En retard »; never once attendance is confirmed (« En cours », « Relève
  demandée »). The server MUST refuse any attempt to the contrary.
- **FR-006**: The assigned supervisor's availability MUST be re-checked on the new slot
  (active account, neither absent nor unavailable, no other assignment or reinforcement that
  overlaps). If it fails, the change MUST be refused with nothing changed, with a message that names
  the conflicting assignment (class and slot); no reassignment is offered in the
  edit form.
- **FR-007**: After a change, the assigned supervisor MUST be notified (old and new
  slot and/or class; a class change is highlighted in the notification), as well as
  the other admins; the teacher who originated the report MUST
  see the new values in « Mes signalements ». Updates MUST appear in real
  time for the people viewing the assignment.
- **FR-008**: The status MUST stay unchanged, including « En route » after a class change
  (no additional step for the supervisor).
- **FR-009**: After a class change, attendance confirmation MUST require the QR code of
  the new class.
- **FR-010**: Each change MUST add an « Affectation modifiée » event to the assignment's
  history and an entry to the audit log (author, date and time, before and after values);
  the reason for the absence, visible to admins only, stays unchanged and is not logged.
- **FR-011**: The takeover deadlines, reminders and escalations MUST be recomputed from
  the new slot.
- **FR-012**: A concurrent change MUST be detected and refused with no loss: explicit
  message and reload of the assignment.
- **FR-013**: The edit form MUST comply with WCAG 2.2 AA (keyboard, labels,
  errors tied to fields, announced confirmation) and fit in 320 px width.

### Key Entities *(include if feature involves data)*

- **Assignment** (existing): class (and copied floor), start, planned end, status, assigned
  supervisor, teacher concerned, reason. The change modifies class, floor, start and planned end,
  nothing else.
- **History event** (existing): new « Affectation modifiée » event with the before and after
  values.
- **Audit log entry** (existing): action « Affectation gérée par un admin » for the
  change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Correcting an assignment's class or slot takes a single operation
  (« Modifier » then « Enregistrer »), instead of a cancellation followed by a recreation.
- **SC-002**: After a change, the assigned supervisor sees the new class and the new
  slot in under 5 seconds, without reloading the page.
- **SC-003**: 100% of saved changes appear in the assignment's history
  and in the audit log with the before and after values.
- **SC-004**: 0 changed assignments place a supervisor on two overlapping slots.
- **SC-005**: No accessibility violation detected by the automated audit on the edit
  form, at 320 px and on desktop.

## Assumptions

- Editing = correcting the same assignment (same reference, same history); the supervisor and the
  type (delay, absence, empty class) do not change. To change supervisor, the existing
  reassignment applies.
- The existing extension stays available and unchanged; the change also covers
  shortening and shifting the slot.
- The teacher's correction of their « En attente » report stays unchanged.
- In-app notifications only (no email or SMS), like the rest of the module.
- The absence reason is not editable by this feature.
