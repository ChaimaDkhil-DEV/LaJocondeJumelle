---

description: "Task list for feature 004 — retards et absences des enseignants, affectation des surveillants"
---

# Tasks: Retards et absences des enseignants, affectation des surveillants

**Input**: Design documents from `/specs/004-retards-affectation-surveillants/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBLIGATOIRES — constitution, principe I (TDD non négociable). Chaque tâche de test
placée avant une implémentation DOIT être écrite et constatée **rouge** avant de coder. Les
tests existants de gardes ne sont modifiés que pour la diffusion retirée et le renommage du rôle
(FR-002) ; toute suppression de test est listée avec sa raison dans
`docs/validation/verification-004.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 à US5 (spec.md). Ordre d'exécution : US4 → US1 → US2 → US3 → US5 (plan.md)
- `Rn` → research.md ; `§n` → data-model.md ; `FR-nnn` → spec.md

## Path Conventions

- Application web, workspaces npm : `backend/src/`, `backend/prisma/`, `backend/scripts/`,
  `backend/test/{unit,integration,utils}/`, `frontend/src/`, `frontend/tests/`, `e2e/`,
  `deploy/`, `docs/`
- Commandes : `npm run -w backend test`, `npm run -w backend test:integration` (PostgreSQL
  embarqué, en série), `npm run -w frontend test`, `npm run -w backend typecheck`,
  `npm run -w frontend typecheck`, `npm run lint`, `npx playwright test -c e2e/playwright.config.ts`,
  `npm run verify`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: état de départ mesuré et configuration partagée

