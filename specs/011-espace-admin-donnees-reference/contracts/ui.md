# UI contract: Espace Administrateur pour l'ADMIN (011)

## Menu (`AppLayout`)

| Role | « Administrateur » entry |
|---|---|
| `SUPER_ADMIN` | shown (unchanged) |
| `ADMIN` | shown (new) |
| `EMPLOYEE` | hidden (unchanged) |

## Sections (`AdminLayout`, `/admin/*`)

| Section | Path | `SUPER_ADMIN` | `ADMIN` |
|---|---|---|---|
| Suivi des gardes | `suivi` | ✓ | — |
| Comptes | `comptes` | ✓ | — |
| Catégories | `categories` | ✓ | — |
| Consignes | `consignes` | ✓ | — |
| Groupes | `groupes` | ✓ | — |
| Étages | `etages` | ✓ | ✓ |
| Niveaux | `niveaux` | ✓ | ✓ |
| Classes | `classes` | ✓ | ✓ |
| Élèves | `eleves` | ✓ | ✓ |
| Employés (new, read only) | `employes` | — (not in his menu; he has « Comptes ») | ✓ |
| Réglages | `reglages` | ✓ | — |
| Journal d'audit | `journal` | ✓ | — |

- `/admin`: redirects to `comptes` (super administrator) or `etages` (`ADMIN`).
- `ADMIN` opening a "—" path: message « Accès réservé au super administrateur. », the page is not
  mounted (no request to a reserved route).
- `EMPLOYEE` opening any `/admin/*` path: message « Accès réservé à l'administration. ».
- Page header description lists only the sections of the current role.

## « Employés » page (`/admin/employes`)

- Title « Employés »; list labelled « Liste des employés ».
- Columns: Nom, Fonction, Rôle (via `ROLE_LABELS`), Groupes (comma-separated, « — » if none),
  Étage (« — » if none), Statut (« Actif » / « Inactif », as text, not colour alone).
- List in the « Comptes » page pattern: column header (decorative) from `md`, stacked rows below; each row labels its values (« Groupes : … », « Étage : … »); usable at 320 px.
- No button, link or menu acting on an account.
- States: loading (`LoadingState`), error (`ErrorState` with retry), empty (`EmptyState`
  « Aucun employé. »).
- No axe violation (Playwright check, `e2e/admin-reference-admin.spec.ts`).
