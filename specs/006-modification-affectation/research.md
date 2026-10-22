# Research — 006 Modification d'une affectation par l'admin

Aucune inconnue technique : la modification réutilise les mécanismes de la correction d'un
signalement par l'enseignant (`CoverageService.updateTeacherRequest`), de la prolongation
(`EXTEND`) et de la réassignation (disponibilité). Décisions fixées à partir de `master`
(`d939375`).

## R1 — Route et autorisation

- **Decision** : nouvelle route `PATCH /api/coverage/:id` (admins et super administrateur),
  corps `UpdateCoverageDto` : `version` (obligatoire) et, facultatifs, `classId`, `date`
  (AAAA-MM-JJ), `startTime`, `endTime` (HH:MM, fuseau de l'école). Autorisation par la machine à
  états : nouvelle règle `{ from: [PENDING, ASSIGNED…, ON_SITE…], action: 'UPDATE', to: 'same',
  actors: ['ADMIN'] }`, en plus de la règle existante de l'enseignant (`PENDING`,
  `REQUESTER_TEACHER`). `allowedActions` contient alors `UPDATE` pour l'admin : l'interface
  affiche « Modifier » sans règle propre au client.
- **Rationale** : même forme que `PATCH /api/coverage/:id/teacher-request` (formulaire partiel, pas
  une simple transition) ; l'action `UPDATE` existe déjà dans la machine à états ; refus journalisé
  `ACCESS_DENIED` et `404` pour les autres rôles, comme les autres routes du module (principe V).
- **Alternatives considered** : action `POST /:id/actions` avec un `UPDATE` admin (le corps des
  actions ne porte ni classe ni créneau : rejeté) ; nouvelle action `MODIFY` (doublon de `UPDATE` :
  rejeté).

## R2 — Champs modifiables selon le statut (FR-002, FR-005, Clarification Q1)

- **Decision** : fonction pure `modifiableFields(status)` dans `backend/src/coverage/domain/`
  (testée unitairement) :
  - `PENDING`, `ACCEPTED`, `EN_ROUTE`, `LATE` → classe, date, début, fin ;
  - `ON_DUTY`, `RELIEF_PENDING` → fin seulement ;
  - statuts définitifs → rien (la règle de la machine à états refuse déjà `UPDATE`).
  Le service refuse tout champ hors de cette liste (`400 VALIDATION_ERROR`, champ concerné).
  L'interface utilise la même règle, renvoyée dans le détail de l'affectation
  (`modifiableFields`), pour désactiver les champs.
- **Rationale** : règle métier unique, côté serveur, exposée au client (pas de duplication).

## R3 — Créneau (FR-003, FR-004)

- **Decision** : date et heures converties dans le fuseau de l'école avec `atLocalTime`
  (`backend/src/common/school-time.ts`). Règles de la création directe : fin après le début
  (`INVALID_RANGE`), fin pas encore passée, début entre 12 h avant et 7 jours après maintenant
  (`MAX_PAST_MS`, `MAX_FUTURE_MS` de `coverage.service.ts`). Pendant la présence, le début n'est
  pas modifiable et la fin doit être postérieure à maintenant.
