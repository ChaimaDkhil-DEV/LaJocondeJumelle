# Feature Specification: Student class history and situation at a given moment (historique élève)

**Feature Branch**: `021-historique-eleve-situation`

**Created**: 2026-11-20

**Status**: Implemented (2026-11-20), not yet committed

**Input**: User description (summary): "Historiser la classe de chaque élève et permettre à l'administration de
reconstituer, pour un élève et un instant précis, dans quelle classe il était, quelle séance était prévue, qui
enseignait réellement, qui remplaçait, et qui surveillait. Chaque information indique si elle est connue,
inconnue ou non disponible. Réservé à l'administration, chaque consultation est journalisée."

## Context

When a parent complains or a pupil is hurt during a session, the administration must be able to say who was
responsible for the pupil at that exact minute. An audit of the existing application (2026-11-20) showed that
the facts are recorded in several places but cannot be put together for a pupil:

- A pupil's class is a single value, overwritten on every change. The audit trail only says that the class
  changed, not from which class to which. The class a pupil was in last month cannot be known.
- The timetable (feature 020), the teachers' arrivals and departures (019), the announced absences and
  lateness, the substitutes and the supervisors' coverages (004, 013) are all recorded with dates and times,
  but nothing links them to a pupil, and no screen answers "what was the situation at 10:42 on 12 November?".
- The audit trail cannot be searched by the person or object concerned, and only the super administrator can
  read it.

This feature adds (1) a dated history of each pupil's class and (2) a **situation** view that, for a pupil
and a moment, assembles the existing facts. It records no new facts about teachers, sessions or supervision.

Vocabulary used in this document:

- **Situation**: the set of facts that applied to a pupil at a given moment.
- **Moment** (« instant »): a date and time precise to the minute, in the school's time zone.
- **Class period** (« période de classe »): the period during which a pupil belonged to a class: class, start, end (open if the
  pupil is still in it), author of the change.
- **Titular teacher**: the teacher the timetable planned for the session.
- **Actual teacher**: the teacher who recorded an arrival in the class for that session.
- **Authorized substitute**: the teacher the administration named for an announced absence.
- **Supervisors**: staff who covered the class (coverage assignee, reinforcements, recorded presences).
- **Administration**: active accounts with role `ADMIN` or `SUPER_ADMIN`.
- **Availability of a fact**: *known* (a value was recorded), *probable* (deduced from the current class for a
  period before the history began; changes may not have been recorded), *none* (the records show that nothing
  happened, e.g. no substitute was named), or *unavailable* (no record exists and none can be deduced).
- **Go-live date**: the day the class history started being recorded.

## Clarifications

### Session 2026-11-20

- Q: For a pupil enrolled before this feature, is the current class shown as certain or probable before the
  go-live date? → A: Probable, with a visible warning "not guaranteed, changes may not have been recorded".
- Q: Does this feature deliver an administration screen or only the data service? → A: Both: the service and a
  situation screen reached from the pupil's record (class history, date and time choice, printable page).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know which class a pupil was in on a given day (Priority: P1)

An administrator opens a pupil's record and sees the list of classes the pupil belonged to, each with its
start and end date, and who made each change. When the pupil moved from one class to another, both are shown.

**Why this priority**: every other answer depends on it. Without the class at the time, the timetable,
teacher and supervisors cannot be found. It also starts collecting data that cannot be recovered later, so it
is valuable even before the situation view exists.

**Independent Test**: create a pupil in class A, move them to class B, then to class C; the history lists
A, B, C with continuous dates and the author of each change.

**Acceptance Scenarios**:

1. **Given** a pupil created today in class A, **When** the administrator reads the history, **Then** it shows
   one class period for A, starting at creation and still open.
2. **Given** a pupil in class A, **When** the administrator moves them to class B, **Then** the class period of
   A ends at that moment, a class period for B starts at the same moment, and both show who made the change.
3. **Given** a pupil already in the school before this feature, **When** the history is first read, **Then**
   it shows the current class as starting at the pupil's creation date, marked *probable* with the warning
   "not guaranteed, changes may not have been recorded" up to the go-live date.
