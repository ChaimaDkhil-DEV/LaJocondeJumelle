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

## Phase 7 — US5, historique, statistiques, anonymisation (T075 à T080)

- **T075** (`coverage-stats.spec.ts`, 10 cas) : rouge (module absent), puis vert avec
  `domain/coverage-stats.ts`. Deux règles non écrites dans data-model §7, choisies et testées :
  une relève est comptée avec l'affectation d'origine (pas un second retard) ; après
  anonymisation, les affectations vont dans « Enseignant anonymisé », distinct de « Enseignant non
  précisé ». Paire en suspens dont la demande est annulée : la déclaration reste l'événement.
- **T076** (`supervision-stats.spec.ts`, 7 cas) : 4 rouges, 3 verts avant le code. Verts : le
  scénario 1 (historique détaillé déjà servi par `GET /coverage/:id`) et les deux refus, qui
  passaient alors pour une mauvaise raison (`/coverage/stats` tombait sur `/:id` → 404) ; ils
  vérifient la vraie route depuis T078. Un attendu corrigé (nom d'affichage « Enseignante »).
- **T077** (`supervision-anonymization.spec.ts`, 4 cas) : rouge (job absent), puis vert. Le compte
  technique `enseignant-anonymise` (migration 0009) est recréé à l'identique s'il manque (base de
  test réinitialisée) plutôt que de faire échouer le job. Attendu corrigé : le journal d'audit
  n'est pas vidé entre les cas, le décompte se fait avant / après.
- **T078** : `GET /coverage/stats` (admins et super administrateur ; période par défaut : mois en
  cours de l'école ; 400 jours au plus ; aucun export, paramètre inconnu refusé).
- **T079** : `CoverageAnonymizationService` + `CoverageAnonymizationJob` (toutes les heures,
  verrou consultatif, lots de 200, idempotent). Pour une demande d'enseignant, l'auteur passe au
  compte technique et la consigne est effacée ; le `cancelReason` saisi par l'admin est conservé.
- **Correction (US2)** : les clés `sourceRequestId`, `targetRequestId`, `afterTheFact` du journal
  d'audit de `COVERAGE_MERGE_DECIDED` étaient filtrées par la liste blanche ; ajoutées, avec
  `retentionMonths` et `cutoff` (anonymisation).
- **T080** : `CoverageStatsPage.tsx` (`/gardes/statistiques`, bouton « Statistiques » des admins) ;
  historique du détail : sources, réassignations « de X à Y », renforts, correction de
  l'enseignant, décisions de doublon, noms résolus à la lecture (jamais stockés, R5) ;
  `stats.test.tsx` (5 cas) rouge puis vert.
- **Passage complet** : un premier passage a eu 1 échec (`coverage.spec.ts`, cas « disponibilité »,
  dépassement de 30 s ; la suite a pris 270 s). Repassée seule : 23 / 23 en 12 s ; repassage
  complet : 441 / 441 (41 suites) en 212 s. Même instabilité ponctuelle de la base embarquée qu'en
  phase 4 ; cause non établie.

Résultat : lint et typages sans erreur ; unitaires 571 / 571 ; intégration 441 / 441 ; frontend
226 / 226 (31 fichiers).

## Phase 8 — Finitions (T081 à T086)

### T081 — Matrice des permissions

- `supervision-permissions.spec.ts` : 26 routes × 5 rôles + sans session, 157 cas. Premier
  passage : 10 échecs, tous des écarts réels au principe V (aucun attendu corrigé) :
  `GET /coverage/mine`, `GET /coverage/history` et `PATCH /coverage/availability` répondaient
  200 à tout compte connecté (listes vides ou disponibilité modifiable par un employé hors
  module) ; `POST /coverage/presence/resolve` donnait le nom de la classe d'un QR à un employé
  hors module. Corrigé : espace du surveillant réservé au groupe Surveillants et au super
  administrateur, page du QR aux membres du module ; refus `404` journalisés.
- Exception assumée : `GET /coverage/availability` reste ouvert à tout compte connecté ; il ne
  renvoie que les capacités et la disponibilité de l'appelant (aucune donnée d'autrui).
- Administration du module : `403` journalisé (SuperAdminGuard), écart déjà documenté en phase 2.
- Résultat : unitaires 571 / 571 ; intégration 598 / 598 (42 suites).

### T083 — Documentation

`docs/ARCHITECTURE.md` (section 13 et tableaux mis à jour) et `docs/coverage-migration.md`
(procédure 004 : pré-contrôle, validations V1 à V3, déploiement, contrôles, retour arrière).

### T084 — Répétition de migration

- **Base utilisée** : PostgreSQL embarqué jetable (port 55498, dossier temporaire), **pas une
  copie de la production** : aucune n'est disponible dans cet environnement, et la base de
  développement partagée (5433) n'a pas été utilisée. Données : état `0007` construit avec le jeu
  des tests de migration (gardes dans chaque statut) + 2 000 gardes terminées, soit 2 011 gardes
  et 2 011 événements.
- **Outils réels** : `buildPreflightReport` (script `preflight:supervision`), `prisma migrate
  deploy` pour `0008` puis `0009`, `prisma db execute` pour les `down.sql`.
- **Résultats** :

| Étape | Durée | Résultat |
|---|---|---|
| Pré-contrôle | 36 ms | lecture seule (aucun événement ajouté) ; 2 membres listés (V1) ; 0 garde sans équivalent (V2) ; 0 anonymisation à la première exécution (V3) |
| `0008_supervision_schema` | 1,6 s | appliquée |
| `0009_supervision_data` | 1,6 s | `BROADCAST` 1 → `PENDING` ; `UNFILLED` non terminée 1 → `PENDING` ; autres statuts inchangés ; `MANAGER` → `ADMIN` ; groupes `SUPERVISORS` et `TEACHERS` ; compte `enseignant-anonymise` inactif |
| Contrôles | — | 2 011 événements conservés (tous les identifiants présents) + 2 ajoutés (`migration-0009`) ; journal d'audit inchangé (1 ligne) |
| `0009/down.sql` puis `0008/down.sql` | 1,5 s chacun | statuts initiaux restaurés à l'identique, rôle `MANAGER` restauré, nouvelles tables supprimées ; historique en ajout seul : 2 événements ajoutés par le retour arrière, aucun supprimé |

- **Reste à faire avant la mise en production** : la même répétition sur une copie de la base de
  production en préproduction (quickstart, « Migration »), avec les validations V1 à V3 signées.
  Script de répétition non versionné (outil ponctuel) ; la procédure est celle de
  `docs/coverage-migration.md`.

### T082 — Parcours de bout en bout

- `e2e/coverage-class.spec.ts` réécrit : trois parcours, chacun à 360, 768 et 1280 px
  (Chromium) : A. demande d'un enseignant → assignation → en route → présence QR + photo →
  terminée ; B. classe vide → seconde déclaration en renfort → libération du renfort par l'admin →
  terminée ; C. affectation directe → réassignation → annulation. Défilement horizontal et axe
  vérifiés sur chaque écran traversé. Créneaux du jour : parcours ignorés après 22 h (heure de
  l'école).
- **Premier passage** : 3 échecs. Cause unique : à 360 px, le parcours B a échoué sur le message
  « Remplaçante est libéré(e) » ; l'affectation restée ouverte a fait échouer les parcours
  suivants (surveillant occupé, déclaration rattachée). Correctifs :
  - **défaut réel de l'interface** : la libération du dernier renfort fonctionnait (historique
    « Renfort libéré ») mais sans confirmation. La liste des renforts n'était montée que s'il en
    restait ; TanStack Query n'exécute pas les rappels d'un `mutate` dont le composant a disparu.
    La liste reste montée (rendu vide). **Même défaut** trouvé à la relecture sur le retrait d'une
    demande par l'enseignant (la page passe en lecture seule, « Demande retirée. » perdu) : actions
    sorties du formulaire. Deux tests de non-régression (`admin-duplicates.test.tsx`,
    `teacher-request.test.tsx`) **rouges sans le correctif, verts avec** ; il a fallu que les faux
    serveurs relisent l'état à jour avec un délai réseau, comme le vrai, pour reproduire le défaut ;
  - **indépendance des parcours** : chacun commence par l'annulation, par l'API et avec la
    session de l'admin, des affectations encore ouvertes.
- Serveurs e2e orphelins après l'arrêt du premier passage (API et Vite de ce worktree) : arrêtés
  après vérification de leur ligne de commande ; base e2e déjà arrêtée.
- **Second passage** : 9 / 9 (3,7 min).
- `e2e/a11y-responsive.spec.ts` : écrans des affectations à 320 px (enseignante, surveillant,
  admin et ses cinq onglets, nouvelle affectation, statistiques, étages) : 3 / 3 (profil
  `mobile-320`).

Résultat : lint et typages sans erreur ; frontend 226 / 226 (31 fichiers).

### T085 — Scénarios manuels (quickstart)

Déroulé le 20/10/2026 entre 21:05 et 22:10 (heure de l'école), dans un vrai navigateur
(Chromium piloté pas à pas, captures d'écran relues), sur les serveurs e2e (base jetable,
tâches planifiées actives toutes les 15 s). Vérifications complémentaires en lecture seule sur
la base jetable (échéances, notifications, journal d'audit).

| # | Résultat | Observations |
|---|---|---|
| 1 | Conforme | « en attente » ; admin notifiée ; rappel du matin prévu à 07:00 |
| 2 | Conforme | candidats du 1er étage en tête, indisponible grisé et libellé ; surveillant et enseignante notifiés ; motif absent chez le surveillant |
| 3 | Conforme | alerte URGENT à l'admin à +2 min, demande en tête avec bordure rouge ; escalade au super administrateur à +7 min |
| 4 | Conforme après correctif | premier passage : fausse « double affectation » (voir défaut 1) ; revérifié sur le code corrigé : aucun avertissement, une seule notification URGENT `COVERAGE_EMPTY_CLASS` |
| 5 | Conforme | renfort ; 3 rappels à l'admin puis escalade au super administrateur. Mise en veille du poste de 21:28 à 22:05 (journal Windows) : rappels en retard rattrapés à la reprise, en rafale (≈ 30 s) |
| 6 | Conforme | surveillants occupés grisés avec leur motif ; par l'API : `409 NOT_AVAILABLE` ; avec un disponible : « assignée » |
| 7 | Conforme | relève assignée ; l'ancien reste en classe ; à la présence du nouveau (QR + photo), l'origine est close et le renfort libéré automatiquement |
| 8 | Conforme | « non pourvue » à la fin du créneau, bandeau URGENT en direct chez l'admin ; enseignante notifiée ; comptée à part dans les statistiques |
| 9 | Conforme | `reprographie` : pas de menu « Gardes », page vide ; `surveillant` : `ASSIGN` et liste admin → `404`, refus journalisés (`NOT_VISIBLE`, `NOT_COVERAGE_ADMIN`) |
| 10 | Conforme | « Admin » pour l'admin ; menu et page « Administrateur » ; catégories et circuit B inchangés |
| 11 | Conforme | chiffres exacts au regard des données : 2 événements, 50 % de non pourvue, durée moyenne 7 min, « Enseignant non précisé » à part |

**Défauts corrigés** (commit `24f0c1e`, tests de non-régression rouges sans le correctif) :

1. Fin inconnue d'un créneau traitée comme « sans fin » : une classe vide déclarée chevauchait
   toute affectation future (fausses doubles affectations URGENT, surveillant indisponible pour
   les jours suivants, y compris dans l'onglet « Équipe »). Fin inconnue = fin de la journée de
   l'école (FR-016a) ; « disponible maintenant » vérifié à l'instant présent.
2. Début des affectations sans le jour (« À 07:00 » pour demain) et « Maintenant » pour tout
   début passé.

**Point à décider (non corrigé)** : les formulaires saisissent et affichent l'heure de l'école,
les listes affichent l'heure du poste. Sur un poste réglé sur un autre fuseau (le navigateur de
test était en `Etc/GMT-1`), une même demande se lit 08:00 dans le formulaire et 07:00 dans la
liste. Sans effet quand les postes sont dans le fuseau de l'école.

**Observations non corrigées** (comportements existants ou libellés) :
- message `NOT_AVAILABLE` au vocabulaire ancien (« employé », « garde ») ; titre « Garde — … » ;
  tuile « Retards et absences » qui compte aussi les classes vides ;
- « Prolonger » proposé sur une demande en attente et sur une affectation sans fin (fixe alors
  une fin) ; un renfort peut être choisi pour une réassignation de la même affectation ;
- l'affectation directe ne signale pas une demande en attente pour la même classe et le même
  créneau (le contrôle de doublon ne vise que les déclarations, comme le prévoit la spec) ;
- après une interruption du serveur, les rappels en retard partent l'un après l'autre ;
- hors 004 : chaque déconnexion ajoute deux entrées `UNAUTHENTICATED` au journal d'audit (relecture
  par la page après la fin de session) ;
- le son de l'alerte urgente n'a pas été écouté (navigateur sans sortie audio) ; couvert par
  `urgent-alert.test.tsx`.

Nettoyage : serveurs arrêtés (processus orphelins vérifiés par leur ligne de commande puis
arrêtés), scripts de lecture temporaires et dossier d'artefacts du navigateur supprimés.

### T086 — Vérification complète

- `npm run verify` (lint, tous les tests, `npm audit --audit-level=high`) : **réussi**.
  Unitaires 572 / 572 (29 suites) ; intégration 599 / 599 (42 suites) ; frontend 229 / 229
  (32 fichiers). `npm audit` : aucune vulnérabilité haute ou critique ; 21 modérées, toutes dans
  des dépendances déjà présentes sur `master` (aucune dépendance ajoutée, voir ci-dessous).
- Typages : backend et frontend sans erreur.
- **R15, dépendances** : `package-lock.json` identique à `master` ; seul ajout dans
  `backend/package.json` : le script `preflight:supervision`.
- **Playwright complet** (6 projets : chromium, firefox, webkit, iPhone 13, Pixel 7,
  mobile-320 ; 40 min) : 141 réussis, 73 ignorés par conception (parcours réservés à Chromium,
  contrôles réservés au profil 320 px), **2 échecs** :
  1. `auth.spec.ts`, premier test du projet Firefox : `NS_ERROR_CONNECTION_REFUSED` sur le
     serveur de développement. Repassé seul : 4 / 4. Incident ponctuel au démarrage de Firefox,
     tous les autres tests Firefox réussis.
  2. `a11y-responsive.spec.ts`, écrans 004 à 320 px : **défaut réel**. Le tableau des
     statistiques dépasse l'écran et sa zone de défilement n'était pas atteignable au clavier
     (axe `scrollable-region-focusable`, sérieux). Non vu au passage précédent : sur une base
     sans affectation du mois, la page affiche l'état vide et non le tableau. Correctif : zone
     nommée (`role="region"`, titre du tableau) et focalisable. Le test e2e crée désormais une
     demande annulée avant les écrans, pour que le tableau soit toujours présent. Démontré :
     **sans le correctif, le test échoue sur cette règle ; avec, 3 / 3**. Assertion ajoutée dans
     `stats.test.tsx` (rouge puis verte).

Résultat final : lint et typages sans erreur ; unitaires 572 / 572 ; intégration 599 / 599 ;
frontend 229 / 229 ; e2e complet vert après correctif (les deux échecs expliqués et repassés).
