---

description: "Task list for feature 007 — brouillons de demande de travail"
---

# Tasks: Brouillons de demande de travail

**Input**: Design documents from `/specs/007-brouillons-demandes/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBLIGATOIRES — constitution, principe I (TDD non négociable). Chaque tâche de test
placée avant une implémentation DOIT être écrite et constatée **rouge** avant de coder.
L'extraction du formulaire (T005) est une refactorisation : elle DOIT laisser
`frontend/tests/requests/CreateRequestPage.test.tsx` vert **sans modification**. Tout attendu
existant modifié est consigné dans `docs/validation/verification-007.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallélisable (fichiers différents, aucune dépendance sur une tâche non terminée)
- **[Story]**: US1 (enregistrer, P1), US2 (retrouver, reprendre, envoyer, P1), US3 (supprimer, P2)

---

## Phase 1: Setup

- [X] T001 Sur `007-brouillons-demandes`, constater l'état de départ (référence à la vérification finale de la 006 et à la CI verte de `master` si aucun fichier de code n'a changé depuis) dans un nouveau `docs/validation/verification-007.md`, section « État initial »

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: périmètre de liste `drafts`, « Envoyées » sans brouillon, appels d'API côté interface, formulaire réutilisable

**⚠️ CRITICAL**: aucune story ne commence avant la fin de cette phase

- [X] T002 Nouveau `backend/test/integration/requests-drafts.spec.ts` (rouge) : `GET /api/requests?scope=drafts` renvoie les seuls brouillons de l'utilisateur de la session (ni ses demandes envoyées, ni les brouillons d'un autre) ; `scope=mine` ne renvoie plus aucun brouillon ; `scope=drafts` sans session → 401
- [X] T003 Dans `backend/src/requests/requests.dto.ts`, ajouter `'drafts'` à `REQUEST_SCOPES` ; dans `backend/src/requests/requests.service.ts` (`list`), `mine` → `{ requesterId: user.id, status: { not: 'DRAFT' } }`, `drafts` → `{ requesterId: user.id, status: 'DRAFT' }` ; T002 au vert et `backend/test/integration/requests-create.spec.ts`, `requests-search.spec.ts` verts (consigner tout attendu touché)
- [X] T004 [P] Frontend : dans `frontend/src/features/requests/types.ts`, `RequestScope` gagne `'drafts'` ; dans `frontend/src/features/requests/api.ts`, `saveDraft(input)` (téléversement du vocal puis `POST` avec `asDraft: true`), `updateDraft(id, changes)` (`PATCH`, `voiceFileId: null` pour retirer), `submitDraft(id, version)` (`POST …/actions` `SUBMIT`), `deleteDraft(id)` (`DELETE`)
- [X] T005 Extraire le formulaire de `frontend/src/features/requests/CreateRequestPage.tsx` dans un nouveau `frontend/src/features/requests/RequestForm.tsx` (champs, règles de catégorie et de destinataire, message vocal, erreurs ; valeurs initiales et actions fournies par la page) ; `CreateRequestPage` l'utilise sans changement de comportement ; `frontend/tests/requests/CreateRequestPage.test.tsx` vert sans modification

**Checkpoint**: la liste distingue brouillons et demandes envoyées ; le formulaire est réutilisable

---

## Phase 3: User Story 1 - Enregistrer une demande en brouillon (Priority: P1) 🎯 MVP

**Goal**: « Enregistrer en brouillon » depuis « Nouvelle demande », sans rien envoyer

**Independent Test**: enregistrer en brouillon ; aucune notification ; le brouillon existe pour son auteur seul

### Tests for User Story 1 ⚠️

- [X] T006 [P] [US1] Nouveau `frontend/tests/requests/drafts.test.tsx` (rouge), bloc « enregistrer » : bouton « Enregistrer en brouillon » présent si `draftsEnabled` (réglages publics), absent sinon ; validation réduite (catégorie « Choisissez une catégorie. », titre « Saisissez un titre. » ; description, vocal, destinataire et priorité non exigés) ; appel `POST /api/requests` avec `asDraft: true` et priorité `NORMAL` par défaut ; vocal téléversé d'abord quand il y en a un ; succès : toast « Brouillon enregistré. » et navigation vers `/demandes/:id/brouillon`

