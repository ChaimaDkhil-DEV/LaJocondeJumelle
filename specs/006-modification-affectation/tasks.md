---

description: "Task list for feature 006 — modification d'une affectation par l'admin (classe, créneau)"
---

# Tasks: Modification d'une affectation par l'admin (classe, créneau)

**Input**: Design documents from `/specs/006-modification-affectation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBLIGATOIRES — constitution, principe I (TDD non négociable). Chaque tâche de test
placée avant une implémentation DOIT être écrite et constatée **rouge** avant de coder. Aucun
attendu existant n'est modifié, sauf les libellés « Demande modifiée » → « Affectation modifiée »
(événement `UPDATED`, notification `COVERAGE_UPDATED`), à consigner dans
`docs/validation/verification-006.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallélisable (fichiers différents, aucune dépendance sur une tâche non terminée)
- **[Story]**: US1 (créneau, P1), US2 (classe, P2)

## Path Conventions

Monorepo : `backend/src/coverage/`, `backend/test/{unit,integration}/`, `frontend/src/features/coverage/`,
`frontend/tests/coverage/`, `e2e/`. Commandes depuis la racine du dépôt.

---

## Phase 1: Setup

- [X] T001 Sur `006-modification-affectation`, constater l'état de départ (`npm run verify`, typecheck backend et frontend, ou référence à la dernière vérification complète si aucun fichier de code n'a changé depuis) et le consigner dans un nouveau `docs/validation/verification-006.md`, section « État initial »

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: route `PATCH /api/coverage/:id` protégée, règle par statut, version, réponse et bouton « Modifier » — sans encore modifier ni créneau ni classe

**⚠️ CRITICAL**: aucune story ne commence avant la fin de cette phase

- [X] T002 [P] Tests unitaires (rouges) : dans `backend/test/unit/coverage-state-machine.spec.ts`, l'action `UPDATE` est autorisée à l'acteur `ADMIN` depuis `PENDING`, `ACCEPTED`, `EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING` vers le même statut, refusée (`INVALID_TRANSITION`) depuis `DONE`, `CLOSED`, `CANCELLED`, `UNFILLED`, et la règle de l'enseignant (`PENDING`, `REQUESTER_TEACHER`) est inchangée ; dans un nouveau `backend/test/unit/coverage-modification.spec.ts`, `modifiableFields(status)` renvoie `['classId','date','startTime','endTime']` pour `PENDING`, `ACCEPTED`, `EN_ROUTE`, `LATE`, `['endTime']` pour `ON_DUTY`, `RELIEF_PENDING`, `[]` pour les statuts définitifs
- [X] T003 [P] Test d'intégration (rouge) : dans `backend/test/integration/supervision-permissions.spec.ts`, ajouter `PATCH /api/coverage/:id` à la matrice route × rôle : admin et super administrateur autorisés ; employé, surveillant, enseignant → `404` et refus journalisé `ACCESS_DENIED`
- [X] T004 [P] Nouveau `backend/test/integration/supervision-update.spec.ts` (rouge), socle : version différente → `409 STATE_CHANGED` sans écriture ; affectation terminée ou annulée → `409 INVALID_TRANSITION` ; corps sans changement → `200`, version inchangée, aucun événement ni notification ; `GET /api/coverage/:id` renvoie `modifiableFields` selon le statut pour un admin et `[]` pour un surveillant
- [X] T005 Dans `backend/src/coverage/domain/coverage-state-machine.ts`, ajouter la règle `{ from: [PENDING, ACCEPTED, EN_ROUTE, LATE, ON_DUTY, RELIEF_PENDING], action: 'UPDATE', to: 'same', actors: ['ADMIN'] }` ; créer `backend/src/coverage/domain/coverage-modification.ts` (`modifiableFields`) ; T002 au vert
- [X] T006 Dans `backend/src/coverage/coverage.dto.ts`, `UpdateCoverageDto` (`version` entier obligatoire ; `classId` UUID, `date` AAAA-MM-JJ, `startTime` et `endTime` HH:MM facultatifs, mêmes formats et messages que `TeacherRequestDto`) ; dans `backend/src/coverage/coverage.controller.ts`, `@Patch(':id')` → `CoverageService.updateCoverage` ; dans `coverage.service.ts`, `updateCoverage` : contrôle admin (`assertCoverageAdmin`, refus journalisé), chargement, version, règle `UPDATE`, sortie anticipée sans changement ; ajouter `modifiableFields` au détail (`coverage.mapper.ts`, vide hors admin) ; T003 et T004 au vert
- [X] T007 [P] Frontend : dans `frontend/src/features/coverage/types.ts`, `modifiableFields` sur le détail ; dans `api.ts`, `useUpdateCoverage(id, handlers)` (`PATCH`, retours `onSuccess`/`onError` au niveau de la mutation comme `useCoverageAction`, mise en cache du détail puis rafraîchissement du module)

