# Feature Specification: Teacher timetables linked to the QR attendance (emplois du temps)

**Feature Branch**: `020-emplois-du-temps` (created from `019-enseignants-presents`, not yet merged into `master`)

**Created**: 2026-11-18

**Status**: Draft (decisions D1 to D5 validated by the user on 2026-11-18)

**Input**: User description (summary): "Compléter le suivi des présences des enseignants avec les emplois du
temps : gestion par l'administration (séances hebdomadaires, modifications, changements exceptionnels,
conflits d'horaires) ; consultation par chaque enseignant de son seul emploi du temps ; liste administrative
des enseignants attendus et non arrivés ; rattachement automatique au pointage QR existant avec un délai de
tolérance configurable ; tableau de bord avec indicateurs et filtres. Intégré aux modules existants, sans
second système de présence."

## Context

Teachers already record their presence with the QR code printed in each class (lot 3, feature 019): the first
scan of the day records their arrival, a scan of another class records their arrival in that class, a second
scan records their departure from the school, a new scan records their return. The administration can enter
an arrival, an absence or a departure by hand, and correct an entry with a reason. Teachers can also announce
a lateness or an absence (existing request), and the administration can name a substitute for an announced
absence. Supervisors can declare a class empty by scanning its QR code (feature 013).

What is missing is a timetable. Without one, nobody can tell who was expected: a teacher who did not scan is
not listed anywhere, and an undeclared absence goes unnoticed. The application states this limit today: "an
absence is never deduced from a missing scan".

This feature adds the timetable and uses it to **compute** a status for each scheduled session from the
facts the attendance module already records. It adds no new way of scanning and no second attendance
record.

Vocabulary used in this document:

- **Session** (« séance »): one dated teaching slot: a teacher, a class, a date, a start and an end time,
  optionally a subject and a room. The grade level is the level of the class.
- **Weekly series** (« série hebdomadaire »): a pattern (weekday, times, teacher, class, subject, room) repeated
  every week over a period; it produces dated sessions.
- **Expected teacher** of a session: the session's teacher, or the substitute named by the administration on
  an announced absence covering the session.
- **Present in the school** (feature 019): arrived today (at least one arrival that is not an absence) and no
  open departure.
- **Lateness threshold** (« seuil de retard »): minutes after the start of a session within which an arrival
  still counts as on time. Default 5.
- **Tolerance delay** (« délai de tolérance »): minutes after the start of a session after which a teacher who
  has not arrived is shown as "Non arrivé". Default 10.
- **Administration**: active accounts with role `ADMIN` or `SUPER_ADMIN`.

## Clarifications (decisions validated by the user on 2026-11-18)

- **D1 — Who manages timetables**: the administration (`ADMIN` and `SUPER_ADMIN`), the same accounts that
  already follow teacher attendance. No new role and no new configurable permission.
- **D2 — On time / late**: an arrival at most *lateness threshold* minutes after the start is on time
  ("Présent"); later, it is "En retard". A class declared empty by a supervisor during the session, before the
  teacher has arrived, also shows the teacher as "En retard"; if the teacher then arrives and scans, the
  session stays "En retard" with the arrival time; if the teacher never arrives, the session becomes
  "Non arrivé" once the tolerance delay is over.
- **D3 — No new scanning logic**: scanning stays exactly as it is (019). Presence in the school is what
  counts for a session; teachers are not asked to scan again in each class. A session becomes "Non arrivé"
  when no arrival is recorded within the tolerance delay.
- **D4 — Forgotten scan**: the administration may state that a teacher is present (existing manual entry,
  "à l'heure" or "en retard"); this is its privilege and it is recorded in the audit log as today.
- **D5 — Signalling**: "Non arrivé" is shown in the administration list, updated live. No notification
  (bell or push) is sent.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The administration builds the weekly timetable (Priority: P1)

An administrator opens the timetable management page, picks a teacher or a class, and creates weekly
series: for example "Mme Ben Ali, 3A, Mathematics, room 12, every Monday 08:00–09:00 from 1 September to
30 June". The application creates the dated sessions for the period. Before saving, it checks that neither
the teacher nor the class already has a session at an overlapping time; if they do, nothing is saved and
every conflict is listed (date, time, teacher or class concerned).

**Why this priority**: every other story reads the timetable. Without it, nothing can be expected.

