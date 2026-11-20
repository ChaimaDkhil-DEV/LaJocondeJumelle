# Data Model: Student class history and situation

## New entity: StudentClassHistory (« affectation de classe »)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, primary key | |
| `seq` | bigint, autoincrement | write order; breaks ties between two rows with the same `startedAt` |
| `studentId` | uuid, required | → `Student.id` |
| `classId` | uuid, required | → `SchoolClass.id` |
| `startedAt` | timestamptz(3), required | the moment the pupil joined this class. For a backfilled row: `Student.createdAt` |
| `changedById` | uuid, optional | → `User.id`; null only for backfilled rows |
| `reconstructed` | boolean, default false | true only for rows created by the migration |
| `createdAt` | timestamptz(3), default now | write time; for a backfilled row it is the go-live moment (see R2) |

**Indexes**: `(studentId, startedAt, seq)` for the lookup at a moment; `(classId)` for later reports.

**Rules**

- No `endedAt`. The period of a row is `[startedAt, next row's startedAt)`; the last row is current.
- Appending is the only write. A trigger refuses `UPDATE`, `DELETE` and `TRUNCATE` (pattern of `forbid_modification()` in migration 0001).
- Invariant, tested over the whole database: every `Student` has at least one row, and the row with the highest `(startedAt, seq)` has `classId = Student.classId`.
- A new row is appended only when the class actually changes (FR-003). A pupil update with the same class appends nothing.
- A row's `startedAt` is the server time of the change, never a client value (same rule as attendance).
- Deleting a class or pupil: neither is deleted today (classes and pupils are deactivated), so no cascade is needed. The foreign keys are `RESTRICT`.

**Backfill (in the migration)**

```text
for each Student: one row (classId = Student.classId, startedAt = Student.createdAt,
                           changedById = null, reconstructed = true, createdAt = now())
```

## Changed: AuditAction enum

- Add value `STUDENT_SITUATION_VIEWED`.
- `AuditLog` gets index `(targetType, targetId, createdAt)`.

## Changed: audit `details` for pupil changes (no schema change)

```text
STUDENT_CHANGED  create: { action: 'create', classId }
                 update: { action: 'update', fields: [...], before: {...}, after: {...} }
                         before/after contain only changed fields among firstName, lastName, classId, active.
                         parentPhone appears in `fields` only.
STUDENT_SITUATION_VIEWED { studentId, at }   targetType 'Student', targetId = pupil id
```

Whitelist of detail keys gains `at`.

## Computed, not stored: Situation

```text
Situation {
  student { id, firstName, lastName }
  moment  { requested: ISO, evaluatedAt: ISO (end of the minute, UTC) , timeZone }
  class        : Section<{ classId, name, level, floor, room, since, until?, reconstructed }>
  session      : Section<{ id, teacher, subject, room, startAt, endAt, status, cancellation? }>
  teacher      : Section<{ arrivals[], departures[], laterArrivals[], dayLevelOnly: boolean }>
  announcement : Section<{ requestId, type, announcedLateMinutes?, reason?, window }>
  substitute   : Section<{ inForce?, previous[], arrived? }>
  supervisors  : Section<{ assignee?, reinforcements[], source }>
  changes      : Section<Change[]>        // Change { kind, at, by, before, after, reason?, madeAfterMoment }
}

Section<T> { availability: 'KNOWN' | 'PROBABLE' | 'NONE' | 'UNAVAILABLE',
             value?: T, warning?: string, reasonUnavailable?: string }
```

**Availability rules** (single place: `domain/situation.ts`)

| Case | `class` | dependent sections |
|---|---|---|
| `T` before the pupil's creation | `UNAVAILABLE` ("before the pupil's creation date") | `UNAVAILABLE` |
| `T` in a reconstructed row and `T < row.createdAt` | `PROBABLE` + warning | their own availability, downgraded to `PROBABLE` if `KNOWN` |
| otherwise | `KNOWN` | each section's own rule |
| A section has no matching record and the records can show it (no session, no coverage) | | `NONE` |
| A section depends on a missing link (arrival cannot be tied to the session) | | `KNOWN` with `dayLevelOnly = true` |

A teacher without a recorded arrival is `NONE` ("no arrival recorded"); never "absent" unless an `ABSENT`
attendance row exists (FR-017).

## Existing entities read, unchanged

`Student`, `SchoolClass` (with `GradeLevel`, `Floor`), `TeachingSession`, `TimetableSeries`, `TeacherAttendance`,
`TeacherDeparture`, `CoverageDetail`, `CoveragePresence`, `CoverageSupport`, `Request`, `RequestEvent`,
`AuditLog`, `User` (display name only).

## Migration `0032_student_class_history` (outline, not the SQL)

1. `ALTER TYPE "AuditAction" ADD VALUE 'STUDENT_SITUATION_VIEWED'`.
2. `CREATE TABLE "StudentClassHistory"` with keys, foreign keys and indexes above.
3. Triggers `StudentClassHistory_append_only` and `StudentClassHistory_no_truncate` (function from 0001).
4. `CREATE INDEX` on `"AuditLog"("targetType","targetId","createdAt")`.
5. Backfill `INSERT … SELECT` from `"Student"`.
6. Runtime-role privileges for the new table, following what 0031 and `docs/roles-base-de-donnees.md` do (to verify when writing the SQL: `SELECT` and `INSERT` only).
7. `down.sql`: stops if any non-reconstructed row exists or the audit value has been used, as 0031's does; otherwise drops the table and index. The enum value cannot be removed once used; same wording as 0031's down script.

Per `CLAUDE.md`: the file is written once, complete (the project hook applies it on write), and applied only to
the local development database.
