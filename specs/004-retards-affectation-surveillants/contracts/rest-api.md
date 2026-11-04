# REST contract — 004 (assignments module)

Prefix `/api`, `sid` session cookie (unchanged), JSON, errors in the existing format
`{ code, message, details? }`. All rules are checked **server side**; every refusal is logged
(`ACCESS_DENIED`) and answers `404` when the resource is not visible to the caller (principle V:
do not reveal existence). Writes carry `version` (optimistic locking, `409 STATE_CHANGED`) and
creations carry a `clientId` (idempotency, unchanged).

Roles: **SA** super administrator · **AD** admin (formerly "responsable", manager) · **SV** member
of the `SUPERVISORS` group · **EN** member of the `TEACHERS` group. SA passes all role checks of
the module (FR-004b). Other employees get `404` on the whole module (FR-023b).

## Assignments

### `POST /coverage/teacher-requests` — EN (FR-012, FR-013)

```json
{ "clientId": "uuid", "type": "LATENESS|ABSENCE", "classId": "uuid",
  "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM", "durationMinutes": 55,
  "reason": "optional text ≤ 1000" }
```

`endTime` **or** `durationMinutes`. Date = today or tomorrow (school time zone); time range not
entirely in the past; end > start. `201` → `CoverageDetail` (teacher view). Errors `400
INVALID_DATE`, `INVALID_RANGE`, `CLASS_INACTIVE`.

### `PATCH /coverage/:id/teacher-request` — EN author, status `PENDING` (FR-008g)

Same fields (partial) + `version`. `409 NOT_PENDING` if already assigned.

### `POST /coverage/empty-class` — SV (FR-015 to FR-015j)

```json
{ "clientId": "uuid", "classId": "uuid", "teacherId": "uuid|null", "qrToken": "optional" }
```

`201` →

```json
{ "outcome": "CREATED|ATTACHED|ALREADY_ASSIGNED|SUPPORT|MERGE_PROPOSED",
  "coverage": { "...": "supervisor view" },
  "assignedTo": { "id": "uuid", "displayName": "..." },
  "doubleAssignment": false }
```

Never blocked by a missing `teacherId`. `teacherId` must designate a member of `TEACHERS`.

### `POST /coverage` — AD (direct assignment, FR-019) — **modified**

```json
{ "clientId": "uuid", "classId": "uuid", "type": "LATENESS|ABSENCE|EMPTY_CLASS",
  "teacherId": "uuid|null", "startAt": "ISO", "endAt": "ISO", "assigneeId": "uuid",
  "reason": "optional", "note": "optional", "voiceFileId": "optional" }
```

Born `ACCEPTED`, source `ADMIN_DIRECT`. `assigneeId` must be available (`409
NOT_AVAILABLE`, no override). **Removed**: `groupIds`, `categoryId` (guard category resolved
server side), `estimatedMinutes`, `absentTeacher`.

### `GET /coverage` — AD · `GET /coverage/mine` — SV · `GET /coverage/my-requests` — EN

Filters: `mainStatus` (`PENDING|ASSIGNED|IN_PROGRESS|DONE|CANCELLED|UNFILLED`, multiple),
`source`, `type`, `floorId`, `classId`, `teacherId` (AD), `from`, `to`. AD sort: `PENDING` whose
deadline has expired first ("affichée en priorité" (shown first), FR-011e), then by `startAt`.
Each item carries `status` (technical), `mainStatus`, `subState`, `source`, `type`, `floor`,
`class`, `teacher` (AD/SA; SV: name only), `assignee`, `supports[]`, `alerts[]`.

### `GET /coverage/:id`

View depends on the actor: **AD/SA** full (including `reason`); **SV assigned or on backup**:
class, floor, time slot, type, status — never `reason` (FR-023c); **EN author**: their request,
without the history of other actors beyond the status and the supervisor's name.

### `GET /coverage/:id/candidates` — AD — **modified**

Active members of `SUPERVISORS`, sorted: the class's floor first, then available ones. Each
candidate: `available` and `reason` (`INACTIVE|ABSENT|UNAVAILABLE|ON_GUARD|SUPPORT`). Unavailable
ones are listed for information but refused at assignment (FR-010).

### `POST /coverage/:id/actions` — **modified**

`{ "action": "...", "version": 3, ...parameters }`

| Action | Actor | Parameters |
| --- | --- | --- |
| `ASSIGN`, `REASSIGN` | AD | `assigneeId` |
| `CANCEL` | AD | `reason?` |
| `WITHDRAW` | EN author | `reason?` |
| `SET_TEACHER` | AD | `teacherId \| null` |
| `RELEASE_SUPPORT` | AD | `supportId` |
| `DEPART`, `CONFIRM_PRESENCE` | SV assigned | `photoFileId?`, `qrToken?` (unchanged) |
| `REQUEST_RELIEF` | SV assigned | `reason` (unchanged) |
| `RELIEVE` ("Terminer", Finish) | SV assigned | — |
| `RELEASE_BY_MANAGER`, `VALIDATE` | AD | unchanged |
| `EXTEND` | AD, SV assigned | `minutes` (unchanged) |

**Removed**: `ACCEPT`, `WIDEN`, `RELEASE` → `400 UNKNOWN_ACTION`. The `force` parameter is
removed.

### Removed

`GET /coverage/open` ("À prendre" (To take) tab) → `404`.

## Duplicates

- `GET /coverage/merge-proposals?status=PENDING` — AD. Pairs with both assignments
  summarized and `unresolved` ("non tranché", undecided).
- `POST /coverage/merge-proposals/:id/decision` — AD — `{ "decision": "CONFIRM|REJECT" }`.
  Possible at any time, including after the fact (FR-015h); `200` with both assignments up to date.

## Statistics — AD/SA (FR-022)

`GET /coverage/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=teacher|class|period&period=week|month`

```json
{ "totals": { "events": 0, "lateness": 0, "absence": 0, "emptyClass": 0,
              "cancelled": 0, "unfilled": 0, "unfilledRate": 0.0,
              "averageDurationMinutes": 0, "undecidedDuplicates": 0 },
  "rows": [ { "key": "...", "label": "Enseignant non précisé", "events": 0, "...": 0 } ] }
```

No export (out of scope).

## Administration — SA only

- `GET|POST /admin/floors`, `PATCH /admin/floors/:id` (name, position, active) — audit
  `FLOOR_CHANGED`. Response with `supervisorCount` and `warning: "NO_SUPERVISOR"` if 0 (FR-006a).
- `POST|PATCH /admin/coverage/classes` — **modified**: `floorId` required.
- `POST|PATCH /admin/users` — **modified**: `floorId` optional (supervisor).
- `GET|PATCH /admin/settings` — new `coverage*` keys (data-model §3).
- Groups: a group with a `systemKey` can be neither deleted nor deactivated (`409 SYSTEM_GROUP`).

## Role

Responses that expose a role use `ADMIN` instead of `MANAGER`. `GET /settings/client` and
the user DTOs follow (enum synchronized with the interface).
