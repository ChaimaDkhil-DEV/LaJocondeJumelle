# Research — 004 Retards et absences des enseignants, affectation des surveillants

**Date** : 2026-10-16 · **Spec** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md)

Chaque décision indique : la décision, la raison, les alternatives écartées. « Validée » signifie
tranchée par l'utilisateur le 2026-10-16 (questions techniques posées pendant `/speckit-plan`).
Les références de code renvoient à la branche `003-corrections-audit-technique`.

## Constats de départ (lus dans le code)

- Une garde est une `Request` (`kind = COVERAGE`) + `CoverageDetail` 1-1. La machine d'états pure
  est `backend/src/coverage/domain/coverage-state-machine.ts` (`TRANSITIONS`, l. 188-232) ; les
  effets (mise à jour conditionnelle `{id, status, version}`, événements, audit, notifications)
  sont dans `coverage-actions.service.ts` (`commit`, l. 265-535).
- Diffusion : `BROADCAST` posé à la création (`coverage.service.ts:161`), par `createRelief` et
  par `RELEASE` ; `broadcastInTx` notifie les membres disponibles des groupes ciblés ; `ACCEPT`
  (acteur `CANDIDATE`) prend la garde.
- Disponibilité : `coverage-availability.ts` — raisons `INACTIVE`, `ABSENT`, `UNAVAILABLE`,
  `ON_GUARD` (gardes actives qui chevauchent, `plannedEndAt` null = +∞) ; verrou
  `pg_advisory_xact_lock` par employé.
- Échéances : `Request.currentStage/currentDueAt/overdueStage` ; `CoverageDeadlinesJob`
  (15 s, verrou consultatif) exécute `EXPIRE` (BROADCAST→UNFILLED, ACCEPTED/EN_ROUTE→LATE).
  Aucun mécanisme générique de rappel ; `warnAt` est calculé mais lu par aucun job.
- `RequestEvent` et `AuditLog` : triggers `forbid_modification()` sur UPDATE/DELETE/TRUNCATE
  (`0001_init`). INSERT et DDL restent permis.
- Notifications : `notifyInTx(tx, userIds, actorId, {type, requestId, priority})`, publiées après
  commit (Socket.IO, salle par utilisateur). `priority = URGENT` déclenche déjà dans
  `NotificationCenter.tsx` une mise en évidence visuelle, une région `aria-live="assertive"` et
  un Snackbar persistant `role="alert"`. **Aucun son.** Aucun e-mail, SMS, push ni PWA.
- Fuseau : l'API tourne en UTC ; seul le service `backup` reçoit `TZ` (défaut `Europe/Paris`).
- Migrations : `0001_init`, `0002_coverage` (+ `down.sql`), `0003_request_event_seq`, puis dans `master` après la spécification : `0004_superadmin_notifications` et `0005_routing_mode` (+ `down.sql`). Les migrations de cette fonctionnalité sont donc `0006` et `0007`.
  `deploy/api-entrypoint.sh` exige une sauvegarde récente avant toute migration en attente.

## R1 — Statuts principaux et sous-états : dérivés de `Request.status` (validée)

- **Décision** : `Request.status` reste l'unique source de vérité. On ajoute la valeur
  `PENDING` (« en attente ») à `RequestStatus`. Le statut principal et le sous-état sont
  calculés par une fonction pure `coverageMainStatus(status)` :

  | `Request.status` | Statut principal | Sous-état (badge) |
  |---|---|---|
  | `PENDING` | en attente | — |
  | `ACCEPTED` | assignée | — |
  | `EN_ROUTE` | assignée | En route |
  | `LATE` | assignée | En retard |
  | `ON_DUTY` | en cours | — |
  | `RELIEF_PENDING` | en cours | Relève demandée |
  | `DONE` | terminée | — |
  | `CLOSED` | terminée | Clôturée après validation |
  | `CANCELLED` | annulée | — |
  | `UNFILLED` | non pourvue | — |
  | `BROADCAST` | *(obsolète : plus jamais posé ; migré vers `PENDING`)* | — |