**Independent Test**: create a series for one teacher and check that the sessions appear on the right
dates; try to create an overlapping series for the same teacher, then for the same class, and check that
both are refused with the conflicts listed.

**Acceptance Scenarios**:

1. **Given** an active teacher and an active class, **When** the administrator creates a weekly series
   Monday 08:00–09:00 over four weeks, **Then** four dated sessions exist, each with the teacher, class,
   level of the class, subject and room entered.
2. **Given** the teacher already has a session Monday 08:30–09:30, **When** the administrator creates a
   series Monday 08:00–09:00 for the same teacher, **Then** nothing is saved and the conflicting dates and
   times are listed.
3. **Given** the class already has a session Monday 08:00–09:00 with another teacher, **When** the
   administrator creates a session for the class at 08:30–09:30, **Then** it is refused for a class conflict.
4. **Given** sessions 08:00–09:00 and 09:00–10:00 for the same teacher, **When** they are saved, **Then**
   they are accepted (touching sessions do not overlap).
5. **Given** a teacher, an employee or a parent account, **When** they try to reach the timetable
   management, **Then** they get "not found", and the denial is logged.

---

### User Story 2 - The administration handles exceptional changes (Priority: P1)

During the year, the administration changes one session (another time, another room, another teacher
replacing the usual one), changes a whole series from a given date, or cancels sessions (one session, or the
sessions of a series between two dates, for example during holidays), always with a reason for a
cancellation. A cancelled session never makes anyone absent.

**Why this priority**: a timetable that cannot follow real life produces false absences, which is exactly
what the feature must avoid.

**Independent Test**: modify one session of a series, then modify the series from a later date, and check
that the individually modified session keeps its change; cancel a session and check it shows "Séance
annulée" in the list, never "Non arrivé".

**Acceptance Scenarios**:

1. **Given** a series, **When** the administrator moves one of its future sessions to 10:00–11:00,
   **Then** only that session changes, and the change is checked for conflicts.
2. **Given** a series with one individually modified session, **When** the administrator changes the series
   times from a date onwards, **Then** the future, not individually modified sessions from that date change;
   the modified session and past sessions are left as they are.
3. **Given** a session, **When** the administrator assigns it to another teacher, **Then** the new teacher
   becomes the expected teacher, the change is checked for conflicts with the new teacher's sessions, and the
   previous teacher is no longer expected.
4. **Given** a session, **When** the administrator cancels it with a reason, **Then** its status is
   "Séance annulée", its teacher is no longer expected, and the reason is visible to the administration.
5. **Given** a cancellation without a reason, **When** it is submitted, **Then** it is refused.
6. **Given** a session that has already started, **When** the administrator tries to change its teacher,
   class, date or times, **Then** it is refused (history stays as it was); only cancellation with a reason
   remains possible, for at most 7 days back.
7. **Given** any creation, modification or cancellation, **Then** an audit entry records the author, time,
   values before and after, and the reason when there is one.

---

### User Story 3 - The administration sees who is expected and who has not arrived (Priority: P1)

In the "Surveillance" section, a new tab lists the sessions of the day with, for each one, the expected
teacher, the class and its level, the date and times, and a status computed from the existing attendance:

| Status | When |
|---|---|
| **À venir** | the session has not started |
| **Attendu** | the session has started, the tolerance delay is not over, the teacher has not arrived and nothing signals a lateness |
| **Présent** | the teacher was present in the school at the start, or arrived at most *lateness threshold* minutes after the start |
| **En retard** | the teacher arrived more than *lateness threshold* minutes after the start (minutes shown); or a supervisor declared the class empty during the session before the teacher arrived (in the school, or in that class when already present); or the teacher announced a lateness covering the start |
| **Non arrivé** | the tolerance delay is over and the teacher has not arrived (and is not covered by one of the statuses below) |
| **Absence justifiée** | an announced absence of the teacher covers the session, or the administration recorded an absence of the teacher that day with a reason |
| **Séance annulée** | the session is cancelled |

**Why this priority**: this is the problem the user wants solved: undeclared absences are currently invisible.

**Independent Test**: with a session starting at 08:00, a tolerance of 10 minutes and no scan, check the
status is "Attendu" at 08:09 and "Non arrivé" at 08:10; then have the teacher scan at 08:12 and check the
status becomes "En retard" (12 minutes).