- [ ] T001 Exécuter `npm run lint`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm run -w backend typecheck`, `npm run -w frontend typecheck` sur la branche `004-retards-affectation-surveillants` ; consigner les résultats dans une section « État initial » de `docs/validation/verification-004.md` (créer le fichier sur le modèle de `docs/validation/verification-003.md`). Tout échec DOIT être signalé avant de continuer.
- [ ] T002 [P] Ajouter `SCHOOL_TIMEZONE: ${SCHOOL_TIMEZONE:-${TZ:-Europe/Paris}}` à l'environnement du service API dans `deploy/docker-compose.yml`, la ligne `SCHOOL_TIMEZONE=Europe/Paris` commentée dans `deploy/.env.example`, et une ligne de documentation dans `README.md` (R4).
- [ ] T003 [P] Créer `backend/test/utils/clock.ts` : horloge injectable `fixedNow(iso)` utilisable par les services et les jobs (`runOnce(now?: Date)`), sur le modèle des appels `runOnce()` existants des jobs.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schéma, migrations, renommage technique du rôle, statuts dérivés, machine d'états
sans diffusion, échéances, étages, groupes à clé système. **Aucune story ne commence avant la fin
de cette phase.**

### Tests (écrire d'abord, constater rouge)

- [ ] T004 [P] Tests unitaires de `SCHOOL_TIMEZONE` dans `backend/test/unit/config.spec.ts` : défaut `Europe/Paris`, identifiant IANA invalide refusé au démarrage (message explicite), valeur valide acceptée.
- [ ] T005 [P] Tests unitaires `backend/test/unit/school-time.spec.ts` pour `backend/src/common/school-time.ts` : `localDate(now, tz)`, « aujourd'hui / demain » (y compris 23:59 → 00:01), `atLocalTime(date, "07:00", tz)`, `endOfLocalDay(instant, tz)`, passage à l'heure d'été et d'hiver en `Europe/Paris`.
- [ ] T006 [P] Tests unitaires `backend/test/unit/coverage-status.spec.ts` : correspondance complète R1 de `coverageMainStatus(status)` → `{ mainStatus, subState }` (`PENDING`→en attente ; `ACCEPTED`→assignée ; `EN_ROUTE`→assignée/« En route » ; `LATE`→assignée/« En retard » ; `ON_DUTY`→en cours ; `RELIEF_PENDING`→en cours/« Relève demandée » ; `DONE`→terminée ; `CLOSED`→terminée/« Clôturée après validation » ; `CANCELLED`→annulée ; `UNFILLED`→non pourvue) ; `BROADCAST` et tout statut de demande de travail lèvent une erreur ; ensembles `MAIN_STATUS_VALUES` utilisés par les filtres.
- [ ] T007 [P] Tests unitaires `backend/test/unit/coverage-reminders.spec.ts` pour `backend/src/coverage/domain/coverage-reminders.ts` (R3) : `TAKEOVER.dueAt = max(now, startAt − seuil 60) + takeoverMinutes 2` (créneau lointain, créneau dans 30 min, créneau déjà commencé) ; aucune ligne `TAKEOVER` pour `source = SUPERVISOR_REPORT` ; `MORNING` à 07:00 locales du jour de `startAt` seulement si ce jour est postérieur au jour local de création ; `END_OF_SLOT = plannedEndAt + 10` puis `END_OF_SLOT_ADMIN = +10` ; **garde « jusqu'à l'arrivée » (`plannedEndAt` null) : `END_OF_SLOT = endOfLocalDay(startAt) + 10`, aucun rappel de clôture avant la fin de la journée locale (FR-016a, R3)** ; `SUPPORT_DECISION` toutes les 10 min, `maxAttempts = 3`, puis `SUPPORT_ESCALATION` ; recalcul après `UPDATE` (FR-008g) et `EXTEND`.
- [ ] T008 [P] Réécrire `backend/test/unit/coverage-state-machine.spec.ts` selon la table de transitions de data-model §4 : chaque transition autorisée (acteurs `ADMIN`, `ASSIGNEE`, `REQUESTER_TEACHER`, `SUPERVISOR`, `SYSTEM`) ; actions retirées `ACCEPT`, `WIDEN`, `RELEASE` refusées (`UNKNOWN_ACTION`) ; `EXPIRE` `BROADCAST→UNFILLED` absent ; `EXPIRE_UNFILLED` seulement depuis `PENDING` ; le surveillant n'a aucune action d'acceptation, de refus ni d'annulation (FR-008f) ; `CANCEL` par ADMIN depuis `PENDING`, `ACCEPTED`, `EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING` (FR-008b, FR-008e, FR-008h) ; `WITHDRAW` et `UPDATE` par l'enseignant auteur seulement en `PENDING` (FR-008g) ; statuts finaux `DONE`/`CLOSED`, `CANCELLED`, `UNFILLED`.
- [ ] T009 [P] Réécrire `backend/test/unit/coverage-policy.spec.ts` : matrice « Permissions par rôle » de plan.md (super admin, admin, surveillant, enseignant, autres employés), y compris : super admin passe tous les contrôles (FR-004b) ; les autres employés n'ont aucun accès (FR-023b) ; motif `reason` visible seulement de l'admin et du super admin (FR-023c) ; éligibilité = membre actif du groupe `SUPERVISORS` (R7).
- [ ] T010 [P] Test d'intégration `backend/test/integration/migration-0007.spec.ts` (contrats/migration.md, « Vérification ») : base en état `0005` avec un jeu de gardes dans chaque statut (`BROADCAST`, `UNFILLED` à venir et passée, `ACCEPTED`, `EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING`, `DONE`, `CLOSED`, `CANCELLED`), un compte `responsable` du seed, le groupe « Surveillants/Remplaçants » avec membres → application `0006` + `0007` → statuts attendus, un `RequestEvent STATUS_CHANGED` commentaire `migration-0007` par ligne modifiée, rôle `ADMIN`, groupes et `systemKey`, compte `admin`, compte technique `enseignant-anonymise`, réglages `coverage*` ; nombre de `RequestEvent`/`AuditLog` seulement augmenté ; garde-fou : `0007` refuse si une garde sans équivalent existe ; puis `0007/down.sql` et `0006/down.sql` restaurent l'état initial (aucun événement supprimé) et refusent quand des données nouvelles existent.
- [ ] T011 [P] Test d'intégration `backend/test/integration/admin-floors.spec.ts` : CRUD `/admin/floors` par le super admin (`FLOOR_CHANGED` audité), refus `404` pour admin et employés ; `warning: "NO_SUPERVISOR"` quand aucun surveillant n'est rattaché, sans blocage (FR-006a) ; `floorId` obligatoire à la création et à la modification d'une classe (`/admin/coverage/classes`) ; `floorId` facultatif sur `/admin/users` ; groupe à `systemKey` non supprimable ni désactivable (`409 SYSTEM_GROUP`).
- [ ] T012 [P] Test d'intégration `backend/test/integration/supervision-availability.spec.ts` (data-model §5) : candidats = membres actifs de `SUPERVISORS` ; tri étage de la classe d'abord puis les autres ; raisons `INACTIVE`, `ABSENT`, `UNAVAILABLE`, `ON_GUARD`, `SUPPORT` ; un renfort actif rend occupé ; chevauchement de plages (fin inconnue = +∞) ; assignation d'un indisponible refusée `409 NOT_AVAILABLE` (plus de `force`).
- [ ] T013 [P] Test d'intégration `backend/test/integration/supervision-reminders-job.spec.ts` (horloge `backend/test/utils/clock.ts`) : `CoverageRemindersJob.runOnce(now)` envoie chaque type au bon destinataire, une seule fois (idempotence, `attempts`, `resolvedAt`), écrit `REMINDER_SENT`/`ESCALATED` ; condition revérifiée avant envoi (ligne résolue `OBSOLETE` si l'affectation n'est plus concernée) ; deux exécutions concurrentes n'envoient pas en double ; **garde `plannedEndAt` null : aucun `COVERAGE_CLOSE_REMINDER` avant `endOfLocalDay(startAt) + 10 min`** ; `EXPIRE_UNFILLED` sur `PENDING` dont la fin est passée ; `CoverageDeadlinesJob` ne traite plus que `ARRIVAL` (`ACCEPTED`/`EN_ROUTE` → `LATE`).

### Schéma et migrations

- [ ] T014 Modifier `backend/prisma/schema.prisma` selon data-model.md : `Role` (`MANAGER` → `ADMIN`) ; `RequestStatus` + `PENDING` ; nouveaux enums `CoverageSource` (`TEACHER_REQUEST`, `SUPERVISOR_REPORT`, `ADMIN_DIRECT`), `CoverageType` (`LATENESS`, `ABSENCE`, `EMPTY_CLASS`), `GroupSystemKey` (`TEACHERS`, `SUPERVISORS`), `CoverageReminderKind`, `MergeProposalStatus` ; ajouts `RequestEventType`, `NotificationType`, `AuditAction` (data-model §1) ; modèles `Floor` (`name` varchar(60) unique, `position` int, `active` bool défaut true), `CoverageSupport` (index unique partiel « un seul renfort actif par (requestId, userId) » déclaré en SQL), `CoverageMergeProposal` (unique `(sourceRequestId, targetRequestId)`), `CoverageReminder` (index `(resolvedAt, dueAt)`, `resolution` varchar(30)) ; colonnes `CoverageDetail.source|type|teacherId|reason varchar(1000)|floorId|mergedIntoId|anonymizedAt` (toutes nullables en base), `SchoolClass.floorId`, `User.floorId`, `EmployeeGroup.systemKey` unique ; index `CoverageDetail (teacherId)`, `(floorId)`, `(source, type)`.
- [ ] T015 Écrire `backend/prisma/migrations/0006_supervision_schema/migration.sql` (purement additive : `ADD VALUE`, `CREATE TYPE`, `CREATE TABLE`, `ADD COLUMN` nullables, index, aucune donnée modifiée) et `down.sql` sur le modèle de `0002_coverage/down.sql` (garde-fou si les nouvelles tables ou colonnes contiennent des données ; recréation des enums sans les valeurs ajoutées ; suppression de la ligne `_prisma_migrations`). Le renommage du rôle n'est PAS dans 0006.
- [ ] T016 Écrire `backend/prisma/migrations/0007_supervision_data/migration.sql` (contracts/migration.md étape 2, points 1 à 8, une transaction) et `down.sql` (rétablissement depuis les événements `migration-0007` en **ajoutant** des événements `migration-0007-down`, garde-fous, suppression de la ligne `_prisma_migrations`). Fait passer T010 avec T015.
- [ ] T017 Créer `backend/scripts/supervision-preflight.ts` et le script `preflight:supervision` dans `backend/package.json` : rapport Markdown en lecture seule `supervision-preflight-<date>.md` avec sections A (membres du groupe : nom, identifiant, intitulé, rôle — validation V1), B (décompte par statut, statut cible, liste nominative « sans équivalent évident » — V2), C (12 mois glissants, nombre d'affectations anonymisées dès la première exécution — V3), et emplacements de signature (nom, date) pour V1–V3. Test : `backend/test/integration/supervision-preflight.spec.ts` (rapport attendu sur le jeu de T010, aucune écriture en base).

### Renommage technique du rôle (compilation)

- [ ] T018 Remplacer `Role.MANAGER` / `'MANAGER'` (au sens du rôle uniquement) par `ADMIN` dans `backend/src/**` (dont `settings/default-permissions.ts`, `settings/admin-settings.service.ts`, `common/authorization.ts`, `requests/domain/access-policy.ts` (`isAdministration`, `canCreateInCategory`), `requests/domain/visibility.ts` (demandes `DIRECT` et `PEER` visibles de tout admin), `categories/admin-categories.service.ts` (comptes éligibles aux catégories), `users/users.dto.ts`, `coverage/`) et `backend/prisma/seed.ts` ; NE PAS renommer `ClosureMode.MANAGER`, l'acteur `MANAGER` des machines à états, `RELEASE_BY_MANAGER` ni la source d'affectation `MANAGER_CHOICE` (R8). `npm run -w backend typecheck` vert.
- [ ] T019 [P] Mettre à jour `frontend/src/api/types.ts` (`Role` : `ADMIN`) et tous les usages de `'MANAGER'` au sens du rôle dans `frontend/src/**` (dont `features/admin/api.ts`, `SettingsAdminPage.tsx`, `UserFormDialog.tsx`, `features/requests/RequestListPage.tsx` (`isManager`), `features/admin/CategoryFormDialog.tsx` (`creatorRoles` par défaut et filtre des comptes éligibles ; PAS `closureMode: 'MANAGER'`)) ; `frontend/tests/api/enums-sync.test.ts` vert. `npm run -w frontend typecheck` vert.
- [ ] T020 [P] Adapter les tests qui référencent le rôle `MANAGER` (au sens du rôle) ou le compte `responsable` : seule la valeur ou l'identifiant change, les attendus restent identiques (FR-002, Q24). Liste établie le 2026-10-16 (`grep` sur `master` après la PR #11) :
  - **valeur du rôle** : `backend/test/unit/access-policy.spec.ts`, `unit/authorization.spec.ts`, `unit/audit-sanitize.spec.ts`, `integration/admin-users.spec.ts`, `integration/admin-categories.spec.ts`, `integration/categories-form-list.spec.ts`, `integration/reassign.spec.ts`, `integration/requests-circuit-b.spec.ts`, `integration/requests-create.spec.ts`, `integration/routing-modes.spec.ts` ; `frontend/tests/admin/admin-pages.test.tsx`, `admin/dashboard.test.tsx`, `requests/ApprovalPanel.test.tsx`, `requests/routing.test.tsx` ;
  - **compte `responsable` ou libellés** : `backend/test/integration/admin-audit.spec.ts`, `admin-dashboard.spec.ts`, `assignable-employees.spec.ts`, `auto-assignment-snapshot.spec.ts`, `history-priority.spec.ts`, `overdue-job.spec.ts`, `requests-actions-circuit-a.spec.ts`, `requests-search.spec.ts`, `search-performance.spec.ts`, `superadmin-notifications.spec.ts`, `backend/test/unit/notifications-recipients.spec.ts` ; `frontend/tests/requests/CreateRequestPage.test.tsx`, `requests/HistoryTimeline.test.tsx` ;
  - traités ailleurs : `coverage-policy.spec.ts` (T009), `coverage-state-machine.spec.ts` (T008), `seed.spec.ts` et `auth-helpers.ts` (T037), `coverage.spec.ts` (T038), `coverage-work-isolation.spec.ts` (T039), `coverage.test.tsx` (T040), e2e (T046, T082) ;
  - inchangés : `unit/request-state-machine.spec.ts` (acteur et mode de clôture `MANAGER`, pas le rôle), `MANAGER_CHOICE` dans `auto-assignment-snapshot.spec.ts`.

### Socle du domaine

- [ ] T021 [P] Ajouter `SCHOOL_TIMEZONE` à `backend/src/config/config.ts` (validation IANA via `Intl.DateTimeFormat`, défaut `Europe/Paris`) — fait passer T004.
- [ ] T022 [P] Créer `backend/src/common/school-time.ts` (fonctions pures sur `Intl`, aucune dépendance) — fait passer T005.
- [ ] T023 [P] Ajouter les clés `coverageUrgencyThresholdMinutes` (60, 5–720), `coverageEscalationMinutes` (5, 1–120), `coverageMorningReminderTime` ("07:00", `HH:MM`), `coverageCloseReminderMinutes` (10, 1–240), `coverageCloseEscalationMinutes` (10, 1–240), `coverageSupportReminderMinutes` (10, 1–120), `coverageSupportReminderMax` (3, 1–10), `coverageRetentionMonths` (12, 1–60) à `SETTING_DEFAULTS` et `SETTING_RULES` dans `backend/src/settings/settings.service.ts` ; libellés dans `frontend/src/features/admin/SettingsAdminPage.tsx`.
- [ ] T024 [P] Créer `backend/src/coverage/domain/coverage-status.ts` (`coverageMainStatus`, `MAIN_STATUS_VALUES`, `ACTIVE_STATUSES` incluant `PENDING` pour les listes, `FINAL_STATUSES`) — fait passer T006.
- [ ] T025 [P] Créer `backend/src/coverage/domain/coverage-reminders.ts` (calcul pur des lignes `CoverageReminder` à créer, recalculer ou résoudre pour chaque transition) — fait passer T007, y compris la règle « fin réputée = fin de journée locale » pour `plannedEndAt` null.
- [ ] T026 Réécrire `backend/src/coverage/domain/coverage-state-machine.ts` selon data-model §4 (supprimer `ACCEPT`, `WIDEN`, `RELEASE`, `EXPIRE` vers `UNFILLED` ; ajouter `PENDING`, `ASSIGN`, `CANCEL` étendu, `WITHDRAW`, `UPDATE`, `ATTACH_DECLARATION`, `EXPIRE_UNFILLED`, `SET_TEACHER`, `RELEASE_SUPPORT`, `REASSIGN` sur site) — fait passer T008.
- [ ] T027 Réécrire `backend/src/coverage/domain/coverage-policy.ts` : acteurs `ADMIN` (rôle `ADMIN` ou `SUPER_ADMIN`), `ASSIGNEE`, `REQUESTER_TEACHER`, `SUPERVISOR`, `SUPPORT` ; vue limitée sans `reason` pour le surveillant ; `isCoverageManagerUser` = rôle `ADMIN` ou `SUPER_ADMIN` dans `backend/src/coverage/coverage.service.ts` (R9) — fait passer T009.
- [ ] T028 Créer `backend/src/coverage/coverage-groups.ts` : `isTeacher(userId)`, `isSupervisor(userId)`, `supervisorIds()`, `teacherIds()` par `EmployeeGroup.systemKey` (jamais par nom, R7), et `adminRecipients(tx)` (admins actifs, à défaut super admins actifs) et `superAdminRecipients(tx)` (R11).
- [ ] T029 Modifier `backend/src/coverage/coverage-availability.ts` et `CoverageService.candidates` dans `backend/src/coverage/coverage.service.ts` : éligibilité `SUPERVISORS`, renfort actif = occupé (raison `SUPPORT`), tri par étage de la classe, suppression de `force` — fait passer T012.
- [ ] T030 Modifier `backend/src/coverage/coverage-actions.service.ts` : retirer `broadcastInTx`, `AcceptRateLimiter`, `ALREADY_TAKEN`, `coverage:taken`, `CoverageTarget` à la création ; destinataires « managers de catégorie » remplacés par `adminRecipients` ; création, recalcul et résolution des `CoverageReminder` via `coverage-reminders.ts` dans la même transaction que chaque transition ; événements `RequestEvent` pour chaque changement (sans nom ni motif dans les payloads, R5) ; `createRelief` crée la relève en `PENDING` (sans diffusion) ou `ACCEPTED` quand l'admin désigne le remplaçant (`REASSIGN` sur site, FR-008j).
- [ ] T031 Ajouter `copyFloor` à la création : `CoverageDetail.floorId` = étage de la classe au moment de la création (data-model §3) dans `backend/src/coverage/coverage-actions.service.ts`.
- [ ] T032 Créer `backend/src/scheduler/coverage-reminders.job.ts` (15 s, `pg_try_advisory_xact_lock(hashtext('coverage-reminders-job'))`, `FOR UPDATE SKIP LOCKED`, lots de 200, `runOnce(now?)`) traitant tous les types de `CoverageReminderKind` et la transition `EXPIRE_UNFILLED` ; modifier `backend/src/scheduler/coverage-deadlines.job.ts` pour ne garder que `ARRIVAL` ; enregistrer dans `backend/src/scheduler/scheduler.module.ts` — fait passer T013.
- [ ] T033 Ajouter les nouveaux types aux libellés et icônes de `frontend/src/features/notifications/api.ts` et aux enums de `frontend/src/api/types.ts` ; `frontend/tests/api/enums-sync.test.ts` vert.

### Étages et groupes (super administrateur)

- [ ] T034 Ajouter les routes `/admin/floors` (GET, POST, PATCH) dans `backend/src/coverage/coverage-admin.controller.ts` et `coverage-admin.service.ts` (`supervisorCount`, `warning: "NO_SUPERVISOR"`, audit `FLOOR_CHANGED`) ; `floorId` obligatoire sur les DTO de classe ; refus de suppression ou désactivation d'un groupe à `systemKey` (`409 SYSTEM_GROUP`) ; ajouter `FLOOR_CHANGED` et les nouvelles clés de détail à `ALLOWED_DETAIL_KEYS` de `backend/src/audit/audit.service.ts`.
- [ ] T035 [P] Ajouter `floorId` (facultatif) à `backend/src/users/users.dto.ts` et `users.service.ts` (fiche de compte, super admin seulement) — avec T034, fait passer T011.
- [ ] T036 [P] Écran `frontend/src/features/coverage/FloorsAdminPage.tsx` (liste, création, renommage, ordre, activation, avertissement « Étage sans surveillant » non bloquant) + route dans `frontend/src/features/admin/adminRoutes.tsx` ; champ « Étage » obligatoire dans `ClassesAdminPage.tsx` ; champ « Étage (surveillant) » dans `frontend/src/features/admin/UserFormDialog.tsx` ; test `frontend/tests/admin/floors.test.tsx` (accessibilité : libellés, focus, erreurs actionnables).

### Données de démonstration et tests existants

- [ ] T037 Mettre à jour `backend/prisma/seed.ts` : compte `admin` (ex-`responsable`, rôle `ADMIN`, « Admin — surveillante générale »), groupes « Surveillants » (`SUPERVISORS`) et « Enseignants » (`TEACHERS`), `enseignante` dans Enseignants, `surveillant` et un second surveillant `surveillant2` sur deux étages, étages « 1er étage » et « 2e étage », classes rattachées ; `reprographie` hors groupes ; mettre à jour `backend/test/utils/auth-helpers.ts`, `backend/test/integration/seed.spec.ts` et `e2e/support/accounts.ts`.
- [ ] T038 Adapter `backend/test/integration/coverage.spec.ts` : remplacer la préparation par diffusion/acceptation par `ASSIGN` de l'admin ; supprimer les cas 1 bis/1 ter de diffusion, 2 (acceptation concurrente), limite de débit, 2 bis, 3, 5, 5 bis, 6 (rediffusion), « taken » en direct, groupe vide — en consignant chaque suppression et sa raison (diffusion supprimée, FR-011a) dans `docs/validation/verification-004.md` ; conserver et faire passer présence QR/photo, relève, libération par l'admin, prolongation, retard d'arrivée, annulation, transitions interdites, écrans super admin, catégorie.
- [ ] T039 [P] Adapter `backend/test/integration/coverage-work-isolation.spec.ts`, `notifications.spec.ts` et `realtime.spec.ts` (plus de `coverage:taken`, destinataires admins) sans changer les attendus des demandes de travail.
- [ ] T040 Retirer l'onglet « À prendre », `OpenCoverageCard`, `OpenCoverageTab`, l'action `ACCEPT` (« Je prends »), `canAccept`, `useOpenCoverage` et l'élargissement de `frontend/src/features/coverage/CoveragePage.tsx`, `EmployeeViews.tsx`, `CoverageActions.tsx`, `api.ts`, `types.ts`, `labels.tsx` ; retirer `GET /coverage/open` et `CoverageService.open` côté backend ; adapter `frontend/tests/coverage/coverage.test.tsx` (suppression des cas « À prendre » consignée).
- [ ] T041 Afficher le statut principal et le sous-état en badge (data-model R1) dans les listes et le détail : `frontend/src/features/coverage/labels.tsx` (libellés « en attente », « assignée », « en cours », « terminée », « annulée », « non pourvue » ; badges « En route », « En retard », « Relève demandée », « Clôturée après validation »), `ManagerViews.tsx`, `CoverageDetailPage.tsx` ; exposer `mainStatus`/`subState` dans `backend/src/coverage/coverage.mapper.ts` ; test `frontend/tests/coverage/status-badges.test.tsx`.

**Checkpoint**: migrations montées et descendues (T010), suites backend et frontend vertes,
gardes existantes fonctionnelles par assignation de l'admin.

---

## Phase 3: User Story 4 - Rôle « Admin » à la place de « Responsable » (Priority: P1)

**Goal**: partout, « Admin » remplace « Responsable » sans perte d'accès ; l'espace du super
administrateur s'appelle « Administrateur » (FR-004 à FR-004d).

**Independent Test**: le compte `admin` (ex-`responsable`) retrouve tous ses droits selon le
mode de routage (Q22 : via l'administration, direct, entre enseignants), la réassignation et les
catégories qu'il gère ; aucun texte d'interface n'emploie « responsable » au sens du rôle.

### Tests for User Story 4

- [ ] T042 [P] [US4] Test d'intégration `backend/test/integration/role-admin-rename.spec.ts` : un ex-responsable migré (rôle `ADMIN`) conserve `RolePermission`, `Category.creatorRoles`, `CategoryManager` et les droits de chaque mode de routage (Q22) — `VIA_ADMIN` : validation ou refus (motif obligatoire), affectation, réaffectation, priorité et discussion dans les catégories qu'il gère ; `DIRECT` et `PEER` : consultation en lecture seule de toutes les demandes, aucune action, aucun message, aucune notification ; création dans toute catégorie active ; messages d'erreur de l'API sans « responsable » au sens du rôle ; le super admin reste distinct.
- [ ] T043 [P] [US4] Test `frontend/tests/admin/role-labels.test.tsx` : `ROLE_LABELS.ADMIN === 'Admin'`, `SUPER_ADMIN === 'Super administrateur'`, menu et titre de l'espace « Administrateur », `CLOSURE_LABELS.MANAGER === 'Par un admin'`, formulaire de catégorie « Admins de la catégorie », « Validation finale par un admin ».

### Implementation for User Story 4

- [ ] T044 [US4] Libellés dans `frontend/src/features/admin/labels.ts`, `AdminLayout.tsx`, `CategoryFormDialog.tsx`, `CategoriesAdminPage.tsx`, `UserFormDialog.tsx`, `frontend/src/app/AppLayout.tsx` (menu « Administrateur »), et les textes « responsable » au sens du rôle dans `frontend/src/features/**` (`EmployeeViews.tsx`, `ManagerViews.tsx`, `CoverageDetailPage.tsx`, `CoverageActions.tsx`, `CoveragePage.tsx`, `CreateCoveragePage.tsx`, `coverage/api.ts`, `CreateRequestPage.tsx`, `HistoryTimeline.tsx`, `ReassignDialog.tsx`, `requests/api.ts`, `RequestListPage.tsx` (onglet « Suivi »), les libellés des modes de routage dans `CategoryFormDialog.tsx` et `CategoriesAdminPage.tsx`, l'onglet Employés de `DashboardPage.tsx`) — fait passer T043. Désignent l'employé affecté (et non le rôle) mais sont reformulés pour éviter toute confusion avec « Admin » (décision du 2026-10-17) : colonnes « Responsable » de `DashboardPage.tsx` → « Employé affecté », aide « « Reçues » : demandes de la période dont l'employé est actuellement responsable » → « « Reçues » : demandes de la période actuellement affectées à l'employé », et `UNASSIGNED: 'Demande sans responsable'` de `features/notifications/api.ts` → « Demande sans employé affecté » (cohérent avec la carte « Sans employé affecté ») ; adapter `frontend/tests/admin/dashboard.test.tsx` et les tests de notifications concernés.
- [ ] T045 [P] [US4] Messages et commentaires « responsable » au sens du rôle dans `backend/src/**` (`coverage/coverage.service.ts`, `coverage.controller.ts`, `coverage.dto.ts`, `coverage-actions.service.ts`, `coverage-availability.ts`, `coverage-file-access.ts`, `domain/coverage-state-machine.ts`, `domain/coverage-policy.ts`, `categories/admin-categories.service.ts`, `requests/requests.service.ts`, `requests/requests.controller.ts`, `requests/request-transitions.service.ts`, `requests/domain/access-policy.ts`, `requests/domain/visibility.ts`, `messages/messages.service.ts`, `scheduler/overdue.job.ts`, `users/users.dto.ts`, `users/users.service.ts`) — fait passer T042.
- [ ] T046 [P] [US4] Adapter les specs e2e au compte `admin` et aux libellés : `e2e/us8-admin.spec.ts`, `e2e/us5-admin-validation.spec.ts`, `e2e/us6-deadlines.spec.ts`, `e2e/auth.spec.ts`, `e2e/admin-dashboard.spec.ts` (`e2e/coverage-class.spec.ts` : T082 ; `e2e/support/accounts.ts` : T037).
- [ ] T047 [P] [US4] Documentation : `README.md` (« Rôles : employé, admin, super administrateur »), `docs/ARCHITECTURE.md`, `docs/coverage-migration.md` ; note en tête de `specs/001-demandes-travail-vocales/spec.md` et `specs/003-corrections-audit-technique/spec.md` : « Depuis la fonctionnalité 004, le rôle "Responsable" s'appelle "Admin" ; la terminologie de la spécification courante fait foi » (FR-004d), sans autre réécriture.
- [ ] T048 [US4] Contrôle final : `git grep -in "responsable"` sur `backend/src`, `frontend/src`, `e2e`, `README.md`, `docs` ; chaque occurrence restante est justifiée (sens non lié au rôle) dans `docs/validation/verification-004.md` (SC-007).

**Checkpoint**: US4 livrable seule ; parcours existants (lot 1, gardes assignées) verts.

---

## Phase 4: User Story 1 - Signaler à l'avance un retard ou une absence (Priority: P1) 🎯 MVP

**Goal**: l'enseignant signale (aujourd'hui/demain, plage libre, classe, type, motif facultatif) ;
l'admin est notifiée, assigne un surveillant disponible ; le surveillant et l'enseignant sont
notifiés ; délai, escalade, rappel de 7 h, non pourvue, clôture et rappels de clôture.

**Independent Test**: `enseignante` signale un retard pour demain ; `admin` voit la demande
« en attente » et assigne `surveillant` ; `surveillant` voit l'affectation sans le motif ; il la
passe « en cours » puis « terminée » ; l'historique conserve qui, quand, classe et durée.

### Tests for User Story 1

- [ ] T049 [P] [US1] Test d'intégration `backend/test/integration/supervision-teacher-request.spec.ts` couvrant les scénarios d'acceptation 1 à 7 de US1 et : validation (date aujourd'hui/demain en `SCHOOL_TIMEZONE`, plage non entièrement passée, fin > début, `endTime` ou `durationMinutes`, une seule classe et une seule plage, FR-012) ; `400 INVALID_DATE`/`INVALID_RANGE`/`CLASS_INACTIVE` ; `PATCH` et `WITHDRAW` seulement en `PENDING` avec événement `UPDATED` tracé (FR-008g) ; `409 NOT_PENDING` après assignation ; `ASSIGN` par l'admin → `ACCEPTED`, `ASSIGNED` au surveillant **et à l'enseignant auteur** (classe, créneau, nom du surveillant, FR-017a) ; `REASSIGN` → `COVERAGE_LIFTED` à l'ancien, `ASSIGNED` au nouveau et à l'enseignant ; `CANCEL` admin ; le surveillant ne voit jamais `reason` (FR-023c) ; l'enseignant ne voit que ses demandes ; durée = `presenceAt` → `relievedAt` (FR-021).
- [ ] T050 [P] [US1] Test d'intégration `backend/test/integration/supervision-deadlines.spec.ts` (horloge simulée) : demande pour aujourd'hui dans 30 min → `COVERAGE_TAKEOVER_EXPIRED` URGENT aux admins à +2 min, `COVERAGE_ESCALATED` aux super admins à +5 min, arrêt de l'escalade à l'assignation, à l'annulation ou au retrait ; consultation de l'alerte sans effet ; demande pour 15 h à 7 h → aucun délai avant 14 h, puis même alerte et même escalade (FR-011d/e) ; demande pour demain → `COVERAGE_MORNING_REMINDER` à 07:00 si encore `PENDING`, rien sinon (FR-011f) ; aucun admin actif → super admins (R11) ; `PENDING` jamais assignée → `UNFILLED` après la fin de créneau (FR-008a) ; `END_OF_SLOT` à fin + 10 min vers le surveillant puis admins à + 20 min (FR-016a) ; liste admin : `PENDING` à délai expiré en tête.
- [ ] T051 [P] [US1] Tests frontend `frontend/tests/coverage/teacher-request.test.tsx` (formulaire : type, classe parmi toutes les classes, date aujourd'hui/demain, début, fin ou durée, motif facultatif ; erreurs par champ ; modification et retrait en attente ; accessibilité) et `frontend/tests/coverage/admin-queue.test.tsx` (file « En attente » priorisée, dialogue d'assignation avec candidats triés par étage et indisponibles marqués non sélectionnables).

### Implementation for User Story 1

- [ ] T052 [P] [US1] DTO `TeacherRequestDto` et `UpdateTeacherRequestDto` dans `backend/src/coverage/coverage.dto.ts` (contracts/rest-api.md : `type` `LATENESS|ABSENCE`, `classId`, `date` `YYYY-MM-DD`, `startTime`/`endTime` `HH:MM` ou `durationMinutes`, `reason` ≤ 1000, `clientId`, `version` pour la modification).
- [ ] T053 [US1] `CoverageService.createTeacherRequest`, `updateTeacherRequest` et action `WITHDRAW` dans `backend/src/coverage/coverage.service.ts` / `coverage-actions.service.ts` : source `TEACHER_REQUEST`, `teacherId` = demandeur, `requesterId` = enseignant, statut `PENDING`, `plannedEndAt` obligatoire, reminders `TAKEOVER`/`MORNING`, notification `COVERAGE_REQUESTED` (ou `COVERAGE_UPDATED`) aux admins.
- [ ] T054 [US1] Routes `POST /coverage/teacher-requests`, `PATCH /coverage/:id/teacher-request`, `GET /coverage/my-requests` dans `backend/src/coverage/coverage.controller.ts` ; filtres `mainStatus`, `source`, `type`, `floorId`, `classId`, `teacherId`, `from`, `to` et tri prioritaire sur `GET /coverage` ; `404` pour les non-autorisés avec `ACCESS_DENIED` journalisé.
- [ ] T055 [US1] Vues par acteur dans `backend/src/coverage/coverage.mapper.ts` (admin complète avec `reason` ; surveillant : classe, étage, créneau, type, statut, jamais `reason` ; enseignant : sa demande, statut, nom du surveillant) et notification `ASSIGNED` à l'enseignant auteur lors de `ASSIGN`/`REASSIGN` dans `coverage-actions.service.ts` (FR-017a).
- [ ] T056 [US1] Traitements `TAKEOVER`, `TAKEOVER_ESCALATION`, `MORNING`, `END_OF_SLOT`, `END_OF_SLOT_ADMIN` et `EXPIRE_UNFILLED` dans `backend/src/scheduler/coverage-reminders.job.ts` (destinataires et priorités de contracts/realtime-events.md) — fait passer T050.
- [ ] T057 [P] [US1] Écran `frontend/src/features/coverage/TeacherRequestPage.tsx` (création et modification) et liste « Mes signalements » dans `frontend/src/features/coverage/TeacherViews.tsx` ; hooks dans `frontend/src/features/coverage/api.ts` ; routes `/gardes/signaler` et `/gardes/signalements/:id` dans `frontend/src/app/routes.tsx`.
- [ ] T058 [US1] File admin dans `frontend/src/features/coverage/ManagerViews.tsx` : onglet « En attente » en tête, délais expirés mis en évidence, dialogue `AssignDialog.tsx` (candidats `/coverage/:id/candidates`, étage d'abord, raisons d'indisponibilité), actions annuler et réassigner ; notifications et Snackbar via `NotificationCenter` existant.
- [ ] T059 [US1] Visibilité du menu « Gardes » dans `frontend/src/app/AppLayout.tsx` : admin, super admin, membres `SUPERVISORS` ou `TEACHERS` ; rien pour les autres employés (FR-023b) ; exposer `isTeacher`/`isSupervisor` dans la réponse de session (`backend/src/auth/`) ; test `frontend/tests/coverage/navigation.test.tsx`.

**Checkpoint**: MVP — parcours enseignant → admin → surveillant de bout en bout, délais et
rappels compris.

---

## Phase 5: User Story 2 - Déclarer une classe vide pendant le tour (Priority: P1)

**Goal**: le surveillant déclare une classe vide (enseignant facultatif) ; l'affectation naît à
son nom « en cours » ; admin alertée en temps réel ; doublons, renforts, propositions de
rattachement, double affectation (FR-015 à FR-015j).

**Independent Test**: `surveillant` déclare une classe vide ; `admin` reçoit une alerte mise en
évidence ; `surveillant2` déclare la même classe et devient renfort ; `surveillant` clôture.

### Tests for User Story 2

- [ ] T060 [P] [US2] Tests unitaires `backend/test/unit/coverage-duplicates.spec.ts` pour `backend/src/coverage/domain/coverage-duplicates.ts` : table de data-model §6 (enseignant précisé + `PENDING` → rattachement `ATTACH_DECLARATION` ; `ACCEPTED`/`EN_ROUTE`/`LATE` → `ALREADY_ASSIGNED` sans modification ; `ON_DUTY`/`RELIEF_PENDING` sur la classe → `SUPPORT` ; enseignant non précisé + demande existante → `MERGE_PROPOSED` ; sinon `CREATED`) ; chevauchement sur `[now, fin de journée)`.
- [ ] T061 [P] [US2] Test d'intégration `backend/test/integration/supervision-empty-class.spec.ts` : scénarios d'acceptation 1 à 4 de US2 ; déclaration jamais bloquée sans `teacherId` (FR-015a) ; `teacherId` hors `TEACHERS` refusé ; `ON_DUTY` immédiat, `presenceAt` = déclaration ; QR facultatif enregistré en `CoveragePresence` (R10) ; aucune ligne `TAKEOVER` ; `COVERAGE_EMPTY_CLASS` URGENT aux admins ; chaque `outcome` de contracts/rest-api.md ; surveillant déjà occupé → affectation créée quand même + `COVERAGE_DOUBLE_ASSIGNMENT` URGENT (FR-015j) ; renfort occupé jusqu'à libération par l'admin (`RELEASE_SUPPORT`) ou passage « terminée », rappels `SUPPORT_DECISION` toutes les 10 min, 3 au plus, puis `COVERAGE_ESCALATED` aux super admins (FR-015i) ; propositions : décision `CONFIRM` (absorbée `CANCELLED` + `mergedIntoId`, R6) et `REJECT`, décision après coup, `finalPresentedAt` quand les deux sont finales, événements `MERGE_DECIDED` et audit `COVERAGE_MERGE_DECIDED` (FR-015g, FR-015h) ; `SET_TEACHER` par l'admin tracé `TEACHER_SET` (FR-015c) ; `CANCEL` d'une affectation en cours par l'admin seulement (FR-008h).
- [ ] T062 [P] [US2] Tests frontend `frontend/tests/coverage/empty-class.test.tsx` (déclaration en deux gestes, enseignant facultatif choisi dans le groupe Enseignants, messages selon `outcome`, accessibilité) et `frontend/tests/notifications/urgent-alert.test.tsx` (alerte URGENT : `role="alert"`, `aria-live="assertive"`, Snackbar persistant ; signal sonore désactivable, jamais joué sans interaction préalable, jamais seul porteur de l'information).

### Implementation for User Story 2

- [ ] T063 [P] [US2] Créer `backend/src/coverage/domain/coverage-duplicates.ts` (pur) — fait passer T060.
- [ ] T064 [US2] `CoverageService.declareEmptyClass` et route `POST /coverage/empty-class` (`backend/src/coverage/coverage.service.ts`, `coverage.controller.ts`, `coverage.dto.ts` : `classId`, `teacherId|null`, `qrToken?`, `clientId`) : source `SUPERVISOR_REPORT`, type `EMPTY_CLASS`, assignee = déclarant, `ON_DUTY`, rattachement, renfort (`CoverageSupport`), proposition (`CoverageMergeProposal`), double affectation, notifications, reminders `END_OF_SLOT` et `SUPPORT_DECISION`.
- [ ] T065 [US2] Actions `RELEASE_SUPPORT` et `SET_TEACHER`, libération des renforts au passage `DONE`, et routes `GET /coverage/merge-proposals`, `POST /coverage/merge-proposals/:id/decision` dans `backend/src/coverage/coverage-actions.service.ts` et `coverage.controller.ts`.
- [ ] T066 [US2] Traitements `SUPPORT_DECISION` et `SUPPORT_ESCALATION` dans `backend/src/scheduler/coverage-reminders.job.ts` — avec T064 et T065, fait passer T061.
- [ ] T067 [P] [US2] Écran `frontend/src/features/coverage/EmptyClassPage.tsx` (choix de la classe ou QR via `PresencePage.tsx`, enseignant facultatif, résultat selon `outcome`) + route `/gardes/classe-vide` dans `frontend/src/app/routes.tsx` ; liste « Mes affectations » du surveillant dans `EmployeeViews.tsx` (affectations et renforts, bouton « Terminer »).
- [ ] T068 [US2] Côté admin dans `frontend/src/features/coverage/ManagerViews.tsx` et `CoverageDetailPage.tsx` : renforts (libérer), propositions de rattachement (confirmer/refuser, mention « non tranché »), correction de l'enseignant, alerte double affectation.
- [ ] T069 [US2] Signal sonore facultatif dans `frontend/src/features/notifications/NotificationCenter.tsx` (Web Audio API, préférence locale désactivable, déclenché seulement après une interaction utilisateur, toujours accompagné du signal visuel existant) — fait passer T062.

**Checkpoint**: US1 et US2 fonctionnent indépendamment.

---

## Phase 6: User Story 3 - Créer une affectation directe (Priority: P2)

**Goal**: l'admin crée une affectation (classe, type, plage, surveillant disponible) sans demande
préalable ; réassignation sur affectation assignée et en cours ; annulation (FR-008e, FR-008j,
FR-019).

**Independent Test**: `admin` crée une affectation directe pour `surveillant` ; un surveillant
occupé est refusé ; `admin` réassigne une affectation en cours à `surveillant2`, `surveillant`
n'est libéré qu'à la présence de `surveillant2`.

### Tests for User Story 3

- [ ] T070 [P] [US3] Test d'intégration `backend/test/integration/supervision-direct.spec.ts` : scénarios 1 à 3 de US3 ; `POST /coverage` naît `ACCEPTED`, source `ADMIN_DIRECT`, `type` obligatoire, `endAt` obligatoire, `teacherId` facultatif ; champs retirés (`groupIds`, `categoryId`, `estimatedMinutes`, `absentTeacher`, `force`) refusés ; `409 NOT_AVAILABLE` ; réassignation en `ACCEPTED` (statut inchangé, `COVERAGE_LIFTED` et `ASSIGNED`, `REASSIGNED` tracé avec ancien et nouveau, FR-008k) ; réassignation en `ON_DUTY` → relève **assignée** au nouveau, l'ancien libéré par `RELIEVE` système à la présence du nouveau, statut principal « en cours » conservé (FR-008j) ; refus pour enseignant et surveillant journalisés.
- [ ] T071 [P] [US3] Test frontend `frontend/tests/coverage/direct-assignment.test.tsx` (formulaire : classe, type, enseignant facultatif, début, fin, surveillant parmi les disponibles ; erreurs ; accessibilité).

### Implementation for User Story 3

- [ ] T072 [US3] Modifier `CreateCoverageDto` et `CoverageService.create` dans `backend/src/coverage/coverage.dto.ts` et `coverage.service.ts` (contracts/rest-api.md `POST /coverage`) : catégorie de garde résolue côté serveur, `ACCEPTED`, `END_OF_SLOT`, notification `ASSIGNED`.
- [ ] T073 [US3] `REASSIGN` sur `ON_DUTY`/`RELIEF_PENDING` via `createRelief` avec remplaçant désigné dans `backend/src/coverage/coverage-actions.service.ts` — fait passer T070 avec T072.
- [ ] T074 [US3] Réécrire `frontend/src/features/coverage/CreateCoveragePage.tsx` (affectation directe ; plus de groupes ni de diffusion) et l'action « Réassigner » dans `CoverageActions.tsx` pour les statuts assignée et en cours — fait passer T071.

**Checkpoint**: US1, US2, US3 indépendantes et vertes.

---

## Phase 7: User Story 5 - Historique, statistiques et conservation (Priority: P3)

**Goal**: historique complet et statistiques (FR-020 à FR-022, FR-008i, FR-015b, FR-015h) ;
anonymisation à 12 mois glissants (FR-023a).

**Independent Test**: après un jeu d'affectations terminées, annulées, non pourvues et en doublon,
`admin` obtient des chiffres conformes à data-model §7 ; l'anonymisation efface l'enseignant et le
motif sans toucher à l'historique ni à l'audit.

### Tests for User Story 5

- [ ] T075 [P] [US5] Tests unitaires `backend/test/unit/coverage-stats.spec.ts` pour `backend/src/coverage/domain/coverage-stats.ts` : règles de data-model §7 (événements hors annulées et hors `mergedIntoId` ; « enseignant non précisé » ; durée moyenne `DONE`/`CLOSED` ; taux de non pourvue ; annulées à part ; doublons `PENDING` comptés une fois, rubrique « non tranché » si `finalPresentedAt`, `REJECTED` deux, `CONFIRMED` un ; correction après coup).
- [ ] T076 [P] [US5] Test d'intégration `backend/test/integration/supervision-stats.spec.ts` : `GET /coverage/stats` par enseignant, classe, période (semaine, mois, fuseau de l'école) ; accès admin et super admin seulement (`404` sinon) ; aucun export ; scénarios 1 et 2 de US5.
- [ ] T077 [P] [US5] Test d'intégration `backend/test/integration/supervision-anonymization.spec.ts` : affectations finales de plus de `coverageRetentionMonths` anonymisées (`teacherId`, `absentTeacher`, `reason` à null ; `requesterId` → compte `enseignant-anonymise` et `description` à null pour une demande enseignant ; `anonymizedAt`) ; affectations récentes ou non finales intactes ; événement `ANONYMIZED` ajouté sans donnée personnelle ; audit `COVERAGE_ANONYMIZED` ; **aucune ligne `RequestEvent`, `AuditLog` ni `Notification` modifiée** ; idempotence.

### Implementation for User Story 5

- [ ] T078 [P] [US5] Créer `backend/src/coverage/domain/coverage-stats.ts` (pur) et `backend/src/coverage/coverage-stats.service.ts` + route `GET /coverage/stats` dans `coverage.controller.ts` — fait passer T075 et T076.
- [ ] T079 [P] [US5] Créer `backend/src/coverage/coverage-anonymization.service.ts` et `backend/src/scheduler/coverage-anonymization.job.ts` (toutes les heures, verrou consultatif, lots de 200, idempotent via `anonymizedAt`), enregistré dans `scheduler.module.ts` ; ajouter `COVERAGE_ANONYMIZED` aux clés autorisées de l'audit — fait passer T077.
- [ ] T080 [US5] Écran `frontend/src/features/coverage/CoverageStatsPage.tsx` (filtres période et regroupement, tableaux accessibles, « Enseignant non précisé », annulées et « non tranchés » à part) et historique détaillé dans `CoverageDetailPage.tsx` (sources, statuts successifs, auteurs, réassignations, fusions, renforts) ; route `/gardes/statistiques` ; test `frontend/tests/coverage/stats.test.tsx`.

**Checkpoint**: toutes les stories livrées.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T081 [P] Test d'intégration transversal `backend/test/integration/supervision-permissions.spec.ts` : chaque route du module × chaque rôle de la matrice de plan.md ; refus journalisés `ACCESS_DENIED` ; `404` hors périmètre (principe V).
- [ ] T082 Réécrire `e2e/coverage-class.spec.ts` en trois parcours à 360, 768 et 1280 px : demande enseignant → assignation → en cours → terminée ; classe vide → seconde déclaration en renfort → décision de l'admin ; affectation directe → réassignation ; et `e2e/a11y-responsive.spec.ts` étendu aux nouveaux écrans (pas de défilement horizontal à 320 px, axe sans violation).
- [ ] T083 [P] Mettre à jour `docs/ARCHITECTURE.md` (module affectations, jobs, statuts dérivés) et `docs/coverage-migration.md` (renvoi vers `specs/004-retards-affectation-surveillants/contracts/migration.md`, procédure de pré-contrôle et de retour arrière).
- [ ] T084 Répétition de migration sur une copie de base (quickstart.md, « Migration ») : pré-contrôle, `0006`, `0007`, contrôles, `down.sql` à blanc ; consigner les résultats dans `docs/validation/verification-004.md`.
- [ ] T085 Dérouler les 11 scénarios manuels de `quickstart.md` et consigner les résultats dans `docs/validation/verification-004.md`.
- [ ] T086 `npm run verify` (lint, tous les tests, `npm audit --audit-level=high`), `npm run -w backend typecheck`, `npm run -w frontend typecheck`, Playwright complet ; consigner dans `docs/validation/verification-004.md` ; aucune nouvelle dépendance dans `package-lock.json` (R15).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance.
- **Foundational (Phase 2)** : après Setup ; **bloque toutes les stories**. Dans la phase : tests
  T004–T013 d'abord ; T014 → T015 → T016 → T017 ; T018–T020 après T014 ; T021–T025 en parallèle ;
  T026 → T027 → T028 → T029 → T030 → T031 → T032 ; T034/T035 → T036 ; T037 avant T038–T041.
- **US4 (Phase 3)** : après Foundational.
- **US1 (Phase 4)** : après Foundational ; indépendante de US4 fonctionnellement (le renommage
  technique est fait en T018), mais exécutée après US4 pour stabiliser les libellés.
- **US2 (Phase 5)** : après Foundational ; réutilise la file admin de US1 (T058) pour l'affichage,
  sans en dépendre pour ses tests backend.
- **US3 (Phase 6)** : après Foundational ; réutilise `AssignDialog` (T058) côté interface.
- **US5 (Phase 7)** : après Foundational ; ses tests construisent leurs propres jeux de données.
- **Polish (Phase 8)** : après toutes les stories.

### Within Each User Story

Tests rouges → domaine pur → services → routes → jobs → interface → checkpoint.

### Parallel Opportunities

- Phase 2 : T004–T013 (fichiers de test distincts) ; T019/T020 ; T021–T025 ; T035/T036 ; T039.
- US4 : T042/T043 ; T045/T046/T047.
- US1 : T049/T050/T051 ; T052 et T057.
- US2 : T060/T061/T062 ; T063 et T067.
- US3 : T070/T071.
- US5 : T075/T076/T077 ; T078/T079.
- Une fois la Phase 2 terminée, US2, US3 et US5 (backend) peuvent avancer en parallèle de US1.

## Parallel Example: User Story 1

```text
# Tests (ensemble, avant tout code US1)
T049 backend/test/integration/supervision-teacher-request.spec.ts
T050 backend/test/integration/supervision-deadlines.spec.ts
T051 frontend/tests/coverage/teacher-request.test.tsx + admin-queue.test.tsx

# Puis en parallèle
T052 backend/src/coverage/coverage.dto.ts
T057 frontend/src/features/coverage/TeacherRequestPage.tsx
```

## Parallel Example: User Story 2

```text
T060 backend/test/unit/coverage-duplicates.spec.ts
T061 backend/test/integration/supervision-empty-class.spec.ts
T062 frontend/tests/coverage/empty-class.test.tsx + notifications/urgent-alert.test.tsx
# puis
T063 backend/src/coverage/domain/coverage-duplicates.ts
T067 frontend/src/features/coverage/EmptyClassPage.tsx
```

## Implementation Strategy

### MVP First

1. Phase 1 et Phase 2 (dont migrations montées/descendues et tests de gardes adaptés).
2. Phase 3 (US4) : renommage visible, sans risque fonctionnel.
3. Phase 4 (US1) : **MVP** — l'enseignant signale, l'admin assigne, le surveillant intervient.
4. **STOP et valider** : quickstart scénarios 1, 2, 3, 8, 9, 10.

### Incremental Delivery

US2 (classe vide, la situation la plus fréquente) → US3 (affectation directe) → US5 (statistiques
et conservation). Chaque story ajoute de la valeur sans casser les précédentes ; la suite
complète reste verte à chaque checkpoint.

### Mise en production

Uniquement après T084–T086 et les validations V1–V3 signées (contracts/migration.md, étape 0).

## Notes

- [P] = fichiers distincts, pas de dépendance sur une tâche inachevée.
- Les tests sont écrits et constatés rouges avant l'implémentation (principe I).
- Commiter après chaque tâche ou groupe logique ; ne jamais mélanger 004 avec une autre
  fonctionnalité dans un commit.
- `RequestEvent` et `AuditLog` : uniquement des ajouts, partout, y compris migration et
  anonymisation (principe V).
