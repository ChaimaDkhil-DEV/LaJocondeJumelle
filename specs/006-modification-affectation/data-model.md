# Data Model — 006 Modification d'une affectation (Editing an assignment)

**No schema change, no migration.** The fields, event and notification used already exist.

## Assignment (`Request` of type `COVERAGE` + `CoverageDetail`, existing)

| Field | Modified | Rule |
|-------|----------|------|
| `CoverageDetail.classId` | yes | **active** class; only if the status is `PENDING`, `ACCEPTED`, `EN_ROUTE` or `LATE` |
| `CoverageDetail.floorId` | yes (derived) | copy of the new class's floor |
| `CoverageDetail.startAt` | yes | before attendance only; between 12 h before and 7 days after now; school time zone |
| `CoverageDetail.plannedEndAt` | yes | after the start; not already past (during attendance: later than now) |
| `CoverageDetail.estimatedMinutes` | yes (derived) | `(plannedEndAt − startAt)` in minutes |
| `Request.title` | yes (derived) | follows the class: existing prefix (« Garde », « Retard », « Absence » (Duty, Delay, Absence)) + class name |
| `Request.version` | +1 | optimistic locking; received version different → `409 STATE_CHANGED` |
| `Request.currentDueAt`, `warnAt` | yes (derived) | recomputed from the new start as long as attendance is not confirmed |
| `Request.status`, `assigneeId`, `departedAt`, `type`, `teacherId`, `reason` | **no** | status unchanged, including `EN_ROUTE` |

## Fields editable by status (`modifiableFields`)

| Status | Fields |
|--------|--------|
| `PENDING` (En attente), `ACCEPTED` (Assignée), `EN_ROUTE` (En route), `LATE` (En retard) | `classId`, `date`, `startTime`, `endTime` |
| `ON_DUTY` (En cours), `RELIEF_PENDING` (Relève demandée) | `endTime` |
| `DONE`, `CLOSED`, `CANCELLED`, `UNFILLED` | none (`UPDATE` action refused) |

## History event (`RequestEvent`, existing type `UPDATED`)

```jsonc
{
  "type": "UPDATED",
  "actorId": "<admin>",
  "fromValue": { "classId": "…", "startAt": "ISO", "plannedEndAt": "ISO" },
  "toValue":   { "classId": "…", "startAt": "ISO", "plannedEndAt": "ISO", "byAdmin": true }
}
```

Never the reason. Class names are resolved at read time (`className`), like people's names.

## Audit log (`AuditLog`, existing action `COVERAGE_MANAGED`)

`details`: `{ action: "UPDATE", before: { classId, startAt, plannedEndAt }, after: { … } }`;
`targetType: "Request"`, `targetId`: the assignment. Never the reason.

## Reminders (`CoverageReminder`, existing)

Recomputed after the change: wait-for-assignment reminder for `PENDING` (existing); end-of-slot
reminders for an assigned or in-progress assignment (like the extension).

## Transitions

Rule added to the state machine: `UPDATE`, actor `ADMIN`, from `PENDING`, `ACCEPTED`,
`EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING`, to the **same** status. The teacher's existing
rule (`UPDATE` from `PENDING`, actor `REQUESTER_TEACHER`) is unchanged.