**Acceptance Scenarios**:

1. **Given** a session at 08:00 and a teacher who scanned at 07:50, **When** the list is shown at 08:01,
   **Then** the status is "Présent".
2. **Given** a session at 08:00, a lateness threshold of 5 and an arrival at 08:04, **Then** the status is
   "Présent"; with an arrival at 08:06, it is "En retard" (6 minutes).
3. **Given** a session at 08:00, a tolerance of 10 and no arrival, **When** the list is shown at 08:09:59,
   **Then** the status is "Attendu", never "Non arrivé"; at 08:10 it is "Non arrivé".
4. **Given** a session at 08:00 and a supervisor who declared the class empty at 08:03, **When** the list is
   shown at 08:05, **Then** the status is "En retard"; **When** the teacher scans at 08:08, **Then** it stays
   "En retard" (8 minutes) with the arrival time; **When** the teacher never arrives, **Then** it is
   "Non arrivé" from 08:10.
5. **Given** a teacher with sessions at 08:00 and 14:00, present since 07:55, who scanned a departure at 11:00
   and no return, **When** the list is shown at 14:10, **Then** the 08:00 session is "Présent" and the 14:00
   session is "Non arrivé"; if the teacher scans back in at 14:20, the 14:00 session becomes "En retard"
   (20 minutes).
6. **Given** an announced absence of the teacher covering the session, **Then** the status is
   "Absence justifiée", never "Non arrivé"; **Given** the administration also named a substitute, **Then**
   the substitute appears as the expected teacher of that session and is evaluated like any teacher, and the
   titular appears as "Absence justifiée".
7. **Given** a teacher who forgot to scan, **When** the administration records a manual arrival "à l'heure"
   (or "en retard", with or without a time), **Then** the session becomes "Présent" (or "En retard").
8. **Given** a scan, a manual entry, a correction or a departure, **When** it is recorded, **Then** an open
   list reflects the new status within one minute, without reloading the page; a status that changes only
   because time passes (for example "Attendu" → "Non arrivé") is also reflected within one minute.

---

### User Story 4 - Each teacher consults their own timetable (Priority: P2)

From their account, a teacher opens "Mon emploi du temps" and sees their sessions for a day or for a week:
date and weekday, start and end times, class and level, subject and room when known. They can move to the
previous or next day or week. A cancelled session is shown as cancelled. A session they take as a named
substitute is shown with the name of the teacher replaced. A teacher can only ever see their own timetable.

**Why this priority**: useful for teachers, but the administration's need (stories 1 to 3) comes first.

**Independent Test**: log in as a teacher with sessions, check day and week views; check that no way exists
to display another teacher's timetable.

**Acceptance Scenarios**:

1. **Given** a teacher with sessions this week, **When** they open the week view, **Then** sessions are
   grouped by day in time order with all the fields listed above.
2. **Given** the day view, **When** they move to the next day, **Then** the sessions of that day are shown, or
   a message saying there is none.
3. **Given** any request for another teacher's timetable, **Then** it is impossible: the teacher's own
   identity comes from their session, never from a parameter they could change.
4. **Given** a cancelled session, **Then** it is shown as "Séance annulée" with no reason (the reason is for
   the administration).
5. **Given** an account that is not in the Teachers group, **When** it tries to open the page, **Then** it gets
   "not found" and the denial is logged.

---

### User Story 5 - The administration follows the day with indicators and filters (Priority: P2)

At the top of the new tab, four indicators count the sessions of the selected day: expected, present, late,
not arrived. The list can be filtered by date, teacher, class and status; the filters stay in the page
address so the view can be bookmarked or shared between administrators.

**Why this priority**: improves follow-up once the list exists.

**Independent Test**: with known sessions and attendance, check each indicator's value, then each filter
alone and combined.

**Acceptance Scenarios**:

1. **Given** the selected day, **Then** "expected" counts sessions that are neither cancelled nor justified
   absences; "present", "late" and "not arrived" count sessions with that status.
2. **Given** filters on a teacher and a status, **Then** only matching sessions are listed, and the
   indicators keep counting the whole day (or the selected teacher/class), so they do not contradict the
   status filter.
3. **Given** a past date, **Then** the list shows the statuses of that day as they result from the recorded
   facts (no "À venir" or "Attendu" remains on a past day).