### Implementation for User Story 1

- [X] T007 [US1] Dans `CreateRequestPage.tsx` (via `RequestForm`), bouton secondaire « Enregistrer en brouillon » (si `draftsEnabled`), validation réduite, `saveDraft`, toast et navigation ; erreur réseau ou serveur : message, formulaire conservé (pas de boîte d'envoi pour un brouillon, R6) ; T006 au vert, `CreateRequestPage.test.tsx` vert

**Checkpoint**: un brouillon s'enregistre (US1 seule livrable : le brouillon est visible dans les données de l'auteur)

---

## Phase 4: User Story 2 - Retrouver, compléter et envoyer un brouillon (Priority: P1)

**Goal**: onglet « Brouillons », page brouillon pré-remplie, enregistrer et envoyer

**Independent Test**: ouvrir un brouillon depuis l'onglet, le compléter, l'envoyer ; statut et notifications identiques à une création directe

### Tests for User Story 2 ⚠️

- [X] T008 [P] [US2] Dans `backend/test/integration/requests-drafts.spec.ts` (constat, vert attendu sur l'existant) : un brouillon envoyé par `SUBMIT` obtient le statut et les notifications d'une création directe (mode direct : `SENT`, destinataire notifié ; via l'administration : `PENDING_ADMIN_VALIDATION`) ; réglage `draftsEnabled` désactivé : création `asDraft` refusée (`400`), mais `PATCH`, `SUBMIT` et `DELETE` d'un brouillon existant acceptés (FR-008)
- [X] T009 [P] [US2] Dans `frontend/tests/requests/drafts.test.tsx` (rouge), bloc « liste » : onglet « Brouillons » affiché seulement si `scope=drafts` renvoie au moins un élément ; sa liste vient de `scope=drafts` ; un brouillon mène à `/demandes/:id/brouillon`
- [X] T010 [P] [US2] Dans `frontend/tests/requests/drafts.test.tsx` (rouge), bloc « page brouillon » : titre « Brouillon de demande », formulaire pré-rempli (catégorie, destinataire, priorité, titre, description) ; vocal existant avec « Remplacer le message vocal » et « Supprimer le message vocal » ; « Enregistrer le brouillon » → `PATCH` des seuls champs changés, toast « Brouillon enregistré. » ; « Envoyer la demande » : validation complète (description ou vocal), `PATCH` si changements puis `SUBMIT` avec la version renvoyée, toast « Votre demande a été envoyée. » et navigation vers `/demandes/:id` ; `409 STATE_CHANGED` ou `404` : message puis retour à « Mes demandes » ; `/demandes/:id` d'un brouillon redirige vers `/demandes/:id/brouillon`

### Implementation for User Story 2

- [X] T011 [US2] Dans `frontend/src/features/requests/RequestListPage.tsx`, onglet « Brouillons » (`?onglet=brouillons`, après « Envoyées ») selon `scope=drafts&limit=1` ; lien des brouillons vers `/demandes/:id/brouillon` ; T009 au vert
- [X] T012 [US2] Nouveau `frontend/src/features/requests/DraftPage.tsx` (pré-remplissage depuis `useRequest`, `RequestForm`, vocal existant via `VoicePlayer`, actions « Envoyer la demande » et « Enregistrer le brouillon ») ; route `demandes/:id/brouillon` dans `frontend/src/app/routes.tsx` ; redirection depuis `RequestDetailPage.tsx` quand le statut est `DRAFT` ; T010 au vert
- [X] T013 [P] [US2] Nouveau `e2e/drafts.spec.ts` (Chromium) : `enseignante` enregistre un brouillon « Photocopies » → onglet « Brouillons » → reprise → description complétée → envoi → détail « Envoyée » ; `reprographie` voit la demande ; le brouillon n'a jamais été visible de `reprographie`
- [X] T014 [US2] Lancer `npm run -w backend test:integration`, `npm run -w frontend test` et `e2e/drafts.spec.ts` (Chromium) : tout au vert

**Checkpoint**: US1 et US2 livrables ensemble (cycle complet brouillon → envoi)

---

## Phase 5: User Story 3 - Supprimer un brouillon (Priority: P2)

**Goal**: supprimer un brouillon après confirmation

**Independent Test**: supprimer avec confirmation ; annuler ne supprime rien

### Tests for User Story 3 ⚠️

- [X] T015 [P] [US3] Dans `frontend/tests/requests/drafts.test.tsx` (rouge), bloc « supprimer » : « Supprimer le brouillon » ouvre « Supprimer ce brouillon ? » ; « Annuler » → aucun `DELETE` ; « Supprimer » → `DELETE`, toast « Brouillon supprimé. » et retour à « Mes demandes »

### Implementation for User Story 3

- [X] T016 [US3] Dans `DraftPage.tsx`, action « Supprimer le brouillon » avec `ConfirmDialog` existant, `deleteDraft`, toast, navigation ; T015 au vert
- [X] T017 [P] [US3] Dans `e2e/drafts.spec.ts`, parcours de suppression (annulation puis confirmation, brouillon absent de l'onglet ; la disparition de l'onglet sans brouillon est couverte par `drafts.test.tsx`, la base e2e pouvant contenir d'autres brouillons)

**Checkpoint**: les trois stories fonctionnent

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 [P] Dans `e2e/a11y-responsive.spec.ts`, test V18 (`mobile-320`) : écran « Nouvelle demande » avec le bouton de brouillon, onglet « Brouillons » et page brouillon (axe, sans défilement horizontal) ; atteindre « Enregistrer en brouillon » au clavier (FR-010, SC-005)
- [X] T019 [P] Mettre à jour `docs/superadmin-fonctionnalites.md` (§1.1 « Mes demandes » : onglet « Brouillons » ; §4.3 retirer « Brouillons : réglage et API présents, aucun écran pour en créer » ; §2.6 réglage des brouillons : « Complète »)
- [X] T020 Dérouler les scénarios 1 à 8 de `specs/007-brouillons-demandes/quickstart.md` (couverture automatique et reste à faire à la main) et consigner dans `docs/validation/verification-007.md`
- [ ] T021 Vérification finale : `npm run verify`, typecheck backend et frontend, `npm run test:e2e` (tous les profils) avec sorties conservées ; consigner les compteurs ; CI verte ; demande de fusion selon `docs/procedure-fusion.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → **US1 (Phase 3)** → **US2 (Phase 4)** → **US3 (Phase 5)** → **Polish (Phase 6)**
- Phase 2 bloque toutes les stories (périmètres, appels d'API, `RequestForm`).

### User Story Dependencies

- **US1** : après la phase 2.
- **US2** : a besoin d'un brouillon existant ; ses tests créent leurs brouillons eux-mêmes (indépendante de l'interface d'US1), mais partage `drafts.test.tsx` et `RequestForm` : faire US1 d'abord.
- **US3** : sur la page brouillon d'US2 (T012 avant T016).

### Within Each User Story

- Tests rouges avant l'implémentation (T006 avant T007 ; T009–T010 avant T011–T012 ; T015 avant T016).
- T008 est un **constat** de l'existant (vert attendu dès l'écriture) : il fixe les comportements du serveur sur lesquels l'interface s'appuie.

### Parallel Opportunities

- Phase 2 : T004 en parallèle de T002–T003 ; T005 en parallèle de T002–T004.
- US2 : T008, T009, T010 en parallèle ; T013 en parallèle de T011–T012.
- Polish : T018 et T019 en parallèle.

---

## Parallel Example: User Story 2

```text
T008 backend/test/integration/requests-drafts.spec.ts
T009 frontend/tests/requests/drafts.test.tsx (liste)
T010 frontend/tests/requests/drafts.test.tsx (page brouillon) — même fichier que T009 : écrire l'un après l'autre
```

---

## Implementation Strategy

### MVP First

1. Phases 1 et 2 (T001–T005)
2. US1 (T006–T007) et US2 (T008–T014) : le cycle brouillon → reprise → envoi n'a de valeur qu'entier
3. **Arrêt et validation** : scénarios 1 à 5 et 7 du quickstart

### Incremental Delivery

1. Socle → périmètres et formulaire réutilisable
2. US1 + US2 → brouillons utilisables (MVP)
3. US3 → suppression
4. Polish → accessibilité 320 px, documentation, vérification finale
