# Data Model: Fixes from the technical audit

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

**A single schema migration**: `0003_request_event_seq` adds `RequestEvent.seq` (N3,
R15). All other changes concern existing JSON fields or enum values already present. The
full model remains the one in
[`specs/001-demandes-travail-vocales/data-model.md`](../001-demandes-travail-vocales/data-model.md).

## Request.rulesSnapshot (JSON) — one key added

| Key | Type | Origin | Rule |
|-----|------|--------|------|
| `autoAssigneeId` | `string (uuid) \| null` | `Category.autoAssigneeId` at submission | **New.** Set if `assignmentMode = AUTO`, otherwise `null`. |
| `assignmentMode` | `MANUAL \| AUTO` | unchanged | Now read at approval (instead of `Category.assignmentMode`). |

The other keys (`circuit`, `closureMode`, `autoCloseAfterMinutes`, `finalValidation`,
`photoRequired`, deadline durations) are unchanged.

**Compatibility**: requests submitted before the fix do not have the `autoAssigneeId` key.
**Missing key ≠ `null`**:
- key missing → exception **EXC-1** (decision D9): person read from the current category;
- key present and `null` in `AUTO` mode → no person designated → exception **EXC-2**
  (decision D8), like a person who is not assignable.

### Resolution of the employee at approval (workflow B) — FR-008, FR-011

"Assignable" = active account **and** current recipient of the category (`canPickRecipient`).

```text
mode = snapshot.assignmentMode                         (never Category.assignmentMode)
if mode = MANUAL:
    if assigneeId missing            → refuse ASSIGNEE_REQUIRED          (unchanged)
    if assigneeId not assignable     → refuse RECIPIENT_NOT_ALLOWED      (unchanged)
    otherwise employee = assigneeId                    → source MANAGER_CHOICE
if mode = AUTO:
    if the key snapshot.autoAssigneeId exists: candidate = snapshot.autoAssigneeId  → SNAPSHOT
    otherwise (EXC-1, D9):                     candidate = Category.autoAssigneeId  → CATEGORY_CURRENT
    if candidate is non-null and assignable:
        employee = candidate      (a supplied assigneeId is ignored, FR-008)
    otherwise (EXC-2, D8):
        if assigneeId missing         → refuse AUTO_ASSIGNEE_UNAVAILABLE (no write)
        if assigneeId not assignable  → refuse RECIPIENT_NOT_ALLOWED     (no write)
        otherwise employee = assigneeId                → source MANAGER_CHOICE
```

## RequestEvent (approval) — source detail

The existing `ASSIGNED` event, created by the approval, records the assigned employee in
`toValue` (`assigneeId`). It gains the key `assigneeSource`: `SNAPSHOT` | `CATEGORY_CURRENT`
(EXC-1, D9) | `MANAGER_CHOICE` (manual mode, or EXC-2, D8). The `STATUS_CHANGED` event of the
same approval is unchanged. The history shows this source (T031). Append-only table
(triggers unchanged).

## RequestEvent — write order (FR-025, N3)

| Field | Type | Rule |
|-------|------|------|
| `seq` | `BigInt`, `BIGSERIAL NOT NULL` | Assigned by the database at insertion; second sort key after `createdAt` in every chronological read; never exposed by the API |

Migration: `ALTER TABLE "RequestEvent" ADD COLUMN "seq" BIGSERIAL NOT NULL;`. The table stays
append-only (triggers unchanged).

## AuditLog — reset by the operations tool

No new value: the `PASSWORD_RESET` action already exists in `AuditAction`.

| Field | Value |
|-------|-------|
| `action` | `PASSWORD_RESET` |
| `actorId` | `null` (action outside the interface, no logged-in user) |
| `targetType` / `targetId` | `User` / identifier of the super administrator |
| `details` | `{ "reason": "CLI" }` (key already on the allowlist) |
| `ip` | `null` |

Effects in the same transaction: `User.passwordHash` replaced, `User.mustChangePassword = true`,
all `Session` rows of the account deleted.

## Configuration (AppConfig) — new validated value

| Field | Variable | Default | Validation |
|-------|----------|---------|------------|
| `trustProxy` | `TRUST_PROXY` | `loopback` | See [contracts/configuration.md](./contracts/configuration.md) |
| `port` | `PORT` | `3002` | Integer 1–65535 (unchanged; now the only source for listening) |

## Findings register (documentary)

Spec entity, kept in `docs/ARCHITECTURE.md` (FR-024): identifier (A01–A35, N1–N3),
source section, [VERIFIED]/[INFERRED] marking, class CT/DH/HP, status (`ouvert`, `corrigé
(référence de commit)`, `confirmé`, `infirmé`; that is: open, fixed (commit reference), confirmed, refuted). No database storage.
