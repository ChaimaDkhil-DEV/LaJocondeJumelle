# REST Contract — 006 Modification d'une affectation (Editing an assignment)

## `PATCH /api/coverage/:id` (new)

Session required; **admins and super administrator** only. `Origin` header required (like any
write).

Body (`UpdateCoverageDto`) — all fields except `version` are optional; at least one must
differ from the current value for there to be a change:

```jsonc
{
  "version": 7,                 // required, integer: version read
  "classId": "uuid",            // active class
  "date": "2026-10-23",         // YYYY-MM-DD, school time zone
  "startTime": "09:30",         // HH:MM
  "endTime": "10:30"            // HH:MM
}
```

`200` response: assignment detail (`CoverageDetail`, same shape as `GET /api/coverage/:id`),
with `version` incremented. Identical values: `200`, detail unchanged, with no event or
notification.

| Code | Case |
|------|------|
| 200 | updated (or nothing to change) |
| 400 `VALIDATION_ERROR` | malformed field; field not editable in this status (`fields[].field` = `classId`, `date` or `startTime`, message « Non modifiable pendant la présence en classe. » (Not editable during attendance in class.)); start outside the window 12 h before / 7 days after; end not later than now during attendance |
| 400 `INVALID_RANGE` | end before the start, or end already past |
| 400 `CLASS_INACTIVE` | class not found or deactivated |
| 404 `NOT_FOUND` | assignment does not exist, or non-admin role (refusal logged `ACCESS_DENIED`) |
| 409 `INVALID_TRANSITION` | final status (done, closed, cancelled, unfilled) |
| 409 `STATE_CHANGED` | different version (concurrent change) |
| 409 `NOT_AVAILABLE` | supervisor unavailable in the new slot; `message` names the conflict, `details.conflict = { id, className, startAt, plannedEndAt }` if another assignment or a reinforcement overlaps |

Example of a named refusal:

```json
{
  "error": {
    "code": "NOT_AVAILABLE",
    "message": "Surveillant déjà affecté : 2e année Bleu, 22/10 09:00–10:00. Réassignez d’abord, puis modifiez.",
    "details": { "conflict": { "id": "uuid", "className": "2e année Bleu", "startAt": "ISO", "plannedEndAt": "ISO" } }
  }
}
```

(Message in English: Supervisor already assigned: 2e année Bleu, 22/10 09:00–10:00. Reassign first, then edit.)

## `GET /api/coverage/:id` — field added to the detail

```jsonc
{
  "allowedActions": ["UPDATE", "REASSIGN", "EXTEND", "CANCEL"],
  "modifiableFields": ["classId", "date", "startTime", "endTime"]   // ADDED; [] if none
}
```

`modifiableFields` is filled in for admins (empty for the other roles).

## History (`GET /api/coverage/:id`, `history[]`) — `UPDATED` event

`fromValue` / `toValue`: `classId`, `className` (resolved at read time), `startAt`, `plannedEndAt`;
`toValue.byAdmin: true` for a change by an admin. Never the reason.

## `COVERAGE_UPDATED` notification (existing)

Recipients: the assigned supervisor (if any) and the other admins. Displayed label:
« Affectation modifiée » (Assignment modified), followed by the assignment title, which carries the class.
