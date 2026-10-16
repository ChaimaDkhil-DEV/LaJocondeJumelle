# Data Model — 004 Retards et absences, affectation des surveillants

**Date** : 2026-10-16 · Base : `backend/prisma/schema.prisma` (PostgreSQL 17, Prisma 6).
Décisions : [research.md](./research.md). Seuls les ajouts et changements sont décrits ; le reste
du schéma est inchangé.

## 1. Énumérations

| Enum | Changement | Valeurs |
| --- | --- | --- |
| `Role` | renommage de valeur (migration 0005) | `SUPER_ADMIN`, **`ADMIN`** (ex-`MANAGER`), `EMPLOYEE` |
| `RequestStatus` | ajout | **`PENDING`** (« en attente ») ; `BROADCAST` conservé mais plus jamais posé |
| `CoverageSource` | **nouveau** | `TEACHER_REQUEST`, `SUPERVISOR_REPORT`, `ADMIN_DIRECT` |
| `CoverageType` | **nouveau** | `LATENESS` (retard), `ABSENCE`, `EMPTY_CLASS` (classe vide) |
| `GroupSystemKey` | **nouveau** | `TEACHERS`, `SUPERVISORS` |
| `CoverageReminderKind` | **nouveau** | `TAKEOVER`, `TAKEOVER_ESCALATION`, `MORNING`, `END_OF_SLOT`, `END_OF_SLOT_ADMIN`, `SUPPORT_DECISION`, `SUPPORT_ESCALATION` |
| `MergeProposalStatus` | **nouveau** | `PENDING`, `CONFIRMED`, `REJECTED` |
| `RequestEventType` | ajout | `UPDATED`, `TEACHER_SET`, `SUPPORT_JOINED`, `SUPPORT_RELEASED`, `MERGE_PROPOSED`, `MERGE_DECIDED`, `REMINDER_SENT`, `ESCALATED`, `ANONYMIZED` |
| `NotificationType` | ajout | `COVERAGE_REQUESTED`, `COVERAGE_EMPTY_CLASS`, `COVERAGE_TAKEOVER_EXPIRED`, `COVERAGE_ESCALATED`, `COVERAGE_MORNING_REMINDER`, `COVERAGE_CLOSE_REMINDER`, `COVERAGE_DUPLICATE`, `COVERAGE_SUPPORT_REMINDER`, `COVERAGE_DOUBLE_ASSIGNMENT`, `COVERAGE_LIFTED`, `COVERAGE_UPDATED` |
| `AuditAction` | ajout | `FLOOR_CHANGED`, `COVERAGE_ANONYMIZED`, `COVERAGE_MERGE_DECIDED` |

## 2. Nouvelles tables

### Floor (étage)

| Champ | Type | Règles |
| --- | --- | --- |
| `id` | uuid | PK |
| `name` | varchar(60) | unique, obligatoire (ex. « 1er étage ») |
| `position` | int | ordre d'affichage |
| `active` | bool | défaut `true` ; un étage désactivé reste lié à l'historique |
| `createdAt`, `updatedAt` | timestamptz | |

Création, modification et désactivation : super administrateur uniquement (FR-006), auditées
`FLOOR_CHANGED`. Avertissement « étage sans surveillant » calculé à l'affichage (FR-006a).

### CoverageSupport (renfort)

