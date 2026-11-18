# API contract — 020 Teacher timetables

Base `/api`. Session cookie authentication as everywhere. Errors use the existing `AppException` envelope
(`{ code, message, details? }`). Every route checks rights on the server; a denied account gets `404 NOT_FOUND` and
an `ACCESS_DENIED` audit entry (`AttendanceGate`). Dates `YYYY-MM-DD`, times `HH:MM` (school time zone), instants
ISO 8601 UTC.

Common error codes (new ones in bold):

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | field errors (`details.fields`) |
| `NOT_FOUND` | 404 | unknown id, or no right |
| **`TIMETABLE_CONFLICT`** | 409 | overlap; `details.conflicts: Conflict[]` |
| **`SESSION_LOCKED`** | 409 | change of a started or cancelled session; cancellation more than 7 days back |

```ts
interface Conflict {
  kind: 'TEACHER' | 'CLASS';
  date: string; startAt: string; endAt: string;     // the existing session
  sessionId: string;
  teacher: { id: string; displayName: string };
  class: { id: string; name: string };
  proposed: { date: string; startAt: string; endAt: string }; // the rejected one
}

interface SessionView {
  id: string; seriesId: string | null; detached: boolean;
  teacher: { id: string; displayName: string };
  class: { id: string; name: string; room: string | null };
  level: { id: string; name: string } | null;
  date: string; weekday: 1|2|3|4|5|6|7; startAt: string; endAt: string;
  startTime: string; endTime: string;              // local HH:MM in SCHOOL_TIMEZONE, computed by the server
  subject: string | null; room: string | null;      // room: own room, else the class's room
  status: 'SCHEDULED' | 'CANCELLED';
  cancelReason: string | null;                      // never sent on teacher routes
}
```

## Timetable management — administration (`ADMIN`, `SUPER_ADMIN`)

| Route | Body / query | Result |
|---|---|---|
| `GET /timetable/sessions` | `from`, `to` (≤ 31 days), `teacherId?`, `classId?`, `includeCancelled?` | `200 SessionView[]` ordered by start |
| `POST /timetable/sessions` | `{ teacherId, classId, date, startTime, endTime, subject?, room? }` | `201 SessionView`; 409 conflict |
| `PATCH /timetable/sessions/:id` | any of `teacherId, classId, date, startTime, endTime, subject, room` | `200 SessionView` (`detached` true if in a series); 409 conflict / locked |
| `POST /timetable/sessions/:id/cancel` | `{ reason }` (1–500) | `200 SessionView`; 409 locked |
| `GET /timetable/series` | `teacherId?`, `classId?` | `200 SeriesView[]` (with `upcomingCount`: scheduled future sessions) |
| `POST /timetable/series` | `{ teacherId, classId, weekday, startTime, endTime, subject?, room?, startDate, endDate }` | `201 { series, sessionCount }`; all-or-nothing, 409 lists every conflict |
| `PATCH /timetable/series/:id` | `{ from, teacherId?, classId?, startTime?, endTime?, subject?, room?, endDate? }` | `200 { series, updated, created, cancelled }`; applies to scheduled, not detached, not started sessions with `date ≥ from` (R2) |
| `POST /timetable/series/:id/cancel` | `{ from, to, reason }` | `200 { cancelled }` (scheduled, not started sessions of the range) |

Every write: one transaction, `TIMETABLE_CHANGED` audit entry, then `timetable:updated` to active admins and
the teachers concerned.

## Teacher's own timetable (active member of the Teachers group)

| Route | Query | Result |
|---|---|---|
| `GET /timetable/mine` | `from`, `to` (≤ 14 days) | `200 { from, to, sessions: OwnSessionView[] }` |

`OwnSessionView` = `SessionView` without `cancelReason`, plus `replaces?: { displayName }` for sessions the
teacher takes as a named substitute and `announcedAbsence: boolean` for their own sessions covered by an
announced absence. Identity from the session only; no teacher parameter is accepted (an unknown query key is
rejected by the global validation pipe).

## Expected teachers — administration (`ADMIN`, `SUPER_ADMIN`)

| Route | Query | Result |
|---|---|---|
| `GET /attendance/expected` | `date?` (default today), `teacherId?`, `classId?`, `status?` (one of the 7) | `200 ExpectedDay` |

```ts
interface ExpectedDay {
  date: string;
  serverNow: string;
  settings: { lateThresholdMinutes: number; toleranceMinutes: number };
  counts: { expected: number; present: number; late: number; notArrived: number }; // date + teacher + class filters, never status
  lines: ExpectedLine[];   // data-model.md; filtered by status too; ordered by start, then teacher name
}
```

## Changed existing routes

| Route | Change |
|---|---|
| `POST /attendance/resolve`, `POST /attendance/arrive` | response gains `session: { current: OwnSessionView \| null; next: OwnSessionView \| null }` for the scanning teacher today (FR-019). Nothing else changes. |
| `PUT /admin/settings` (existing) | accepts the two new keys; refuses threshold > tolerance (`VALIDATION_ERROR` on the saved key) |

## Realtime (Socket.IO, existing channel)

| Event | To | Payload |
|---|---|---|
| `attendance:updated` (existing) | admins + teacher | unchanged |
| `timetable:updated` (new) | active admins + teachers concerned | `{ dates: string[] }` (no session data: screens refetch over REST) |
