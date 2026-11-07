# Data model: Espace Administrateur pour l'ADMIN (011)

**No schema change, no migration.** Only who may read and write existing data changes.

## Existing entities, newly managed by `ADMIN`

| Entity (Prisma) | Operations opened to `ADMIN` | Rules |
|---|---|---|
| `Floor` | list, create, edit (name, position, active) | unchanged (`FloorDto`, `UpdateFloorDto`) |
| `GradeLevel` | list, create, edit | unchanged (`LevelDto`, `UpdateLevelDto`) |
| `SchoolClass` (+ QR version) | list, create, edit, read QR link, revoke QR | unchanged (`ClassDto`); revoking bumps the QR version, old codes refused |
| `Student` | list, create, edit, CSV import (dry run / all or nothing) | unchanged (`StudentDto`, `ImportCsvDto`) |
| `AuditLog` | written, never read by `ADMIN` | each change logged with `actorId` = the `ADMIN`; each refusal `ACCESS_DENIED` |

## Read-only view: `EmployeeListItem` (response of `GET /api/admin/employees`)

Projection of `User`, no new storage.

| Field | Source | Notes |
|---|---|---|
| `id` | `User.id` | uuid, for list keys only |
| `displayName` | `User.displayName` | sort key |
| `jobTitle` | `User.jobTitle` | `null` if empty |
| `role` | `User.role` | `SUPER_ADMIN` \| `ADMIN` \| `EMPLOYEE` |
| `active` | `User.active` | inactive accounts are listed too |
| `groups` | `EmployeeGroupMember` → `EmployeeGroup` where `active = true` | `[{ id, name }]`, sorted by name |
| `floor` | `User.floor` | `{ id, name }` or `null` |

Never included: `username`, password hash or state (`mustChangePassword`), `createdAt`, sessions,
recipient categories, permissions, avatar file.

## Access rule (new, `common/authorization.ts`)

`canUseAdministrationSpace(user) = user.active && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')`

| Role | active | Reference data + employee list | Reserved sections |
|---|---|---|---|
| `SUPER_ADMIN` | yes | allowed | allowed |
| `ADMIN` | yes | allowed | refused (403, logged `NOT_SUPER_ADMIN`) |
| `ADMIN` | no | refused (401: the session check rejects inactive accounts on every request) | refused |
| `EMPLOYEE` | yes | refused (403, logged `NOT_ADMINISTRATION`) | refused (403, logged `NOT_SUPER_ADMIN`) |
