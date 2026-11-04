# REST Contract — 005 Page « Mon profil » (My profile page)

No new route. One existing response gains two fields; one route is reused as is.

## `GET /api/auth/me` (and `POST /api/auth/login` response) — added fields

Session required (global `SessionGuard`); returns **only** the session's account.

```jsonc
{
  "id": "uuid",
  "username": "enseignante",          // ADDED: login identifier
  "displayName": "Enseignante",
  "jobTitle": "Professeure des écoles", // ADDED: job title, or null if not provided
  "role": "EMPLOYEE",                   // EMPLOYEE | ADMIN | SUPER_ADMIN
  "permissions": ["REQUEST_CREATE"],
  "mustChangePassword": false,
  "isTeacher": true,
  "isSupervisor": false
}
```

| Code | Case |
|------|------|
| 200 | valid session |
| 401 | no session or expired session (unchanged) |

Compatibility: fields added only; no field removed or renamed.

## `POST /api/auth/password` — unchanged

Body: `{ "currentPassword": string, "newPassword": string (at least 12 characters) }`.

| Code | Case |
|------|------|
| 204 | password changed; `mustChangePassword` → `false`; **other sessions deleted**, current session kept; audit `PASSWORD_CHANGED` |
| 400 `VALIDATION_ERROR` | `currentPassword`: « Mot de passe actuel incorrect. » (Current password incorrect.); `newPassword`: « Le nouveau mot de passe doit contenir au moins 12 caractères. » (The new password must contain at least 12 characters.) |
| 401 | no session |