- **Raison** : une seule source de vérité, aucune réécriture d'historique, migration de données
  minimale (FR-008c, FR-008d), filtres et statistiques sur le statut principal par simple
  ensemble de valeurs.
- **Alternatives écartées** : colonnes `mainStatus`/`subState` sur `CoverageDetail` (deux sources
  à synchroniser, migration de toutes les lignes).
- **Conséquence** : `UNFILLED` change de sens — il ne signifie plus « délai de prise en charge
  dépassé » mais « créneau passé sans assignation » (FR-008a). La valeur `BROADCAST` reste dans
  l'enum (la retirer imposerait de recréer le type et de réécrire l'historique).

## R2 — Rappels, délais et escalades : table d'échéances unique (validée)

- **Décision** : table `CoverageReminder` (affectation, type, cible, échéance, tentatives,
  plafond, intervalle, résolution). Un job unique `CoverageRemindersJob` (15 s, verrou
  consultatif, `FOR UPDATE SKIP LOCKED`) traite les lignes échues. Types : `TAKEOVER`,
  `TAKEOVER_ESCALATION`, `MORNING`, `END_OF_SLOT`, `END_OF_SLOT_ADMIN`, `SUPPORT_DECISION`,
  `SUPPORT_ESCALATION`.
- **Raison** : sept minuteries hétérogènes (dont une répétée avec plafond) ; une table rend chaque
  envoi idempotent, traçable et testable sans migration supplémentaire par type.
- **Alternatives écartées** : colonnes horodatées sur `CoverageDetail` (8-10 colonnes, répétition
  du renfort mal représentée) ; réutiliser `currentStage/currentDueAt` (une seule échéance à la
  fois, alors que délai de prise en charge, rappel du matin et escalade coexistent).
- **Conservé** : `currentStage = ARRIVAL` et `EXPIRE` vers `LATE` (délai d'arrivée, FR-011b).
  Retiré : l'étape `TAKEOVER` sur `currentStage` (remplacée par `CoverageReminder.TAKEOVER`).

## R3 — Calcul des échéances

- **Délai de prise en charge** (FR-011d) : à la création d'une demande `PENDING` (hors classe
  vide), une ligne `TAKEOVER` avec `dueAt = max(now, startAt − seuil) + délai`. Seuil = réglage
  `coverageUrgencyThresholdMinutes` (60) ; délai = `DeadlineRule.takeoverMinutes` de la catégorie
  de garde (2, déjà réglable par le super administrateur). À l'échéance : notification URGENT aux
  admins, puis ligne `TAKEOVER_ESCALATION` à `+ coverageEscalationMinutes` (5) vers les super
  administrateurs. Résolution de toutes les lignes ouvertes à l'assignation ou à l'annulation.
- **Modification par l'enseignant** (FR-008g) : les lignes ouvertes sont recalculées.
- **Rappel du matin** (FR-011f) : si la date locale de `startAt` est postérieure à la date locale
  de création, ligne `MORNING` à `coverageMorningReminderTime` (« 07:00 ») du jour de `startAt` ;
  envoyée aux admins seulement si l'affectation est encore `PENDING`.
- **Fin de créneau** (FR-016a) : à l'assignation (ou à la création « en cours »), ligne
  `END_OF_SLOT` à `plannedEndAt + coverageCloseReminderMinutes` (10) vers le surveillant ; sans
  clôture, ligne `END_OF_SLOT_ADMIN` à `+ coverageCloseEscalationMinutes` (10) vers les admins.
  Recalculée à chaque prolongation (`EXTEND`).
- **Renfort** (FR-015i) : ligne `SUPPORT_DECISION` toutes les `coverageSupportReminderMinutes`
  (10), au plus `coverageSupportReminderMax` (3) envois, puis `SUPPORT_ESCALATION` vers les super
  administrateurs.