4. **Given** a change that does not affect the class (phone number, name), **When** it is saved, **Then** the
   class history is unchanged.
5. **Given** a class change, **When** the audit trail is read, **Then** its entry shows the previous and the
   new class, not only the fact that the class changed.

---

### User Story 2 - Reconstruct a pupil's situation at a precise moment (Priority: P1)

An administrator picks a pupil, enters a date and a time, and gets one page answering: which class the pupil
was in; which session was planned (teacher, subject, room, cancelled or not); which teacher actually arrived
and when; whether an absence or lateness had been announced; who the authorized substitute was and whether
they arrived; and who the supervisors were. Each answer states whether it is known, none, or unavailable.

**Why this priority**: this is the question the administration must answer to a parent or an insurer.

**Independent Test**: with a seeded session 10:00–11:00, a teacher arrival at 10:12, and a pupil in that class,
ask for 10:42: the page shows the class, the session, the teacher and the 10:12 arrival.

**Acceptance Scenarios**:

1. **Given** a session 10:00–11:00 and the titular teacher arrived at 10:02, **When** the administrator asks
   for 10:42, **Then** the page shows the class, the planned session, the titular teacher as actual teacher
   with the arrival time, and no substitute.
2. **Given** the titular teacher announced an absence and a substitute was named and arrived at 10:05,
   **When** the administrator asks for 10:42, **Then** the page shows the titular teacher as absent (with the
   announcement), the substitute's identity and arrival time as the actual teacher.
3. **Given** the titular teacher arrived at 10:30, **When** the administrator asks for 10:15, **Then** the
   page shows that no teacher had arrived yet, and the arrival of 10:30 is shown as later than the moment.
4. **Given** a supervisor covered the class from 10:08 to 10:35, **When** the administrator asks for 10:20,
   **Then** the page names the supervisor and their coverage period; asked for 10:40, it shows that the
   coverage had ended.
5. **Given** no session was planned at that moment, **When** the administrator asks, **Then** the page says
   "no session planned" (none), still shows the class, and shows any supervisors.
6. **Given** a pupil enrolled before the go-live date and a moment between their creation and the go-live
   date, **When** the administrator asks, **Then** the class is shown as *probable* with the warning, and
   the dependent items (session, teacher, supervisors) are shown as *probable* too, not as certain.
7. **Given** a moment before the pupil's creation date, **When** the administrator asks, **Then** the class is
   shown as *unavailable* and the dependent items are not guessed.
8. **Given** a session was cancelled, **When** the administrator asks for a moment within it, **Then** the page
   shows the cancellation, its reason and its author.

---

### User Story 3 - See what changed around the moment (Priority: P2)

On the same page, the administrator sees the timetable changes, attendance corrections and substitute changes
that touched this session, with date, time, author, and before/after values, including those made *after* the
moment (so a correction made after the incident is visible and flagged as such).

**Why this priority**: a record corrected after an incident must not be mistaken for what was known at the time.

**Independent Test**: change a session's room and correct a teacher's arrival time after the fact; both appear
with their author and a "made after the moment" mark.

**Acceptance Scenarios**:

1. **Given** a session whose room was changed at 09:00 the same day, **When** the situation at 10:42 is read,
   **Then** the change is listed with its author, time, old and new room.
2. **Given** an arrival time corrected the next day with a reason, **When** the situation is read, **Then**
   the original and corrected values, the reason and the author are shown, flagged as made after the moment.
3. **Given** the substitute was changed twice, **When** the situation is read, **Then** the substitute in
   force at the moment is shown and the earlier ones are listed.

---

### User Story 4 - Control and traceability of consultations (Priority: P2)

Only the administration can open a pupil's history and situation. Each situation consultation is recorded
(who, when, which pupil, which moment). An administrator can search the audit trail for entries concerning one
pupil.

**Why this priority**: these pages disclose where a child was and who was responsible; access must be
controlled and traceable.

**Independent Test**: a teacher account is refused; an administrator's request creates a trail entry.

**Acceptance Scenarios**:

1. **Given** a teacher, supervisor or parent account, **When** it requests a pupil's history or situation,
   **Then** access is refused and nothing is revealed about the pupil.
