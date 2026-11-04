# Quickstart — 005 Page « Mon profil » (My profile page)

Validation guide: each scenario refers to the spec's requirements. Screen details:
[contracts/ui.md](./contracts/ui.md); `/api/auth/me` response: [contracts/rest-api.md](./contracts/rest-api.md).

## Prerequisites

- Dependencies installed (`npm ci`), development application running (`start.bat`):
  API 3002, UI 5173, local database 5433 with the demo seed.
- Demo accounts: `enseignante` (Teachers), `surveillant` (Supervisors), `admin`,
  `superadmin`, `autre` (no group), `nouveau` (forced change).

## Automated checks

```text
npm run verify                     lint, unit, integration and frontend tests, audit
npm run -w backend typecheck
npm run -w frontend typecheck
npm run test:e2e                   including auth.spec.ts (profile) and V18 at 320 px
```

Expected: all green; existing forced-change tests (`auth.spec.ts`, `nouveau` account)
unchanged (SC-005).

## Manual scenarios

1. **Menu link (FR-001, SC-001)** — signed in as `enseignante`, desktop: Tab to the profile
   block, screen reader: « Mon profil : Enseignante Employé, lien » (My profile: Enseignante Employé, link); Enter → `/profil`.
   Mobile (320 px): open the menu, activate the block → `/profil`, drawer closed.
2. **Information (FR-003 to FR-005, SC-002)** — for `enseignante`, `surveillant`, `admin`,
   `superadmin`, `autre`: name, identifier, job title, role and groups identical to
   Administrateur › Comptes and Groupes; `autre`: « Aucun »; account without a job title:
   « Non renseignée »; no editable field, administration notice present.
3. **Voluntary change (FR-006 to FR-008, FR-010, SC-003)** — signed in as `autre` in two
   browsers: in the first, profile → « Changer mon mot de passe » → enter the current one and a
   new one of 12 characters → back to the profile, confirmation « … autres sessions fermées » (… other sessions closed); the
   second browser is sent back to sign-in; sign-in with the new password: OK.
   Audit log (superadmin): « Mot de passe changé » (Password changed) for `autre`. Restore the old
   password.
4. **Cancel and errors (FR-007, FR-010)** — « Annuler » → profile, nothing is changed; wrong
   current password, new one too short, different confirmation → message under the
   relevant field, nothing is changed.
5. **Forced change unchanged (FR-009, SC-005)** — sign in as `nouveau`: forced page, no
   « Annuler », `/profil` redirects to the change; after success → home.
6. **Server message (FR-013)** — as `superadmin`, Administrateur › Comptes: reset your
   own password → refusal « Utilisez « Changer mon mot de passe » pour votre propre
   compte » (Use "Change my password" for your own account); the action of that name exists on « Mon profil ».
7. **Accessibility (FR-011, FR-012, SC-004)** — keyboard only on both pages (focus order,
   visible focus), 320 px with no horizontal scrolling, axe with no violation (covered by V18).