- **Non pourvue** (FR-008a) : le même job passe en `UNFILLED` (transition système) toute
  affectation `PENDING` dont la fin de créneau est passée.
- **Fin de créneau inconnue** (gardes anciennes « jusqu'à l'arrivée », `plannedEndAt` null) :
  fin réputée = fin de la journée locale de `startAt`. Les nouvelles demandes ont toujours une fin
  (FR-012) ; l'affectation directe exige aussi une fin.

## R4 — Fuseau horaire de l'école : `SCHOOL_TIMEZONE` (validée)

- **Décision** : nouvelle variable d'environnement `SCHOOL_TIMEZONE`, validée au démarrage par
  `backend/src/config` (identifiant IANA accepté par `Intl.DateTimeFormat`), défaut
  `Europe/Paris`, branchée sur `TZ` dans `deploy/docker-compose.yml`. Calculs « aujourd'hui /
  demain », 7 h 00 et fin de journée via un module pur `school-time.ts` utilisant `Intl` (aucune
  dépendance).
- **Alternatives écartées** : fuseau en dur (changement de code si l'école change) ; `TZ` du
  processus Node (effets de bord sur tous les horodatages et les tests).

## R5 — Rétention et anonymisation (validée)

- **Décision** : âge glissant. Réglage `coverageRetentionMonths` (12). Job quotidien
  `CoverageAnonymizationJob` (intervalle horaire, verrou, idempotent via `anonymizedAt`) :
  pour chaque affectation finale (terminée, annulée, non pourvue) créée il y a plus de N mois,
  `CoverageDetail.teacherId = null`, `absentTeacher = null`, `reason = null`, `anonymizedAt = now` ;
  si l'affectation vient d'une demande enseignant, `Request.requesterId` est remplacé par le
  compte technique inactif `enseignant-anonymise` et `Request.description` vidée. Un événement
  `ANONYMIZED` (sans donnée personnelle) est ajouté et une entrée d'audit `COVERAGE_ANONYMIZED`
  (comptes, sans identité) écrite.
- **Non touchés** : `RequestEvent`, `AuditLog` (append-only, principe V) et `Notification`
  (historique de réception). Ils gardent des **identifiants** d'auteur, jamais de nom ni de motif
  (les nouveaux événements n'écrivent ni motif ni nom d'enseignant) ; ce lien résiduel est
  documenté et l'accès à ces historiques reste restreint (FR-023).
- **Alternatives écartées** : événements sans `actorId` (affaiblit la traçabilité) ; bascule à
  date fixe de rentrée (durée de conservation réelle variable de 0 à 12 mois).

## R6 — Fusion de doublons (validée)

- **Décision** : à la confirmation, l'affectation absorbée (déclaration du surveillant) passe
  `CANCELLED` avec `mergedIntoId` vers l'affectation conservée ; le déclarant est reporté sur
  l'affectation conservée selon FR-015d/e/f (prise en charge si `PENDING`, renfort sinon). Les
  statistiques excluent toute affectation ayant `mergedIntoId` (ni retard, ni annulation).
  Propositions dans `CoverageMergeProposal` (`PENDING`, `CONFIRMED`, `REJECTED`) ; « non
  tranché » = `PENDING` après la dernière présentation (`finalPresentedAt`).

## R7 — Identification des enseignants et surveillants : groupes à clé système

- **Décision** : colonne `EmployeeGroup.systemKey` (enum `GroupSystemKey` : `TEACHERS`,
  `SUPERVISORS`, unique, nullable). Le groupe « Surveillants/Remplaçants » est renommé
  « Surveillants » et reçoit `SUPERVISORS` ; un groupe « Enseignants » (`TEACHERS`) est créé vide.
  Le code identifie les groupes par clé, jamais par nom (le super administrateur peut renommer).
- **Éligibilité à une affectation** : membre actif du groupe `SUPERVISORS` (remplace le contrôle
  actuel « rôle EMPLOYEE », `coverage-actions.service.ts:624-633`). Un super administrateur membre
  du groupe est donc assignable (FR-004b).
- **Alternative écartée** : repérage par nom de groupe (fragile au renommage).

## R8 — Renommage du rôle

- **Décision** : `ALTER TYPE "Role" RENAME VALUE 'MANAGER' TO 'ADMIN'` (réversible par
  l'opération inverse, met à jour automatiquement `User.role`, `Category.creatorRoles`,
  `RolePermission`). Dans le code, `Role.MANAGER` → `Role.ADMIN`. Les autres identifiants
  techniques contenant `MANAGER` (`ClosureMode.MANAGER`, acteur `MANAGER` des politiques,
  `RELEASE_BY_MANAGER`) ne désignent pas le rôle et sont conservés ; seuls leurs libellés
  d'interface changent (« Par un admin »). Espace `/admin/*` : libellé « Administrateur ».
- **Compte de démonstration** : `responsable` → `admin` dans `seed.ts`, `e2e/support/accounts.ts`,
  `test/utils/auth-helpers.ts` ; la migration de données renomme aussi le compte en base s'il
  existe, si l'identifiant `admin` est libre et s'il porte le nom affiché du seed (« Responsable
  administratif »), afin de ne jamais toucher un compte réel.
- **Documentation** : note en tête de `specs/001…/spec.md` et `specs/003…/spec.md` (FR-004d),
  `README.md`, `docs/ARCHITECTURE.md`, `docs/coverage-migration.md` mis à jour.

## R9 — Gestion des gardes : tous les admins

- **Décision** : `isCoverageManagerUser` devient « rôle `ADMIN` ou `SUPER_ADMIN` » (Q18) ; la
  règle « responsable d'une catégorie de garde » disparaît. L'acteur `MANAGER` de
  `coverage-policy.ts` = admin ou super administrateur (le demandeur n'est plus `MANAGER` : un
  enseignant demandeur obtient un acteur `REQUESTER` limité à modifier/retirer en `PENDING`).
- **Catégorie** : la catégorie « Garde de classe » reste le support technique (`Request.categoryId`
  obligatoire, `DeadlineRule`, `proofMode`, `finalValidation`) ; ses responsables et rôles
  créateurs ne servent plus aux droits du module.

## R10 — Déclaration de classe vide : présence

- **Décision** : la déclaration crée l'affectation directement `ON_DUTY` (« en cours »,
  `presenceAt = now`, durée à partir de la déclaration, FR-021). Un QR code scanné (page
  `/gardes/presence` existante) peut servir à choisir la classe et est alors enregistré comme
  `CoveragePresence` ; aucune preuve n'est exigée pour déclarer, car la spec impose un passage
  immédiat « en cours » et l'absence de blocage.
