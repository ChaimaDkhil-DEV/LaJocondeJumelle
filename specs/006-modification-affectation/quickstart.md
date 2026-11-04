# Quickstart — 006 Modification d'une affectation (Editing an assignment)

Contracts: [contracts/rest-api.md](./contracts/rest-api.md), [contracts/ui.md](./contracts/ui.md).
Model: [data-model.md](./data-model.md).

## Prerequisites

- `npm ci`, development application running (`start.bat`): API 3002, UI 5173, local
  database 5433 with the demo seed.
- Accounts: `admin` (general supervisor), `superadmin`, `surveillant` (1st floor),
  `surveillant2` (2nd floor), `enseignante`. Classes: « 1ère année Violet » (1st floor), « 2e année
  Bleu » (2nd floor).
- During the school day (today's time slots).

## Automated checks

```text
npm run verify
npm run -w backend typecheck
npm run -w frontend typecheck
npm run test:e2e
```

## Scenarios

1. **Time slot (US1, FR-003, FR-004, FR-007, FR-010)** — as `admin`, create a direct assignment
   (1ère année Violet, `surveillant`, now → +1 h); « Modifier »: end moved earlier by 30 min →
   « Affectation modifiée. »; detail, `surveillant`'s « Mes affectations » (without reloading,
   SC-002) and notification « Affectation modifiée — Garde — 1ère année Violet »; history:
   « Affectation modifiée : … → … »; audit log (`superadmin`): « Affectation gérée par un
   admin » (Assignment managed by an admin) with before and after.
2. **Invalid slot (US1 scenario 5)** — end before the start, start in 8 days → message under
   the field, nothing changed.
3. **Named conflict (US1 scenario 4, FR-006, SC-004)** — two assignments of `surveillant` at
   different times; change the second to overlap the first → refusal « Surveillant déjà
   affecté : 1ère année Violet, … », nothing changed; reassign to `surveillant2`, then edit
   → accepted.
4. **Class before attendance (US2, FR-005, FR-009, Q3)** — « En route » assignment: change the
   class → status still « En route », notification with the new class; QR code of the
   old class refused, of the new one accepted.
5. **During attendance (US1 scenario 6, US2 scenario 3)** — « En cours » assignment: only the
   end time is editable; end in the past refused; later end accepted.
6. **Final statuses and roles (FR-001, FR-002)** — finished assignment: no « Modifier »;
   as `surveillant` or `enseignante`, `PATCH /api/coverage/:id` → `404` and refusal in the log.
7. **Concurrency (FR-012)** — two admin tabs: change in one then in the other → « La
   demande a été modifiée entre-temps. Elle a été rechargée. » (The request was modified in the meantime. It has been reloaded.)
8. **Accessibility (FR-013, SC-005)** — dialog with keyboard only; 320 px with no horizontal
   scrolling; axe with no violation.
