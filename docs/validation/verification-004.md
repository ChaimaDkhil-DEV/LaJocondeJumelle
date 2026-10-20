# Vérification de la fonctionnalité 004 — retards et absences des enseignants, affectation des surveillants

- **Branche** : `004-retards-affectation-surveillants`
- **Poste** : Windows 11, Node.js 24.21, PostgreSQL 17 embarqué (embedded-postgres)

## État initial (T001)

- **Date** : 20 octobre 2026
- **Commit** : `aa76140` (documents de conception seuls, aucun code modifié). La branche a été
  rebasée sur `master` (`38b968f`, PR #17). `master` contient désormais
  `0006_request_event_dashboard_indexes` (PR #13) et `0007_audit_request_actions` (PR #17) : les
  migrations de la fonctionnalité sont renumérotées `0008_supervision_schema` et
  `0009_supervision_data` dans tous les documents de conception.

| Commande | Code de sortie | Résultat |
|----------|----------------|----------|
| `npm run lint` | 0 | aucun problème |
| `npm run -w backend typecheck` | 0 | aucune erreur |
| `npm run -w frontend typecheck` | 0 | aucune erreur |
| `npm run -w backend test` (unitaires) | 0 | 431 / 431 ; 24 suites |
| `npm run -w backend test:integration` | 0 | 313 / 313 ; 29 suites (133 s) |
| `npm run -w frontend test` | 0 | 159 / 159 ; 21 fichiers |

**Remarque d'environnement** : dans une copie de travail neuve (`git worktree`), `npm ci` ne
génère pas le client Prisma. Le premier passage du typage backend et des tests d'intégration
échoue alors (types `@prisma/client` absents, enums `undefined`). Après
`npm exec -w backend -- prisma generate`, les deux passent ; les résultats ci-dessus sont ceux du
second passage. Aucun code n'est en cause.

**Aucun échec.**

## Phase 2 — socle (T004 à T039)

### Ordre TDD et constat « rouge »

- **T004 à T009** (unitaires) : écrits d'abord, 74 échecs constatés avant le code, puis verts.
- **T010** (migrations) : rouge sur l'absence des dossiers `0008`/`0009`, puis 15 / 15.
- **T017** (pré-contrôle) : rouge sur le module absent, puis 6 / 6.
- **T011, T012, T013** : écrits avant le code des services, mais pendant la réécriture l'API ne
  compilait plus ; ils n'ont donc été vus rouges que par compilation, pas sur un comportement.
  Ils sont verts dès que le backend recompile.

### Décisions d'implémentation

- **T011 — refus des routes `/admin/floors`** : 403 et `ACCESS_DENIED` (`NOT_SUPER_ADMIN`), comme
  toutes les routes `/admin/*` (`SuperAdminGuard`), et non 404 comme l'indique la tâche. Le 404
  « hors périmètre » s'applique au module des affectations (`/coverage/*`), qui le respecte.
- **Groupes à clé système** : tout compte actif peut être membre (un admin enseignant, un super
  administrateur surveillant, R7, FR-004b) ; auparavant, seuls les comptes de rôle employé.
- **Action `CANCEL`** : l'acteur SYSTEM est ajouté pour annuler une relève en cascade quand
  l'affectation d'origine se termine (comportement existant conservé).
- **Rappel de clôture** : le job revérifie l'échéance réelle (fin prolongée, ou fin de journée locale
  pour une garde « jusqu'à l'arrivée ») et repousse la ligne au lieu d'envoyer trop tôt (FR-016a).
- **Relève** : une demande de relève crée une affectation « en attente » (source `ADMIN_DIRECT`, avec
  délai de prise en charge) ; l'admin l'assigne. Plus de diffusion.
- **SQL des migrations** : limité à WIN1252 (PostgreSQL embarqué sous Windows) ; `0009` sans
  `BEGIN`/`COMMIT` explicites (Prisma l'exécute en une requête, donc en transaction implicite ; un
  bloc explicite masquait le message des garde-fous). Fuseau `Europe/Paris` dans le SQL de `0009`.

### Tests supprimés ou remplacés (diffusion supprimée, FR-011a)

`backend/test/integration/coverage.spec.ts` (T038) :

| Cas d'origine | Sort | Raison |
| --- | --- | --- |
| 2. concurrence : deux employés acceptent en même temps | supprimé | plus d'acceptation par un volontaire ; la sérialisation des assignations reste (verrou par surveillant) |
| limitation de débit sur « Je prends » | supprimé | action `ACCEPT` retirée (400 `UNKNOWN_ACTION`, cas 9) |
| 2 bis. « Déjà prise par [nom] » | supprimé | plus de vue réduite pour les membres d'un groupe ciblé |
| 3. employé hors groupe cible ne peut accepter | remplacé | employé hors module : 404 et refus journalisé |
| 4. employé déjà en garde ne peut accepter | remplacé | surveillant occupé non assignable (`NOT_AVAILABLE`) |
| 4 bis. affectation forcée par le responsable | remplacé | plus de forçage : `force` refusé (400), cas 4 et T012 |
| 5. désistement et rediffusion | supprimé | action `RELEASE` retirée (FR-008f) |
| 6. aucun preneur : non pourvue, groupe relancé | remplacé | « non pourvue » en fin de créneau sans assignation : T013 |
| les employés voient disparaître une garde prise (`coverage:taken`) | supprimé | événement retiré (contracts/realtime-events.md) |
| groupe vide : avertissement, élargissement (`WIDEN`) | supprimé | plus de groupes ciblés ni d'élargissement |

Ajoutés dans le même fichier : assignation d'une demande en attente (surveillant et enseignant
notifiés, FR-017a) ; prolongation avec rappel de clôture recalculé.

