# Data Model — 005 Page « Mon profil » (My profile page)

**No schema change, no migration.** The feature reads existing data from the signed-in account.

## User account (`User`, existing)

| Field | Type | Displayed as | Missing value |
|-------|------|--------------|---------------|
| `displayName` | text (required) | Nom (Name) | — (always set) |
| `username` | text (required, unique) | Identifiant de connexion (login identifier) | — (always set) |
| `jobTitle` | text, 100 characters max, optional | Fonction (job title) | « Non renseignée » (not provided) |
| `role` | `EMPLOYEE` / `ADMIN` / `SUPER_ADMIN` | Rôle (role): « Employé », « Admin », « Super administrateur » (existing `ROLE_LABELS` labels) | — |
| `mustChangePassword` | boolean | not displayed; decides the mode of `/mot-de-passe` (forced or voluntary) | — |

Changes: **none** by this feature, except the password through the existing flow
(`POST /api/auth/password`), which resets `mustChangePassword` to `false`.

## Assignment groups (`EmployeeGroup`, existing)

| Data | Source | Displayed as | Missing value |
|------|--------|--------------|---------------|
| member of the group with key `SUPERVISORS` | `isSupervisor` (already computed for `/api/auth/me`) | « Surveillants » (Supervisors) | « Aucun » (None) if neither |
| member of the group with key `TEACHERS` | `isTeacher` (same) | « Enseignants » (Teachers) | |

The other groups (without a system key) are not displayed: they have no effect on the
application (`docs/superadmin-fonctionnalites.md` §2.5).

## Rules

- Only the session account's data is read (no identifier passed by the client).
- Personal data: nothing new is collected or stored; `username` and `jobTitle`
  are returned only to the account holder (principle IV, minimization).
- No state transition specific to the feature; the password change keeps its
  behavior: `mustChangePassword` → `false`, other sessions deleted, audit
  `PASSWORD_CHANGED`.