**Checkpoint**: la route existe, protégée et versionnée ; le détail expose `modifiableFields`

---

## Phase 3: User Story 1 - Corriger le créneau d'une affectation (Priority: P1) 🎯 MVP

**Goal**: modifier date, début et fin (fin seulement pendant la présence), conflit nommé, échéances et rappels recalculés, historique, audit et notification

**Independent Test**: modifier le créneau d'une affectation assignée ; vérifier détail, vue du surveillant, notification, historique, audit ; chevauchement refusé avec conflit nommé

### Tests for User Story 1 ⚠️

- [X] T008 [P] [US1] Dans `backend/test/unit/coverage-reminders.spec.ts` (rouge) : `reminderChanges` pour l'action `UPDATE` sur une affectation `ACCEPTED` ou `ON_DUTY` résout les rappels de fin de créneau et en replanifie à partir de la nouvelle fin (comme `EXTEND`) ; sur `PENDING`, comportement actuel inchangé
- [X] T009 [P] [US1] Dans `backend/test/integration/supervision-update.spec.ts` (rouge), créneau : nouvelle date et nouvelles heures (fuseau de l'école) enregistrées, `estimatedMinutes` recalculé, statut et surveillant inchangés ; fin avant début ou passée → `400 INVALID_RANGE` ; début hors de 12 h avant / 7 jours après → `400 VALIDATION_ERROR` sur `startTime` ; pendant la présence (`ON_DUTY`) : `classId`, `date` ou `startTime` → `400 VALIDATION_ERROR` « Non modifiable pendant la présence en classe. », fin antérieure à maintenant refusée, fin plus tardive acceptée ; chevauchement avec une autre affectation du même surveillant → `409 NOT_AVAILABLE`, message « Surveillant déjà affecté : <classe>, <date> <début>–<fin>. Réassignez d’abord, puis modifiez. », `details.conflict` renseigné, rien de modifié ; surveillant absent → `409 NOT_AVAILABLE` sans conflit nommé ; événement `UPDATED` (`fromValue`/`toValue` : `classId`, `startAt`, `plannedEndAt`, `toValue.byAdmin`), audit `COVERAGE_MANAGED` avec `details.action = 'UPDATE'`, avant et après, sans le motif ; notification `COVERAGE_UPDATED` au surveillant affecté et aux autres admins (pas à l'auteur) ; échéance (`currentDueAt`) recalculée sur le nouveau début avant présence
- [X] T010 [P] [US1] Nouveau `frontend/tests/coverage/edit-coverage.test.tsx` (rouge) : bouton « Modifier » présent seulement si `allowedActions` contient `UPDATE` ; dialogue « Modifier l’affectation » pré-rempli (date et heures locales) ; champs désactivés selon `modifiableFields` et phrase « Le surveillant est en classe : seule l’heure de fin peut changer. » ; « Enregistrer » n'envoie que les champs changés avec `version` ; erreur `INVALID_RANGE` et `VALIDATION_ERROR` sous le champ ; `NOT_AVAILABLE` dans une alerte du dialogue avec le message du serveur ; succès : dialogue fermé et toast « Affectation modifiée. » même si le détail se démonte avant la réponse
- [X] T011 [P] [US1] Dans `frontend/tests/coverage/edit-coverage.test.tsx` (rouge, rendu du détail réel) : texte d'historique d'un `UPDATED` d'admin — « Affectation modifiée : 09:00–10:00 → 09:30–10:30 » (créneau seul), avec la date si le jour change ; libellé générique « Affectation modifiée »