2. **Given** an administrator consulted a situation, **When** the audit trail is read, **Then** it shows who,
   when, which pupil and which moment.
3. **Given** a pupil identifier that does not exist, **When** requested, **Then** a "not found" answer is returned.

---

### Edge Cases

- Moment in the future: refused with a clear message.
- Moment malformed: refused with a clear message; the school's time zone is applied when only a local date
  and time are given.
- Pupil deactivated or class deactivated since: history and situation still work.
- Pupil changed class the same day as the moment: the class is the one in force at that exact minute; at the
  minute of change, the new class applies.
- Two changes of class within the same minute: the order of recording decides; the last one is in force.
- Two sessions of the same teacher in the same class on the same day: the session covering the moment is used,
  and the arrival is shown against the whole day if it cannot be tied to one session (stated as such).
- Teacher left the school (departure) and had not returned at the moment: shown as "left at HH:MM, not
  returned".
- Teacher data anonymized after a retention action: shown as "anonymized", not as a missing fact.
- Supervisor reinforcements released before the moment are not listed as present.
- Import of pupils creating or moving many pupils: each class change is recorded individually.

## Requirements *(mandatory)*

### Functional Requirements

**Class history**

- **FR-001**: The system MUST record, for each pupil, every period spent in a class: class, start, end (known once a
  later period exists), and the author of the change.
- **FR-002**: Creating a pupil, changing a pupil's class by hand, and creating pupils through a bulk import MUST
  each create the corresponding history entry in the same operation as the change; if one fails, neither is kept.
- **FR-003**: Changes that do not modify the class MUST NOT add a history entry.
- **FR-004**: A pupil MUST have at most one current class period, and class periods of one pupil MUST NOT
  overlap.
- **FR-005**: For pupils existing before this feature, the system MUST create one class period for their current
  class starting at the pupil's creation date and ending at the go-live date, marked "reconstructed from the
  current class"; its availability is *probable* (see FR-016).
- **FR-006**: History entries MUST NOT be editable or deletable through the application.
- **FR-007**: The audit trail entry for a pupil change MUST include the previous and the new value of each
  changed field. Personal contact data (parent phone) MUST be shown only as "changed", not with its values.

**Situation**

- **FR-008**: The administration MUST be able to request, for one pupil and one moment, a situation made of the
  sections below. The moment MUST NOT be in the future.
- **FR-009**: *Class*: the class the pupil belonged to at the moment, with its level, floor and room, and the
  period of the class period.
- **FR-010**: *Planned session*: the timetable session of that class covering the moment: titular teacher,
  subject, room, start and end, status, and cancellation reason, time and author when cancelled.
- **FR-011**: *Actual teacher*: the teacher(s) who recorded an arrival in that class on that day before the
  moment, with arrival time, how it was recorded (QR or by hand), and whether it was corrected afterwards.
  Departures from the school without return before the moment MUST be shown.
- **FR-012**: *Announced absence or lateness*: the announcement concerning the titular teacher and that
  session, with its reason visible to the administration and the announced lateness.
- **FR-013**: *Substitute*: the authorized substitute in force at the moment, the earlier ones, and whether the
  substitute actually recorded an arrival, with time.
- **FR-014**: *Supervisors*: staff on coverage of the class at the moment (assignee, reinforcements active at
  the moment, recorded presences), with coverage start, presence time and end, and source of the coverage.
- **FR-015**: *Changes*: timetable changes, attendance corrections and substitute changes concerning that
  session, class and teachers on that day, with author, time, before and after values, and whether made after
  the moment.
- **FR-016**: Every item in FR-009 to FR-015 MUST carry an availability of *known*, *probable*, *none* or
  *unavailable*. A *probable* item MUST show the warning "not guaranteed, changes may not have been recorded"
  and every item that depends on a *probable* class is *probable* too. An *unavailable* item MUST state why
  (for example "before the pupil's creation date").
- **FR-017**: The system MUST NOT deduce or guess a fact it cannot establish. In particular, a teacher without
  a recorded arrival is "no arrival recorded", never "absent" unless an absence was recorded.