| Champ | Type | Règles |
| --- | --- | --- |
| `id` | uuid | PK |
| `requestId` | uuid → Request | affectation renforcée |
| `userId` | uuid → User | surveillant en renfort |
| `joinedAt` | timestamptz | heure serveur |
| `releasedAt` | timestamptz? | libération par l'admin ou passage « terminée » |
| `releasedById` | uuid? → User | null = système (fin de l'affectation) |

Index unique partiel : un seul renfort actif par `(requestId, userId)`. Un renfort actif rend le
surveillant **occupé** (FR-015i) : il entre dans le calcul de disponibilité.

### CoverageMergeProposal (proposition de rattachement)

| Champ | Type | Règles |
| --- | --- | --- |
| `id` | uuid | PK |
| `sourceRequestId` | uuid → Request | déclaration du surveillant (enseignant non précisé) |
| `targetRequestId` | uuid → Request | demande existante, même classe, plage qui chevauche |
| `status` | `MergeProposalStatus` | `PENDING` → `CONFIRMED` \| `REJECTED` ; modifiable après coup (FR-015h) |
| `createdAt` | timestamptz | |
| `finalPresentedAt` | timestamptz? | dernière présentation quand les deux affectations sont finales |
| `decidedAt`, `decidedById` | timestamptz?, uuid? | dernière décision |

Contrainte unique `(sourceRequestId, targetRequestId)`. « Doublon possible » = proposition
`PENDING` ; « non tranché » = `PENDING` et `finalPresentedAt` non null. Chaque décision ajoute un
`RequestEvent MERGE_DECIDED` sur les deux affectations et un audit `COVERAGE_MERGE_DECIDED`.

### CoverageReminder (échéance)

| Champ | Type | Règles |
| --- | --- | --- |
| `id` | uuid | PK |
| `requestId` | uuid → Request | |
| `kind` | `CoverageReminderKind` | |
| `targetUserId` | uuid? → User | null = « les admins » ou « les super administrateurs » selon le type |
| `supportId` | uuid? → CoverageSupport | rappels de renfort |
| `dueAt` | timestamptz | prochaine échéance |
| `attempts` | int | envois déjà faits (défaut 0) |
| `maxAttempts` | int | 1, sauf `SUPPORT_DECISION` (réglage, 3) |
| `intervalMinutes` | int? | répétition (`SUPPORT_DECISION`) |
| `resolvedAt` | timestamptz? | posé à l'envoi final ou quand la condition disparaît |
| `resolution` | varchar(30)? | `SENT`, `ASSIGNED`, `CANCELLED`, `CLOSED`, `DECIDED`, `OBSOLETE` |

Index `(resolvedAt, dueAt)`. Une ligne n'est traitée que si `resolvedAt` est null et
`dueAt <= now` ; elle est verrouillée (`FOR UPDATE SKIP LOCKED`) et l'envoi écrit un
`RequestEvent REMINDER_SENT` ou `ESCALATED`.

## 3. Tables modifiées

### CoverageDetail (affectation = garde enrichie, FR-011)

| Champ | Type | Règles |
| --- | --- | --- |
| `source` | `CoverageSource` | nullable en base (lignes anciennes avant 0005), obligatoire pour toute création ; 0005 pose `ADMIN_DIRECT` sur les gardes existantes |
| `type` | `CoverageType?` | obligatoire pour toute création (FR-007a) ; null seulement pour les gardes antérieures |
| `teacherId` | uuid? → User | enseignant concerné, membre du groupe `TEACHERS` ; facultatif pour une classe vide (FR-015a) ; null après anonymisation |
| `reason` | varchar(1000)? | motif détaillé, visible de l'admin et du super administrateur seulement (FR-023c) |
| `floorId` | uuid? → Floor | **copie** de l'étage de la classe à la création (historique stable si la classe change d'étage) |
| `mergedIntoId` | uuid? → Request | affectation absorbée par une fusion confirmée (R6) |
| `anonymizedAt` | timestamptz? | posé par l'anonymisation (R5) |
| `absentTeacher` | varchar(100)? | **existant** : texte libre des gardes antérieures, plus alimenté ; vidé par l'anonymisation |

Champs existants réutilisés tels quels : `classId`, `startAt`, `estimatedMinutes`,
`plannedEndAt` (fin du créneau ; obligatoire pour les nouvelles affectations), `departedAt`,
`presenceAt` (début de la durée), `relievedAt`, `durationMinutes` (FR-021 : `presenceAt` →
`relievedAt`), `extensionCount`, `cancelReason`, `reliefForId`. `broadcastAt` et `releaseCount`
ne sont plus alimentés. `CoverageTarget` n'est plus alimentée (plus de diffusion) mais reste lue
pour l'historique.

Index ajoutés : `(teacherId)`, `(floorId)`, `(source, type)`.

### SchoolClass

`floorId uuid? → Floor`. Obligatoire à la création et à la modification d'une classe (validation
DTO) ; nullable en base pour les classes existantes jusqu'à leur rattachement par le super
administrateur (liste « classes sans étage » dans l'administration).

### User

`floorId uuid? → Floor` : étage de rattachement d'un surveillant (un seul, FR-006). Modifiable
par le super administrateur dans la fiche de compte ; ignoré pour un non-surveillant.

### EmployeeGroup

`systemKey GroupSystemKey?` unique. `SUPERVISORS` sur l'ex-« Surveillants/Remplaçants » (renommé
« Surveillants »), `TEACHERS` sur le nouveau groupe « Enseignants ». Un groupe à clé système ne
peut pas être supprimé ni désactivé (son nom reste modifiable).

