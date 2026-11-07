# HTTP contract: Espace Administrateur pour l'ADMIN (011)

All routes need a session (401 otherwise) and, for writes, an allowed `Origin` (unchanged).
Error body unchanged: `{ "error": { "code": "FORBIDDEN", ... } }`.

## Routes whose access widens (URLs, bodies and responses unchanged)

Allowed: active `SUPER_ADMIN` **or** active `ADMIN`. Others: `403 FORBIDDEN` + audit
`ACCESS_DENIED` `{ reason: "NOT_ADMINISTRATION", route, method, channel: "http" }`.

| Method | Path |
|---|---|
| GET, POST | `/api/admin/floors` |
| PATCH | `/api/admin/floors/:id` |
| GET, POST | `/api/admin/levels` |
| PATCH | `/api/admin/levels/:id` |
| GET, POST | `/api/admin/students` |
| PATCH | `/api/admin/students/:id` |
| POST | `/api/admin/students/import` |
| GET, POST | `/api/admin/coverage/classes` |
| PATCH | `/api/admin/coverage/classes/:id` |
| GET | `/api/admin/coverage/classes/:id/qr` |
| POST | `/api/admin/coverage/classes/:id/qr/revoke` |

## New route

### `GET /api/admin/employees`

Same access as above. `200`:

```json
[
  {
    "id": "6f1c…",
    "displayName": "Amel Ben Salah",
    "jobTitle": "Surveillante",
    "role": "EMPLOYEE",
    "active": true,
    "groups": [{ "id": "a2…", "name": "Surveillants" }],
    "floor": { "id": "9b…", "name": "1er étage" }
  }
]
```

Sorted by `displayName`. Exactly these keys, at any role of the caller (SC-004).

## Routes that stay reserved to `SUPER_ADMIN` (unchanged)

Every other `/api/admin/*` route, in particular `/api/admin/users*`, `/api/admin/categories*`,
`/api/admin/guidelines*`, `/api/admin/settings`, `/api/admin/role-permissions`, `/api/admin/audit*`,
`/api/admin/dashboard*`, `/api/admin/coverage/dashboard`, `/api/admin/coverage/export.csv`,
`/api/admin/coverage/groups*`. Others: `403` + `ACCESS_DENIED` `{ reason: "NOT_SUPER_ADMIN", … }`.

A route added later under `/api/admin` is reserved unless it is added to the list above and to the
test `admin-routes-access.spec.ts`.
