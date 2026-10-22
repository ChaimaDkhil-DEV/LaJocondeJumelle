# Data Model — 005 Page « Mon profil »

**Aucune modification de schéma, aucune migration.** La fonctionnalité lit des données
existantes du compte connecté.

## Compte utilisateur (`User`, existant)

| Champ | Type | Affiché comme | Valeur absente |
|-------|------|---------------|----------------|
| `displayName` | texte (obligatoire) | Nom | — (toujours renseigné) |
| `username` | texte (obligatoire, unique) | Identifiant de connexion | — (toujours renseigné) |
| `jobTitle` | texte, 100 caractères max, facultatif | Fonction | « Non renseignée » |
| `role` | `EMPLOYEE` / `ADMIN` / `SUPER_ADMIN` | Rôle : « Employé », « Admin », « Super administrateur » (libellés existants `ROLE_LABELS`) | — |
| `mustChangePassword` | booléen | non affiché ; décide du mode de `/mot-de-passe` (imposé ou volontaire) | — |

Modification : **aucune** par cette fonctionnalité, sauf le mot de passe par le parcours
existant (`POST /api/auth/password`), qui remet `mustChangePassword` à `false`.

## Groupes d'affectation (`EmployeeGroup`, existant)

| Donnée | Source | Affiché comme | Valeur absente |
|--------|--------|---------------|----------------|
| membre du groupe à clé `SUPERVISORS` | `isSupervisor` (déjà calculé pour `/api/auth/me`) | « Surveillants » | « Aucun » si aucun des deux |
| membre du groupe à clé `TEACHERS` | `isTeacher` (idem) | « Enseignants » | |

Les autres groupes (sans clé système) ne sont pas affichés : ils n'ont pas d'effet sur
l'application (`docs/superadmin-fonctionnalites.md` §2.5).

## Règles

- Seules les données du compte de la session sont lues (aucun identifiant passé par le client).
- Données personnelles : rien de nouveau n'est collecté ni conservé ; `username` et `jobTitle`
  sont renvoyés au seul titulaire du compte (principe IV, minimisation).
- Pas de transition d'état propre à la fonctionnalité ; le changement de mot de passe garde son
  comportement : `mustChangePassword` → `false`, autres sessions supprimées, audit
  `PASSWORD_CHANGED`.
