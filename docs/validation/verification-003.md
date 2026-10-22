# Vérification de la fonctionnalité 003 — corrections issues de l'audit technique

- **Branche** : `003-corrections-audit-technique`
- **Poste** : Windows 11, Node.js 24.21, PostgreSQL 17 embarqué (embedded-postgres)

## État initial (T001)

- **Date** : 15 octobre 2026
- **Commit** : `ea47b02` (documents de conception seuls, aucun code modifié depuis la branche 002)

| Commande | Code de sortie | Résultat |
|----------|----------------|----------|
| `npm run lint` | 0 | aucun problème |
| `npm run -w backend typecheck` | 0 | aucune erreur |
| `npm run -w frontend typecheck` | 0 | aucune erreur |
| `npm run -w backend test` (unitaires) | 1 | 348 / 349 ; 15 suites dont 1 en échec |
| `npm run -w backend test:integration` | 0 | 248 / 248 ; 24 suites (140 s) |
| `npm run -w frontend test` | 0 | 120 / 120 ; 17 fichiers |

**Échec constaté** : `backend/test/unit/config.spec.ts` › `loadConfig` › « charge une
configuration valide avec les valeurs par défaut » : `expect(config.port).toBe(3000)`, reçu
`3002`. C'est l'échec attendu (constat A01) : le port par défaut est passé à 3002 dans le commit
`1e6d4ee` sans mise à jour du test. Il est corrigé par T002.

**Aucun autre échec.**

## Phase 2 — suite verte et CI

- **T002** : `config.spec.ts` attend désormais 3002 ; `npm run -w backend test` : 349 / 349.
- **T003** : `.github/workflows/ci.yml` créé (job `verify`, « Contrôles qualité »).
- **T004** : `package-lock.json` contient déjà `node_modules/@embedded-postgres/linux-x64`
  (`17.10.0-beta.17`, ligne 1155) : aucune modification du verrou nécessaire.

- **T005, premier passage de la CI** (commit `b9ed428`, 15 octobre 2026) : run `push`
  (`38809322292`) réussi sur toutes les étapes ; run `pull_request` (`38809324478`) en échec sur
  `coverage.spec.ts` › « 1. nominal » : `→CLOSED` reçu avant `→DONE`. Même commit, résultat
  différent : test instable, constat **N3** (research R15). Le binaire Linux d'embedded-postgres,
  `npm audit` et `search-performance.spec.ts` fonctionnent en CI : aucune exclusion nécessaire.
- **T063** : deux tests déterministes ajoutés (`history-priority.spec.ts`, `coverage.spec.ts`) ;
  rouges avant correction (ordre inversé dans les deux historiques).
- **T064** : colonne `RequestEvent.seq` (migration `0003_request_event_seq`), tris par
  `createdAt` puis `seq`. SQL de la migration identique à celui que Prisma génère pour le schéma.
  Suite locale : lint et types sans erreur ; unitaires 349 / 349 ; intégration 250 / 250 ;
  frontend 120 / 120.
- **T005, CI après correction** (commit `6aac605`) : runs `push` (`38811005287`, 3 min 40 s) et
  `pull_request` (`38811010302`, 4 min 30 s) réussis sur toutes les étapes.
- **T006** : `docs/procedure-fusion.md`, `.github/pull_request_template.md` et renvoi dans
  `README.md`. Procédure manuelle (décision D10) : GitHub n'empêche pas une fusion rouge.

## Phase 3 — US1, port 3002 cohérent

- **T007** : `backend/test/unit/dev-port-consistency.spec.ts`, 9 cas ; rouge sur 6 avant
  correction (`.env.example`, `Caddyfile.dev`, `README.md`, `dev:backend`), vert après.
