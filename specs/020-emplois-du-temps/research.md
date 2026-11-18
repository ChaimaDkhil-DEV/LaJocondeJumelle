# Research — 020 Teacher timetables linked to the QR attendance

All Technical Context unknowns are resolved below. Each entry: decision, rationale, alternatives.

## R1 — Store dated sessions, not only a weekly pattern

**Decision**: two tables. `TimetableSeries` holds the weekly pattern; `TeachingSession` holds one row per dated
session, generated when the series is created or extended. Every reader (teacher views, expected list,
QR page, conflicts) reads `TeachingSession` only.

**Rationale**: exceptional changes (move, cancel, other teacher) are plain updates of one row; conflicts are a
range check on rows; past sessions stay as they were when the pattern changes (FR-005, FR-008); the status
computation needs dated rows anyway.

**Alternatives rejected**: pattern + exception rows computed on the fly (every reader must merge patterns and
exceptions, conflict checks over virtual occurrences, history changes when a pattern is edited); sessions only,
without a series (the admin could not change "every Monday" in one action, FR-005).

## R2 — Series changes

**Decision**: a series change applies "from a date": it updates in place the series' sessions that are
scheduled, not detached and not yet started, from that date. Editable: times, teacher, class, subject, room,
end date. The weekday is not editable (end the series and create another one). Extending the end date generates
the missing sessions; shortening it cancels the sessions beyond it with the reason "Fin de série avancée".
Editing one session sets `detached = true`, so later series changes skip it.

**Rationale**: in-place updates keep session ids stable (the expected list and audit refer to them) and need no
"replaced by" links. Refusing weekday changes avoids moving sessions across dates, which would mix dates and
conflicts for little value.

**Alternatives rejected**: split the series into two series on every change (more rows, harder to read the
history); allow weekday changes (moves dated rows, confusing for teachers who already saw the week).

## R3 — Conflicts: database exclusion constraint + readable pre-check

**Decision**: migration enables `btree_gist` and adds two exclusion constraints on `TeachingSession`:
`EXCLUDE USING gist ("teacherId" WITH =, tstzrange("startAt","endAt",'[)') WITH &&) WHERE (status = 'SCHEDULED')`,
and the same on `"classId"`. The service first queries overlapping scheduled sessions (teacher or class) for all
rows it is about to write and returns `409 TIMETABLE_CONFLICT` listing them; if a concurrent write slips
between the check and the insert, PostgreSQL raises `23P01` (exclusion violation), which the service turns into
the same 409 after re-running the check.

**Rationale**: SC-002 requires refusal "including simultaneous saves"; only the database can guarantee it.
`[)` ranges make touching sessions (08:00–09:00, 09:00–10:00) legal. `btree_gist` is a contrib extension shipped
with the `postgres:17` image used in dev, CI and production, and is marked *trusted*, so the database owner
can create it without superuser rights.

**Alternatives rejected**: application check only (race between two administrators); `pg_advisory_xact_lock`
per teacher and class (works, but every writer must remember to lock; the constraint protects every path,
including future ones).

**To verify at implementation (T0)**: `prisma migrate dev` does not represent exclusion constraints; like the
partial unique index of 0030, they live only in `migration.sql`. Run `prisma migrate status` and `migrate diff`
after the migration and confirm no drift is reported. Fallback if Prisma reports drift: replace the constraints by
advisory locks in the service (one function used by every writer), documented in the plan.

## R4 — Where the status is computed: pure function, on reading

**Decision**: `backend/src/attendance/domain/session-status.ts`, a pure function (no database, no clock: `now` is
a parameter), called by `ExpectedTeachersService` for the list and the indicators. Nothing is stored.

**Rationale**: FR-013 (no second attendance record); a correction, a manual entry or a departure is reflected at
once; the rules are unit-testable at the minute (SC-003). Volume is small (a school: ~100 teachers, ~300
sessions a day): five queries per request (sessions, arrivals, departures, announced requests, empty-class
declarations of the day) and an in-memory computation.

**Alternatives rejected**: a scheduled job writing statuses (a second record of attendance, stale between runs,
needs reconciliation after corrections); a database view (rules in SQL are hard to test and to read).

## R5 — Status rules (exact)

For one expected line (session × expected teacher), with `S` start, `E` end, `G` lateness threshold, `T` tolerance,
`now` server time:

