---

description: "Task list for feature 005 — page « Mon profil » et accès au changement de mot de passe"
---

# Tasks: Page « Mon profil » et accès au changement de mot de passe

**Input**: Design documents from `/specs/005-page-mon-profil/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBLIGATOIRES — constitution, principe I (TDD non négociable). Chaque tâche de test
placée avant une implémentation DOIT être écrite et constatée **rouge** avant de coder. Les tests
existants du changement **imposé** (`frontend/tests/auth/login.test.tsx`, `e2e/auth.spec.ts`,
compte `nouveau`) ne sont pas modifiés (SC-005).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: peut tourner en parallèle (fichiers différents, aucune dépendance sur une tâche non terminée)
- **[Story]**: user story de rattachement (US1, US2)

## Path Conventions

Monorepo : `backend/src/`, `backend/test/{unit,integration}/`, `frontend/src/`,
`frontend/tests/`, `e2e/`. Commandes depuis la racine du dépôt.

---

## Phase 1: Setup

**Purpose**: point de départ vérifié

- [X] T001 Sur la branche `005-page-mon-profil`, exécuter `npm run verify`, `npm run -w backend typecheck` et `npm run -w frontend typecheck` ; consigner les compteurs de départ (tests unitaires, intégration, frontend) dans un nouveau `docs/validation/verification-005.md`, section « État initial »

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la page `/profil` existe (coquille vide), derrière l'authentification ; prérequis des deux stories

**⚠️ CRITICAL**: aucune story ne commence avant la fin de cette phase

- [X] T002 Écrire la suite `frontend/tests/auth/profile.test.tsx` (rouge) sur le modèle de `frontend/tests/auth/login.test.tsx` (`createMemoryRouter`, `QueryClientProvider`, `fetch` simulé) : (a) `ProfilePage` affiche un titre de niveau 1 « Mon profil » une fois `/api/auth/me` chargé ; (b) pendant le chargement, l'état de chargement commun de `RequireAuth` (« Chargement de votre espace »), sans le titre ; (c) si `/api/auth/me` échoue (500), l'état d'erreur commun de `RequireAuth` (message et « Réessayer »), sans le titre ; (d) avec `RequireAuth` et un compte `mustChangePassword: true`, la route `/profil` redirige vers `/mot-de-passe` (cas limite « changement imposé en cours »)
- [X] T003 Créer `frontend/src/features/auth/ProfilePage.tsx` (titre « Mon profil » via `PageHeader`, données de `useCurrentUser` ; chargement et erreur déjà assurés par `RequireAuth`, aucun état propre à la page) et déclarer la route `{ path: 'profil', element: <ProfilePage /> }` parmi les enfants de `AppLayout` dans `frontend/src/app/routes.tsx` (donc derrière `RequireAuth`) ; T002 au vert

**Checkpoint**: `/profil` s'ouvre (vide) pour tout compte connecté, et pas pendant un changement imposé

---

## Phase 3: User Story 1 - Changer son mot de passe quand on le souhaite (Priority: P1) 🎯 MVP

**Goal**: depuis le menu, ouvrir « Mon profil », choisir « Changer mon mot de passe », annuler ou changer, revenir au profil avec la confirmation ; le parcours imposé est inchangé

**Independent Test**: se connecter, ouvrir le profil depuis le menu, changer le mot de passe, se reconnecter avec le nouveau ; une session ouverte ailleurs est fermée

### Tests for User Story 1 ⚠️

> Écrire ces tests d'abord et les constater rouges

- [X] T004 [P] [US1] Dans un nouveau `frontend/tests/app/app-layout.test.tsx` (rouge) : le bloc profil de `AppLayout` est un lien (`getByRole('link', { name: /^Mon profil : / })`) dont le nom accessible contient le nom et le rôle visibles (« Mon profil : Enseignante, Employé ») et qui mène à `/profil` ; il porte `aria-current="page"` quand `/profil` est affichée ; en mobile (fenêtre < 900 px, `matchMedia` simulé), le lien est dans le tiroir et l'activer ferme le tiroir. Simuler le temps réel (`SocketProvider`) comme dans `frontend/tests/notifications/NotificationCenter.test.tsx`
- [X] T005 [P] [US1] Dans un nouveau `frontend/tests/auth/change-password.test.tsx` (rouge), compte `mustChangePassword: false` (mode volontaire) : (a) un bouton « Annuler » existe et mène à `/profil` sans appeler `POST /api/auth/password` ; (b) succès (`204`) → `/profil`, où une zone `role="status"` affiche « Mot de passe modifié. Vos autres sessions ont été fermées. » ; (c) erreurs inchangées : actuel vide, nouveau de moins de 12 caractères, confirmation différente, et `400 VALIDATION_ERROR` sur `currentPassword` (« Mot de passe actuel incorrect. ») affiché sous le champ. Compte `mustChangePassword: true` (mode imposé) : pas de bouton « Annuler », succès → `/` (accueil)
- [X] T006 [P] [US1] Dans `e2e/auth.spec.ts`, nouveau test (rouge) réservé à Chromium (`test.skip(testInfo.project.name !== 'chromium', …)`, comme le test du compte `nouveau`) avec le compte `autre` : ouvrir deux contextes connectés ; dans le premier, activer le lien « Mon profil : … » du menu, puis « Changer mon mot de passe », saisir l'actuel et un nouveau de 12 caractères au moins ; attendre le retour sur `/profil` et le statut « Mot de passe modifié. Vos autres sessions ont été fermées. » ; recharger le second contexte → page de connexion ; se reconnecter avec le nouveau mot de passe ; **dans un bloc `finally`, remettre l'ancien mot de passe** (par l'interface ou `POST /api/auth/password` avec l'en-tête `Origin`) pour laisser la base e2e rejouable

### Implementation for User Story 1

- [X] T007 [P] [US1] Dans `frontend/src/app/AppLayout.tsx`, faire du bloc profil (`user`, partagé par la barre latérale et le tiroir) un lien React Router vers `/profil` : texte masqué visuellement « Mon profil : » (`visuallyHidden` de `frontend/src/components/a11y.ts`) avant le `Person` visible, focus visible, `aria-current="page"` sur `/profil`, fermeture du tiroir au clic (comme `NavList` `onNavigate`) ; T004 au vert
- [X] T008 [P] [US1] Dans `frontend/src/features/auth/ChangePasswordPage.tsx`, mode volontaire quand `me.data.mustChangePassword` est `false` : bouton « Annuler » (variante secondaire) → `navigate('/profil')` ; succès → `navigate('/profil', { replace: true, state: { passwordChanged: true } })` ; mode imposé strictement inchangé (texte d'explication, pas d'annulation, succès → `/`) ; T005 au vert, `frontend/tests/auth/login.test.tsx` inchangé et vert
- [X] T009 [US1] Dans `frontend/src/features/auth/ProfilePage.tsx`, ajouter l'action « Changer mon mot de passe » (bouton-lien vers `/mot-de-passe`, libellé exact du message serveur de `backend/src/users/users.service.ts`, FR-013) et, si `location.state.passwordChanged`, le statut « Mot de passe modifié. Vos autres sessions ont été fermées. » (`role="status"`, composant d'alerte existant) ; compléter `frontend/tests/auth/profile.test.tsx` (rouge d'abord) pour l'action et le statut
- [X] T010 [US1] Lancer `npm run -w frontend test` et `npx playwright test -c e2e/playwright.config.ts e2e/auth.spec.ts --project=chromium` : T004 à T006 au vert

**Checkpoint**: US1 complète et testable seule (MVP) : le changement volontaire est accessible en 2 actions (SC-001)

---

## Phase 4: User Story 2 - Consulter les informations de son compte (Priority: P2)

**Goal**: « Mon profil » affiche en lecture seule nom, identifiant, fonction, rôle et groupes d'affectation, avec des libellés explicites pour les valeurs absentes

**Independent Test**: pour un compte de chaque rôle et un membre de chaque groupe, les valeurs affichées sont celles de l'administration ; rien n'est modifiable

### Tests for User Story 2 ⚠️

- [X] T011 [P] [US2] Nouveau `backend/test/unit/auth-me.spec.ts` (rouge) : `toMeResponse` (`backend/src/auth/auth.types.ts`) renvoie `username` et `jobTitle` de l'utilisateur ; `jobTitle` vaut `null` si non renseigné ; les champs existants (`id`, `displayName`, `role`, `permissions` triées, `mustChangePassword`, `isTeacher`, `isSupervisor`) sont inchangés
- [X] T012 [P] [US2] Dans `backend/test/integration/auth.spec.ts` (rouge) : `GET /api/auth/me` renvoie le `username` et le `jobTitle` du compte de la session (« `jobTitle`, texte, 100 caractères max, facultatif » : valeur renseignée, puis `null` pour un compte sans fonction) ; deux comptes connectés reçoivent chacun leurs propres valeurs ; la réponse de `POST /api/auth/login` contient aussi les deux champs
- [X] T013 [P] [US2] Compléter `frontend/tests/auth/profile.test.tsx` (rouge) : liste de termes et définitions — « Nom », « Identifiant de connexion », « Fonction », « Rôle », « Groupes d'affectation » ; rôle traduit par `ROLE_LABELS` (« Employé », « Admin », « Super administrateur ») ; fonction absente → « Non renseignée » ; groupes : « Surveillants », « Enseignants », les deux, ou « Aucun » ; aucun champ de saisie (`queryAllByRole('textbox')` vide) ; mention « Pour modifier ces informations, adressez-vous à l'administration. »

### Implementation for User Story 2

- [X] T014 [US2] Dans `backend/src/auth/auth.types.ts`, ajouter `jobTitle: string | null` à `AuthenticatedUser`, `username: string` et `jobTitle: string | null` à `MeResponse`, et les renvoyer dans `toMeResponse` ; dans `backend/src/auth/session.service.ts` (`toAuthenticatedUser`), renseigner `jobTitle: user.jobTitle` ; corriger les fixtures de test qui construisent un `AuthenticatedUser` (`npm run -w backend typecheck`) ; T011 et T012 au vert
- [X] T015 [P] [US2] Dans `frontend/src/api/types.ts`, ajouter `username: string` et `jobTitle: string | null` à `Me` ; mettre à jour les objets `Me` simulés dans `frontend/tests/**` (rechercher `mustChangePassword:`) pour que `npm run -w frontend typecheck` passe
- [X] T016 [US2] Dans `frontend/src/features/auth/ProfilePage.tsx`, afficher la liste de `contracts/ui.md` (élément `dl`, termes et valeurs, retour à la ligne des valeurs longues pour 320 px) et la mention de l'administration ; T013 au vert
- [X] T017 [US2] Lancer `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test` : T011 à T013 au vert, aucun test existant modifié hors fixtures de type (T014, T015)

**Checkpoint**: US1 et US2 fonctionnent, chacune testable seule

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: accessibilité vérifiée, documentation à jour, vérification complète

- [X] T018 [P] Dans `e2e/a11y-responsive.spec.ts`, test V18 (profil `mobile-320`, compte `enseignante`) : ajouter `page.goto('/profil')` puis `checkScreen(page, 'mon profil')`, et `page.goto('/mot-de-passe')` puis `checkScreen(page, 'changer mon mot de passe (volontaire)')` — sans soumettre le formulaire ; vérifier aussi le parcours clavier jusqu'au lien « Mon profil : … » dans le test « au clavier seul » (FR-011, SC-004)
- [X] T019 [P] Mettre à jour `docs/superadmin-fonctionnalites.md` : §1.1 ligne « Bloc profil » (route `/profil`, état « Complète ») et paragraphe « Profil et déconnexion » ; §4.2 retirer « Pas de page de profil ni de lien « Changer mon mot de passe » » ; §4.4 remarque S01
- [X] T020 [P] Mettre à jour la démo : sous-titre « Il n'existe pas de page de profil » de `demo/scenarios/S01-menu-lateral.ts` (montrer le lien vers « Mon profil ») et remarque S01 de `demo/README.md` ; rejouer `npx tsx demo/run.ts S01 --env=test` avant 22 h, heure de l'école
- [ ] T021 Dérouler les scénarios manuels 1 à 7 de `specs/005-page-mon-profil/quickstart.md` et consigner le résultat dans `docs/validation/verification-005.md`
- [ ] T022 Vérification finale : `npm run verify`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`, `npm run test:e2e` (tous les profils) ; consigner les compteurs dans `docs/validation/verification-005.md` ; CI verte sur le dernier commit ; demande de fusion selon `docs/procedure-fusion.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance
- **Foundational (Phase 2)** : après Setup ; **bloque les deux stories** (T002 → T003)
- **US1 (Phase 3)** et **US2 (Phase 4)** : après Phase 2 ; indépendantes l'une de l'autre, mais toutes deux modifient `ProfilePage.tsx` (T009, T016) et `profile.test.tsx` (T009, T013) : faire T009 avant T016, ou fusionner avec soin
- **Polish (Phase 5)** : après les deux stories

### User Story Dependencies

- **US1 (P1)** : n'utilise pas les nouveaux champs de `/api/auth/me` ; seule la coquille de page (T003) est requise
- **US2 (P2)** : indépendante de US1 côté serveur (T011, T012, T014) ; côté page, après T003

### Within Each User Story

- Tests écrits et **rouges** avant l'implémentation (T004–T006 avant T007–T009 ; T011–T013 avant T014–T016)
- Serveur avant interface pour US2 (T014 avant T016) ; types frontend (T015) avant T016

### Parallel Opportunities

- US1 : T004, T005, T006 en parallèle (fichiers distincts) ; puis T007 et T008 en parallèle
- US2 : T011, T012, T013 en parallèle ; T015 en parallèle de T014
- Les phases 3 et 4 peuvent avancer en parallèle après la phase 2 (attention à `ProfilePage.tsx`)
- Polish : T018, T019, T020 en parallèle

---

## Parallel Example: User Story 1

```text
# Tests d'abord, ensemble (rouges) :
T004 frontend/tests/app/app-layout.test.tsx
T005 frontend/tests/auth/change-password.test.tsx
T006 e2e/auth.spec.ts

# Puis implémentation, ensemble :
T007 frontend/src/app/AppLayout.tsx
T008 frontend/src/features/auth/ChangePasswordPage.tsx
```

## Parallel Example: User Story 2

```text
T011 backend/test/unit/auth-me.spec.ts
T012 backend/test/integration/auth.spec.ts
T013 frontend/tests/auth/profile.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001) et Phase 2 (T002–T003)
2. Phase 3 (T004–T010) : le changement de mot de passe volontaire est accessible depuis le menu
3. **Arrêt et validation** : scénarios 1, 3, 4, 5 et 6 du quickstart ; livrable seul (la page profil
   n'affiche alors que le titre et l'action)

### Incremental Delivery

1. Setup + Foundational → page `/profil` protégée
2. US1 → changement volontaire (MVP, enjeu de sécurité)
3. US2 → informations du compte
4. Polish → accessibilité à 320 px, documentation, démo, vérification finale