- **T008** : `client.test.ts`, deux attendus resserrés au message exact ; verts dès leur
  écriture (comportement existant, exception documentée à la règle « rouge d'abord »).
- **T009 à T012** : `PORT=3002` et commentaire dans `backend/.env.example` ; `Caddyfile.dev`
  vers 3002 ; README (port 3002, consigne pour un ancien `.env`) ; `dev:backend` →
  `start:dev`. `start.bat` appelle `npm run dev` : aucune autre modification.
- Suites : unitaires backend 358 / 358 ; frontend 120 / 120 ; lint sans erreur.
- **T013** (manuel, poste Windows) : **à faire** — `start.bat`, connexion, rechargement sans
  compilation, chronométrage (SC-001), message affiché API arrêtée.

## Phase 4 — US2, sécurité et traçabilité

- **T014 à T017** (tests d'abord, tous rouges avant correction) : cas `TRUST_PROXY` dans
  `config.spec.ts` ; `sensitive-keys.spec.ts` ; `origin.spec.ts` ; `describe('resetSuperAdminPassword')`
  dans `bootstrap-production.spec.ts`, ligne de commande réelle et base inaccessible compris.
- **T018** : `common/sensitive-keys.ts`, liste unique ; le logger masque désormais `message`,
  l'audit retire `authorization`. Aucun appel du logger ne passe d'objet à clé `message` [VÉRIFIÉ].
- **T019** : `common/origin.ts` (`isAllowedOrigin`) ; Referer admis pour HTTP seulement,
  comme avant.
- **T020, T021** : `TRUST_PROXY` validé par `loadConfig` (liste renvoyée sans espaces autour des
  virgules) ; `app.setup.ts` et `main.ts` lisent `APP_CONFIG`. `process.env` ne reste lu que
  dans `config/` et `cli/bootstrap.ts`.
- **T022, T023** : `bootstrap.ts --reset-password [identifiant]` ; script
  `reset-superadmin-password.ts` supprimé ; exemples dans le README.
- Suites : lint et types sans erreur ; unitaires 392 / 392 ; intégration 257 / 257 ; frontend
  120 / 120.
- **T024** (manuel, quickstart scénarios 2 et 3) : **à faire**.

## Phase 5 — US3, affectation figée à la soumission

- **T025** : `auto-assignment-snapshot.spec.ts`, 7 cas. Avant correction : (1) affectée à E2 au
  lieu de E1 (constat [DÉDUIT] **A04 confirmé**, FR-009) ; (2) `422 ASSIGNEE_REQUIRED` (**N1
  confirmé**) ; (3) et (3b) `RECIPIENT_NOT_ALLOWED` au lieu de `AUTO_ASSIGNEE_UNAVAILABLE` ;
  (5) et (6) source absente ; (4) vert (comportement conservé). Tous verts après correction.
- **T026, T031** (interface) : rouges, puis verts.
- **T027 à T029** : `autoAssigneeId` figé dans le snapshot ; code `AUTO_ASSIGNEE_UNAVAILABLE` ;
  `assigneeContext` suit le snapshot (EXC-1, EXC-2), source sur l'événement `ASSIGNED`. Le
  nouveau refus ne remplace que `ASSIGNEE_REQUIRED`, après les contrôles de droits et d'état.
  `requests-circuit-b.spec.ts` et `assignable-employees.spec.ts` verts, attendus inchangés.
- **T030** : boîte d'approbation en choix manuel après `AUTO_ASSIGNEE_UNAVAILABLE` (message du
  serveur, focus sur le choix de l'employé, sans `autoFocus` : règle `jsx-a11y/no-autofocus`).
  **Écart** : `autoAssigneeId` n'est pas ajouté au type `rulesSnapshot` de l'interface, car
  l'API ne l'expose pas (`requests.mapper.ts`) et l'interface n'en a pas besoin.
- **T031** : source affichée après « Affectée à <nom> » ; événements antérieurs inchangés.
- Suites : lint et types sans erreur ; unitaires 392 / 392 ; intégration 264 / 264 ; frontend
  122 / 122. Incident local : un PostgreSQL de test orphelin (fin de run en `EBUSY` sous
  Windows) bloquait le port 55433 ; arrêté, puis suite d'intégration verte.
- **T032** (manuel, quickstart scénario 4) : **à faire** ; D1 reste à faire confirmer par
  l'établissement.

## Phase 6 — US4, dépendances lisibles et vérifiées

- **T033** : `architecture-layers.spec.ts`, rouge au départ sur 11 imports : `auth → requests`
  (2), `common → audit`, `common → auth`, `files → requests` (4), `files → coverage` (3),
  `coverage → scheduler`. L'expression des imports couvre aussi les imports sans liaison
  (`import '…'`), sans quoi la contre-épreuve (a) ne pourrait pas échouer.
- **T034** : `enums-sync.test.ts`, vert. `RequestStatus` et `DeadlineStage` du schéma sont
  partagés par les demandes de travail et la couverture de classe ; l'interface les découpe
  (`RequestStatus` + `CoverageStatus`, `DeadlineStage` + `CoverageStage`) : le test compare le
  schéma à leur réunion. Aucune divergence réelle.
- **T035 à T041** (un commit par déplacement ; après chacun, types, unitaires et intégration
  verts) : `common/authorization.ts` ; `request-info` vers `common/` ; `SuperAdminGuard` vers
  `audit/` ; `RequestPolicyModule` ; registre d'accès aux fichiers (`WorkFileAccess`,
  `CoverageFileAccess`, fermé par défaut ; le rattachement d'un fichier à une couverture au
  téléversement reste refusé, comme avant) ; job des délais de couverture dans `scheduler/`.
  Tests existants : chemins d'import seuls modifiés ; deux `describe` de `access-policy.spec.ts`
  déplacés dans `authorization.spec.ts`, attendus inchangés.
- **T042** : vérification des couches verte, sans violation imprévue.
- **T043 à T047** : `NoopNotificationPublisher` supprimé ; commentaire de
  `RealtimeGatewayModule` ; `@mui/icons-material` désinstallée (build frontend vert) ;
  `check-users.ts` formaté ; en-tête de `api/types.ts`.
- **T048, contre-épreuves** :
  (a) `import '../requests/request-policy.loader';` ajouté dans `files/files.service.ts` →
  `architecture-layers` échoue : « files/files.service.ts → ../requests/request-policy.loader
  (files ne peut pas dépendre de requests) » ; annulé.
  (b) `TEST_VALUE` ajoutée à `enum RequestStatus` → `enums-sync` échoue : « RequestStatus :
  manquant côté interface [TEST_VALUE] ; en trop côté interface [] » ; annulé.
  (c) suite complète : lint et types sans erreur ; unitaires 393 / 393 ; intégration 264 / 264 ;
  frontend 127 / 127. `git status` propre après les contre-épreuves.

## Phase 7 — US5, mise en production (T049 à T054 ; T055 à T058 sur préproduction)

### T049 — sorties de `prisma migrate status` (Prisma 6.19.3)

Relevées le 16 octobre 2026 sur une base PostgreSQL 17 **jetable** (embedded-postgres, port
55444, dossier temporaire supprimé ensuite), avec une **copie temporaire** de `backend/prisma`
où une migration de test vide (`9999_test_pending`) a été ajoutée. Ni la base de développement
(port 5433) ni `backend/prisma/migrations` n'ont été modifiées ; aucune migration n'a été
appliquée à une base persistante, d'où l'absence de sauvegarde préalable.

| État | Code | Sortie |
|------|------|--------|
| Schéma à jour | 0 | stdout : `Database schema is up to date!` |
| Migration en attente | 1 | stdout : `Following migration have not yet been applied:` puis `9999_test_pending` |
| Base arrêtée | 1 | stderr : ``Error: P1001: Can't reach database server at `localhost:55444` `` |

Conséquence pour l'entrypoint (T053) : « en attente » et « base inaccessible » ont le même code ;
seul le texte `have not yet been applied` (stdout) les distingue. Toute autre sortie non nulle
est traitée comme une erreur bloquante.

### T050 à T054

- **T050** : `backend/test/unit/api-entrypoint.spec.ts`, 5 cas, faux `npx` et `node` ; shell
  `/bin/sh` sous Linux, `bash.exe` de Git for Windows sous Windows (échec explicite s'il manque).
  Avant correction : (1), (2), (3) et (5) en échec — (1) aussi, car l'ancien script appliquait
  `migrate deploy` à chaque démarrage ; (4) vert.
- **T053** : `deploy/api-entrypoint.sh` (POSIX `sh`, `set -eu`, fins de ligne LF imposées par
  `.gitattributes`) : schéma à jour → démarrage ; migration en attente → archive `db-*.dump` de
  moins de `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes exigée dans `PRE_MIGRATION_BACKUP_DIR`
  (défaut `/backups`), sinon refus ; toute autre erreur → sortie de Prisma recopiée, code 1.
  T050 vert (5 / 5).
- **T051** : `deploy/deploy.sh` (bash, `set -euo pipefail`, exécutable, mode 100755) :
  sauvegarde par le service `backup` puis `up -d --build` ; refuse de s'exécuter hors de la racine
  du dépôt ou sans `deploy/.env` (vérifié localement). **Écart volontaire** : sans `--no-deps`
  (contrat et R12), pour que la base soit démarrée avant la sauvegarde au premier déploiement.
  Les étapes Docker n'ont pas été exécutées (Docker absent du poste) : à vérifier en T055.
- **T052** : `docker-compose.yml`, service `api` : `${BACKUP_DIR:-./backups}:/backups:ro` et
  `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` (défaut 60) ; variable commentée dans
  `deploy/.env.example`. Port de production 3000 et healthcheck inchangés.
- **T054** : `README.md` (section Déploiement) et `docs/coverage-migration.md` : `deploy/deploy.sh`
  remplace la sauvegarde manuelle et `docker compose … up -d --build` ; refus expliqué.
- Suites : lint et types sans erreur ; unitaires 398 / 398 ; intégration 264 / 264 ; frontend
  127 / 127.
- **T055 à T058** : non lancés (préproduction nécessaire).

## Phase 8 — clôture

- **T059** : `docs/ARCHITECTURE.md` mis à jour : en-tête, constats corrigés avec leur commit,
  A04 et A11 re-marqués [VÉRIFIÉ], A20 et A26 partiellement vérifiés, A23 à A25 laissés ouverts
  (préproduction) ; ordre des couches et test décrits ; cycle restant mesuré le 16 octobre 2026 :
  `auth`, `realtime`, `settings`, `users` (hors périmètre) ; nouveau §12 de suivi (A01 à A35,
  N1 à N3).
- **T060** : statut de traitement ajouté au registre de `spec.md` ; D1 reste à faire confirmer
  par l'établissement.

### Vérification finale (T061) — 16 octobre 2026, commit de départ `4575b84`

`npm run verify` : code de sortie 0.

| Étape | Résultat |
|-------|----------|
| Lint (ESLint, dont jsx-a11y) | aucun problème |
| Types backend et frontend (`typecheck`) | aucune erreur |
| Tests unitaires backend | 398 / 398 (21 suites) |
| Tests d'intégration backend (PostgreSQL embarqué) | 264 / 264 (25 suites) |
| Tests frontend (Vitest) | 127 / 127 (18 fichiers) |
| `npm audit --audit-level=high` | aucune vulnérabilité élevée ou critique (21 modérées, comme au lot 1) |

Avertissement `DEP0190` de Node supprimé : `bootstrap-production.spec.ts` lance désormais `tsx` par
`node`, sans shell. CI GitHub verte sur `4575b84` (push et demande de fusion) ; à revérifier sur
le commit de clôture.

### Vérification finale et bout en bout (T061, T058) — 22 octobre 2026, `master` `855961c`

Section A de `docs/validation/preproduction-003.md`, en local (Windows), après `npm ci` (les
dépendances locales dataient du 16 octobre : `@vitejs/plugin-react` manquait, le lancement des
tests frontend échouait ; sans lien avec le code, la CI installe par `npm ci`).

`npm run verify` : code de sortie 0.

| Étape | Résultat |
|-------|----------|
| Lint (ESLint, dont jsx-a11y) | aucun problème |
| Types backend et frontend (`typecheck`) | aucune erreur |
| Tests unitaires backend | 572 / 572 (29 suites) |
| Tests d'intégration backend (PostgreSQL embarqué) | 599 / 599 (42 suites) |
| Tests frontend (Vitest) | 229 / 229 (32 fichiers) |
| `npm audit --audit-level=high` | aucune vulnérabilité élevée ou critique (21 modérées) |

CI GitHub verte sur `855961c` (« Contrôles qualité », toutes les étapes).

`npm run test:e2e` (T058), lancé de 00 h 04 à 00 h 42, heure de l'école : les parcours
d'affectations ont tourné. (Correction du 2026-10-22, spec 006 : la garde censée les ignorer de
22 h à minuit ne s'appliquait jamais — l'heure « 22 h » lue par `Number` donnait NaN ; corrigée
dans `e2e/coverage-class.spec.ts`, voir `verification-006.md`.) 6 profils : Chromium, Firefox, WebKit,
iPhone 13, Pixel 7, 320 px. **143 réussis, 0 échec, 73 ignorés volontairement** (37,7 min) :

- 45 : parcours d'affectations `coverage-class.spec.ts` (3 parcours × 3 largeurs), réservés à
  Chromium ;
- 15 : V18 et écrans des affectations à 320 px, réservés au profil 320 px ;
- 5 : changement de mot de passe imposé (compte partagé `nouveau`), réservé à Chromium ;
- 4 : V14 (délais réels), réservé à Chromium et iPhone 13 ;
- 4 : mesure SC-001, réservée aux profils téléphone.

Mesure SC-001 (demande vocale complète créée et envoyée, limite 60 s) : **iPhone 13 : 15,9 s ;
Pixel 7 : 14,0 s** (annotations du rapport `e2e/playwright-report`).

### Relecture du quickstart (T062)

| Scénario | Consigné | État |
|----------|----------|------|
| 1 — Démarrage sur le port 3002 | contrôles automatiques (Phase 3) | parcours manuel **à faire** (T013) |
| 2 — Configuration refusée au démarrage | tests `config.spec.ts` (Phase 4) | démarrage manuel **à faire** (T024) |
| 3 — Réinitialisation tracée | tests `bootstrap-production.spec.ts` (Phase 4) | déroulé à deux navigateurs **à faire** (T024) |
| 4 — Affectation figée | tests `auto-assignment-snapshot.spec.ts` (Phase 5) | déroulé manuel **à faire** (T032) |
| 5 — Dépendances et nettoyage | contre-épreuves (Phase 6, T048) | **fait** |
| 6 — Mise en production | entrypoint testé (Phase 7) ; bout en bout et vérification finale (22 octobre) | T058 et T061 **faits** ; **à faire sur préproduction** (T055 à T057) |
| Clôture | `docs/ARCHITECTURE.md` §12 (T059) | fait ; A23 à A26 ouverts |

Critères de réussite : SC-003 à SC-007 atteints ; SC-001, SC-002, SC-008 et SC-009 ouverts ou
partiels (détail dans `spec.md`, « État des critères »). La fonctionnalité **ne peut pas être
déclarée prête pour la production** tant que T055 à T058 ne sont pas faits.