### Implementation for User Story 1

- [X] T012 [US1] Dans `backend/src/coverage/domain/coverage-reminders.ts`, cas `UPDATE` : affectation assignée ou en cours → rappels de fin de créneau recalculés (`endOfSlotPlan`), `PENDING` inchangé ; T008 au vert
- [X] T013 [US1] Dans `backend/src/coverage/coverage.service.ts` (`updateCoverage`) : créneau en fuseau de l'école (`atLocalTime`), règles R3 et champs autorisés par `modifiableFields` ; disponibilité du surveillant sur le nouveau créneau (`availabilityFor` en excluant l'affectation, sous `lockEmployee`), refus `NOT_AVAILABLE` nommant le conflit (`guardRequestId` → classe et créneau) ; dans la transaction : `updateMany` versionné, `coverageDetail` (`startAt`, `plannedEndAt`, `estimatedMinutes`), échéance (`nextCoverageDeadline`) avant présence, `applyReminders` (`UPDATE`), événement `UPDATED`, audit `COVERAGE_MANAGED`, notification `COVERAGE_UPDATED` (surveillant et autres admins), `pushUpdate` ; T009 au vert
- [X] T014 [US1] Dans `historyOf` (`coverage.service.ts`), résoudre `classId` → `className` dans `fromValue`/`toValue` (comme `assigneeName`) ; dans `frontend/src/features/coverage/CoverageDetailPage.tsx`, texte de l'événement `UPDATED` (contrats/ui.md) et libellé « Affectation modifiée » ; dans `frontend/src/features/notifications/api.ts`, libellé `COVERAGE_UPDATED` « Affectation modifiée » ; T011 au vert
- [X] T015 [US1] Nouveau `frontend/src/features/coverage/EditCoverageDialog.tsx` (date, heure de début, heure de fin ; classe en lecture seule pour l'instant) et bouton « Modifier » dans `CoverageDetailPage.tsx` (zone des actions d'admin) ; T010 au vert
- [X] T016 [P] [US1] Dans `e2e/coverage-class.spec.ts`, nouveau parcours Chromium (rouge puis vert) à 1280 px : affectation directe → « Modifier » la fin → vue du surveillant à jour sans rechargement, historique ; seconde affectation du même surveillant modifiée pour chevaucher → message de conflit ; nettoyage par annulation (base rejouable)
- [X] T017 [US1] Lancer `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test` et le parcours T016 : tout au vert

**Checkpoint**: US1 livrable seule (MVP)

---

## Phase 4: User Story 2 - Changer la classe d'une affectation (Priority: P2)

**Goal**: changer la classe avant présence (étage, titre, notification mettant en avant la classe), statut inchangé (y compris « En route »), QR code de la nouvelle classe

**Independent Test**: changer la classe d'une affectation « En route » ; surveillant notifié ; QR de l'ancienne classe refusé, de la nouvelle accepté

### Tests for User Story 2 ⚠️