- **FR-018**: The substitute in force at the moment MUST be reconstructed from the dated records of its changes.
  The arrival of a teacher is shown with its current, corrected value; when it was corrected, the original
  value, the reason, the author and the time of the correction appear under FR-015 and the arrival is marked
  "corrected". A correction is meant to fix the truth, so the situation does not replay the uncorrected value.

**Access and traceability**

- **FR-019**: Only the administration MAY open a pupil's class history and situation; every other account
  MUST be refused without revealing whether the pupil exists.
- **FR-020**: Each situation consultation MUST be recorded in the audit trail: author, time, pupil, moment.
- **FR-021**: An administrator MUST be able to list the audit entries concerning a given pupil, within the
  limits of what the administration may read (no passwords, tokens or message contents).
- **FR-022**: From a pupil's record, the administration MUST be able to open the class history and a situation
  screen where it enters a date and a time. The situation MUST be readable on screens from 320 px wide, be usable by keyboard, and meet
  WCAG 2.2 AA. Each section shows its availability in words, not by colour alone.
- **FR-023**: The situation MUST be printable as a single page for a parent meeting or an insurer, including
  who produced it and when.

### Key Entities

- **Class period (période de classe)**: a pupil, a class, a start, an optional end, the author, and an
  indicator "reconstructed" for entries created from existing data.
- **Situation**: a read-only assembly, not stored, of sections (class, planned session, actual teacher,
  announcement, substitute, supervisors, changes), each with its availability.
- **Audit entry**: existing; gains the previous/new values for pupil changes and a "situation consulted" kind.
- **Existing entities used, unchanged**: pupil, class, timetable session and series, teacher attendance,
  teacher departure, coverage (with substitute, presences, reinforcements), request events.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a pupil whose class changed after this feature went live, an administrator finds the class on
  any past date in under 30 seconds, with 100 % accuracy against the recorded changes.
- **SC-002**: For a moment covered by a planned session, an administrator obtains the class, titular teacher,
  actual teacher, substitute and supervisors on a single page in under 1 minute, without opening other screens.
- **SC-003**: In acceptance tests covering the eight scenarios of User Story 2, 100 % of the facts shown match
  the recorded data, and no section shows a guessed value.
- **SC-004**: 100 % of class changes (manual and bulk) after go-live have a history entry; 0 pupils have two
  current classes or overlapping periods.
- **SC-005**: 100 % of situation consultations appear in the audit trail with author, pupil and moment.
- **SC-006**: 0 accounts outside the administration can read a history or situation.
- **SC-007**: The situation for one pupil is displayed in under 3 seconds for a school of several hundred
  pupils and a year of records.
- **SC-008**: The administration can answer a parent's question about a past incident the same day, without
  asking the technical team for database access.

## Assumptions

- Reconstruction is possible only from what is recorded. Class changes made before go-live are lost; the
  history starts at go-live for them; the period before is *probable* and flagged "reconstructed"
  (FR-005, FR-016).
- Administration means `ADMIN` and `SUPER_ADMIN`, as in features 019 and 020. No new role or permission.
- The school's time zone is the one already configured; moments are shown and entered in that zone.
- The moment is precise to the minute; seconds are ignored.
- A teacher's arrival is recorded per class and per day, not per session; when two sessions of the same
  teacher and class fall on the same day, the arrival is tied to the day and the page says so (FR-011).
- The previous substitutes are read from the dated records already kept (request events and audit trail);
  nothing is stored twice.
- Parent phone numbers are personal data: the audit trail shows only that they changed (Constitution IV).
- Purpose and retention: the class history exists to answer safeguarding and complaint questions. It follows
  the retention rule of the pupil record; a dedicated retention policy is out of scope.
- The supervisors section covers only coverages recorded in the application; there is no supervision
  planning, so a class without a coverage shows "none recorded", not "unsupervised".
- Out of scope: incident register, supervision planning, retention policy, pupil attendance (whether the pupil
  was present), parent-facing access, notifications.
- Depends on features 004 (coverages), 013 (empty class declaration), 019 (teacher attendance and departures)
  and 020 (timetable).
