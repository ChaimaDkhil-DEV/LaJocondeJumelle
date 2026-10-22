# Vérification de la fonctionnalité 005 — page « Mon profil »

Spécification, plan et tâches : `specs/005-page-mon-profil/`.

## État initial (T001)

Branche `005-page-mon-profil`, créée depuis `master` (`dafec78`). Aucun fichier de `backend/`,
`frontend/`, `e2e/` ni des dépendances n'a changé depuis `855961c`
(`git diff --stat 855961c HEAD -- backend frontend e2e package.json package-lock.json` vide) :
l'état de départ est celui de la vérification du 22 octobre sur `855961c`
(`docs/validation/verification-003.md`).

| Étape | Résultat |
|-------|----------|
| `npm run verify` | code de sortie 0 |
| Lint | aucun problème |
| Types backend et frontend | aucune erreur |
| Tests unitaires backend | 572 / 572 (29 suites) |
| Tests d'intégration backend | 599 / 599 (42 suites) |
| Tests frontend (Vitest) | 229 / 229 (32 fichiers) |
| `npm audit --audit-level=high` | aucune vulnérabilité élevée ou critique |
| Bout en bout (6 profils) | 143 réussis, 0 échec, 73 ignorés volontairement |

## Attendu existant modifié (exception consignée)

`backend/test/integration/auth.spec.ts`, « renvoie le profil et les permissions de
l'utilisateur » : l'égalité stricte (`toEqual`) sur la réponse de `GET /api/auth/me` reçoit les
deux champs ajoutés par la spec 005 (`username`, `jobTitle: null`). C'est le changement de contrat
prévu (`specs/005-page-mon-profil/contracts/rest-api.md` : ajout seulement, aucun champ retiré ni
renommé) ; aucun autre attendu existant n'est modifié. Les tests du changement imposé
(`frontend/tests/auth/login.test.tsx`, `e2e/auth.spec.ts`, compte `nouveau`) sont inchangés et
verts (SC-005).

## Sélecteurs e2e resserrés (sans changement d'attendu)

Le lien du bloc profil a pour nom « Mon profil : Super administrateur, Super administrateur »
pour le super administrateur. Les sélecteurs `getByRole('link', { name: 'Administrateur' })`,
qui comparent par sous-chaîne, trouvaient alors deux liens (violation du mode strict, relevée par
la vérification finale) : `exact: true` ajouté dans `e2e/admin-dashboard.spec.ts` (l. 51) et
`e2e/us8-admin.spec.ts` (l. 29 et 93). Même élément visé (entrée « Administrateur » du menu),
mêmes attendus ; les deux fichiers repassent au vert (Chromium).

## Tests ajoutés

| Fichier | Tests | Couvre |
|---------|-------|--------|
| `backend/test/unit/auth-me.spec.ts` | 3 | FR-003 (`toMeResponse`) |
| `backend/test/integration/auth.spec.ts` | 2 nouveaux (+1 attendu mis à jour) | FR-002, FR-003 (`/me`, `/login`) |
| `frontend/tests/auth/profile.test.tsx` | 10 | FR-002 à FR-006, FR-013, cas limite du changement imposé |
| `frontend/tests/auth/change-password.test.tsx` | 5 | FR-007 à FR-010 |
| `frontend/tests/app/app-layout.test.tsx` | 3 | FR-001 (desktop, page courante, tiroir mobile) |
| `e2e/auth.spec.ts` | 1 (Chromium) | US1 de bout en bout, SC-003 (autres sessions fermées) |
| `e2e/a11y-responsive.spec.ts` | V18 étendu (2 écrans, parcours clavier) | FR-011, FR-012, SC-001, SC-004 |

Constat pendant l'implémentation (T007) : nom et rôle du bloc profil sont deux éléments en ligne ;
sans séparateur, le nom accessible devenait « EnseignanteEmployé ». Une virgule masquée
visuellement donne « Mon profil : Enseignante, Employé » (`contracts/ui.md` mis à jour).

## Scénarios du quickstart (T021)

| Scénario | Couverture automatique | Reste à faire à la main |
|----------|------------------------|-------------------------|
| 1 — Lien du menu | `app-layout.test.tsx` (nom accessible, desktop et tiroir) ; V18 clavier | écoute avec un lecteur d'écran réel |
| 2 — Informations | `profile.test.tsx` (rôles, groupes, valeurs absentes) ; vidéo S01 (superadmin) | comparaison avec l'administration pour chaque compte de démonstration |
| 3 — Changement volontaire | `e2e/auth.spec.ts` (autres sessions fermées, nouveau mot de passe, remise de l'ancien) | entrée du journal d'audit « Mot de passe changé » à constater |
| 4 — Annulation et erreurs | `change-password.test.tsx` ; V18 (« Annuler ») | — |
| 5 — Changement imposé | `login.test.tsx`, `e2e/auth.spec.ts` (compte `nouveau`), `profile.test.tsx` (redirection) | — |
| 6 — Message serveur | `profile.test.tsx` (libellé exact de l'action) | refus constaté en superadmin |
| 7 — Accessibilité | V18 : axe sans violation et 320 px, parcours clavier | contrôle visuel du focus |

T021 reste ouverte tant que la colonne « à la main » n'est pas déroulée.

## Vérification finale (T022) — 22 octobre 2026, branche `005-page-mon-profil`

`npm run verify` : code de sortie 0 ; types backend et frontend : aucune erreur.

| Étape | Départ (T001) | Final |
|-------|---------------|-------|
| Lint (dont `e2e/`) | aucun problème | aucun problème |
| Tests unitaires backend | 572 / 572 (29 suites) | **575 / 575** (30 suites) |
| Tests d'intégration backend | 599 / 599 (42 suites) | **601 / 601** (42 suites) |
| Tests frontend (Vitest) | 229 / 229 (32 fichiers) | **247 / 247** (35 fichiers) |
| `npm audit --audit-level=high` | aucune vulnérabilité élevée | aucune vulnérabilité élevée (21 modérées, inchangées) |
| Bout en bout (6 profils, 222 tests) | 143 réussis, 73 ignorés | **143 réussis, 1 échec intermittent, 78 ignorés volontairement** (38,5 min) |

Bout en bout : le nouveau test « changement volontaire depuis « Mon profil » » (Chromium) et V18
étendu (320 px : « Mon profil », changement volontaire, parcours clavier) sont verts.

**Échec intermittent, sans lien avec la spec 005** : `coverage-class.spec.ts`, parcours A à
768 px (Chromium) — « Affectation terminée. » non vu après « Terminer », alors que l'action a
réussi (page du surveillant : « Aucune affectation en cours »). Le même pas a réussi dans les
8 autres parcours d'affectations de la même exécution et dans l'exécution complète précédente.
Relancé seul sur une base neuve : **3 réussites sur 3**. (Avec `--repeat-each=5` dans une même
exécution, les répétitions se gênent : la liste « Mes signalements » garde les demandes
précédentes et le test lit la première.) Course déjà rencontrée en 004 pour d'autres
confirmations (« confirmations perdues », commit `a8e01ea`) : à traiter à part.

CI GitHub : à constater sur la demande de fusion.