- [X] T018 [P] [US2] Dans `backend/test/integration/supervision-update.spec.ts` (rouge), classe : nouvelle classe active enregistrée avec son étage (`floorId`), titre `Garde — <classe>` (ou `Retard`/`Absence` selon l'affectation) ; classe désactivée → `400 CLASS_INACTIVE` ; affectation `EN_ROUTE` → reste `EN_ROUTE`, `departedAt` conservé ; notification `COVERAGE_UPDATED` au surveillant ; présence : QR de l'ancienne classe ne trouve plus l'affectation (`resolveQr`), celui de la nouvelle la trouve ; classe modifiée en même temps que le créneau : une seule version, un seul événement
- [X] T019 [P] [US2] Compléter `frontend/tests/coverage/edit-coverage.test.tsx` (rouge) : liste « Classe » des classes actives (nom, salle, étage), changement envoyé en `classId` ; désactivée pendant la présence ; et `frontend/tests/coverage/coverage.test.tsx` : historique « Affectation modifiée : classe 2e année Bleu → 1ère année Violet »

### Implementation for User Story 2

- [X] T020 [US2] Dans `updateCoverage` (`coverage.service.ts`) : classe active (`CLASS_INACTIVE`), `classId` et `floorId`, titre selon la source et le type existants, statut et `departedAt` inchangés ; T018 au vert
- [X] T021 [US2] Dans `EditCoverageDialog.tsx`, champ « Classe » (classes actives, comme `CreateCoveragePage.tsx`), activé selon `modifiableFields` ; texte d'historique avec la classe ; T019 au vert
- [X] T022 [P] [US2] Dans `e2e/coverage-class.spec.ts`, compléter le parcours T016 : changement de classe d'une affectation « En route » → toujours « En route » chez le surveillant, nouvelle classe affichée ; présence par QR de la nouvelle classe
- [X] T023 [US2] Lancer les suites backend et frontend et `e2e/coverage-class.spec.ts` (Chromium) : tout au vert

**Checkpoint**: US1 et US2 fonctionnent, chacune testable seule

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T024 [P] Dans `e2e/a11y-responsive.spec.ts`, test « 004 — écrans des affectations à 320 px » : ouvrir « Modifier » sur une affectation et `checkScreen` du dialogue (axe, sans défilement horizontal) ; atteindre « Modifier » et les champs au clavier (FR-013, SC-005)
- [X] T025 [P] Mettre à jour `docs/superadmin-fonctionnalites.md` : §3 (modification par l'admin), §2.7 (audit `COVERAGE_MANAGED` : modification), §4.2 (retirer « Modification d'une affectation par l'admin (classe, horaire) : absente »)
- [X] T026 Dérouler les scénarios 1 à 8 de `specs/006-modification-affectation/quickstart.md` (couverture automatique et reste à faire à la main) et consigner dans `docs/validation/verification-006.md`, avec les libellés modifiés (« Affectation modifiée »)
- [X] T027 Vérification finale : `npm run verify`, typecheck backend et frontend, `npm run test:e2e` (tous les profils, en journée de l'école) ; consigner les compteurs ; CI verte ; demande de fusion selon `docs/procedure-fusion.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → **US1 (Phase 3)** et **US2 (Phase 4)** → **Polish (Phase 5)**
- Phase 2 bloque les deux stories (route, règle, version, `modifiableFields`)

### User Story Dependencies

- **US1** : après la phase 2.
- **US2** : après la phase 2 ; partage `updateCoverage`, `EditCoverageDialog.tsx`, `supervision-update.spec.ts` et `edit-coverage.test.tsx` avec US1 — faire US1 d'abord (T013 avant T020, T015 avant T021) pour éviter les conflits dans ces fichiers.

### Within Each User Story

- Tests rouges avant l'implémentation (T008–T011 avant T012–T015 ; T018–T019 avant T020–T021)
- Serveur avant interface (T013 avant T015 ; T020 avant T021)

### Parallel Opportunities

- Phase 2 : T002, T003, T004 en parallèle ; T007 en parallèle de T005–T006
- US1 : T008, T009, T010, T011 en parallèle ; T016 en parallèle de T012–T015 (écrit rouge d'abord)
- US2 : T018 et T019 en parallèle ; T022 en parallèle de T020–T021
- Polish : T024 et T025 en parallèle

---

## Parallel Example: Foundational

```text
T002 backend/test/unit/coverage-state-machine.spec.ts + coverage-modification.spec.ts
T003 backend/test/integration/supervision-permissions.spec.ts
T004 backend/test/integration/supervision-update.spec.ts
```

## Parallel Example: User Story 1

```text
T008 backend/test/unit/coverage-reminders.spec.ts
T009 backend/test/integration/supervision-update.spec.ts
T010 frontend/tests/coverage/edit-coverage.test.tsx
T011 frontend/tests/coverage/coverage.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001), Phase 2 (T002–T007)
2. Phase 3 (T008–T017) : modification du créneau, conflit nommé, traces
3. **Arrêt et validation** : scénarios 1, 2, 3, 5, 6, 7 du quickstart

### Incremental Delivery

1. Socle → route protégée et versionnée
2. US1 → créneau (cas le plus fréquent)
3. US2 → classe
4. Polish → accessibilité 320 px, documentation, vérification finale