### Edge Cases

- **Session overlapping midnight or ending before it starts**: refused; a session starts and ends on the same
  day.
- **Very short or long session**: between 5 minutes and 12 hours.
- **Series period**: the end date is on or after the start date, and at most one year after it; a series
  that produces no session (for example a Saturday pattern over three weekdays) is refused.
- **Inactive teacher or class**: cannot receive new sessions; their existing sessions remain in history.
- **Teacher removed from the Teachers group**: future sessions remain until the administration reassigns or
  cancels them; the list keeps evaluating them.
- **Arrival before the session but departure before its start**: not present at the start; a return before
  the start counts as present.
- **Teacher who leaves without scanning**: stays present for the following sessions (019 limit, stated on
  screen); the administration can record the departure by hand.
- **Two overlapping sessions saved at the same moment by two administrators**: only one is saved; the other
  gets the conflict.
- **Announced lateness and no arrival by the end of the tolerance delay**: stays "En retard" until the session
  ends, then becomes "Non arrivé" if the teacher never arrived.
- **Empty class declared while the teacher is already present in the school** (later session): the session
  shows "En retard" (class declared empty) until the teacher's arrival in that class is recorded (existing
  scan of that class's QR) or the administration records it; it never becomes "Non arrivé", since the teacher
  is in the school.
- **Announced absence cancelled**: the session goes back to the normal evaluation.
- **Tolerance or threshold changed during the day**: statuses are recomputed with the new values, including
  for past days.
- **Lateness threshold greater than the tolerance delay**: refused; the threshold must be lower than or equal
  to the tolerance.
- **Manual absence recorded although a scan exists**: already refused by the attendance module (unchanged).

## Requirements *(mandatory)*

### Functional Requirements

**Timetable management (administration)**

- **FR-001**: Only the administration (`ADMIN`, `SUPER_ADMIN`, active) MUST be able to create, modify and
  cancel sessions and weekly series; every other account MUST get "not found", and the denial MUST be logged.
- **FR-002**: A session MUST contain a teacher (active member of the Teachers group), a date, a start and an
  end time on that date, an active class; it MAY contain a subject (up to 100 characters) and a room (up to
  80 characters). The grade level MUST be the level of the class, never entered separately. Without a room,
  the class's room is shown.
- **FR-003**: The administration MUST be able to create a weekly series (weekday, times, teacher, class,
  subject, room, start and end date of the period); the series MUST produce one session per matching date.
- **FR-004**: The system MUST refuse any session (single, generated or modified) that overlaps a
  non-cancelled session of the same teacher or of the same class, and MUST list every conflict. A series is
  saved entirely or not at all. The check MUST hold when two administrators save at the same time.
- **FR-005**: The administration MUST be able to modify a future session alone, or a series from a chosen
  date; a series change MUST NOT affect past sessions nor sessions modified individually.
- **FR-006**: The administration MUST be able to change the teacher of a session (exceptional replacement);
  the new teacher becomes the expected teacher.
- **FR-007**: The administration MUST be able to cancel a session, or the sessions of a series between two
  dates, with a mandatory reason. Sessions MUST never be deleted.
- **FR-008**: Once a session has started, its teacher, class, date and times MUST NOT change; cancellation
  with a reason MUST remain possible up to 7 days back.
- **FR-009**: Every creation, modification and cancellation MUST be recorded in the audit log (author, time,
  values before and after, reason).

**Teacher's own timetable**

- **FR-010**: An active member of the Teachers group MUST be able to view their own sessions, by day and by
  week, with date, weekday, times, class, level, subject and room.
- **FR-011**: A teacher MUST only see their own sessions and the sessions where they are the named substitute
  (marked as such); their identity MUST come from their authenticated session only.
- **FR-012**: Cancelled sessions MUST appear as cancelled to the teacher, without the reason.

**Session status (attendance link)**

- **FR-013**: The status of each session MUST be computed from the timetable and from facts the attendance
  module already records (arrivals by scan or manual entry, departures and returns, announced latenesses and
  absences, named substitutes, empty-class declarations). The feature MUST NOT add a new kind of scan nor a
  second attendance record.
- **FR-014**: The statuses and their rules MUST be those of the table in User Story 3, applied in this order
  of precedence: Séance annulée, Absence justifiée, then, if the teacher's arrival is known, Présent or
  En retard (a class declared empty during the session, before the teacher's arrival in that class, makes it
  En retard), then by time: À venir, Attendu or En retard (lateness signalled), Non arrivé.
