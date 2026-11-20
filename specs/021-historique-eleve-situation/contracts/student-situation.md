# API contract: student class history and situation

All routes are under `/admin/students`, behind `AdministrationGuard` (roles `ADMIN` and `SUPER_ADMIN`),
session cookie authentication as for the other admin routes. Times are ISO 8601 UTC in responses; the screen
shows them in the school time zone.

Common errors: `401` not signed in; `403 FORBIDDEN` for any other role (the guard logs the denial as `ACCESS_DENIED`
and answers the same way whether or not the pupil exists); `404 NOT_FOUND` for an unknown or malformed pupil id (administration only);
`400 VALIDATION_ERROR` for invalid query values, in the project's field-error format.

## GET /admin/students/:id/class-history

Class periods of the pupil, most recent first.

**200**

```json
{
  "studentId": "uuid",
  "items": [
    {
      "id": "uuid",
      "class": { "id": "uuid", "name": "CE2 A", "level": "2e année", "floor": "Étage 1", "room": "Salle 12" },
      "startedAt": "2026-11-12T08:30:00.000Z",
      "endedAt": null,
      "changedBy": { "id": "uuid", "displayName": "Prénom Nom" },
      "reconstructed": false,
      "availability": "KNOWN",
      "warning": null
    },
    {
      "id": "uuid",
      "class": { "id": "uuid", "name": "CE1 B", "level": "1re année", "floor": "Étage 1", "room": "Salle 8" },
      "startedAt": "2026-09-01T07:00:00.000Z",
      "endedAt": "2026-11-12T08:30:00.000Z",
      "changedBy": null,
      "reconstructed": true,
      "availability": "PROBABLE",
      "warning": "Non garantie : des changements ont pu ne pas être enregistrés avant le 2026-11-21."
    }
  ]
}
```

`endedAt` is the next item's `startedAt` (null for the current one). A reconstructed row is `PROBABLE`, carries
`probableUntil` (the go-live moment, before which it is not guaranteed) and a `warning`; other rows are `KNOWN` with
`probableUntil: null`. The same rule applies inside a situation: the class is `PROBABLE` only for a moment earlier than `probableUntil`.

## GET /admin/students/:id/situation?at=…

Query: `at` required. ISO 8601 date-time, with offset (`2026-11-12T10:42:00+01:00`, `…Z`) or without (read in
the school time zone). Seconds are ignored. Must not be after now.

**Side effect**: appends one `STUDENT_SITUATION_VIEWED` audit entry (`{ studentId, at }`) before answering. No
other write.

**200**

```json
{
  "student": { "id": "uuid", "firstName": "…", "lastName": "…" },
  "moment": { "requested": "2026-11-12T10:42:00+01:00", "evaluatedAt": "2026-11-12T09:42:59.999Z", "timeZone": "Africa/Tunis" },
  "class":        { "availability": "KNOWN", "value": { "id": "uuid", "name": "CE2 A", "level": "…", "floor": "…", "room": "…", "since": "…", "reconstructed": false } },
  "session":      { "availability": "KNOWN", "value": { "id": "uuid", "teacher": { "id": "uuid", "displayName": "…" }, "subject": "Maths", "room": "Salle 12", "startAt": "…", "endAt": "…", "status": "SCHEDULED", "cancellation": null } },
  "teacher":      { "availability": "KNOWN", "value": { "arrivals": [ { "teacher": { "id": "uuid", "displayName": "…" }, "arrivedAt": "…", "method": "QR", "status": "ON_TIME", "corrected": false } ], "departures": [], "laterArrivals": [], "dayLevelOnly": false } },
  "announcement": { "availability": "NONE" },
  "substitute":   { "availability": "NONE" },
  "supervisors":  { "availability": "NONE" },
  "changes":      { "availability": "KNOWN", "value": [ { "kind": "TIMETABLE_CHANGED", "at": "…", "by": { "id": "uuid", "displayName": "…" }, "before": { "room": "Salle 8" }, "after": { "room": "Salle 12" }, "reason": null, "madeAfterMoment": false } ] }
}
```

Section shape: `{ "availability": "KNOWN" | "PROBABLE" | "NONE" | "UNAVAILABLE", "value"?, "warning"?, "reasonUnavailable"? }`.

- `teacher.value.arrivals[].corrected` is true as soon as a correction exists (before or after the moment); the value shown is the corrected one and the original is listed in `changes`.
- `PROBABLE` always carries `warning`. `UNAVAILABLE` always carries `reasonUnavailable`.
- `announcement.value`: `{ requestId, type: "ABSENCE" | "LATENESS", announcedLateMinutes?, reason?, startAt, plannedEndAt? }`. `reason` is present because the caller is the administration (FR-012).
- `substitute.value`: `{ inForce?: user, previous: [ { teacher, setAt, setBy } ], arrived?: { teacher, arrivedAt } }`.
- `supervisors.value`: `{ source, assignee?: { user, presentSince?, state: "PRESENT" | "ASSIGNED_NOT_RECORDED" }, reinforcements: [ { user, joinedAt } ] }`.
- When the teacher data was anonymized, the user object is `{ "anonymized": true }`, not null.

**Errors specific to this route**

| Status | Code | When |
|---|---|---|
| 400 | field error on `at` | missing, malformed, or in the future |

## GET /admin/students/:id/audit?limit=&cursor=

Audit entries concerning the pupil, most recent first, page size as `/admin/audit` (cursor pagination). Includes
`STUDENT_CHANGED` (target the pupil) and `STUDENT_SITUATION_VIEWED` (`details.studentId`). Same entry shape as
`GET /admin/audit`; no entry about other targets is ever returned.

## Not exposed

No route writes class history directly: rows come only from the existing pupil create, update and import
routes (unchanged paths, unchanged request bodies). `PATCH /admin/students/:id` keeps `409 STATE_CHANGED`
behaviour.
