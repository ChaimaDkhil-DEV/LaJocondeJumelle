# REST contract — changes

Only the approval action changes. The rest of the API is the one in
[`specs/001-demandes-travail-vocales/contracts/rest-api.md`](../../001-demandes-travail-vocales/contracts/rest-api.md).

## `POST /api/requests/:id/actions` — `APPROVE` action (workflow B)

Body unchanged: `{ "action": "APPROVE", "version": <int>, "assigneeId"?: "<uuid>" }`.

"Assignable" = active account **and** current recipient of the category. "Person to
assign" = `rulesSnapshot.autoAssigneeId` if the key exists; otherwise (earlier request,
exception EXC-1, decision D9) the current `Category.autoAssigneeId`. Full algorithm:
[data-model.md](../data-model.md) §Résolution.

| Mode frozen in the snapshot | `assigneeId` provided | Result | `assigneeSource` |
|---|---|---|---|
| `MANUAL` | yes, assignable | `200`, assigned to `assigneeId` | `MANAGER_CHOICE` |
| `MANUAL` | no | `422 ASSIGNEE_REQUIRED` (unchanged) | — |
| `MANUAL` | yes, not assignable | `422 RECIPIENT_NOT_ALLOWED` (unchanged) | — |
| `AUTO`, person to assign is assignable | ignored (FR-008) | `200`, assigned to the person to assign | `SNAPSHOT`, or `CATEGORY_CURRENT` (EXC-1) |
| `AUTO`, person to assign missing or not assignable (EXC-2, D8) | no | **`422 AUTO_ASSIGNEE_UNAVAILABLE`** (new), no write | — |
| `AUTO`, person to assign missing or not assignable (EXC-2, D8) | yes, assignable | `200`, assigned to `assigneeId` | `MANAGER_CHOICE` |
| `AUTO`, person to assign missing or not assignable (EXC-2, D8) | yes, not assignable | `422 RECIPIENT_NOT_ALLOWED`, no write | — |

**Behavior changes** (the only ones allowed by FR-023): the mode and the person now come
from the snapshot, no longer from the current category (D1); exception EXC-1 for earlier
requests (D9); refusal, then choice by the manager if the person is no longer assignable
(EXC-2, D8); source recorded in `toValue.assigneeSource` of the `ASSIGNED` event created
by the approval, returned as is by `GET /api/requests/:id/history`.

### New error code

```json
{
  "error": {
    "code": "AUTO_ASSIGNEE_UNAVAILABLE",
    "message": "La personne désignée pour cette catégorie n'est plus disponible. Choisissez l'employé qui réalisera la demande.",
    "details": null
  }
}
```

(The message means: the person designated for this category is no longer available. Choose the employee who will carry out the request.)

HTTP status `422`. Added to the `ERROR_CATALOG` catalog. The interface then shows the employee
selector in the approval dialog.

## File reading — unchanged

`GET /api/files/:id` keeps exactly its responses (`200`, `404` + `ACCESS_DENIED` audit); only the
internal organization changes (registry by request type, research R8).