- **FR-015**: "Non arrivé" MUST NOT be shown before the tolerance delay is over, and MUST NEVER create an
  absence: the formal absence remains an entry made by a person.
- **FR-016**: For a teacher with several sessions in a day, each session MUST be evaluated separately against
  the teacher's presence in the school at that time (arrivals, departures and returns).
- **FR-017**: When a substitute is named on an announced absence covering a session, the substitute MUST be the
  expected teacher of that session, and the titular MUST appear as "Absence justifiée".
- **FR-018**: The lateness threshold (default 5 minutes) and the tolerance delay (default 10 minutes) MUST be
  settings editable by the super administrator, between 0 and 60 minutes, the threshold not exceeding the
  tolerance.
- **FR-019**: After a scan, the teacher's existing QR confirmation page MUST also show the session in progress
  or the next session of the day, if any (information only; nothing else changes on that page).

**Administration list and indicators**

- **FR-020**: The "Surveillance" section MUST offer a tab listing the sessions of a day with expected teacher,
  class and level, date, times, status, arrival time and minutes late when known, replacement and
  cancellation reason when relevant.
- **FR-021**: The tab MUST show four indicators for the selected day (expected, present, late, not arrived)
  and filters by date, teacher, class and status, kept in the page address.
- **FR-022**: An open list MUST reflect a new scan, entry, correction, departure or the passing of a threshold
  within one minute, without a manual reload.
- **FR-023**: No notification (bell or push) MUST be sent for "Non arrivé".

**Accessibility and security**

- **FR-024**: Statuses MUST be conveyed by text, not by colour alone; the timetable views, forms, filters and
  list MUST be usable with the keyboard and a screen reader and on a phone-sized screen, like the rest of the
  application.
- **FR-025**: All rights MUST be checked by the server on every request; the client is never trusted for the
  identity, the time or the status.

### Key Entities *(include if feature involves data)*

- **Weekly series**: a repeating pattern (weekday, start and end time, teacher, class, optional subject and
  room, period start and end date), with its author. Produces sessions; changing it from a date changes the
  future sessions it still governs.
- **Session**: a dated slot (teacher, class, date, start, end, optional subject and room), optionally linked to
  its series, marked when modified individually, with a state (scheduled or cancelled), a cancellation reason,
  and its author and dates. Never deleted.
- **Session status** (not stored): computed on reading from the session, the attendance facts of the day and
  the two settings.
- **Existing entities reused, unchanged**: teacher arrivals (`TeacherAttendance`), departures
  (`TeacherDeparture`), announced latenesses and absences and their substitute (coverage requests), empty-class
  declarations, classes and grade levels, the Teachers group, settings, the audit log.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can enter a teacher's weekly timetable of 20 sessions in under 10 minutes.
- **SC-002**: 100% of overlapping sessions for a teacher or a class are refused, including simultaneous saves.
- **SC-003**: In the tests covering every status rule, no session is ever shown "Non arrivé" before the end of
  its tolerance delay, nor for a cancelled session or a justified absence.
- **SC-004**: Every teacher who has a non-cancelled, non-justified session and no arrival appears as
  "Non arrivé" in the list at most one minute after the tolerance delay ends.
- **SC-005**: A teacher can display their day or week in at most two actions from their home page, and no
  path lets them display another teacher's timetable.
- **SC-006**: The new pages pass the project's automated accessibility checks with no violation.
- **SC-007**: All existing attendance, presence and coverage tests keep passing unchanged.

## Assumptions

- The timetable is managed by hand in the application; importing a timetable from a file or another software
  is out of scope.
- School holidays and closures are handled by cancelling the sessions of a period; no school calendar is
  added.
- Teachers do not see their attendance statuses in this feature (they keep "Mes présences" as today).
- Statuses are computed on reading and are not frozen: a later correction of an attendance entry, or a
  change of the settings, changes the status shown for past sessions; the audit log keeps the history of the
  facts themselves.
- Times are in the school's time zone, as everywhere in the application.
- The 7-day limit for cancelling a past session reuses the existing limit for manual attendance entries.
- The existing per-class unique arrival (one arrival per teacher, class and day) is unchanged.
