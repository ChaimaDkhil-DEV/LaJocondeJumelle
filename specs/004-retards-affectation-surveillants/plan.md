# Implementation Plan: Retards et absences des enseignants, affectation des surveillants

**Branch**: `004-retards-affectation-surveillants` | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-retards-affectation-surveillants/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Faire évoluer la fonctionnalité « Gardes » (lot 2) en module d'affectations, sans créer de
module parallèle :

- **Attribution** : la diffusion « premier volontaire » disparaît ; seul l'admin assigne et
  réassigne. Exception : un surveillant qui déclare une classe vide en reçoit l'affectation, déjà
  « en cours ». Les mécanismes existants sont conservés : présence QR/photo, délai d'arrivée,
  prolongation, relève, validation.
- **Trois sources** : demande d'enseignant (aujourd'hui/demain, plage libre), déclaration de
  classe vide, affectation directe. **Trois types** : retard, absence, classe vide.
- **Statuts** : six statuts principaux et des sous-états, **calculés** à partir de
  `Request.status` existant, plus une seule nouvelle valeur `PENDING` (R1).
- **Échéances** : une table `CoverageReminder` et un job unique couvrent le délai de prise en
  charge, l'escalade, le rappel de 7 h, les rappels de clôture et les rappels de renfort (R2, R3).
  Le passage « non pourvue » et l'anonymisation à 12 mois glissants sont des jobs dédiés.
- **Nouveautés de structure** :
  - étages (super administrateur) ;
  - groupes « Enseignants » et « Surveillants » repérés par une clé système ;
  - renforts ;
  - propositions de fusion des doublons ;
  - statistiques calculées à la demande.
- **Rôle** : `MANAGER` est renommé `ADMIN` (enum PostgreSQL) et l'espace du super administrateur est libellé « Administrateur ».
- **Migration** : deux étapes, `0004` additive puis `0005` données, chacune avec un `down.sql`.
  Elle est précédée d'un pré-contrôle et de trois validations humaines. Chaque changement de
  statut est tracé par un événement ajouté ; aucun historique n'est réécrit.