1. Session `CANCELLED` → **Séance annulée**.
2. Line of a titular whose announced absence (coverage request, source `TEACHER_REQUEST`, type `ABSENCE`, not
   cancelled, not merged) overlaps `[S, E)` → **Absence justifiée**. Same if the administration recorded an
   attendance `ABSENT` for this teacher on that day (any class: an absence entry is made for the day).
3. Human qualification first: if an attendance row of the expected teacher, in the session's class, that day,
   has status `ON_TIME` or `LATE` (manual entry or correction, D4), then **Présent** or **En retard**
   (minutes from `arrivedAt` when known).
4. Presence in the school (019 facts: non-`ABSENT` arrivals with their time, departures with their return):
   - present at `S` → **Présent**, unless an empty-class declaration for the session's class falls in `[S, E)`
     with no arrival of the teacher in that class recorded before it → **En retard** (class declared empty);
     an arrival in that class after the declaration keeps **En retard** with that arrival time;
   - else the first instant `A` in `(S, E)` where the teacher becomes present (arrival or return):
     `A ≤ S + G` → **Présent**, else **En retard** (`A − S` minutes).
5. No arrival known (or `A > now`):
   - `now < S` → **À venir**;
   - announced lateness overlapping `[S, E)` and `now < E` → **En retard** (announced);
   - empty-class declaration in `[S, now]` and `now < S + T` → **En retard** (class declared empty);
   - `now < S + T` → **Attendu**;
   - otherwise → **Non arrivé**.

Arrival instants: `arrivedAt` of the row; for a manual row without time, `recordedAt` (it proves presence from
that moment, not before). A substitute's line uses the substitute's facts. On a past day (`now ≥ end of day`),
rule 5 never yields À venir / Attendu.

## R6 — Substitutes

**Decision**: when a substitute is named on an announced absence overlapping the session, the list shows two
lines: the titular (**Absence justifiée**, "remplacé par X") and the substitute (evaluated, "remplace Y"). The
indicators count lines. A change of teacher in the timetable itself (exceptional replacement, FR-006) is just
the session's `teacherId`: one line, the new teacher.

**Rationale**: the existing substitute mechanism (`CoverageDetail.substituteTeacherId`) stays the only way to
handle announced absences; no second replacement model.

## R7 — Settings

**Decision**: two keys in `SETTING_DEFAULTS` / `SETTING_RULES`: `attendanceLateThresholdMinutes` (5) and
`attendanceToleranceMinutes` (10), `int` 0–60. Cross-field rule (threshold ≤ tolerance) checked in
`AdminSettingsService` on save, with a field error on the key being saved. Edited on the existing settings
page (super administrator).

## R8 — Live update

**Decision**: reuse `attendance:updated` (already emitted by every scan, entry, correction and departure) and add
`timetable:updated` (emitted by every timetable write, to active admins and to the teachers concerned, no data in
the payload). The expected tab invalidates its query on both events and also refetches every 60 s, because some
statuses change only with time (FR-022). The response carries `serverNow` so the screen never relies on the
client clock.

## R9 — Rights

**Decision**: reuse `AttendanceGate`: `assertManager` (ADMIN, SUPER_ADMIN active) for timetable management and the
expected list; `assertTeacher` (active member of the Teachers group) for "Mon emploi du temps". Denials: logged
`ACCESS_DENIED`, answered 404, as today. The teacher route takes no teacher id. `AttendanceModule` exports the gate;
the new `TimetableModule` imports it.

## R10 — Dates allowed at creation

**Decision**: single sessions and generated sessions are created only from today (school time zone) onward; a
session today that has already started can still be created (the admin may enter today's timetable late). A
series may start in the past; it only generates sessions from today. Past sessions can only be cancelled (7 days
back, FR-008).

**Rationale**: creating past sessions would make "Non arrivé" appear retroactively for days nobody followed.

## R11 — E2E timing without a fake clock

**Decision**: the E2E suite creates sessions relative to the real time (e.g. starting 15 minutes ago for
"Non arrivé", 2 minutes ago for "Attendu") and sets the tolerance setting as needed. Minute-level boundaries
(09:59 vs 10:00) are covered by the unit tests of R4, where `now` is a parameter.

## R12 — Deletion and retention

**Decision**: sessions and series are never deleted (triggers reusing `forbid_deletion()` from 0014); an error is
cancelled. Retention: same as teacher attendance (no automatic purge, unchanged). Personal data: only the teacher's
identity, already held; no new personal data (constitution IV).
