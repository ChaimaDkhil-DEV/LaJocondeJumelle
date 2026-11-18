# Data model — 020 Teacher timetables

Migration `0031_timetable` (with `down.sql`). Nothing changes in `TeacherAttendance`, `TeacherDeparture`,
`CoverageDetail` or `SchoolClass`. Times are `timestamptz` (UTC); dates are school-local `date`; local times are
`HH:MM` strings, converted with `common/school-time.ts` (`atLocalTime`) in `SCHOOL_TIMEZONE`.

## New enum

```prisma
/// État d'une séance d'emploi du temps (020). Une séance n'est jamais supprimée : une erreur s'annule.
enum TeachingSessionStatus {
  SCHEDULED
  CANCELLED
}
```

`AuditAction` gains `TIMETABLE_CHANGED`.

## TimetableSeries — weekly pattern

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | |
| `teacherId` | uuid → User | active member of the Teachers group at creation and on change |
| `classId` | uuid → SchoolClass | active at creation and on change |
| `weekday` | Int | 1 (Monday) … 7 (Sunday), ISO; not editable |
| `startTime`, `endTime` | VarChar(5) `HH:MM` | `endTime > startTime`; duration 5 min – 12 h |
| `subject` | VarChar(100)? | trimmed, empty → null |
| `room` | VarChar(80)? | trimmed, empty → null; null → the class's room is shown |
| `startDate`, `endDate` | date | `startDate ≤ endDate ≤ startDate + 366 days`; at least one matching date from today |
| `createdById` | uuid → User | |
| `createdAt`, `updatedAt` | timestamptz | |

Indexes: `(teacherId)`, `(classId)`. Rows not deletable (triggers `forbid_deletion()`).

## TeachingSession — dated session (what every reader reads)

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | |
| `seriesId` | uuid? → TimetableSeries | null for a single session |
| `teacherId` | uuid → User | as above |
| `classId` | uuid → SchoolClass | as above |
| `localDate` | date | school-local day of `startAt`; ≥ today at creation (R10) |
| `startAt`, `endAt` | timestamptz | same local day; `endAt > startAt`; 5 min – 12 h |
| `subject`, `room` | as series | copied from the series at generation |
| `status` | TeachingSessionStatus | default `SCHEDULED` |
| `detached` | Boolean | default false; true once edited individually (series changes skip it) |
| `cancelReason` | VarChar(500)? | required when `CANCELLED` (CHECK constraint) |
| `cancelledAt`, `cancelledById` | timestamptz?, uuid? → User | set with the cancellation |
| `createdById` | uuid → User | |
| `createdAt`, `updatedAt` | timestamptz | |

Indexes: `(localDate)`, `(teacherId, localDate)`, `(classId, localDate)`, `(seriesId)`.

SQL-only (not expressible in `schema.prisma`, documented in the model comment as for 0030):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_teacher_no_overlap"
  EXCLUDE USING gist ("teacherId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&) WHERE ("status" = 'SCHEDULED');
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_class_no_overlap"
  EXCLUDE USING gist ("classId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&) WHERE ("status" = 'SCHEDULED');
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_range" CHECK ("endAt" > "startAt");
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_cancel_reason"
  CHECK ("status" <> 'CANCELLED' OR "cancelReason" IS NOT NULL);
-- + no-delete / no-truncate triggers on both tables (forbid_deletion(), migration 0014)
```

`down.sql`: refuses (RAISE) if any series or session exists, or if `TIMETABLE_CHANGED` already appears in
`AuditLog` (restore the backup instead, as for 0030); otherwise drops both tables and `TeachingSessionStatus` and
recreates `AuditAction` without the value (labels read from `pg_enum`, order kept). Leaves `btree_gist`.

## Session state transitions

```
SCHEDULED ──cancel (reason, ≤ 7 days back)──▶ CANCELLED   (final: never reopened; create a new session instead)
SCHEDULED ──edit (not started)──▶ SCHEDULED, detached = true when it belongs to a series
SCHEDULED ──series change from date D (not started, not detached)──▶ SCHEDULED (updated in place)
```

Refused: any change of teacher/class/date/times once `startAt ≤ now`; any change of a `CANCELLED` session.

## Computed, not stored: expected line and status

```ts
type SessionStatus = 'UPCOMING' | 'EXPECTED' | 'PRESENT' | 'LATE' | 'NOT_ARRIVED' | 'EXCUSED' | 'CANCELLED';
// UI labels: À venir, Attendu, Présent, En retard, Non arrivé, Absence justifiée, Séance annulée

type LateReason = 'ARRIVAL' | 'EMPTY_CLASS' | 'ANNOUNCED' | 'QUALIFIED';

interface ExpectedLine {
  sessionId: string;
  role: 'TEACHER' | 'TITULAR' | 'SUBSTITUTE';   // TITULAR/SUBSTITUTE: named substitute on an announced absence (R6)
  teacher: { id; displayName };
  replaces?: { id; displayName };               // SUBSTITUTE line
  replacedBy?: { id; displayName };             // TITULAR line
  class: { id; name; room }; level: { id; name } | null;
  subject: string | null; room: string | null;
  date: string; startAt: Date; endAt: Date;
  status: SessionStatus;
  arrivedAt: Date | null; lateMinutes: number | null; lateReason: LateReason | null;
  cancelReason: string | null;                  // administration only
  requestId: string | null;                     // announced absence / lateness linked
}
```

Rules: research R5. Inputs of the pure function `sessionStatus(input, now, { lateThreshold, tolerance })`:
the session, the expected teacher's arrivals of the day (`status`, `arrivedAt`, `recordedAt`, `classId`),
departures of the day (`departedAt`, `returnedAt`), announced requests of the day for that teacher (`type`,
`startAt`, `plannedEndAt`), empty-class declarations of the day for the class (`startAt`).

## Settings (no schema change: `Setting` key/value)

| Key | Default | Rule |
|---|---|---|
| `attendanceLateThresholdMinutes` | 5 | int 0–60, ≤ `attendanceToleranceMinutes` |
| `attendanceToleranceMinutes` | 10 | int 0–60, ≥ `attendanceLateThresholdMinutes` |

## Audit (`TIMETABLE_CHANGED`, append-only `AuditLog`)

`targetType` `TimetableSeries` or `TeachingSession`; `details.action` one of `SERIES_CREATED`, `SERIES_UPDATED`,
`SERIES_CANCELLED_RANGE`, `SESSION_CREATED`, `SESSION_UPDATED`, `SESSION_CANCELLED`; `details.before` / `after`
(teacherId, classId, date, start/end, subject, room, status), `details.reason`, `details.sessionCount` and
`details.seriesId` (both added to the audit whitelist `ALLOWED_DETAIL_KEYS`), `from`/`to` for ranges. No
personal data beyond ids.