### Request

Aucune colonne ajoutée. `requesterId` = enseignant (demande), surveillant (déclaration) ou admin
(création directe). `assigneeId` = surveillant responsable. Après anonymisation d'une demande
enseignant : `requesterId` = compte technique inactif `enseignant-anonymise`, `description` = null.

### Setting (nouvelles clés, `SETTING_DEFAULTS` + `SETTING_RULES`)

| Clé | Défaut | Bornes |
| --- | --- | --- |
| `coverageUrgencyThresholdMinutes` | 60 | 5–720 |
| `coverageEscalationMinutes` | 5 | 1–120 |
| `coverageMorningReminderTime` | `"07:00"` | `HH:MM` |
| `coverageCloseReminderMinutes` | 10 | 1–240 |
| `coverageCloseEscalationMinutes` | 10 | 1–240 |
| `coverageSupportReminderMinutes` | 10 | 1–120 |
| `coverageSupportReminderMax` | 3 | 1–10 |
| `coverageRetentionMonths` | 12 | 1–60 |

Le délai de prise en charge (2 min) reste `DeadlineRule.takeoverMinutes` de la catégorie de garde.

## 4. Statuts et transitions

Statut principal dérivé de `Request.status` (table R1). Transitions de la machine d'états
(`coverage-state-machine.ts`), acteurs : `ADMIN` (admin ou super administrateur), `ASSIGNEE`
(surveillant responsable), `REQUESTER_TEACHER` (enseignant auteur), `SUPERVISOR` (membre du groupe
`SUPERVISORS`), `SYSTEM`.