- **Alternatives considered** : instants ISO comme la création directe (le formulaire saisit une
  date et des heures locales, comme le signalement de l'enseignant : rejeté).

## R4 — Disponibilité et conflit nommé (FR-006, Clarification Q2)

- **Decision** : si l'affectation a un surveillant et que le créneau change, `availabilityFor`
  (`coverage-availability.ts`) sur le nouveau créneau en **excluant l'affectation elle-même**, sous
  verrou du surveillant (`lockEmployee`, comme l'assignation). Indisponible → `409 NOT_AVAILABLE`
  avec un message qui nomme le conflit quand `guardRequestId` est renseigné (« Surveillant déjà
  affecté : <classe>, <date> <début>–<fin>. Réassignez d'abord, puis modifiez. ») et
  `details.conflict = { id, className, startAt, plannedEndAt }` ; pour absent, indisponible ou
  compte désactivé, message de la raison. Rien n'est modifié.
- **Rationale** : `EmployeeAvailability.guardRequestId` existe déjà ; aucun forçage (004).

## R5 — Statut, classe et présence (FR-008, FR-009, Clarification Q3)

- **Decision** : statut inchangé, y compris `EN_ROUTE` (pas de remise à zéro de `departedAt`). Le
  titre de la demande suit la classe (`Garde — <classe>`, `Retard — <classe>`, `Absence — <classe>`,
  selon la source et le type existants). La présence par QR code compare déjà la classe de
  l'affectation (`CoverageService.resolveQr`) : après un changement de classe, seul le QR code de la
  nouvelle classe convient, sans modification.

## R6 — Échéances et rappels (FR-011)

- **Decision** :
  - échéance de la demande (`currentDueAt`, `warnAt`) recalculée à partir du nouveau début avec
    `nextCoverageDeadline`, comme à la création, tant que la présence n'est pas confirmée ;
  - rappels (`reminderChanges`, `domain/coverage-reminders.ts`) : le cas `UPDATE` ne traite
    aujourd'hui que l'attente d'assignation ; il traitera aussi les affectations assignées ou en
    cours comme `EXTEND` (rappels de fin de créneau recalculés). Tests unitaires du domaine.

## R7 — Historique, audit, notifications (FR-007, FR-010)

- **Decision** :
  - événement existant `UPDATED`, `fromValue`/`toValue` = `{ classId, startAt, plannedEndAt }`,
    `toValue.byAdmin = true` ; jamais le motif ;
  - noms de classe résolus à la lecture dans `historyOf` (comme `assigneeName`, `teacherName`,
    principe R5 de la 004) ; texte : « Affectation modifiée : classe A → B ; 09:00–10:00 →
    09:30–10:00 » (seuls les éléments changés) ;
  - audit `COVERAGE_MANAGED` (« Affectation gérée par un admin ») avec `action: 'UPDATE'`, valeurs
    avant et après ;
  - notification existante `COVERAGE_UPDATED` au surveillant affecté et aux autres admins ; son
    libellé devient « Affectation modifiée » (aussi pour la correction d'un signalement par
    l'enseignant, déjà notifiée sous ce type) ; le titre mis à jour fait apparaître la nouvelle
    classe dans la notification ; mise à jour temps réel (`pushUpdate`) ;
  - aucune modification effective (mêmes valeurs) : réponse sans effet, ni événement, ni
    notification.
- **Rationale** : aucun type d'événement ni de notification nouveau, donc **aucune migration**.

## R8 — Interface

- **Decision** : bouton « Modifier » sur le détail de l'affectation (admins, si `UPDATE` est dans
  `allowedActions`), dialogue « Modifier l'affectation » : classe, date, heure de début, heure de
  fin, champs désactivés selon `modifiableFields` avec une phrase d'explication pendant la présence ;
  erreurs reliées aux champs ; conflit dans une alerte du dialogue ; succès : toast « Affectation
  modifiée. ». Retours de mutation au niveau de la mutation (leçon de PR #23). Mise en page à 320 px.

## R9 — Stratégie de test (principe I)

- Unitaires : `modifiableFields`, règle `UPDATE` admin de la machine à états, `reminderChanges`
  (`UPDATE` sur affectation assignée).
- Intégration (`backend/test/integration/supervision-update.spec.ts`, nouveau) : rôles, statuts,
  classe refusée pendant la présence, créneau invalide, conflit nommé, version concurrente,
  historique, audit, notification, QR de la nouvelle classe.
- Frontend : dialogue (champs selon statut, erreurs, conflit, succès) et texte d'historique.
- e2e (Chromium) : modification du créneau et de la classe d'une affectation directe, vue du
  surveillant ; écran du dialogue dans le test 004 à 320 px (axe).