- **Alternative écartée** : exiger la preuve (`proofMode`) avant création — contredit FR-015.
- **Validé le 2026-10-16.** Évolution possible : si l'établissement veut une preuve obligatoire pour
  les déclarations, elle s'ajoute au guard sans changer le modèle.

## R11 — Notifications et alertes mises en évidence

- **Décision** : mécanisme existant uniquement (`notifyInTx` + Socket.IO). Les cas urgents
  (classe vide, délai expiré, escalade, double affectation, rappels de renfort) sont émis avec
  `priority = URGENT`, ce qui active la mise en évidence visuelle, `aria-live="assertive"` et le
  Snackbar persistant déjà en place. Ajout d'un **signal sonore facultatif** (Web Audio API, pas
  de fichier ni de dépendance), désactivable, déclenché seulement après une interaction de
  l'utilisateur (règles d'autoplay) et toujours accompagné du signal visuel (FR-024a, WCAG).
- **Destinataires « admin »** : tous les utilisateurs actifs de rôle `ADMIN` ; à défaut d'admin
  actif, les super administrateurs. Les escalades vont aux super administrateurs actifs.
- **Nouveaux types** (`NotificationType`) : `COVERAGE_REQUESTED`, `COVERAGE_EMPTY_CLASS`,
  `COVERAGE_TAKEOVER_EXPIRED`, `COVERAGE_ESCALATED`, `COVERAGE_MORNING_REMINDER`,
  `COVERAGE_CLOSE_REMINDER`, `COVERAGE_DUPLICATE`, `COVERAGE_SUPPORT_REMINDER`,
  `COVERAGE_DOUBLE_ASSIGNMENT`, `COVERAGE_LIFTED`, `COVERAGE_UPDATED`. Le test
  `frontend/tests/api/enums-sync.test.ts` garde l'interface synchronisée.