Aucune nouvelle dépendance. Détails : [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js 24 — inchangé

**Primary Dependencies**: NestJS 11 (`@nestjs/schedule`, `@nestjs/websockets` + Socket.IO), Prisma 6,
React 19, Vite, TanStack Query 5, MUI — inchangés. **Aucun ajout** (fuseau via `Intl`, signal
sonore via Web Audio API).

**Storage**: PostgreSQL 17. Deux migrations : `0004_supervision_schema` (additive) et
`0005_supervision_data` (données), chacune avec `down.sql` ([contracts/migration.md](./contracts/migration.md)).
Quatre tables (`Floor`, `CoverageSupport`, `CoverageMergeProposal`, `CoverageReminder`), colonnes
sur `CoverageDetail`, `SchoolClass`, `User`, `EmployeeGroup` ([data-model.md](./data-model.md)).

**Testing**: Jest (unitaires ; intégration sur PostgreSQL embarqué, `--runInBand`), Vitest + RTL,
Playwright (360/768/1280 px). Tests écrits avant le code (principe I).

**Target Platform**: une seule application web adaptative (smartphone, tablette, ordinateur) ;
production VPS Linux, Docker Compose, Caddy. Pas de mobile natif, pas de push, pas de canal
externe (aucun n'existe).

**Project Type**: application web (API `backend/` + SPA `frontend/`, workspaces npm) + `e2e/`.

**Performance Goals**: notification d'un signalement ou d'une déclaration en moins de 5 s
(SC-003), avec un job de 15 s pour les échéances, comme l'existant. Liste des candidats et
statistiques du mois en moins de 1 s à l'échelle d'une école.

**Constraints**:

- aucune régression : tests existants verts, adaptés seulement pour le renommage du rôle et la
  diffusion retirée (FR-002) ;
- `RequestEvent` et `AuditLog` restent en ajout seul ;
- une seule instance d'API (inchangé) ; verrous consultatifs pour les jobs ;
- fuseau de l'école `SCHOOL_TIMEZONE` (R4).

**Scale/Scope**:

- une école : de l'ordre de 100 comptes, 50 classes, quelques étages et quelques dizaines
  d'affectations par jour ;
- environ 15 écrans touchés ou ajoutés ;
- environ 440 occurrences de « responsable » à traiter (dont tests et documentation).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Vérification avant conception | Après conception (Phase 1) |
| --- | --- | --- |
| **I. TDD** | Chaque FR et scénario d'acceptation reçoit un test qui échoue d'abord. Règles de statuts, transitions et droits : tests unitaires. Parcours : tests d'intégration et e2e. | ✅ Stratégie détaillée ci-dessous. La machine d'états, le statut principal, les échéances et le fuseau sont des modules **purs**, testables unitairement. |
| **II. Simplicité / YAGNI** | Réutiliser gardes, groupes, notifications, disponibilité, présence, relève. Aucune dépendance. | ✅ Statuts dérivés (pas de 2ᵉ source) ; statistiques calculées (pas d'agrégats) ; pas d'emploi du temps ni de module d'absences. Quatre tables justifiées (Complexity Tracking). |
| **III. Accessibilité / UX** | WCAG 2.2 AA, 320 px, états cohérents, messages actionnables. | ✅ Composants MUI existants. Les alertes urgentes ne reposent jamais sur le son seul : `aria-live="assertive"` et Snackbar `role="alert"` existants, son facultatif. Contrôles axe et e2e à 360/768/1280 px. |
| **IV. Sécurité / données** | Validation serveur, minimisation RGPD, finalité et durée documentées. | ✅ DTO validés (dates bornées au fuseau de l'école). Motif détaillé visible de l'admin et du super administrateur seulement. Anonymisation à N mois glissants. `SCHOOL_TIMEZONE` validé au démarrage. Aucun secret ajouté. |
| **V. Intégrité des workflows** | Statuts finis, transitions définies, audit non modifiable, RBAC serveur, refus journalisés sans divulgation. | ✅ Table de transitions complète (data-model §4). Chaque changement, y compris par la migration et l'anonymisation, **ajoute** un `RequestEvent`. Audit pour les actions d'admin. `404` et `ACCESS_DENIED` hors périmètre. Le journal d'audit et l'historique sont exclus de l'anonymisation. |

Contraintes techniques : pile inchangée ✅ ; `data-model.md` rédigé avant implémentation ✅ ;
authentification et sessions inchangées ✅. **Aucune violation non justifiée.**

## Décisions validées (questions posées pendant le plan)

| # | Sujet | Choix |
| --- | --- | --- |
| D1 | Stockage des statuts | Dérivés de `Request.status` + valeur `PENDING` (R1) |
| D2 | Échéances | Table `CoverageReminder` + un job (R2) |
| D3 | Anonymisation | Données du module seulement ; historique et audit intacts (R5) |
| D4 | Fusion | Affectation absorbée « annulée » + `mergedIntoId`, exclue des statistiques (R6) |
| D5 | Fuseau | Variable `SCHOOL_TIMEZONE`, défaut `Europe/Paris` (R4) |
| D6 | Rétention | Âge glissant, 12 mois réglables (R5) |

Choix découlant de la spec, **validés le 2026-10-16** (reportés dans la spec : Clarifications,
FR-016a, FR-017a) :

- **R10** : la déclaration de classe vide n'exige pas de preuve de présence. Un QR code scanné
  est enregistré s'il est fourni.
- **R11** : sans admin actif, les notifications « admin » vont aux super administrateurs. L'enseignant auteur est notifié de l'assignation.
- **R3** : la fin de créneau inconnue des anciennes gardes est réputée être la fin de journée.

## Permissions par rôle

Contrôles côté serveur dans `coverage-policy.ts` (pur). Le rôle vient de `User.role`, les
fonctions de l'appartenance aux groupes à clé système.

| Capacité | Super admin | Admin | Surveillant | Enseignant | Autres employés |
| --- | --- | --- | --- | --- | --- |
| Voir le module | ✅ | ✅ | ses affectations et renforts | ses demandes | ❌ (`404`) |
| Signaler retard/absence, modifier ou retirer en attente | ✅ | si membre Enseignants | si membre Enseignants | ✅ (les siennes) | ❌ |
| Déclarer une classe vide | ✅ | si membre Surveillants | ✅ | si membre Surveillants | ❌ |
| Assigner, réassigner, annuler, créer en direct | ✅ | ✅ | ❌ | ❌ | ❌ |
| Décider fusion et renfort, corriger l'enseignant | ✅ | ✅ | ❌ | ❌ | ❌ |
| Départ, présence, relève, terminer, prolonger | si affecté | si affecté (prolonger : toujours) | si affecté | ❌ | ❌ |
| Voir le motif détaillé | ✅ | ✅ | ❌ | le sien | ❌ |
| Statistiques et historique par enseignant | ✅ | ✅ | ❌ | ❌ | ❌ |
| Étages, rattachement des classes, étage d'un surveillant, réglages | ✅ | ❌ | ❌ | ❌ | ❌ |
| Être assigné | si membre Surveillants | si membre Surveillants | ✅ | si membre Surveillants | ❌ |

Le reste de l'application (demandes de travail, circuit B, administration) est inchangé. `ADMIN`
reprend exactement les droits de l'ex-`MANAGER` (`RolePermission`, `creatorRoles`,
`CategoryManager`).

## Tâches planifiées (`backend/src/scheduler/`)

| Job | Fréquence | Rôle | Idempotence |
| --- | --- | --- | --- |
| `CoverageRemindersJob` (nouveau) | 15 s | Traite les `CoverageReminder` échus : `TAKEOVER` (alerte admins puis crée `TAKEOVER_ESCALATION`), `TAKEOVER_ESCALATION` (SA), `MORNING` (admins, si encore `PENDING`), `END_OF_SLOT` (surveillant puis `END_OF_SLOT_ADMIN`), `SUPPORT_DECISION` (répété, plafonné, puis `SUPPORT_ESCALATION`) | verrou consultatif, `FOR UPDATE SKIP LOCKED`, `attempts`/`resolvedAt` ; condition revérifiée avant envoi |
| `CoverageUnfilledJob` (nouveau, même fichier ou voisin) | 15 s | `PENDING` dont la fin de créneau est passée → `UNFILLED` (`EXPIRE_UNFILLED`) | mise à jour conditionnelle sur `{status, version}` |
| `CoverageDeadlinesJob` (modifié) | 15 s | Garde seulement `ARRIVAL` (`ACCEPTED`/`EN_ROUTE` → `LATE`) ; retire `BROADCAST → UNFILLED` | inchangé (`overdueStage`) |
| `CoverageAnonymizationJob` (nouveau) | toutes les heures | Anonymise les affectations finales de plus de `coverageRetentionMonths` | `anonymizedAt` ; lots de 200 |

**Contrainte à reprendre telle quelle dans `tasks.md`** (FR-016a, R3) : pour une garde « jusqu'à
l'arrivée » (`plannedEndAt` null, gardes antérieures), l'échéance `END_OF_SLOT` est la fin de la
journée locale + `coverageCloseReminderMinutes` ; **aucun rappel de clôture ne part avant la fin
de journée**. Un test unitaire (`coverage-reminders.spec.ts`) et un test du job le vérifient.

Toutes les heures locales passent par `school-time.ts`. Les tests appellent `runOnce(now)` avec
une horloge injectée, comme les jobs existants.

## Notifications et alertes

Voir [contracts/realtime-events.md](./contracts/realtime-events.md) : onze nouveaux types, priorité
`URGENT` pour les cas urgents, mise en évidence visuelle et vocale (lecteurs d'écran) existante,
et signal sonore facultatif ajouté au `NotificationCenter`.

## Validations avant migration

Pré-contrôle en lecture seule et validations **V1** (membres non surveillants), **V2** (statuts
sans équivalent, garde-fou SQL dans `0005`) et **V3** (durée de conservation) :
[contracts/migration.md](./contracts/migration.md) étape 0.

## Stratégie de tests

Ordre TDD : test rouge → code → refactorisation, story par story (US4 rôle → US1 → US2 → US3 →
US5), migration en premier pour la structure.

- **Unitaires (Jest, `backend/test/unit/`)** :
  - `coverage-state-machine.spec.ts` réécrit : table data-model §4, actions retirées refusées,
    surveillant sans action d'acceptation, de refus ni d'annulation ;
  - `coverage-main-status.spec.ts` : correspondance R1 complète ;
  - `coverage-reminders.spec.ts` : seuil de 60 min, 7 h, fin de créneau, renfort plafonné, recalcul
    après modification et prolongation ;
  - `school-time.spec.ts` : aujourd'hui/demain, changement d'heure, minuit ;
  - `coverage-availability.spec.ts` : renfort occupé, disponibilité déclarée, tri par étage ;
  - `coverage-duplicates.spec.ts` : table data-model §6 ;
  - `coverage-stats.spec.ts` : décomptes, fusions, « non tranché » ;
  - `coverage-policy.spec.ts` : matrice des permissions complète ;
  - `config.spec.ts` : `SCHOOL_TIMEZONE` ;
  - `architecture-layers.spec.ts` : inchangé et vert.
- **Intégration (`backend/test/integration/`)** :
  - un fichier par story : `supervision-teacher-request`, `supervision-empty-class`,
    `supervision-direct`, `supervision-stats`, `role-admin-rename` ;
  - `supervision-jobs` : horloge simulée, escalades, non pourvue, anonymisation sans toucher à
    `RequestEvent` ni `AuditLog` ;
  - `supervision-permissions` : chaque refus est journalisé et répond `404` hors périmètre ;
  - `migration-0005` : montée, contrôles, `down.sql`, garde-fous ;
  - `append-only.spec.ts` : inchangé.
- **Adaptation des tests de gardes** :
  - `coverage.spec.ts` : les cas de diffusion et d'acceptation (1, 2, 2 bis, 3, 5, 5 bis, 6,
    « taken » en direct, groupe vide) sont remplacés par leurs équivalents d'assignation par
    l'admin ou supprimés quand le comportement n'existe plus ;
  - les cas de présence, relève, prolongation, retard, annulation, QR et photo sont conservés,
    avec une préparation par `ASSIGN` ;
  - `coverage-work-isolation.spec.ts`, `reassign.spec.ts` et `notifications.spec.ts` : ajustés
    au rôle `ADMIN` ;
  - chaque suppression de test est listée dans la PR avec sa raison (exigence supprimée par la
    spec).
- **Frontend (Vitest + RTL + axe)** :
  - formulaires enseignant et surveillant, file admin priorisée, badges de sous-état,
    propositions et renforts, statistiques, étages ;
  - alerte urgente : rôle `alert`, aucune dépendance au son ;
  - `enums-sync.test.ts` : nouveaux enums ;
  - `coverage.test.tsx` : retrait des cas « À prendre » et « Je prends ».
- **E2E (Playwright)** : `coverage-class.spec.ts` réécrit avec trois parcours (demande →
  assignation → terminée ; classe vide → doublon → renfort ; affectation directe) aux trois
  largeurs ; `us8-admin`, `auth`, `us5`, `us6` adaptés au compte `admin`.
- **Non-régression** : suites complètes backend, frontend et e2e vertes avant fusion, comme le
  CI existant.

## Project Structure

### Documentation (this feature)

```text
specs/004-retards-affectation-surveillants/
├── plan.md              # ce fichier
├── research.md          # décisions R1–R15
├── data-model.md        # modèle, transitions, disponibilité, statistiques
├── quickstart.md        # validation de bout en bout
├── contracts/
│   ├── rest-api.md
│   ├── realtime-events.md
│   └── migration.md     # étapes, validations V1–V3, retour arrière
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                         # enums, Floor, CoverageSupport, CoverageMergeProposal, CoverageReminder, colonnes
│   ├── migrations/0004_supervision_schema/   # migration.sql + down.sql
│   ├── migrations/0005_supervision_data/     # migration.sql + down.sql
│   └── seed.ts                               # admin, enseignante, surveillants, étages
├── scripts/supervision-preflight.ts          # pré-contrôle (lecture seule)
└── src/
    ├── config/                               # SCHOOL_TIMEZONE
    ├── common/school-time.ts                 # jour/heure locale (pur)
    ├── settings/                             # clés coverage*
    ├── coverage/
    │   ├── domain/coverage-state-machine.ts  # transitions (modifié)
    │   ├── domain/coverage-status.ts         # statut principal + sous-état (nouveau, pur)
    │   ├── domain/coverage-reminders.ts      # calcul des échéances (nouveau, pur)
    │   ├── domain/coverage-duplicates.ts     # règles de rattachement (nouveau, pur)
    │   ├── domain/coverage-policy.ts         # acteurs et permissions (modifié)
    │   ├── coverage-availability.ts          # renfort, tri par étage (modifié)
    │   ├── coverage-actions.service.ts       # sans diffusion ; renfort, fusion (modifié)
    │   ├── coverage.service.ts / .controller.ts / .dto.ts / .mapper.ts   # nouvelles routes
    │   ├── coverage-stats.service.ts         # statistiques (nouveau)
    │   ├── coverage-anonymization.service.ts # (nouveau)
    │   └── coverage-admin.*                  # étages, floorId des classes
    ├── users/                                # floorId
    └── scheduler/
        ├── coverage-reminders.job.ts         # (nouveau)
        ├── coverage-anonymization.job.ts     # (nouveau)
        └── coverage-deadlines.job.ts         # ARRIVAL seulement (modifié)
    test/unit/…, test/integration/…           # voir stratégie de tests

frontend/
├── src/
│   ├── api/types.ts                          # Role ADMIN, nouveaux enums
│   ├── app/AppLayout.tsx, features/admin/    # libellés Admin / Administrateur, étages, floorId
│   ├── features/coverage/                    # formulaires enseignant et surveillant, file admin, badges, renforts, fusions, statistiques ; « À prendre » retiré
│   └── features/notifications/NotificationCenter.tsx   # signal sonore facultatif
└── tests/…

e2e/coverage-class.spec.ts, e2e/support/accounts.ts  # parcours réécrits, compte admin
deploy/docker-compose.yml, deploy/.env.example       # SCHOOL_TIMEZONE pour l'API
docs/                                                # ARCHITECTURE, coverage-migration ; notes dans specs 001 et 003
```

**Structure Decision** : on garde l'application web existante (`backend/`, `frontend/`, `e2e/`).
Le module « affectations » est le dossier `coverage/` enrichi ; aucun nouveau module Nest ni
nouvelle fonctionnalité frontend de premier niveau. L'ordre des couches vérifié par
`architecture-layers.spec.ts` (`… → coverage → scheduler`) reste respecté.

## Complexity Tracking

| Ajout | Pourquoi nécessaire | Alternative plus simple écartée |
| --- | --- | --- |
| Table `CoverageReminder` | 7 minuteries, dont une répétée et plafonnée, avec escalades traçables (FR-011d/e/f, FR-015i, FR-016a) | Colonnes sur `CoverageDetail` : 8 à 10 colonnes, et la répétition du renfort ne s'y range pas. `currentDueAt` : une seule échéance à la fois. |
| Table `CoverageSupport` | Plusieurs surveillants sur une affectation (renfort), occupés et libérables (FR-015f, FR-015i) | `assigneeId` unique : ne peut pas représenter le renfort. |
| Table `CoverageMergeProposal` | Proposition, décision, « non tranché » et décision après coup tracés (FR-015g, FR-015h) | Drapeau sur l'affectation : perd la paire, la décision et la dernière présentation. |
| Table `Floor` | Étages gérés par le super administrateur, liés aux classes et aux surveillants (FR-006) | Texte libre : pas d'intégrité, ni de tri ni d'avertissement fiables. |
| Deux migrations | `ADD VALUE` d'un enum inutilisable dans la même transaction ; retour arrière séparé structure/données | Migration unique : techniquement impossible. |