`backend/test/unit/coverage-policy.spec.ts` : cas « rediffusion : délai de prise en charge »
supprimé (diffusion retirée ; le délai de prise en charge est une échéance `CoverageReminder`).

`backend/test/integration/coverage-work-isolation.spec.ts` (T039) : la garde de référence est
créée par affectation directe (statut `ACCEPTED` au lieu de `BROADCAST`) ; attendus des demandes
de travail inchangés. `notifications.spec.ts` et `realtime.spec.ts` : verts sans modification.

### Résultat

`npm run lint` sans erreur ; typage backend et frontend sans erreur ; unitaires backend 546 / 546 ;
intégration 366 / 366 (34 suites) ; frontend 159 / 159.

## Phase 2 — interface (T033, T036, T040, T041)

- **T041** (`status-badges.test.tsx`) et **T036** (`floors.test.tsx`) : écrits d'abord, rouges
  (18 et 5 échecs), puis verts. Deux attendus de `floors.test.tsx` corrigés après coup : attente
  du chargement de la liste, et fermeture du dialogue au lieu du message du Toast (le
  `ToastProvider` n'est pas monté dans ce harnais, comme pour les autres écrans d'administration).
- **T040** (`coverage.test.tsx`) : réécrit avant le code, mais non exécuté entre les deux ; il
  référençait des types absents et n'aurait échoué que par compilation.
- **Écran de création** : `CreateCoveragePage.tsx` (diffusion à des groupes) et la route
  `/gardes/nouvelle` sont retirés ; l'affectation directe sera réécrite en T074 (US3). D'ici là,
  l'admin assigne les demandes en attente depuis leur détail.

`frontend/tests/coverage/coverage.test.tsx` (T040) — cas supprimés ou remplacés :

| Cas d'origine | Sort | Raison |
| --- | --- | --- |
| désistement : motif obligatoire | remplacé | désistement retiré (FR-008f) ; même contrôle sur la demande de relève |
| affectation forcée d'un employé déjà en garde | remplacé | plus de forçage : indisponibles listés mais non sélectionnables |
| onglet « À prendre » : « Je prends », course perdue | supprimé | diffusion supprimée (FR-011a) |
| bouton « Je prends » désactivé | supprimé | idem |
| détail « Déjà prise par [nom] » | supprimé | plus de vue réduite |
| création rapide : groupe sans disponible | supprimé | création par diffusion retirée ; affectation directe en T071/T074 |

