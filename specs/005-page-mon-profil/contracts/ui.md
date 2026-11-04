# UI Contract — 005 Page « Mon profil » (My profile page)

## Profile block link (FR-001)

- Location: bottom of the sidebar (desktop) and bottom of the menu drawer (mobile) — same
  element.
- Role: link to `/profil`. Accessible name: « Mon profil : <nom>, <rôle> » ("My profile: <name>, <role>") (visually hidden texts
  « Mon profil : » and the comma, around the visible content: name and role are two inline
  elements that would otherwise be read as a single word).
- Visible focus; active ("current page" style, `aria-current="page"`) when `/profil` is
  displayed; on mobile, activating it closes the drawer.

## Page `/profil` (FR-002 to FR-006, FR-011, FR-012)

- Application layout (menu present); unreachable while the password change
  is forced (existing redirect to `/mot-de-passe`).
- Page title (`h1`): « Mon profil ».
- Information, as a read-only description list (terms and definitions):

  | Term | Value |
  |------|-------|
  | Nom (Name) | display name |
  | Identifiant de connexion (Login identifier) | identifier |
  | Fonction (Job title) | job title, or « Non renseignée » (Not provided) |
  | Rôle (Role) | « Employé », « Admin » or « Super administrateur » |
  | Groupes d'affectation (Assignment groups) | « Surveillants » (Supervisors), « Enseignants » (Teachers), both, or « Aucun » (None) |

- Notice: « Pour modifier ces informations, adressez-vous à l'administration. » (To change this information, contact the administration.)
- Action: link-button « Changer mon mot de passe » (Change my password) → `/mot-de-passe`.
- Confirmation after a voluntary change: success message in a status region
  (`role="status"`): « Mot de passe modifié. Vos autres sessions ont été fermées. » (Password changed. Your other sessions have been closed.)
- States: loading and loading error are handled by `RequireAuth` (« Chargement de votre espace » (Loading your space), message and « Réessayer » (Retry)) before the page renders, as for all protected pages; the page has no state of its own.
- 320 px: no line overflows (long identifier: line wrap).

## Page `/mot-de-passe` — two modes (FR-007 to FR-010)

The mode is determined by the account's `mustChangePassword` (server state), never by the URL.

| | Forced (`true`) — unchanged | Voluntary (`false`) |
|---|---|---|
| Title | « Changer votre mot de passe » (Change your password) | same |
| Explanatory text | « Pour sécuriser votre compte, choisissez… » (To secure your account, choose…) | none |
| Fields, rules, error messages | current | current |
| « Annuler » (Cancel) | absent | present → `/profil`, nothing is changed |
| After success | `/` (home) | `/profil` with the confirmation above |
