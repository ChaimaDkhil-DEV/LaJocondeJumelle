---

description: "Task list for feature 003 — corrections issues de l'audit technique"
---

# Tasks: Corrections issues de l'audit technique

**Input**: Design documents from `/specs/003-corrections-audit-technique/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBLIGATOIRES — constitution, principe I (TDD non négociable). Chaque test listé avant
une implémentation DOIT être écrit et constaté **rouge** avant de coder. Les refactorisations
sans effet visible (US4) sont protégées par la suite existante : ses attendus NE DOIVENT PAS
être modifiés (SC-007) ; seuls les chemins d'import peuvent changer.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 à US5, voir spec.md)
- Les références `Rn` renvoient à research.md, `Ann`/`Nn` au registre des constats de spec.md

## Path Conventions

- Application web, workspaces npm : `backend/src/`, `backend/test/{unit,integration,utils}/`,
  `frontend/src/`, `frontend/tests/`, `deploy/`, `docs/`
- Commandes : `npm run -w backend test` (unitaires), `npm run -w backend test:integration`
  (PostgreSQL embarqué, en série), `npm run -w frontend test`, `npm run lint`,
  `npm run verify` (lint + tous les tests + `npm audit --audit-level=high`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: établir l'état de départ mesuré

- [ ] T001 Exécuter `npm run lint`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm run -w backend typecheck` et `npm run -w frontend typecheck` sur la branche `003-corrections-audit-technique` ; consigner chaque résultat (réussis / échecs, noms des tests en échec) dans une section « État initial » de `docs/validation/verification-003.md` (créer le fichier sur le modèle de `docs/validation/verification-finale.md`). Attendu connu : `backend/test/unit/config.spec.ts` en échec (attendu 3000, reçu 3002). Tout autre échec DOIT être signalé avant de continuer.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: remettre la suite au vert et la protéger par la CI avant toute autre modification
(constitution : aucune fusion si la suite échoue)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 Dans `backend/test/unit/config.spec.ts`, remplacer l'attendu `expect(config.port).toBe(3000)` par `toBe(3002)` (le code est déjà à 3002 depuis le commit `1e6d4ee`) ; relancer `npm run -w backend test` : tout DOIT être vert (A01)
- [ ] T003 Créer `.github/workflows/ci.yml` selon `contracts/cli-and-deploy.md` §Intégration continue (R11) : déclencheurs `push` et `pull_request` ; `runs-on: ubuntu-latest` ; `actions/checkout` ; `actions/setup-node` avec `node-version-file: .nvmrc` et cache npm ; `sudo apt-get update && sudo apt-get install -y ffmpeg` ; `npm ci` ; `npm run -w backend prisma:generate` ; puis, chacune en étape bloquante : `npm run lint`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm audit --audit-level=high`. Ne PAS inclure `npm run test:e2e` (décision D3)
- [ ] T004 Vérifier que `package-lock.json` contient le binaire Linux d'embedded-postgres (`grep -n "@embedded-postgres/linux-x64" package-lock.json`). S'il manque : l'ajouter au verrou (`npm install --package-lock-only --os=linux --cpu=x64` puis vérifier que le verrou Windows reste fonctionnel avec `npm ci` en local) ; consigner la vérification dans `docs/validation/verification-003.md` (point [DÉDUIT] de R11)
- [ ] T005 Pousser la branche, constater le passage de la CI sur GitHub (onglet Actions) ; si `backend/test/integration/search-performance.spec.ts` est instable sur la machine GitHub, l'exclure de la CI par `--testPathIgnorePatterns search-performance` dans `.github/workflows/ci.yml` uniquement et le noter dans `docs/validation/verification-003.md` (R11). Ne pas avancer tant que la CI n'est pas verte

**Checkpoint**: suite verte en local et en CI — les user stories peuvent commencer

---

## Phase 3: User Story 1 - Démarrer et tester le projet sans incohérence de port (Priority: P1) 🎯 MVP

**Goal**: un développeur suit le README et obtient une API sur 3002 joignable par l'interface, avec rechargement (FR-001 à FR-003)

**Independent Test**: quickstart.md, scénario 1 — sur un poste propre, copier l'exemple de configuration, `npm run dev`, se connecter ; `git grep -n "3000" -- README.md backend/.env.example deploy/Caddyfile.dev backend/test` ne renvoie rien

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T006 [US1] Créer `backend/test/unit/dev-port-consistency.spec.ts` : lit avec `node:fs` (chemins relatifs à la racine du dépôt via `path.resolve(__dirname, '../../..')`) `backend/.env.example`, `deploy/Caddyfile.dev`, `frontend/vite.config.ts` et `README.md` ; vérifie que `.env.example` contient la ligne `PORT=3002`, que chaque `reverse_proxy host.docker.internal:<port>` de `Caddyfile.dev` vers l'API (blocs `/api/*` et `/socket.io/*`) utilise 3002, que `vite.config.ts` contient `'http://localhost:3002'`, et qu'aucune de ces sources ne contient `localhost:3000` ou `:3000` hors production ; et que `loadConfig` sans `PORT` renvoie 3002. Constater l'échec (A01)

### Implementation for User Story 1

- [ ] T007 [P] [US1] Dans `backend/.env.example`, remplacer `PORT=3000` par `PORT=3002` (ligne 17) et ajouter au-dessus le commentaire `# Port de l'API en développement (la production fixe 3000 dans deploy/api.Dockerfile).` (R1)
- [ ] T008 [P] [US1] Dans `deploy/Caddyfile.dev`, remplacer les deux `reverse_proxy host.docker.internal:3000` par `host.docker.internal:3002` (R1)
- [ ] T009 [P] [US1] Dans `README.md` ligne 41, remplacer `# API : http://localhost:3000` par `# API : http://localhost:3002` ; ajouter dans la section d'installation une phrase : « Si votre `backend/.env` date d'avant le passage au port 3002, remplacez `PORT=3000` par `PORT=3002` » (cas limite de la spec)
- [ ] T010 [P] [US1] Dans `package.json` racine, remplacer `"dev:backend": "npm run -w backend start"` par `"dev:backend": "npm run -w backend start:dev"` (R2, A02) ; vérifier que `start.bat` (qui appelle `npm run dev`) n'a pas besoin d'autre modification
- [ ] T011 [US1] Relancer `npm run -w backend test` (T006 vert) et dérouler quickstart.md scénario 1 à la main sous Windows avec `start.bat` : connexion réussie, modification d'un fichier de `backend/src` prise en compte sans compilation ; consigner le résultat dans `docs/validation/verification-003.md`

**Checkpoint**: US1 complète — environnement de développement cohérent, suite verte

---

## Phase 4: User Story 2 - Garantir la traçabilité et la sécurité des opérations sensibles (Priority: P1)

**Goal**: masquage unifié, configuration entièrement validée, contrôle d'origine unique, réinitialisation du super administrateur tracée (FR-004 à FR-007, FR-010)

**Independent Test**: quickstart.md, scénarios 2 et 3

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T012 [P] [US2] Dans `backend/test/unit/config.spec.ts`, ajouter des cas pour `TRUST_PROXY` (contract `contracts/configuration.md`) : absent → `trustProxy` vaut `'loopback'` ; `'true'` → `true` ; `'false'` → `false` ; `'2'` → `2` ; `'uniquelocal'` ; `'loopback, 10.0.0.0/8'` ; `'::1'` → acceptés et renvoyés tels quels (chaîne nettoyée des espaces) ; `'n'importe quoi'`, `'-1'`, `'10.0.0.0/99'`, `'loopback,'` → `ConfigError` dont le message commence par `TRUST_PROXY invalide` (FR-004, R3)
- [ ] T013 [P] [US2] Créer `backend/test/unit/sensitive-keys.spec.ts` : importe `SENSITIVE_KEY` depuis `backend/src/common/sensitive-keys.ts` ; vérifie qu'il reconnaît `password`, `passwordHash`, `token`, `secret`, `cookie`, `authorization`, `Authorization`, `sid`, `text`, `message`, `content` et ne reconnaît pas `reason`, `route`, `username`, `messages`, `contentType` ; puis vérifie que `redact({ authorization: 'Bearer x', message: 'contenu' })` (logger, `backend/src/common/app-logger.ts`) et `sanitizeAuditDetails` (`backend/src/audit/audit.service.ts`) masquent ou retirent tous deux `authorization` et `message` ; et qu'un `new Error('Erreur lisible')` passé à `redact` garde son message lisible (risque [DÉDUIT] de R4) (FR-005)
- [ ] T014 [P] [US2] Créer `backend/test/unit/origin.spec.ts` pour `backend/src/common/origin.ts` : `isAllowedOrigin({ origin: 'https://a.fr' }, 'https://a.fr')` → vrai ; origine étrangère → faux ; `origin` absent et `referer: 'https://a.fr/page'` → vrai seulement si l'option referer est passée ; valeur non URL → faux ; `origin: 'null'` → faux (FR-006, R5)
- [ ] T015 [US2] Dans `backend/test/integration/bootstrap-production.spec.ts`, ajouter un `describe('resetSuperAdminPassword')` : (a) avec un super administrateur ayant deux sessions en base, l'appel renvoie un mot de passe provisoire de 22 caractères base64url, met `mustChangePassword` à vrai, change `passwordHash` (vérifier avec `argon2.verify`), supprime les deux sessions et crée **une** ligne `AuditLog` `action: 'PASSWORD_RESET'`, `actorId: null`, `targetType: 'User'`, `targetId` = id du compte, `details: { reason: 'CLI' }`, `ip: null` ; (b) sans identifiant, cible le plus ancien `SUPER_ADMIN` actif ; (c) identifiant inconnu ou compte `EMPLOYEE` → rejette avec le message `Compte « <identifiant> » introuvable ou non super administrateur : aucune modification.`, aucune écriture (ni utilisateur, ni session, ni audit) ; (d) le mot de passe en clair n'apparaît dans aucune ligne `AuditLog` (FR-007, R6, data-model §AuditLog)

### Implementation for User Story 2

- [ ] T016 [P] [US2] Créer `backend/src/common/sensitive-keys.ts` exportant `export const SENSITIVE_KEY = /pass(word)?|hash|token|secret|cookie|authorization|^sid$|^text$|^message$|^content$/i;` avec un commentaire indiquant qu'il sert au logger et au journal d'audit ; dans `backend/src/common/app-logger.ts` et `backend/src/audit/audit.service.ts`, supprimer les constantes locales `SENSITIVE_KEY` et importer la constante commune ; les motifs de texte du logger (`TEXT_PATTERNS` ou équivalent : argon2, en-têtes cookie/authorization, `sid=`) restent dans `app-logger.ts` ; T013 vert, `log-redaction.spec.ts` et `audit-sanitize.spec.ts` verts (FR-005)
- [ ] T017 [P] [US2] Créer `backend/src/common/origin.ts` : déplacer `originOf(value)` depuis `backend/src/auth/origin.guard.ts` et exporter `isAllowedOrigin(headers: { origin?: string; referer?: string }, appOrigin: string, options?: { allowReferer?: boolean }): boolean` ; `auth/origin.guard.ts` appelle `isAllowedOrigin(req.headers, appOrigin, { allowReferer: true })` ; `realtime/realtime.gateway.ts` supprime sa copie de `originOf` et appelle `isAllowedOrigin(socket.handshake.headers, appOrigin)` sans referer (comportement inchangé, FR-023) ; T014 vert, `auth.spec.ts` et `realtime.spec.ts` verts (FR-006)
- [ ] T018 [US2] Dans `backend/src/config/config.ts` : ajouter `trustProxy: boolean | number | string` à `AppConfig` ; dans `loadConfig`, lire `env.TRUST_PROXY?.trim() || 'loopback'` et valider : `true`/`false` → booléen ; `/^\d+$/` → nombre ; sinon liste séparée par des virgules dont chaque élément (après `trim`, non vide) est `loopback`, `linklocal`, `uniquelocal`, une adresse IP (`net.isIP` de `node:net`) ou une plage CIDR `IP/n` (n ≤ 32 en IPv4, ≤ 128 en IPv6) ; sinon `throw new ConfigError('TRUST_PROXY invalide : utilisez true, false, un nombre de proxys, ou une liste parmi loopback, linklocal, uniquelocal, adresses IP ou plages CIDR')` ; T012 vert (FR-004, R3)
- [ ] T019 [US2] Dans `backend/src/app.setup.ts`, remplacer `process.env.TRUST_PROXY ?? 'loopback'` par `config.trustProxy` et `process.env.NODE_ENV !== 'production'` par `!config.isProduction`, `config` étant obtenu par `app.get<AppConfig>(APP_CONFIG)` ; dans `backend/src/main.ts`, remplacer `Number(process.env.PORT ?? 3002)` par `app.get<AppConfig>(APP_CONFIG).port` ; vérifier avec `grep -rn "process.env" backend/src` qu'il ne reste que `config/`, `cli/bootstrap.ts` et `config/load-env-file.ts` ; `npm run -w backend test:integration` vert (FR-004)
- [ ] T020 [US2] Dans `backend/src/cli/bootstrap.ts`, ajouter et exporter `resetSuperAdminPassword(prisma: PrismaClient, username?: string): Promise<{ username: string; temporaryPassword: string }>` selon research R6 : mot de passe `randomBytes(16).toString('base64url')`, haché Argon2id ; dans **une** `prisma.$transaction` : `user.update({ passwordHash, mustChangePassword: true })`, `session.deleteMany({ where: { userId } })`, `auditLog.create({ action: 'PASSWORD_RESET', actorId: null, targetType: 'User', targetId: user.id, details: { reason: 'CLI' }, ip: null })` ; sans `username`, cible `findFirst({ where: { role: 'SUPER_ADMIN', active: true }, orderBy: { createdAt: 'asc' } })` ; compte absent ou non `SUPER_ADMIN` → `throw new Error('Compte « <identifiant> » introuvable ou non super administrateur : aucune modification.')` avant toute écriture. Dans `main()`, si `process.argv[2] === '--reset-password'`, appeler `resetSuperAdminPassword(prisma, process.argv[3])` et écrire sur stdout `Mot de passe provisoire de « <identifiant> » (affiché une seule fois, à changer à la première connexion) : <mot de passe>` ; sinon comportement historique inchangé ; mettre à jour le commentaire d'usage en tête de `main()` ; T015 vert (FR-007, FR-010, `contracts/cli-and-deploy.md`)
- [ ] T021 [US2] Supprimer `backend/scripts/reset-superadmin-password.ts` ; chercher ses mentions (`grep -rn "reset-superadmin" --exclude-dir=node_modules .`) et les remplacer, dans `README.md` et toute documentation d'exploitation, par les deux exemples de `contracts/cli-and-deploy.md` (développement et production) (FR-010, D2)
- [ ] T022 [US2] Dérouler quickstart.md scénarios 2 et 3 à la main (deux navigateurs connectés en `superadmin`) et consigner le résultat dans `docs/validation/verification-003.md`

**Checkpoint**: US1 et US2 fonctionnent indépendamment

---

## Phase 5: User Story 3 - Affectation automatique conforme à la règle des snapshots (Priority: P2)

**Goal**: en circuit B, l'approbation affecte selon le mode **et** la personne figés à la soumission (D1), avec repli explicite si la personne n'est plus affectable (FR-008, FR-009, FR-011)

**Independent Test**: quickstart.md, scénario 4

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T023 [US3] Créer `backend/test/integration/auto-assignment-snapshot.spec.ts` (modèle : `requests-circuit-b.spec.ts`, utilitaires `seedDemo`, `loginAs`, `userId`, `categoryId` de `backend/test/utils/auth-helpers.ts`). Préparer une catégorie en circuit B, `assignmentMode: 'AUTO'`, `autoAssigneeId` = E1, avec E1, E2, E3 destinataires actifs. Cas, avec résultat attendu selon `contracts/rest-api.md` : (1) soumettre D1, passer `autoAssigneeId` à E2, approuver sans `assigneeId` → `200`, `assigneeId` = E1 ; (2) soumettre D2, passer la catégorie en `MANUAL` (`autoAssigneeId: null`), approuver sans `assigneeId` → `200`, affectée à E1 (aujourd'hui `422 ASSIGNEE_REQUIRED`, constat N1) ; (3) soumettre D3, désactiver E1, approuver sans `assigneeId` → `422` code `AUTO_ASSIGNEE_UNAVAILABLE`, demande inchangée (statut, version) ; puis approuver avec `assigneeId` = E3 → `200`, affectée à E3 ; (4) même situation que (3) mais `assigneeId` d'un compte inactif ou non destinataire → `422 RECIPIENT_NOT_ALLOWED` ; (5) catégorie AUTO intacte, approuver avec `assigneeId` = E2 → `200`, affectée à E1 (le choix fourni est ignoré) ; (6) demande dont on retire la clé `autoAssigneeId` de `rulesSnapshot` par `prisma.request.update` (demande ancienne), catégorie désignant E2 → affectée à E2 ; (7) pour chaque cas réussi, le `RequestEvent` d'approbation porte `toValue.assigneeSource` = `SNAPSHOT` (1, 2, 5), `MANAGER_CHOICE` (3), `CATEGORY_CURRENT` (6). Constater que (1), (2), (3), (5) et (7) échouent avant la correction (FR-009 : confirme le constat [DÉDUIT] A04)
- [ ] T024 [P] [US3] Dans `frontend/tests/requests/ApprovalPanel.test.tsx` (ou un nouveau `frontend/tests/requests/ApprovalDialog.test.tsx` si la boîte n'y est pas couverte), ajouter : boîte d'approbation en mode automatique, l'envoi renvoie une `ApiError` de code `AUTO_ASSIGNEE_UNAVAILABLE` → le message du serveur s'affiche (`role="alert"`) et le sélecteur d'employé apparaît, focus placé sur lui ; un nouvel envoi transmet l'`assigneeId` choisi. Constater l'échec

### Implementation for User Story 3

- [ ] T025 [US3] Dans `backend/src/requests/request-policy.loader.ts` : ajouter `autoAssigneeId: string | null` à `RequestRulesSnapshot` ; dans `rulesSnapshot()`, renseigner `autoAssigneeId: category.assignmentMode === 'AUTO' ? category.autoAssigneeId : null` (data-model : « Renseignée si `assignmentMode = AUTO`, sinon `null` »). Aucune migration (champ JSON)
- [ ] T026 [US3] Dans `backend/src/common/errors.ts`, ajouter à `ERROR_CATALOG` : `AUTO_ASSIGNEE_UNAVAILABLE: { status: 422, message: 'La personne désignée pour cette catégorie n’est plus disponible. Choisissez l’employé qui réalisera la demande.' }` (même apostrophe typographique que les messages voisins) ; ajouter le cas à `backend/test/unit/http-exception.filter.spec.ts` si ce fichier énumère les codes
- [ ] T027 [US3] Dans `backend/src/requests/request-transitions.service.ts`, réécrire la branche `APPROVE` de `assigneeContext` selon data-model §Résolution : lire `rules = readRulesSnapshot(request)` ; si `rules.assignmentMode !== 'AUTO'` → `input.assigneeId`, source `MANAGER_CHOICE` ; sinon candidat = `'autoAssigneeId' in rules ? rules.autoAssigneeId : category.autoAssigneeId` (source `SNAPSHOT` ou `CATEGORY_CURRENT`) ; si candidat affectable (`canPickRecipient`) → candidat (un `input.assigneeId` fourni est ignoré) ; sinon si `input.assigneeId` fourni → l'utiliser, source `MANAGER_CHOICE`, contrôlé par `canPickRecipient` (refus `RECIPIENT_NOT_ALLOWED` inchangé) ; sinon `throw new AppException('AUTO_ASSIGNEE_UNAVAILABLE')` avant toute écriture. Transmettre la source à `commit`/`recordTransition` pour l'ajouter dans `toValue` de l'événement d'approbation sous la clé `assigneeSource` (`SNAPSHOT` | `CATEGORY_CURRENT` | `MANAGER_CHOICE`) ; ne plus lire `category.assignmentMode` pour `APPROVE` ; T023 vert, `requests-circuit-b.spec.ts` et `assignable-employees.spec.ts` verts sans modification de leurs attendus
- [ ] T028 [P] [US3] Dans `frontend/src/features/requests/types.ts`, ajouter `autoAssigneeId?: string | null` au type de `rulesSnapshot` ; dans `frontend/src/features/requests/ApprovalDialog.tsx` (et `RequestActions.tsx` si l'erreur y est traitée), sur une erreur `AUTO_ASSIGNEE_UNAVAILABLE`, passer la boîte en mode manuel : afficher le message du serveur dans une alerte, afficher le sélecteur d'employé existant et y placer le focus ; le bouton de confirmation envoie `{ assigneeId }` ; T024 vert ; vérification axe inchangée
- [ ] T029 [US3] Si l'historique affiche le détail de l'approbation (`frontend/src/features/requests/HistoryTimeline.tsx`), afficher pour `assigneeSource = MANAGER_CHOICE` en mode automatique la mention « désigné par le responsable (personne prévue indisponible) » ; sinon ne rien changer ; test dans `frontend/tests/requests/HistoryTimeline.test.tsx` si l'affichage change
- [ ] T030 [US3] Dérouler quickstart.md scénario 4 à la main et consigner le résultat dans `docs/validation/verification-003.md` ; noter que la décision D1 reste à faire confirmer par l'établissement

**Checkpoint**: US1, US2 et US3 fonctionnent indépendamment

---

## Phase 6: User Story 4 - Des dépendances internes lisibles et vérifiées automatiquement (Priority: P2)

**Goal**: ordre de couches `config → common → audit → auth → files → requests → coverage → scheduler` respecté et vérifié ; accès aux fichiers par registre ; doublons et code mort supprimés ; énumérations synchronisées (FR-012 à FR-016)

**Independent Test**: quickstart.md, scénario 5 ; suite complète verte sans changement d'attendus (SC-007)

**Règle pour toute la phase** : un commit par tâche de déplacement ; après chaque tâche,
`npm run -w backend typecheck`, `npm run -w backend test` et `npm run -w backend test:integration`
DOIVENT être verts. Les tests existants ne changent que par leurs chemins d'import.

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T031 [P] [US4] Créer `backend/test/unit/architecture-layers.spec.ts` (R7) : parcourir récursivement `backend/src` (`node:fs`, fichiers `.ts`) ; extraire les imports relatifs, y compris `import type` et `export … from`, par l'expression `/^\s*(?:import|export)\s[^'"]*?from\s+'(\.[^']+)'/gm` ; résoudre chaque cible et la réduire à son dossier de premier niveau sous `backend/src` ; avec `const LAYERS = ['config', 'common', 'audit', 'auth', 'files', 'requests', 'coverage', 'scheduler']`, échouer si un fichier d'un dossier de `LAYERS` importe un dossier de `LAYERS` d'indice supérieur ; le message d'échec liste chaque violation sous la forme `<fichier source> → <cible> (<dossier> ne peut pas dépendre de <dossier>)`. Les dossiers hors `LAYERS` ne sont pas contrôlés. Constater l'échec, avec au moins les violations `auth → requests`, `common → audit`, `common → auth`, `files → requests`, `files → coverage`, `coverage → scheduler`
- [ ] T032 [P] [US4] Créer `frontend/tests/api/enums-sync.test.ts` (R10) : lire `../backend/prisma/schema.prisma` (chemin résolu depuis le fichier de test) et extraire chaque bloc `enum Nom { … }` (valeurs = identifiants en début de ligne, en ignorant les commentaires `//`) ; lire `frontend/src/api/types.ts` et `frontend/src/features/requests/types.ts` et extraire chaque `export type Nom = 'A' | 'B' …` ainsi que les unions littérales en ligne nommées comme une énumération Prisma ; pour chaque nom présent des deux côtés, comparer les ensembles et échouer en listant `<Nom> : manquant côté interface [...] ; en trop côté interface [...]`. Le test DOIT au minimum comparer `Role`, `Priority`, `RequestStatus` et `AssignmentMode`, et échouer si l'un d'eux est introuvable côté interface. Corriger les éventuelles divergences réelles dans `frontend/src/api/types.ts` (attendu : vert après correction, car les deux côtés sont aujourd'hui alignés à la main)

### Implementation for User Story 4

- [ ] T033 [US4] Créer `backend/src/common/authorization.ts` et y déplacer depuis `backend/src/requests/domain/access-policy.ts`, sans modifier leur corps : `ALL_PERMISSIONS`, `PolicyUser`, `permissionsFor`, `canManageAdministration`, `canReadAudit` ; dans `access-policy.ts`, les importer depuis `../../common/authorization` (pas de réexport) ; mettre à jour les imports de `backend/src/auth/session.service.ts`, `backend/src/auth/auth.types.ts` et de tous les autres fichiers (`grep -rn "permissionsFor\|PolicyUser\|ALL_PERMISSIONS\|canManageAdministration\|canReadAudit" backend/src backend/test`) ; déplacer les tests correspondants de `backend/test/unit/access-policy.spec.ts` vers un nouveau `backend/test/unit/authorization.spec.ts`, attendus inchangés (A09 `auth → requests`, A12)
- [ ] T034 [US4] Déplacer `backend/src/auth/request-info.ts` vers `backend/src/common/request-info.ts` (`git mv`, contenu inchangé) et mettre à jour tous les imports (`grep -rn "request-info" backend/src backend/test`) (supprime `common → auth`)
- [ ] T035 [US4] Déplacer `backend/src/common/super-admin.guard.ts` vers `backend/src/audit/super-admin.guard.ts` (`git mv`) ; y remplacer le test `user?.role === 'SUPER_ADMIN' && user.active` par `user && canManageAdministration(user)` importé de `../common/authorization` ; importer `clientIp`, `requestPath` depuis `../common/request-info` ; mettre à jour les imports dans `audit/`, `categories/`, `coverage/`, `settings/`, `users/` (fichiers listés par `grep -rln "SuperAdminGuard" backend/src`) ; `admin-*.spec.ts` verts (supprime `common → audit`)
- [ ] T036 [US4] Créer `backend/src/requests/request-policy.module.ts` : `@Module({ providers: [RequestPolicyLoader], exports: [RequestPolicyLoader] }) export class RequestPolicyModule {}` ; retirer `RequestPolicyLoader` des `providers` de `requests.module.ts`, `categories.module.ts`, `messages.module.ts`, `coverage.module.ts` et `files.module.ts`, et ajouter `RequestPolicyModule` aux `imports` des quatre premiers (files : voir T038) (A13, R9)
- [ ] T037 [US4] Créer `backend/src/files/file-access.ts` (R8) exportant `export interface RequestFileAccess { canRead(user: AuthenticatedUser, file: StoredFile, request: Request): Promise<boolean>; canAttach(user: AuthenticatedUser, request: Request): Promise<boolean>; }` ; dans `backend/src/files/files.service.ts`, ajouter `private readonly access = new Map<RequestKind, RequestFileAccess>()` et `registerAccess(kind: RequestKind, access: RequestFileAccess): void` (lève une erreur si le type est déjà enregistré) ; réécrire `findReadable` : UUID invalide ou fichier absent → `null` ; `file.requestId === null` → lisible par son auteur seul (inchangé) ; demande absente → `null` ; `this.access.get(request.kind)` absent → `null` (fermé par défaut) ; sinon `await access.canRead(user, file, request) ? file : null` ; réécrire `assertCanAttach` de même avec `canAttach` (`NOT_FOUND` si refus, inchangé)
- [ ] T038 [US4] Créer `backend/src/requests/work-file-access.ts` (`@Injectable() WorkFileAccess implements RequestFileAccess, OnModuleInit`, injecte `FilesService` et `RequestPolicyLoader`) reprenant mot pour mot la branche demandes de travail de l'ancien `findReadable` (`canReadRequest`) et de l'ancien `assertCanAttach` (`canWriteInThread`), et s'enregistrant par `files.registerAccess('WORK', this)` dans `onModuleInit` ; créer `backend/src/coverage/coverage-file-access.ts` (`CoverageFileAccess`, injecte `FilesService`, `PrismaService`, `CoverageAccessLoader`) reprenant la branche `COVERAGE` (`coverage.facts`, preuve = `file.isCompletionProof` ou présence `coveragePresence`, `canReadPresenceProof` / `coverageAccess === 'full'`) et `canAttach` équivalent au comportement actuel pour une couverture (vérifier le comportement actuel de `assertCanAttach` sur une demande `COVERAGE` et le reproduire à l'identique), enregistrée par `registerAccess('COVERAGE', this)` ; déclarer chacun dans `requests.module.ts` et `coverage.module.ts` (qui importent `FilesModule`) ; retirer de `files.module.ts` et `files.service.ts` tout import de `requests/` et `coverage/` ; `files-voice.spec.ts`, `coverage.spec.ts`, `coverage-work-isolation.spec.ts`, `messages.spec.ts` verts sans changement d'attendus (A10, A11, FR-014)
- [ ] T039 [US4] Créer `backend/src/scheduler/job-interval.ts` exportant `export const JOB_INTERVAL_MS = 15_000;` et le retirer de `scheduler/auto-close.job.ts` (importé par `auto-close.job.ts`, `overdue.job.ts`) ; déplacer `backend/src/coverage/coverage-deadlines.job.ts` vers `backend/src/scheduler/coverage-deadlines.job.ts` (`git mv`), l'enregistrer dans `backend/src/scheduler/scheduler.module.ts` (importer `CoverageModule` et faire exporter par `CoverageModule` le service dont le job dépend, `CoverageActionsService`) et le retirer de `coverage.module.ts` ; mettre à jour les commentaires qui citent l'ancien chemin (`coverage/domain/coverage-deadlines.ts`, `scheduler/overdue.job.ts`) (A15)
- [ ] T040 [US4] Relancer `backend/test/unit/architecture-layers.spec.ts` : DOIT être vert. S'il reste des violations non prévues par R7, les corriger par un déplacement du même type ou, si cela exige un changement de comportement, s'arrêter et les signaler (FR-012, FR-013)
- [ ] T041 [P] [US4] Dans `backend/src/notifications/notifications.service.ts`, supprimer la classe `NoopNotificationPublisher` et le commentaire « Implémentation sans effet en Phase 2 ; remplacée par Socket.IO en US4 (T070) » ; vérifier par `grep -rn "NoopNotificationPublisher" backend` qu'il n'en reste aucune mention (A16)
- [ ] T042 [P] [US4] Dans `backend/src/realtime/realtime-gateway.module.ts`, remplacer le commentaire par : « Passerelle Socket.IO, séparée du registre des connexions (RealtimeModule, global, sans dépendance à l'authentification) : la passerelle authentifie avec SessionService (AuthModule). » (R7)
- [ ] T043 [P] [US4] Retirer `@mui/icons-material` de `frontend/package.json` (`npm uninstall -w frontend @mui/icons-material`) après avoir revérifié `grep -rn "@mui/icons-material" frontend/src frontend/tests` (aucun résultat attendu) ; `npm run -w frontend build` et `npm run -w frontend test` verts (A18)
- [ ] T044 [P] [US4] Exécuter `npx prettier --write backend/scripts/check-users.ts` (A19) ; `npm run lint` vert
- [ ] T045 [P] [US4] Dans `frontend/src/api/types.ts`, remplacer le commentaire d'en-tête par : « Types partagés avec l'API, écrits à la main. Les énumérations sont comparées au schéma Prisma par tests/api/enums-sync.test.ts. » (A17, R10)

**Checkpoint**: US1 à US4 fonctionnent ; couches vérifiées automatiquement

---

## Phase 7: User Story 5 - Mettre en production en sécurité (Priority: P3)

**Goal**: sauvegarde imposée avant migration, restauration exercée, en-têtes vérifiés, contrôles rejoués (FR-017 à FR-021)

**Independent Test**: quickstart.md, scénario 6, sur un serveur de préproduction

### Implementation for User Story 5

- [ ] T046 [US5] Créer `deploy/deploy.sh` (exécutable, `set -euo pipefail`, en-tête de commentaire au style de `deploy/backup/restore.sh`) selon `contracts/cli-and-deploy.md` : `COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)` ; étape 1 `"${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/bash backup /scripts/backup.sh`, arrêt avec message si échec ; étape 2 `"${COMPOSE[@]}" up -d --build` (R12)
- [ ] T047 [US5] Dans `deploy/docker-compose.yml`, service `api` : ajouter le volume `${BACKUP_DIR:-./backups}:/backups:ro` et la variable `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES: ${PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES:-60}` ; l'ajouter commentée à `deploy/.env.example` (`contracts/configuration.md`)
- [ ] T048 [US5] Dans `deploy/api-entrypoint.sh`, avant `npx --no-install prisma migrate deploy` : exécuter `npx --no-install prisma migrate status` en capturant sortie et code ; si la sortie contient « Database schema is up to date », démarrer sans contrôle ; sinon, si des migrations sont en attente, exiger un fichier `/backups/db-*.dump` modifié depuis moins de `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes (`find /backups -maxdepth 1 -name 'db-*.dump' -mmin -"${PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES:-60}"`) ; sinon afficher sur stderr « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. » et `exit 1` ; toute autre erreur de `migrate status` (base injoignable) → afficher la sortie et `exit 1`. Vérifier d'abord, sur une base locale avec une migration en attente, le code de sortie et le texte exacts de `prisma migrate status` (Prisma 6) et adapter le test de texte en conséquence ; consigner ce constat dans `docs/validation/verification-003.md` (point [DÉDUIT] de R12)
- [ ] T049 [P] [US5] Dans `README.md` (section production) et `docs/coverage-migration.md`, remplacer la sauvegarde manuelle avant mise à jour et la commande `docker compose … up -d --build` par `deploy/deploy.sh`, en expliquant que l'API refuse d'appliquer une migration sans sauvegarde de moins de `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes (FR-018)
- [ ] T050 [US5] Sur la préproduction, dérouler quickstart.md scénario 6 point 1 (migration de test vide, `up` sans le script → refus ; `deploy/deploy.sh` → sauvegarde puis migration) ; supprimer ensuite la migration de test du dépôt ; consigner dans `docs/validation/verification-003.md` (FR-018, A22, A23)
- [ ] T051 [US5] Sur un serveur vierge, restaurer une sauvegarde réelle avec `deploy/backup/restore.sh <horodatage>` ; contrôler la connexion, une demande avec vocal et photo, le journal d'audit ; mesurer la durée ; consigner dans un nouveau `docs/validation/restauration.md` (date, serveur, horodatage de la sauvegarde, durée, écarts) (FR-020, A24, SC-008)
- [ ] T052 [P] [US5] Sur la préproduction en HTTPS, exécuter `curl -sI https://<domaine>/` et `curl -sI https://<domaine>/api/health` ; vérifier `Content-Security-Policy` et `Strict-Transport-Security` ; envoyer un fichier de 27 Mo à l'API et constater le refus ; consigner les sorties dans un nouveau `docs/validation/en-tetes-securite.md` (FR-021, A25)
- [ ] T053 [US5] Exécuter `npm run test:e2e` (tous les profils, dont `e2e/sc001-create-timing.spec.ts`) et consigner le résultat dans `docs/validation/verification-003.md` (FR-017, FR-019 partie manuelle, A20, A26)

**Checkpoint**: toutes les user stories sont fonctionnelles et vérifiées

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: clôture documentaire et vérification finale

- [ ] T054 Mettre à jour `docs/ARCHITECTURE.md` (FR-024) : retirer la mention « trois modifications non commitées » de l'en-tête ; marquer chaque constat traité « corrigé (commit <sha>) » ; re-marquer A04, A11, A20, A23, A24, A25, A26 en [VÉRIFIÉ] (confirmé ou infirmé) avec la preuve ; ajouter N1 et N2 ; décrire l'ordre de couches et le test qui le vérifie (§10) ; lister les cycles restants hors périmètre (`auth ↔ settings`, `auth ↔ realtime`, `users`, `notifications`) ; mettre à jour §9 (port 3002, `start:dev`, `deploy/deploy.sh`, CI) et §11
- [ ] T055 [P] Mettre à jour le registre de `specs/003-corrections-audit-technique/spec.md` : statut de chaque constat CT, et note dans la table des décisions que D1 attend la confirmation de l'établissement
- [ ] T056 Exécuter `npm run verify` et `npm run -w backend typecheck`, `npm run -w frontend typecheck` ; consigner les résultats finaux dans `docs/validation/verification-003.md` (section « Vérification finale », avec les compteurs de tests comme dans `verification-finale.md`) ; vérifier que la CI est verte sur le dernier commit (SC-002)
- [ ] T057 Relire `quickstart.md` de bout en bout et vérifier que chaque scénario est consigné dans `docs/validation/` ; cocher dans `specs/003-corrections-audit-technique/spec.md` les critères SC-001 à SC-009 atteints, et lister ceux qui restent ouverts (par exemple faute de serveur de préproduction)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance
- **Foundational (Phase 2)** : après Phase 1 ; BLOQUE toutes les user stories (suite verte + CI)
- **US1 (Phase 3)** : après Phase 2
- **US2 (Phase 4)** : après Phase 2 ; indépendante de US1 fonctionnellement, mais T012 et T018 modifient `config.spec.ts` / `config.ts` comme T002 et T006 → faire US1 avant pour éviter les conflits
- **US3 (Phase 5)** : après Phase 2 ; indépendante de US1 et US2. T027 ajoute `AUTO_ASSIGNEE_UNAVAILABLE` dans `errors.ts` (T026) ; pas de conflit avec US4 si US3 est terminée avant T033–T038 (fichiers `request-transitions.service.ts`, `request-policy.loader.ts` touchés par les deux)
- **US4 (Phase 6)** : après Phase 2 ; **recommandé après US2 et US3**, car T033–T039 déplacent des fichiers que US2 (`origin.guard.ts`, `app-logger.ts`) et US3 (`request-policy.loader.ts`) modifient
- **US5 (Phase 7)** : T046–T049 indépendantes du code ; T050–T053 exigent un serveur de préproduction et la fin de US1 à US4 pour valider la version finale
- **Polish (Phase 8)** : après toutes les stories

### Within Each User Story

- Tests écrits et constatés rouges avant l'implémentation (T006, T012–T015, T023–T024, T031–T032)
- US4 : T033 → T034 → T035 (même chaîne d'imports `common`/`audit`/`auth`) ; T036 avant T038 ; T037 avant T038 ; T040 après T033–T039

### Parallel Opportunities

- US1 : T007, T008, T009, T010 (fichiers distincts)
- US2 : T012, T013, T014 (tests) ; T016 et T017 (fichiers distincts)
- US3 : T024 et T028 (frontend) en parallèle de T025–T027 (backend)
- US4 : T031 et T032 ; T041, T042, T043, T044, T045 entre eux et avec la chaîne T033–T040
- US5 : T049 et T052 ; T046–T048 peuvent avancer pendant US3/US4
- Equipe : un développeur sur US3 (backend affectation), un autre sur US5 (déploiement), sans conflit de fichiers

---

## Parallel Example: User Story 2

```bash
# Tests d'abord, en parallèle :
Task: "TRUST_PROXY cases in backend/test/unit/config.spec.ts"
Task: "SENSITIVE_KEY union in backend/test/unit/sensitive-keys.spec.ts"
Task: "isAllowedOrigin in backend/test/unit/origin.spec.ts"

# Puis deux implémentations indépendantes :
Task: "Create backend/src/common/sensitive-keys.ts and use it in app-logger.ts and audit.service.ts"
Task: "Create backend/src/common/origin.ts and use it in origin.guard.ts and realtime.gateway.ts"
```

## Parallel Example: User Story 4

```bash
Task: "Layer check in backend/test/unit/architecture-layers.spec.ts"
Task: "Enum sync in frontend/tests/api/enums-sync.test.ts"
Task: "Remove NoopNotificationPublisher from backend/src/notifications/notifications.service.ts"
Task: "Remove @mui/icons-material from frontend/package.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (état initial) + Phase 2 (suite verte, CI)
2. Phase 3 (US1)
3. **STOP and VALIDATE** : quickstart.md scénario 1 ; un nouveau développeur démarre sans modifier de fichier
4. Fusion possible : l'équipe dispose d'un environnement cohérent et d'une CI

### Incremental Delivery

1. Setup + Foundational → suite verte protégée par la CI
2. US1 → environnement cohérent (MVP)
3. US2 → sécurité et traçabilité (P1, à livrer avant toute mise en production)
4. US3 → affectation conforme à D1 (corrige le blocage N1)
5. US4 → dépendances assainies (sans effet visible)
6. US5 → procédure de production vérifiée sur préproduction
7. Polish → `docs/ARCHITECTURE.md` à jour, vérification finale

---

## Notes

- [P] = fichiers différents, aucune dépendance sur une tâche inachevée
- Commit après chaque tâche ou groupe logique ; en US4, un commit par déplacement
- Aucun test existant ne doit voir ses attendus modifiés (SC-007), sauf T002 (port) qui aligne un test sur un choix déjà commité
- Si une tâche révèle un écart avec research.md, s'arrêter et le signaler plutôt que d'improviser un changement de comportement (FR-023)
- T050 à T053 dépendent d'un serveur de préproduction : s'il n'est pas disponible, les laisser ouvertes et le signaler dans `docs/validation/verification-003.md`