## R12 — Migration en plusieurs étapes, réversible

- **Décision** : deux migrations Prisma + scripts de pré-contrôle (détail :
  [contracts/migration.md](./contracts/migration.md)).
  1. `0006_supervision_schema` — **additive** : valeurs d'enum, tables, colonnes nullables, clé de
     groupe. Séparée car une valeur ajoutée par `ALTER TYPE … ADD VALUE` ne peut pas être
     utilisée dans la même transaction.
  2. `0007_supervision_data` — **données** : rôle `MANAGER`→`ADMIN`, groupes, `BROADCAST`→`PENDING`,
     `UNFILLED` à venir→`PENDING`, `source` des gardes existantes, compte de démo. Chaque
     changement de statut ajoute un `RequestEvent` `STATUS_CHANGED` (acteur SYSTEM, commentaire
     `migration-0007`) : traçabilité (principe V) et repère pour le retour arrière.
  - Chaque migration a un `down.sql` (exécuté manuellement, comme `0002`) : `0007/down.sql`
    rétablit les statuts à partir des événements `migration-0007` (en ajoutant des événements
    inverses, sans rien supprimer) et renomme `ADMIN`→`MANAGER` ; `0006/down.sql` retire tables,
    colonnes et valeurs d'enum en recréant les types, et refuse de s'exécuter si des données du
    nouveau module existent.
  - Ordre de déploiement : pré-contrôles → validations humaines → sauvegarde (imposée par
    l'entrypoint) → `migrate deploy` → démarrage.
- **Alternatives écartées** : une migration unique (impossible : `ADD VALUE` puis usage) ;
  `prisma migrate dev` en production (interdit par le déploiement existant).

## R13 — Pré-contrôles et validations humaines (FR-005a, FR-008d, FR-023a)

- **Décision** : script `backend/scripts/supervision-preflight.ts` (lecture seule, `npm run
  preflight:supervision -w backend`) produisant un rapport Markdown :
  1. membres du groupe « Surveillants/Remplaçants » avec intitulé de poste et rôle, à classer
     surveillant / non surveillant par l'établissement ;
  2. décompte des gardes par statut, avec la cible calculée, et **liste des statuts sans
     équivalent évident** (tout statut hors tableau R1, ou garde `COVERAGE` portant un statut de
     demande de travail) ;
  3. durée de conservation proposée (12 mois) et nombre d'affectations qui seraient anonymisées
     immédiatement.
  La mise en production exige les trois validations consignées dans le rapport ; la migration
  `0007` refuse de s'exécuter si un statut sans équivalent est présent (garde-fou SQL).

## R14 — Interface

- Réutilisation de `features/coverage/` : suppression de l'onglet « À prendre », du bouton « Je
  prends » et de l'élargissement ; ajout des écrans « Signaler un retard ou une absence »
  (enseignant), « Déclarer une classe vide » (surveillant), file « En attente » priorisée,
  propositions de rattachement, renforts et statistiques (admin) ; badges de sous-état.
  Administration : étages (super administrateur), étage sur la classe et sur le profil du
  surveillant. Accessibilité : composants MUI existants, vérifications automatisées existantes
  (Vitest + Playwright à 360/768/1280 px).

## R15 — Dépendances

- **Décision** : aucune nouvelle dépendance. Fuseau via `Intl`, son via Web Audio API, jobs via
  `@nestjs/schedule` déjà présent.