| De | Action | Acteur | Vers | Notes |
| --- | --- | --- | --- | --- |
| — | `CREATE_TEACHER_REQUEST` | REQUESTER_TEACHER | `PENDING` | crée `TAKEOVER` et/ou `MORNING` |
| — | `CREATE_DIRECT` | ADMIN | `ACCEPTED` | surveillant disponible obligatoire |
| — | `DECLARE_EMPTY_CLASS` | SUPERVISOR | `ON_DUTY` | sauf rattachement (FR-015d à g) ; double affectation autorisée (FR-015j) |
| `PENDING` | `UPDATE` | REQUESTER_TEACHER | `PENDING` | date, plage, classe, motif ; échéances recalculées |
| `PENDING` | `WITHDRAW` | REQUESTER_TEACHER | `CANCELLED` | motif facultatif |
| `PENDING` | `ASSIGN` | ADMIN | `ACCEPTED` | résout `TAKEOVER*`/`MORNING` ; crée `END_OF_SLOT` |
| `PENDING` | `ATTACH_DECLARATION` | SYSTEM | `ON_DUTY` | déclaration rattachée (FR-015d) |
| `PENDING` | `CANCEL` | ADMIN | `CANCELLED` | motif facultatif |
| `PENDING` | `EXPIRE_UNFILLED` | SYSTEM | `UNFILLED` | fin de créneau passée |
| `ACCEPTED`, `EN_ROUTE`, `LATE` | `REASSIGN` | ADMIN | `ACCEPTED` | ancien : `COVERAGE_LIFTED` ; nouveau : `ASSIGNED` |
| `ACCEPTED`, `EN_ROUTE`, `LATE` | `CANCEL` | ADMIN | `CANCELLED` | `COVERAGE_LIFTED` au surveillant |
| `ACCEPTED` | `DEPART` | ASSIGNEE | `EN_ROUTE` | existant |
| `ACCEPTED`, `EN_ROUTE` | `EXPIRE` (arrivée) | SYSTEM | `LATE` | existant |
| `ACCEPTED`, `EN_ROUTE`, `LATE` | `CONFIRM_PRESENCE` | ASSIGNEE | `ON_DUTY` | existant (QR/photo) |
| `ON_DUTY` | `REQUEST_RELIEF` | ASSIGNEE | `RELIEF_PENDING` | la relève créée naît `PENDING` (assignée par l'admin) |
| `ON_DUTY`, `RELIEF_PENDING` | `REASSIGN` | ADMIN | inchangé | crée une relève **assignée** au nouveau surveillant ; l'ancien est libéré à la présence du nouveau (FR-008j) |
| `ON_DUTY`, `RELIEF_PENDING` | `RELIEVE` (« Terminer ») | ASSIGNEE / SYSTEM | `DONE` | libère les renforts actifs |
| `ON_DUTY`, `RELIEF_PENDING` | `RELEASE_BY_MANAGER` | ADMIN | `DONE` | existant |
| `ON_DUTY`, `RELIEF_PENDING` | `CANCEL` | ADMIN | `CANCELLED` | nouveau (FR-008h) |
| `RELIEF_PENDING` | `RELIEF_ABANDONED` | SYSTEM | `ON_DUTY` | existant |
| actif | `EXTEND` | ADMIN / ASSIGNEE | inchangé | recalcule `END_OF_SLOT` |
| `DONE` | `VALIDATE` | ADMIN | `CLOSED` | existant |
| tout statut | `SET_TEACHER` | ADMIN | inchangé | FR-015c, événement `TEACHER_SET` |
| actif | `RELEASE_SUPPORT` | ADMIN | inchangé | libère un renfort (FR-015i) |

**Supprimées** : `ACCEPT`, `WIDEN`, `RELEASE` (par le surveillant), `EXPIRE` `BROADCAST→UNFILLED`.
Le surveillant n'a aucune action d'acceptation, de refus ni d'annulation (FR-008f).
**Statuts finaux** : `DONE`/`CLOSED`, `CANCELLED`, `UNFILLED`.

## 5. Disponibilité d'un surveillant (FR-010, FR-015i)

Disponible pour la plage `[startAt, plannedEndAt)` si : actif, membre de `SUPERVISORS`,
disponibilité déclarée `AVAILABLE`, et aucune affectation active (`ACCEPTED`, `EN_ROUTE`, `LATE`,
`ON_DUTY`, `RELIEF_PENDING`) ni renfort actif dont la plage chevauche (fin inconnue = +∞,
inchangé). Tri de la liste : étage de la classe d'abord, puis les autres (FR-010). Seule
exception au chevauchement : la déclaration de classe vide (FR-015j).

## 6. Rattachement et doublons (FR-015d à FR-015h)

À la déclaration d'une classe vide, recherche d'une affectation non finale, même classe, plage
qui chevauche `[now, fin de journée)` :

| Situation | Effet |
| --- | --- |
| enseignant précisé, demande `PENDING` du même enseignant | `ATTACH_DECLARATION` : la demande passe `ON_DUTY` avec le déclarant |
| demande `ACCEPTED`/`EN_ROUTE`/`LATE` (même enseignant) | rien de modifié ; déclarant informé du surveillant assigné ; admins notifiés (`COVERAGE_DUPLICATE`) |
| affectation `ON_DUTY`/`RELIEF_PENDING` sur la classe | déclarant ajouté en **renfort** (`CoverageSupport`) ; `SUPPORT_DECISION` créé ; admins notifiés |
| enseignant non précisé, demande existante | nouvelle affectation `ON_DUTY` + `CoverageMergeProposal PENDING` |
| aucune correspondance | nouvelle affectation `ON_DUTY` |

## 7. Statistiques (FR-022, FR-008i, FR-015b, FR-015h)

Calculées à la demande (pas de table d'agrégats) sur `Request` + `CoverageDetail`, filtrées par
période (`startAt`, fuseau de l'école) :

- événements = affectations finales **sans** `mergedIntoId`, hors `CANCELLED` ; comptées par
  enseignant (ou « enseignant non précisé »), par classe, par type ;
- durée moyenne = moyenne de `durationMinutes` des `DONE`/`CLOSED` ;
- taux de non pourvue = `UNFILLED` / (demandes hors annulées) ;
- annulées : compteur séparé ;
- doublons : les paires d'une proposition `PENDING` comptent pour **un** événement, dans une
  rubrique « non tranché » si `finalPresentedAt` est posé ; `REJECTED` : deux ; `CONFIRMED` :
  un (l'absorbée a `mergedIntoId`).

Données par enseignant visibles de l'admin et du super administrateur seulement (FR-023).

## 8. Anonymisation (FR-023a)

Voir R5. Champs effacés : `CoverageDetail.teacherId`, `absentTeacher`, `reason` ;
`Request.requesterId` (demande enseignant) → compte technique, `Request.description` → null.
Conservés : dates, classe, étage, type, source, statuts, durée. Jamais modifiés : `RequestEvent`,
`AuditLog`, `Notification`.