Ajoutés : onglets du surveillant (« Mes affectations », « Historique »), annulation par l'admin
avec motif facultatif.

Résultat : lint sans erreur ; typage frontend sans erreur ; frontend 180 / 180 (23 fichiers).

## Phase 3 — US4, rôle « Admin » (T042 à T048)

- **T042** (`role-admin-rename.spec.ts`) : écrit d'abord, rouge sur le message de l'API « Seuls les
  responsables… » (1 échec sur 6), puis vert. **T043** (`role-labels.test.tsx`) : rouge (3 échecs),
  puis vert ; un attendu corrigé (l'option « Par un admin » n'existe qu'une fois la liste ouverte).
- **T044** : libellés de l'interface ; « Responsable » au sens de l'employé affecté → « Employé
  affecté » (décision du 2026-10-17). Tests existants adaptés au libellé seul : `admin-pages`,
  `CreateRequestPage`, `routing`, `HistoryTimeline`, `ApprovalPanel` (titres de cas).
- **T046** : `auth`, `us5-admin-validation`, `us6-deadlines`, `us8-admin`, `admin-dashboard` :
  10 / 10 sur Chromium (`npx playwright test --project=chromium …`, 3 min). Les autres profils
  navigateurs sont exécutés en T086.

### T048 — occurrences restantes de « responsable » (SC-007)

`git grep -in responsable -- backend/src frontend/src e2e README.md docs` :

| Fichier | Occurrences | Justification |
| --- | --- | --- |
| `backend/src`, `frontend/src`, `README.md` | 0 | — |
| `e2e/coverage-class.spec.ts` | 6 | parcours de la diffusion supprimée, réécrit en T082 |
| `docs/superadmin-fonctionnalites.md` | 13 | inventaire daté (PR #12), antérieur à 004 ; note en tête renvoyant à la spécification 004 |
| `docs/coverage-migration.md` | 4 | décrit la migration `0002_coverage` (comptes `MANAGER` de l'époque) ; note en tête ; mise à jour en T083 |
| `docs/validation/verification-004.md` | 1 | citation du message d'erreur remplacé (ci-dessus) |

Les sens non liés au rôle (« le surveillant reste responsable » de la classe) ont été reformulés
(« reste en charge de la classe ») plutôt que conservés.

## Phase 4 — US1, demande d'un enseignant (T049 à T059)

### Backend (T049, T050, T052 à T056)

- **T049** (`supervision-teacher-request.spec.ts`, 17 cas) et **T050** (`supervision-deadlines.spec.ts`,
  8 cas) : écrits d'abord, rouges (routes absentes, 17 échecs pour T049), puis verts. Deux attendus
  de T049 corrigés : la sérialisation d'un `RequestEvent` complet échoue sur `seq` (BigInt) ; le
  contrôle « pas de motif dans l'historique » porte désormais sur `fromValue`, `toValue`, `comment`.
- **Ajouts au contrat** : `GET /coverage/classes` (toutes les classes actives, pour tout membre du
  module, FR-012) ; `schoolDates` (`today`, `tomorrow`, fuseau) dans `GET /coverage/availability`,
  le navigateur ne connaissant pas `SCHOOL_TIMEZONE` ; `isTeacher` et `isSupervisor` dans
  `GET /auth/me` et la réponse de connexion (T059, menu « Gardes »). Le calcul des groupes est passé
  dans `common/group-flags.ts` (ordre des couches : `auth` ne dépend pas de `coverage`).
- `WITHDRAW` après assignation répond `409 NOT_PENDING`, comme la modification.
- `auth.spec.ts` : réponse de `GET /auth/me` complétée des deux champs (ajout seul).
- **Instabilité constatée une fois** : lors d'un passage complet, `admin-audit.spec.ts` n'a pas pu
  joindre le PostgreSQL embarqué (`Can't reach database server at localhost:55433`). Repassé seul
  puis dans la suite complète (397 / 397) sans erreur ; cause non établie, à surveiller.

### Interface (T051, T057 à T059)

- **T051** (`teacher-request.test.tsx`, 7 cas ; `admin-queue.test.tsx`, 7 cas) : écrits d'abord, rouges
  (module absent, onglets et menu absents), puis verts au premier passage du code.
- **T057** : `TeacherRequestPage.tsx` (création à `/gardes/signaler`, modification et retrait à
  `/gardes/signalements/:id`, lecture seule une fois assignée) et onglet « Mes signalements ». Les
  heures sont saisies en `HH:MM` dans un champ texte : la date et l'heure locales d'une demande
  existante sont calculées dans le fuseau de l'école renvoyé par le serveur (`schoolDates`).
- **T058** : file de l'admin avec l'onglet « En attente » en tête (`mainStatus=PENDING`, tri du
  serveur : délais expirés d'abord), puis « En cours », « Équipe », « Terminées ». Le dialogue
  d'assignation reste dans `CoverageActions.tsx` (pas de fichier `AssignDialog.tsx` séparé) ; il est
  testé dans `coverage.test.tsx` (étage d'abord, indisponibles non sélectionnables).
- **T059** : menu « Gardes » calculé depuis `GET /auth/me` (`canSeeCoverage`) : admin, super
  administrateur, membre des groupes Enseignants ou Surveillants ; plus d'appel au profil du
  module pour afficher le menu.

Résultat : lint sans erreur ; typages sans erreur ; frontend 197 / 197 (26 fichiers).

## Phase 5 — US2, classe vide déclarée par un surveillant (T060 à T069)

### Backend (T060, T061, T063 à T066)

- **T060** (`coverage-duplicates.spec.ts`, 15 cas) : rouge (module absent), puis vert avec
  `domain/coverage-duplicates.ts` (T063). Le renfort l'emporte sur tout rattachement ; à égalité,
  la plage qui commence le plus tôt.
- **T061** (`supervision-empty-class.spec.ts`, 15 cas) : rouge (15 échecs, route absente), puis vert.
  Attendus corrigés après le premier passage, sans changer le comportement visé : la vue surveillant
  porte `reason: null` (comme en US1) ; un QR refusé répond `422` (codes `QR_*` existants) ;
  `RELIEVE` mène à `CLOSED` quand la catégorie n'exige pas de validation finale ; deux
  notifications d'une même transaction ont le même horodatage (ordre non significatif).
- **Écarts au contrat** :
  - `ALREADY_ASSIGNED` renvoie `coverage: null` : le déclarant n'est ni affecté ni en renfort de
    la demande, il n'a donc pas accès à sa vue ; `assignedTo` donne le surveillant responsable.
  - Ajouts : `GET /coverage/teachers` (surveillant et admin, champ facultatif FR-015a) ; alertes
    `DOUBLE_ASSIGNMENT` (affectations ou renfort qui se chevauchent, FR-015j) et
    `POSSIBLE_DUPLICATE` (proposition en suspens, FR-015h) dans les listes.
  - Renvoi idempotent : par `Request.clientId` quand une affectation est créée ; sinon par un
    marqueur `declarationClientId` dans l'événement qui trace la déclaration (`UPDATED` pour un
    rattachement, `SUPPORT_JOINED` pour un renfort). `ALREADY_ASSIGNED` ne modifie rien et n'est
    pas dédoublonné (seul effet : une notification à l'admin).
  - Déclarations sérialisées par classe (verrou consultatif) : deux surveillants qui déclarent la
    même classe en même temps n'ouvrent pas deux affectations.
- **Décision après coup (FR-015h)** : si l'affectation absorbée est déjà finale, son statut n'est
  pas réécrit ; seul `mergedIntoId` est posé (les statistiques l'excluent, R6). Une proposition
  déjà décidée répond `409 STATE_CHANGED`.
- **T066** : traitements `SUPPORT_DECISION` / `SUPPORT_ESCALATION` déjà présents depuis T032 ;
  vérifiés de bout en bout par T061 (3 rappels à 10 min d'intervalle, puis escalade au super
  administrateur).
- Résultat : lint et typages sans erreur ; unitaires 561 / 561 ; intégration 412 / 412 (38 suites).

### Interface (T062, T067 à T069)

- **T062** : `empty-class.test.tsx` (10 cas) et `urgent-alert.test.tsx` (4 cas) écrits d'abord.
  Rouges : page absente, son et préférence absents. Deux cas de `urgent-alert` passaient déjà
  (rôle `alert` et annonce assertive existants ; aucun son puisqu'il n'y en avait pas) : ils
  décrivent un comportement déjà en place, conservé. Un cas corrigé après coup : le menu masque
  le reste de la page aux technologies d'assistance pendant sa fermeture, le test attend donc
  qu'il soit fermé avant d'envoyer l'alerte.
- **T068** : testé par `admin-duplicates.test.tsx` (5 cas, écrit avant le code) : onglet
  « Doublons » (confirmer, garder distinctes, « Non tranché »), pastilles « Surveillant sur deux
  affectations » et « Doublon possible » dans la file, renforts à libérer et correction de
  l'enseignant dans le détail. `admin-queue.test.tsx` : l'onglet « Doublons » s'ajoute après
  « En cours ».
- **T067** : `EmptyClassPage.tsx` (`/gardes/classe-vide`) ; la page du QR propose « Déclarer cette
  classe vide » quand le surveillant n'a pas d'affectation pour cette classe (classe et QR
  repris). « Mes affectations » (affectations, renforts, « Terminer ») existait depuis la phase 2.
  Lien de retour de la page du QR corrigé (`onglet=mes-affectations`).
- **T069** : `useUrgentSound.ts` : contexte audio créé à la première interaction seulement ;
  préférence locale (`localStorage`, lectures et écritures protégées) ; case à cocher « Signal
  sonore des urgences » dans le menu des notifications.

Résultat : lint et typages sans erreur ; frontend 216 / 216 (29 fichiers).

## Phase 6 — US3, affectation directe par l'admin (T070 à T074)

- **T070** (`supervision-direct.spec.ts`, 18 cas) : écrit d'abord. Premier passage : 16 verts,
  2 rouges. La création directe (`ACCEPTED`, `ADMIN_DIRECT`, champs retirés refusés, `409
  NOT_AVAILABLE`) et la réassignation (statut inchangé si assignée ; relève assignée au nouveau
  si en cours, ancien relevé à sa présence) avaient été réécrites en phase 2 (commit 12a14ee) :
  **T072 et T073 n'ont demandé aucun code nouveau**, ils sont vérifiés par T070. Les 2 rouges
  portaient sur l'ajout ci-dessous, vert ensuite. La suite règle la catégorie de garde en preuve
  « QR seul » ; la photo reste couverte par `coverage.spec.ts`.
- **Ajout au contrat** : `GET /coverage/candidates?classId&startAt&endAt` (admins) : surveillants
  proposables pour un créneau, avant toute création (scénario 2 : un surveillant occupé sur un
  créneau qui chevauche n'est pas proposé). Même tri que `/:id/candidates`.
- **T071** (`direct-assignment.test.tsx`, 5 cas) : rouge (page absente), puis vert.
- **T074** : `CreateCoveragePage.tsx` réécrite (`/gardes/nouvelle`, bouton « Nouvelle affectation »
  des admins) : classe, type, enseignant facultatif, date (jusqu'à 7 jours, borne du serveur),
  début, fin, surveillant parmi ceux du créneau, motif, consigne. Les heures saisies sont celles
  de l'école (`schoolTime.ts`, fuseau renvoyé par le serveur). Message vocal non repris dans ce
  formulaire (toujours accepté par l'API). Dialogue « Réassigner » : sur une affectation en cours,
  rappelle que le surveillant actuel reste jusqu'à la présence du nouveau.

Résultat : lint et typages sans erreur ; unitaires 561 / 561 ; intégration 430 / 430 (39 suites) ;
frontend 221 / 221 (30 fichiers).
