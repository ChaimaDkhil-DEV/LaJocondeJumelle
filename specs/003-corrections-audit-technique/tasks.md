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

- [X] T001 Exécuter `npm run lint`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm run -w backend typecheck` et `npm run -w frontend typecheck` sur la branche `003-corrections-audit-technique` ; consigner chaque résultat (réussis / échecs, noms des tests en échec) dans une section « État initial » de `docs/validation/verification-003.md` (créer le fichier sur le modèle de `docs/validation/verification-finale.md`). Attendu connu : `backend/test/unit/config.spec.ts` en échec (attendu 3000, reçu 3002). Tout autre échec DOIT être signalé avant de continuer.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: remettre la suite au vert, l'exécuter en CI et encadrer chaque fusion par une
vérification manuelle avant toute autre modification (constitution : aucune fusion si la suite
échoue ; règle appliquée à la main, sans protection technique, décision D10)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Dans `backend/test/unit/config.spec.ts`, remplacer l'attendu `expect(config.port).toBe(3000)` par `toBe(3002)` (le code est déjà à 3002 depuis le commit `1e6d4ee`) ; relancer `npm run -w backend test` : tout DOIT être vert (A01)
- [X] T003 Créer `.github/workflows/ci.yml` selon `contracts/cli-and-deploy.md` §Intégration continue (R11) : `name: CI` ; déclencheurs `push` et `pull_request` ; un seul job d'identifiant `verify` et de `name: Contrôles qualité` (nom stable, cité par la vérification avant fusion de T006) ; `runs-on: ubuntu-latest` ; `actions/checkout` ; `actions/setup-node` avec `node-version-file: .nvmrc` et cache npm ; `sudo apt-get update && sudo apt-get install -y ffmpeg` ; `npm ci` ; `npm run -w backend prisma:generate` ; puis, chacune en étape bloquante : `npm run lint`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`, `npm run -w backend test`, `npm run -w backend test:integration`, `npm run -w frontend test`, `npm audit --audit-level=high`. Ne PAS inclure `npm run test:e2e` (décision D3)
- [X] T004 Vérifier que `package-lock.json` contient le binaire Linux d'embedded-postgres (`grep -n "@embedded-postgres/linux-x64" package-lock.json`). S'il manque : l'ajouter au verrou (`npm install --package-lock-only --os=linux --cpu=x64` puis vérifier que le verrou Windows reste fonctionnel avec `npm ci` en local) ; consigner la vérification dans `docs/validation/verification-003.md` (point [DÉDUIT] de R11)
- [X] T063 **Test d'abord (N3, FR-025)** — relevé par le premier passage de la CI (T005) : `coverage.spec.ts` a échoué sur un run et réussi sur l'autre, au même commit (`→CLOSED` avant `→DONE`). Ajouter dans `backend/test/integration/history-priority.spec.ts` le test `restitue dans leur ordre d’écriture des événements de même horodatage (N3)` et dans `backend/test/integration/coverage.spec.ts` le test `1 ter. historique : des événements de même horodatage restent dans leur ordre d’écriture (N3)` : insérer par `prisma.requestEvent.create` deux événements `OVERDUE` de même `createdAt`, dont les `id` sont en ordre inverse de l'écriture (`ffffffff-…` puis `00000000-…`), puis lire l'historique (`GET /api/requests/:id/history`, `GET /api/coverage/:id`) et attendre l'ordre d'écriture. Constater l'échec, sans dépendre du hasard (research R15)
- [X] T064 Corriger N3 (FR-025, research R15) : dans `backend/prisma/schema.prisma`, ajouter à `RequestEvent` `seq BigInt @default(autoincrement())` ; créer `backend/prisma/migrations/0003_request_event_seq/migration.sql` (`ALTER TABLE "RequestEvent" ADD COLUMN "seq" BIGSERIAL NOT NULL;`) et vérifier qu'il correspond au schéma (`prisma migrate diff --from-empty --to-schema-datamodel`) ; remplacer `{ id: 'asc' }` par `{ seq: 'asc' }` dans les tris d'événements de `requests/requests.service.ts` (`history`), `coverage/coverage.service.ts` (`historyOf`) et `coverage/coverage-admin.service.ts`, et ajouter `{ seq: 'desc' }` au tri des libérations de `coverage.service.ts` ; ne pas exposer `seq` par l'API. T063 vert ; suites complètes vertes sans changement d'attendus ; puis reprendre T005
- [X] T005 Pousser la branche, constater le passage de la CI sur GitHub (onglet Actions) ; si `backend/test/integration/search-performance.spec.ts` est instable sur la machine GitHub, l'exclure de la CI par `--testPathIgnorePatterns search-performance` dans `.github/workflows/ci.yml` uniquement et le noter dans `docs/validation/verification-003.md` (R11). Ne pas avancer tant que la CI n'est pas verte
- [X] T006 **Vérification manuelle avant fusion** (constat G3, décision D10, constitution principe I : « Aucune modification ne peut être fusionnée si la suite de tests échoue ») : la protection de branche n'est pas disponible sur le dépôt privé (offre GitHub gratuite, [VÉRIFIÉ] le 2026-10-15) ; ne PAS rendre le dépôt public ni changer l'offre. (a) Créer `docs/procedure-fusion.md` selon `contracts/cli-and-deploy.md` §Vérification avant fusion : en tête, l'avertissement « Procédure manuelle : elle ne constitue pas une protection technique ; GitHub n'empêche pas une fusion dont les tests échouent » ; les règles (toute modification de `master` par une demande de fusion, contrôles vérifiés sur le dernier commit et cochés dans la demande, un contrôle non satisfait interdit la fusion) ; le tableau des quatre contrôles (1 résultat de la CI « Contrôles qualité », 2 tests requis, 3 aucun échec non résolu, 4 examen du diff) avec la façon de les vérifier (`gh pr checks <n°>`, `gh pr diff <n°>`) ; la conduite en cas de fusion malgré un échec ; la règle de protection à créer si l'offre change (research R11). (b) Créer `.github/pull_request_template.md` : les quatre contrôles en cases à cocher, chacun avec son critère de refus, et un lien vers `docs/procedure-fusion.md`. (c) Dans `README.md`, ajouter un renvoi à `docs/procedure-fusion.md` à côté des commandes de test. Après T005 (le job « Contrôles qualité » doit avoir tourné une fois). Le modèle ne s'affiche qu'une fois fusionné dans `master` : la première fusion (celle de cette fonctionnalité, T062) applique la procédure en recopiant les cases à la main. Ne crée aucun workflow : la CI relève de T003

**Checkpoint**: suite verte en local et en CI, procédure de vérification avant fusion en place — les user stories peuvent commencer

---

## Phase 3: User Story 1 - Démarrer et tester le projet sans incohérence de port (Priority: P1) 🎯 MVP

**Goal**: un développeur suit le README et obtient une API sur 3002 joignable par l'interface, avec rechargement (FR-001 à FR-003)

**Independent Test**: quickstart.md, scénario 1 — sur un poste propre, copier l'exemple de configuration, `npm run dev`, se connecter ; `git grep -nE "localhost:3000|host\.docker\.internal:3000|^PORT=3000" -- README.md backend/.env.example deploy/Caddyfile.dev frontend/vite.config.ts` ne renvoie rien (même contrôle que T007 ; les mentions de 3000 dans une phrase sur l'ancien `.env` ou sur la production restent permises)

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T007 [US1] Créer `backend/test/unit/dev-port-consistency.spec.ts` : lit avec `node:fs` (chemins relatifs à la racine du dépôt via `path.resolve(__dirname, '../../..')`) `backend/.env.example`, `deploy/Caddyfile.dev`, `frontend/vite.config.ts` et `README.md` ; vérifie que `.env.example` contient la ligne `PORT=3002`, que chaque `reverse_proxy host.docker.internal:<port>` de `Caddyfile.dev` vers l'API (blocs `/api/*` et `/socket.io/*`) utilise 3002, que `vite.config.ts` contient `'http://localhost:3002'`, et qu'aucune de ces sources ne contient `localhost:3000` ou `:3000` hors production ; que `loadConfig` sans `PORT` renvoie 3002, et que le script `dev:backend` du `package.json` racine vaut exactement `npm run -w backend start:dev` (constat C2, FR-003). Constater l'échec (A01, A02)

- [X] T008 [P] [US1] Dans `frontend/tests/api/client.test.ts`, **renforcer les deux tests existants** qui couvrent déjà l'API arrêtée, sans ajouter de test ni de `describe` (pas de doublon), pour figer le comportement existant (FR-023 : aucun message n'est modifié) : (a) dans `it('produit une erreur lisible si la réponse d’erreur n’est pas au format attendu')` (réponse 502 sans corps JSON, comme celle du proxy Vite quand l'API ne répond pas), remplacer `expect(error.message).toMatch(/erreur/i)` par `expect(error.message).toBe('Une erreur inattendue est survenue. Réessayez plus tard.')` ; (b) dans `it('signale une coupure réseau avec le code NETWORK_ERROR')`, remplacer `expect(error.message).toMatch(/connexion/i)` par `expect(error.message).toBe('Connexion impossible. Vérifiez votre connexion internet puis réessayez.')`. Les autres assertions (statut 502 / 0, codes `INTERNAL_ERROR` / `NETWORK_ERROR`) restent inchangées. **Exception documentée à la règle « rouge d'abord »** : ces attendus resserrés décrivent un comportement déjà en place (`UNEXPECTED_MESSAGE` et `NETWORK_MESSAGE` de `frontend/src/api/client.ts`) ; ils sont verts dès leur écriture ; le constater et l'indiquer dans le message de commit (constat G2, cas limite de la spec)

### Implementation for User Story 1

- [X] T009 [P] [US1] Dans `backend/.env.example`, remplacer `PORT=3000` par `PORT=3002` (ligne 17) et ajouter au-dessus le commentaire `# Port de l'API en développement (la production fixe 3000 dans deploy/api.Dockerfile).` (R1)
- [X] T010 [P] [US1] Dans `deploy/Caddyfile.dev`, remplacer les deux `reverse_proxy host.docker.internal:3000` par `host.docker.internal:3002` (R1)
- [X] T011 [P] [US1] Dans `README.md` ligne 41, remplacer `# API : http://localhost:3000` par `# API : http://localhost:3002` ; ajouter dans la section d'installation une phrase : « Si votre `backend/.env` date d'avant le passage au port 3002, remplacez `PORT=3000` par `PORT=3002` » (cas limite de la spec)
- [X] T012 [P] [US1] Dans `package.json` racine, remplacer `"dev:backend": "npm run -w backend start"` par `"dev:backend": "npm run -w backend start:dev"` (R2, A02) ; vérifier que `start.bat` (qui appelle `npm run dev`) n'a pas besoin d'autre modification
- [ ] T013 [US1] Relancer `npm run -w backend test` (T007 vert) et dérouler quickstart.md scénario 1 à la main sous Windows avec `start.bat` : connexion réussie, modification d'un fichier de `backend/src` prise en compte sans compilation ; chronométrer le parcours de la copie de `.env.example` à la connexion réussie, hors téléchargements (SC-001 : moins de 10 minutes) ; arrêter l'API et vérifier que l'interface affiche le message de T008 sans écran blanc ; consigner le résultat et la durée dans `docs/validation/verification-003.md`

**Checkpoint**: US1 complète — environnement de développement cohérent, suite verte

---

## Phase 4: User Story 2 - Garantir la traçabilité et la sécurité des opérations sensibles (Priority: P1)

**Goal**: masquage unifié, configuration entièrement validée, contrôle d'origine unique, réinitialisation du super administrateur tracée (FR-004 à FR-007, FR-010)

**Independent Test**: quickstart.md, scénarios 2 et 3

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T014 [P] [US2] Dans `backend/test/unit/config.spec.ts`, ajouter des cas pour `TRUST_PROXY` (contract `contracts/configuration.md`) : absent → `trustProxy` vaut `'loopback'` ; `'true'` → `true` ; `'false'` → `false` ; `'2'` → `2` ; `'uniquelocal'` ; `'loopback, 10.0.0.0/8'` ; `'::1'` → acceptés et renvoyés tels quels (chaîne nettoyée des espaces) ; `'n'importe quoi'`, `'-1'`, `'10.0.0.0/99'`, `'loopback,'` → `ConfigError` dont le message commence par `TRUST_PROXY invalide` (FR-004, R3)
- [ ] T015 [P] [US2] Créer `backend/test/unit/sensitive-keys.spec.ts` : importe `SENSITIVE_KEY` depuis `backend/src/common/sensitive-keys.ts` ; vérifie qu'il reconnaît `password`, `passwordHash`, `token`, `secret`, `cookie`, `authorization`, `Authorization`, `sid`, `text`, `message`, `content` et ne reconnaît pas `reason`, `route`, `username`, `messages`, `contentType` ; puis vérifie que `redact({ authorization: 'Bearer x', message: 'contenu' })` (logger, `backend/src/common/app-logger.ts`) et `sanitizeAuditDetails` (`backend/src/audit/audit.service.ts`) masquent ou retirent tous deux `authorization` et `message` ; et qu'un `new Error('Erreur lisible')` passé à `redact` garde son message lisible (risque [DÉDUIT] de R4) (FR-005)
- [ ] T016 [P] [US2] Créer `backend/test/unit/origin.spec.ts` pour `backend/src/common/origin.ts` : `isAllowedOrigin({ origin: 'https://a.fr' }, 'https://a.fr')` → vrai ; origine étrangère → faux ; `origin` absent et `referer: 'https://a.fr/page'` → vrai seulement si l'option referer est passée ; valeur non URL → faux ; `origin: 'null'` → faux (FR-006, R5)
- [ ] T017 [US2] Dans `backend/test/integration/bootstrap-production.spec.ts`, ajouter un `describe('resetSuperAdminPassword')` : (a) avec un super administrateur ayant deux sessions en base, l'appel renvoie un mot de passe provisoire de 22 caractères base64url, met `mustChangePassword` à vrai, change `passwordHash` (vérifier avec `argon2.verify`), supprime les deux sessions et crée **une** ligne `AuditLog` `action: 'PASSWORD_RESET'`, `actorId: null`, `targetType: 'User'`, `targetId` = id du compte, `details: { reason: 'CLI' }`, `ip: null` ; (b) sans identifiant, cible le plus ancien `SUPER_ADMIN` actif ; (c) identifiant inconnu ou compte `EMPLOYEE` → rejette avec le message `Compte « <identifiant> » introuvable ou non super administrateur : aucune modification.`, aucune écriture (ni utilisateur, ni session, ni audit) ; (d) le mot de passe en clair n'apparaît dans aucune ligne `AuditLog` ; (e) **ligne de commande** : lancer `npx tsx src/cli/bootstrap.ts --reset-password inconnu` (`child_process.spawnSync`, `cwd: backend`, `DATABASE_URL` = base de test) → code de sortie 1, message de (c) sur stderr, rien sur stdout ; lancer `npx tsx src/cli/bootstrap.ts` sans argument sur une base où un super administrateur existe → code 0, message « existe déjà » (appel historique inchangé) ; (f) **base inaccessible** (cas limite de la spec) : `resetSuperAdminPassword` avec un `PrismaClient` dont l'URL pointe vers un port fermé → la promesse est rejetée et aucun mot de passe n'est renvoyé ; en ligne de commande, code de sortie 1 (FR-007, FR-010, R6, data-model §AuditLog, constat G5)

### Implementation for User Story 2

- [ ] T018 [P] [US2] Créer `backend/src/common/sensitive-keys.ts` exportant `export const SENSITIVE_KEY = /pass(word)?|hash|token|secret|cookie|authorization|^sid$|^text$|^message$|^content$/i;` avec un commentaire indiquant qu'il sert au logger et au journal d'audit ; dans `backend/src/common/app-logger.ts` et `backend/src/audit/audit.service.ts`, supprimer les constantes locales `SENSITIVE_KEY` et importer la constante commune ; les motifs de texte du logger (`TEXT_PATTERNS` ou équivalent : argon2, en-têtes cookie/authorization, `sid=`) restent dans `app-logger.ts` ; T015 vert, `log-redaction.spec.ts` et `audit-sanitize.spec.ts` verts (FR-005)
- [ ] T019 [P] [US2] Créer `backend/src/common/origin.ts` : déplacer `originOf(value)` depuis `backend/src/auth/origin.guard.ts` et exporter `isAllowedOrigin(headers: { origin?: string; referer?: string }, appOrigin: string, options?: { allowReferer?: boolean }): boolean` ; `auth/origin.guard.ts` appelle `isAllowedOrigin(req.headers, appOrigin, { allowReferer: true })` ; `realtime/realtime.gateway.ts` supprime sa copie de `originOf` et appelle `isAllowedOrigin(socket.handshake.headers, appOrigin)` sans referer (comportement inchangé, FR-023) ; T016 vert, `auth.spec.ts` et `realtime.spec.ts` verts (FR-006)
- [ ] T020 [US2] Dans `backend/src/config/config.ts` : ajouter `trustProxy: boolean | number | string` à `AppConfig` ; dans `loadConfig`, lire `env.TRUST_PROXY?.trim() || 'loopback'` et valider : `true`/`false` → booléen ; `/^\d+$/` → nombre ; sinon liste séparée par des virgules dont chaque élément (après `trim`, non vide) est `loopback`, `linklocal`, `uniquelocal`, une adresse IP (`net.isIP` de `node:net`) ou une plage CIDR `IP/n` (n ≤ 32 en IPv4, ≤ 128 en IPv6) ; sinon `throw new ConfigError('TRUST_PROXY invalide : utilisez true, false, un nombre de proxys, ou une liste parmi loopback, linklocal, uniquelocal, adresses IP ou plages CIDR')` ; T014 vert (FR-004, R3)
- [ ] T021 [US2] Dans `backend/src/app.setup.ts`, remplacer `process.env.TRUST_PROXY ?? 'loopback'` par `config.trustProxy` et `process.env.NODE_ENV !== 'production'` par `!config.isProduction`, `config` étant obtenu par `app.get<AppConfig>(APP_CONFIG)` ; dans `backend/src/main.ts`, remplacer `Number(process.env.PORT ?? 3002)` par `app.get<AppConfig>(APP_CONFIG).port` ; vérifier avec `grep -rn "process.env" backend/src` qu'il ne reste que `config/`, `cli/bootstrap.ts` et `config/load-env-file.ts` ; `npm run -w backend test:integration` vert (FR-004)
- [ ] T022 [US2] Dans `backend/src/cli/bootstrap.ts`, ajouter et exporter `resetSuperAdminPassword(prisma: PrismaClient, username?: string): Promise<{ username: string; temporaryPassword: string }>` selon research R6 : mot de passe `randomBytes(16).toString('base64url')`, haché Argon2id ; dans **une** `prisma.$transaction` : `user.update({ passwordHash, mustChangePassword: true })`, `session.deleteMany({ where: { userId } })`, `auditLog.create({ action: 'PASSWORD_RESET', actorId: null, targetType: 'User', targetId: user.id, details: { reason: 'CLI' }, ip: null })` ; sans `username`, cible `findFirst({ where: { role: 'SUPER_ADMIN', active: true }, orderBy: { createdAt: 'asc' } })` ; compte absent ou non `SUPER_ADMIN` → `throw new Error('Compte « <identifiant> » introuvable ou non super administrateur : aucune modification.')` avant toute écriture. Dans `main()`, si `process.argv[2] === '--reset-password'`, appeler `resetSuperAdminPassword(prisma, process.argv[3])` et écrire sur stdout `Mot de passe provisoire de « <identifiant> » (affiché une seule fois, à changer à la première connexion) : <mot de passe>` ; sinon comportement historique inchangé ; mettre à jour le commentaire d'usage en tête de `main()` ; T017 vert (FR-007, FR-010, `contracts/cli-and-deploy.md`)
- [ ] T023 [US2] Supprimer `backend/scripts/reset-superadmin-password.ts` ; chercher ses mentions (`grep -rn "reset-superadmin" --exclude-dir=node_modules .`) et les remplacer, dans `README.md` et toute documentation d'exploitation, par les deux exemples de `contracts/cli-and-deploy.md` (développement et production) (FR-010, D2)
- [ ] T024 [US2] Dérouler quickstart.md scénarios 2 et 3 à la main (deux navigateurs connectés en `superadmin`) et consigner le résultat dans `docs/validation/verification-003.md`

**Checkpoint**: US1 et US2 fonctionnent indépendamment

---

## Phase 5: User Story 3 - Affectation automatique conforme à la règle des snapshots (Priority: P2)

**Goal**: en circuit B, l'approbation affecte selon le mode **et** la personne figés à la soumission (D1), avec repli explicite si la personne n'est plus affectable (FR-008, FR-009, FR-011)

**Independent Test**: quickstart.md, scénario 4

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T025 [US3] Créer `backend/test/integration/auto-assignment-snapshot.spec.ts` (modèle : `requests-circuit-b.spec.ts`, utilitaires `seedDemo`, `loginAs`, `userId`, `categoryId` de `backend/test/utils/auth-helpers.ts`). Préparer une catégorie en circuit B, `assignmentMode: 'AUTO'`, `autoAssigneeId` = E1, avec E1, E2, E3 destinataires actifs. Cas, avec résultat attendu selon `contracts/rest-api.md` : (1) soumettre D1, passer `autoAssigneeId` à E2, approuver sans `assigneeId` → `200`, `assigneeId` = E1 ; (2) soumettre D2, passer la catégorie en `MANUAL` (`autoAssigneeId: null`), approuver sans `assigneeId` → `200`, affectée à E1 (aujourd'hui `422 ASSIGNEE_REQUIRED`, constat N1) ; (3) soumettre D3, désactiver E1, approuver sans `assigneeId` → `422` code `AUTO_ASSIGNEE_UNAVAILABLE`, demande inchangée (statut, version) ; puis approuver avec `assigneeId` = E3 → `200`, affectée à E3 ; (3b) soumettre D3b, **retirer E1 des destinataires** de la catégorie (compte toujours actif), approuver sans `assigneeId` → `422 AUTO_ASSIGNEE_UNAVAILABLE`, puis avec `assigneeId` = E3 → `200`, affectée à E3 (EXC-2, décision D8) ; (4) même situation que (3) mais `assigneeId` d'un compte inactif ou non destinataire → `422 RECIPIENT_NOT_ALLOWED`, demande inchangée ; (5) catégorie AUTO intacte, approuver avec `assigneeId` = E2 → `200`, affectée à E1 (le choix fourni est ignoré) ; (6) demande dont on retire la clé `autoAssigneeId` de `rulesSnapshot` par `prisma.request.update` (demande antérieure, EXC-1, décision D9), catégorie désignant E2 → affectée à E2 ; (7) pour chaque cas réussi, le `RequestEvent` de type `ASSIGNED` créé par l'approbation porte `toValue.assigneeSource` = `SNAPSHOT` (1, 2, 5), `MANAGER_CHOICE` (3, 3b), `CATEGORY_CURRENT` (6). Avant la correction, constater l'échec de (1), (2), (3), (3b) et (7) ; (4), (5) et (6) passent déjà, car ils décrivent un comportement conservé (FR-009 : confirme le constat [DÉDUIT] A04)
- [ ] T026 [P] [US3] Dans `frontend/tests/requests/ApprovalPanel.test.tsx` (fichier cible confirmé : il rend `RequestActions`, qui ouvre `ApprovalDialog`, et contient déjà `describe('Approbation (circuit B)')` avec le cas « en affectation automatique, approuve sans choix d’employé » ; aucun nouveau fichier de test), ajouter dans ce `describe` le test `it('en affectation automatique, propose le choix de l’employé si la personne prévue n’est plus disponible')` : demande au snapshot `assignmentMode: 'AUTO'` ; appeler `stubFetch` directement (pas `renderActions`, qui répond toujours `200`) avec un gestionnaire qui renvoie la même liste `/api/requests/r1/assignees` que `renderActions`, puis, pour le **premier** `POST /api/requests/r1/actions`, `json(422, { error: { code: 'AUTO_ASSIGNEE_UNAVAILABLE', message: 'La personne désignée pour cette catégorie n’est plus disponible. Choisissez l’employé qui réalisera la demande.' } })`, et `200` ensuite ; même rendu que `renderActions` (`QueryClientProvider` + `RequestActions`). Attendu : après le premier envoi, le message du serveur s'affiche dans un élément `role="alert"` de la boîte « Approuver la demande », le combobox « Employé chargé de la demande » apparaît et a le focus ; après le choix de « Reprographie » et un nouvel envoi, le **dernier** appel à `/api/requests/r1/actions` a pour corps `{ action: 'APPROVE', version: 2, assigneeId: 'e1' }`. Les tests existants du fichier restent inchangés. Constater l'échec

### Implementation for User Story 3

- [ ] T027 [US3] Dans `backend/src/requests/request-policy.loader.ts` : ajouter `autoAssigneeId: string | null` à `RequestRulesSnapshot` ; dans `rulesSnapshot()`, renseigner `autoAssigneeId: category.assignmentMode === 'AUTO' ? category.autoAssigneeId : null` (data-model : « Renseignée si `assignmentMode = AUTO`, sinon `null` »). Aucune migration (champ JSON)
- [ ] T028 [US3] Dans `backend/src/common/errors.ts`, ajouter à `ERROR_CATALOG` : `AUTO_ASSIGNEE_UNAVAILABLE: { status: 422, message: 'La personne désignée pour cette catégorie n’est plus disponible. Choisissez l’employé qui réalisera la demande.' }` (même apostrophe typographique que les messages voisins) ; ajouter le cas à `backend/test/unit/http-exception.filter.spec.ts` si ce fichier énumère les codes
- [ ] T029 [US3] Dans `backend/src/requests/request-transitions.service.ts`, réécrire la branche `APPROVE` de `assigneeContext` selon data-model §Résolution : lire `rules = readRulesSnapshot(request)` ; si `rules.assignmentMode !== 'AUTO'` → `input.assigneeId`, source `MANAGER_CHOICE` ; sinon candidat = `'autoAssigneeId' in rules ? rules.autoAssigneeId : category.autoAssigneeId` (source `SNAPSHOT`, ou `CATEGORY_CURRENT` pour une demande antérieure : EXC-1, décision D9) ; si candidat non nul et affectable (`canPickRecipient` : actif et destinataire actuel) → candidat (un `input.assigneeId` fourni est ignoré, FR-008) ; sinon (EXC-2, décision D8) : si `input.assigneeId` fourni → l'utiliser, source `MANAGER_CHOICE`, contrôlé par `canPickRecipient` (refus `RECIPIENT_NOT_ALLOWED` inchangé) ; sinon `throw new AppException('AUTO_ASSIGNEE_UNAVAILABLE')` avant toute écriture. Ne rien implémenter d'autre que ces règles (FR-008, FR-011). Transmettre la source à `commit`/`recordTransition` pour l'ajouter dans `toValue` de l'événement `ASSIGNED` créé par l'approbation (à côté de `assigneeId` ; l'événement `STATUS_CHANGED` est inchangé) sous la clé `assigneeSource` (`SNAPSHOT` | `CATEGORY_CURRENT` | `MANAGER_CHOICE`) ; ne plus lire `category.assignmentMode` pour `APPROVE` ; T025 vert, `requests-circuit-b.spec.ts` et `assignable-employees.spec.ts` verts sans modification de leurs attendus
- [ ] T030 [P] [US3] Dans `frontend/src/features/requests/types.ts`, ajouter `autoAssigneeId?: string | null` au type de `rulesSnapshot` ; dans `frontend/src/features/requests/RequestActions.tsx` (qui reçoit l'erreur de la mutation d'action [VÉRIFIÉ]) et `frontend/src/features/requests/ApprovalDialog.tsx` (mode choisi par la prop `automatic`), sur une erreur `AUTO_ASSIGNEE_UNAVAILABLE`, passer la boîte en mode manuel : afficher le message du serveur dans une alerte, afficher le sélecteur d'employé existant et y placer le focus ; le bouton de confirmation envoie `{ assigneeId }` ; T026 vert ; vérification axe inchangée (`e2e/us5-admin-validation.spec.ts`)
- [ ] T031 [P] [US3] Afficher la source de l'affectation dans l'historique (US3 scénario 5 ; mention autorisée par FR-023). `HistoryTimeline.tsx` affiche déjà le détail de l'affectation (`describeEvent`, cas `ASSIGNED` : « Affectée à <nom> ») [VÉRIFIÉ]. **Test d'abord** : dans `frontend/tests/requests/HistoryTimeline.test.tsx`, ajouter `it('indique la source de l’affectation décidée à l’approbation')`, qui appelle `describeEvent` (exporté par `frontend/src/features/requests/HistoryTimeline.tsx`) sur des événements `ASSIGNED` de `toValue` `{ assigneeId: 'u2', assigneeName: 'Reprographie', assigneeSource }` et attend exactement (`toBe`) : `SNAPSHOT` → « Affectée à Reprographie (personne prévue à la soumission) » ; `CATEGORY_CURRENT` → « Affectée à Reprographie (selon la catégorie actuelle, demande antérieure) » (EXC-1, D9) ; `MANAGER_CHOICE` → « Affectée à Reprographie (choix du responsable) » (mode manuel ou EXC-2, D8 : l'événement ne permet pas de distinguer les deux) ; sans `assigneeSource` (événements antérieurs, circuit A) → exactement « Affectée à Reprographie » (inchangé). Constater l'échec. Puis, dans `HistoryTimeline.tsx`, compléter le cas `ASSIGNED` de `describeEvent` en conséquence (valeur inconnue → aucune mention ; `REASSIGNED` inchangé) ; nouveau test vert, test existant `présente chaque action en langage courant, avec auteur et date` vert sans modification
- [ ] T032 [US3] Dérouler quickstart.md scénario 4 à la main et consigner le résultat dans `docs/validation/verification-003.md` ; noter que la décision D1 reste à faire confirmer par l'établissement

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

- [ ] T033 [P] [US4] Créer `backend/test/unit/architecture-layers.spec.ts` (R7) : parcourir récursivement `backend/src` (`node:fs`, fichiers `.ts`) ; extraire les imports relatifs, y compris `import type` et `export … from`, par l'expression `/^\s*(?:import|export)\s[^'"]*?from\s+'(\.[^']+)'/gm` ; résoudre chaque cible et la réduire à son dossier de premier niveau sous `backend/src` ; avec `const LAYERS = ['config', 'common', 'audit', 'auth', 'files', 'requests', 'coverage', 'scheduler']`, échouer si un fichier d'un dossier de `LAYERS` importe un dossier de `LAYERS` d'indice supérieur ; le message d'échec liste chaque violation sous la forme `<fichier source> → <cible> (<dossier> ne peut pas dépendre de <dossier>)`. Les dossiers hors `LAYERS` ne sont pas contrôlés. Constater l'échec, avec au moins les violations `auth → requests`, `common → audit`, `common → auth`, `files → requests`, `files → coverage`, `coverage → scheduler`
- [ ] T034 [P] [US4] Créer `frontend/tests/api/enums-sync.test.ts` (R10) : lire `../backend/prisma/schema.prisma` (chemin résolu depuis le fichier de test) et extraire chaque bloc `enum Nom { … }` (valeurs = identifiants en début de ligne, en ignorant les commentaires `//`) ; lire `frontend/src/api/types.ts` et `frontend/src/features/requests/types.ts` et extraire chaque `export type Nom = 'A' | 'B' …` ainsi que les unions littérales en ligne nommées comme une énumération Prisma ; pour chaque nom présent des deux côtés, comparer les ensembles et échouer en listant `<Nom> : manquant côté interface [...] ; en trop côté interface [...]`. Le test DOIT au minimum comparer `Role`, `Priority`, `RequestStatus` et `AssignmentMode`, et échouer si l'un d'eux est introuvable côté interface. Corriger les éventuelles divergences réelles dans `frontend/src/api/types.ts` (attendu : vert après correction, car les deux côtés sont aujourd'hui alignés à la main)

### Implementation for User Story 4

- [ ] T035 [US4] Créer `backend/src/common/authorization.ts` et y déplacer depuis `backend/src/requests/domain/access-policy.ts`, sans modifier leur corps : `ALL_PERMISSIONS`, `PolicyUser`, `permissionsFor`, `canManageAdministration`, `canReadAudit` ; dans `access-policy.ts`, les importer depuis `../../common/authorization` (pas de réexport) ; mettre à jour les imports de `backend/src/auth/session.service.ts`, `backend/src/auth/auth.types.ts` et de tous les autres fichiers (`grep -rn "permissionsFor\|PolicyUser\|ALL_PERMISSIONS\|canManageAdministration\|canReadAudit" backend/src backend/test`) ; déplacer les tests correspondants de `backend/test/unit/access-policy.spec.ts` vers un nouveau `backend/test/unit/authorization.spec.ts`, attendus inchangés (A09 `auth → requests`, A12)
- [ ] T036 [US4] Déplacer `backend/src/auth/request-info.ts` vers `backend/src/common/request-info.ts` (`git mv`, contenu inchangé) et mettre à jour tous les imports (`grep -rn "request-info" backend/src backend/test`) (supprime `common → auth`)
- [ ] T037 [US4] Déplacer `backend/src/common/super-admin.guard.ts` vers `backend/src/audit/super-admin.guard.ts` (`git mv`) ; y remplacer le test `user?.role === 'SUPER_ADMIN' && user.active` par `user && canManageAdministration(user)` importé de `../common/authorization` ; importer `clientIp`, `requestPath` depuis `../common/request-info` ; mettre à jour les imports dans `audit/`, `categories/`, `coverage/`, `settings/`, `users/` (fichiers listés par `grep -rln "SuperAdminGuard" backend/src`) ; `admin-*.spec.ts` verts (supprime `common → audit`)
- [ ] T038 [US4] Créer `backend/src/requests/request-policy.module.ts` : `@Module({ providers: [RequestPolicyLoader], exports: [RequestPolicyLoader] }) export class RequestPolicyModule {}` ; retirer `RequestPolicyLoader` des `providers` de `requests.module.ts`, `categories.module.ts`, `messages.module.ts`, `coverage.module.ts` et `files.module.ts`, et ajouter `RequestPolicyModule` aux `imports` des quatre premiers (files : voir T040) (A13, R9)
- [ ] T039 [US4] Créer `backend/src/files/file-access.ts` (R8) exportant `export interface RequestFileAccess { canRead(user: AuthenticatedUser, file: StoredFile, request: Request): Promise<boolean>; canAttach(user: AuthenticatedUser, request: Request): Promise<boolean>; }` ; dans `backend/src/files/files.service.ts`, ajouter `private readonly access = new Map<RequestKind, RequestFileAccess>()` et `registerAccess(kind: RequestKind, access: RequestFileAccess): void` (lève une erreur si le type est déjà enregistré) ; réécrire `findReadable` : UUID invalide ou fichier absent → `null` ; `file.requestId === null` → lisible par son auteur seul (inchangé) ; demande absente → `null` ; `this.access.get(request.kind)` absent → `null` (fermé par défaut) ; sinon `await access.canRead(user, file, request) ? file : null` ; réécrire `assertCanAttach` de même avec `canAttach` (`NOT_FOUND` si refus, inchangé)
- [ ] T040 [US4] Créer `backend/src/requests/work-file-access.ts` (`@Injectable() WorkFileAccess implements RequestFileAccess, OnModuleInit`, injecte `FilesService` et `RequestPolicyLoader`) reprenant mot pour mot la branche demandes de travail de l'ancien `findReadable` (`canReadRequest`) et de l'ancien `assertCanAttach` (`canWriteInThread`), et s'enregistrant par `files.registerAccess('WORK', this)` dans `onModuleInit` ; créer `backend/src/coverage/coverage-file-access.ts` (`CoverageFileAccess`, injecte `FilesService`, `PrismaService`, `CoverageAccessLoader`) reprenant la branche `COVERAGE` (`coverage.facts`, preuve = `file.isCompletionProof` ou présence `coveragePresence`, `canReadPresenceProof` / `coverageAccess === 'full'`) et `canAttach` équivalent au comportement actuel pour une couverture (vérifier le comportement actuel de `assertCanAttach` sur une demande `COVERAGE` et le reproduire à l'identique), enregistrée par `registerAccess('COVERAGE', this)` ; déclarer `WorkFileAccess` dans `requests.module.ts` (qui importe déjà `FilesModule`) et `CoverageFileAccess` dans `coverage.module.ts`, en **ajoutant `FilesModule` aux `imports` de `CoverageModule`** : il ne l'importe pas aujourd'hui [VÉRIFIÉ], et `CoverageFileAccess` en a besoin pour recevoir `FilesService` (exporté par `FilesModule` [VÉRIFIÉ]). Cette dépendance `coverage → files` respecte l'ordre des couches de R7 ; vérifier que `FilesModule` n'importe aucun module de `coverage/` ni de `requests/` (pas de cycle de modules NestJS) ; retirer de `files.module.ts` et `files.service.ts` tout import de `requests/` et `coverage/` ; `files-voice.spec.ts`, `coverage.spec.ts`, `coverage-work-isolation.spec.ts`, `messages.spec.ts` verts sans changement d'attendus (A10, A11, FR-014)
- [ ] T041 [US4] Créer `backend/src/scheduler/job-interval.ts` exportant `export const JOB_INTERVAL_MS = 15_000;` et le retirer de `scheduler/auto-close.job.ts` (importé par `auto-close.job.ts`, `overdue.job.ts`) ; déplacer `backend/src/coverage/coverage-deadlines.job.ts` vers `backend/src/scheduler/coverage-deadlines.job.ts` (`git mv`), l'enregistrer dans `backend/src/scheduler/scheduler.module.ts` (importer `CoverageModule` et faire exporter par `CoverageModule` le service dont le job dépend, `CoverageActionsService`) et le retirer de `coverage.module.ts` ; mettre à jour les commentaires qui citent l'ancien chemin (`coverage/domain/coverage-deadlines.ts`, `scheduler/overdue.job.ts`) (A15)
- [ ] T042 [US4] Relancer `backend/test/unit/architecture-layers.spec.ts` : DOIT être vert. S'il reste des violations non prévues par R7, les corriger par un déplacement du même type ou, si cela exige un changement de comportement, s'arrêter et les signaler (FR-012, FR-013)
- [ ] T043 [P] [US4] Dans `backend/src/notifications/notifications.service.ts`, supprimer la classe `NoopNotificationPublisher` et le commentaire « Implémentation sans effet en Phase 2 ; remplacée par Socket.IO en US4 (T070) » ; vérifier par `grep -rn "NoopNotificationPublisher" backend` qu'il n'en reste aucune mention (A16)
- [ ] T044 [P] [US4] Dans `backend/src/realtime/realtime-gateway.module.ts`, remplacer le commentaire par : « Passerelle Socket.IO, séparée du registre des connexions (RealtimeModule, global, sans dépendance à l'authentification) : la passerelle authentifie avec SessionService (AuthModule). » (R7)
- [ ] T045 [P] [US4] Retirer `@mui/icons-material` de `frontend/package.json` (`npm uninstall -w frontend @mui/icons-material`) après avoir revérifié `grep -rn "@mui/icons-material" frontend/src frontend/tests` (aucun résultat attendu) ; `npm run -w frontend build` et `npm run -w frontend test` verts (A18)
- [ ] T046 [P] [US4] Exécuter `npx prettier --write backend/scripts/check-users.ts` (A19) ; `npm run lint` vert
- [ ] T047 [P] [US4] Dans `frontend/src/api/types.ts`, remplacer le commentaire d'en-tête par : « Types partagés avec l'API, écrits à la main. Les énumérations sont comparées au schéma Prisma par tests/api/enums-sync.test.ts. » (A17, R10)

- [ ] T048 [US4] Dérouler quickstart.md scénario 5, **contre-épreuves comprises** : (a) ajouter temporairement dans `backend/src/files/files.service.ts` un `import '../requests/request-policy.loader';`, lancer `npm run -w backend test -- architecture-layers` → échec nommant `files/files.service.ts → ../requests/request-policy.loader` ; annuler (`git checkout -- backend/src/files/files.service.ts`) ; (b) ajouter temporairement une valeur `TEST_VALUE` à `enum RequestStatus` de `backend/prisma/schema.prisma`, lancer `npm run -w frontend test -- enums-sync` → échec listant `RequestStatus : manquant côté interface [TEST_VALUE]` ; annuler ; (c) `npm test` complet vert ; vérifier avec `git status` qu'aucune modification temporaire ne subsiste ; consigner les sorties dans `docs/validation/verification-003.md` (constat G1, US4 scénarios 1 et 2, SC-006)

**Checkpoint**: US1 à US4 fonctionnent ; couches vérifiées automatiquement

---

## Phase 7: User Story 5 - Mettre en production en sécurité (Priority: P3)

**Goal**: sauvegarde imposée avant migration, restauration exercée, en-têtes vérifiés, contrôles rejoués (FR-017 à FR-021)

**Independent Test**: quickstart.md, scénario 6, sur un serveur de préproduction

### Tests for User Story 5 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation** (constat C1, principe I)

- [ ] T049 [US5] Constater, sur une base locale (`npm run -w backend db:dev`) avec une migration de test vide en attente (`npx prisma migrate dev --create-only --name test_pending` dans `backend/`), le code de sortie et le texte exacts de `npx prisma migrate status` (Prisma 6) dans trois états : schéma à jour, migration en attente, base arrêtée ; supprimer ensuite la migration de test ; consigner les trois sorties dans `docs/validation/verification-003.md` (point [DÉDUIT] de R12). Elles servent de données aux faux `npx` de T050
- [ ] T050 [US5] Créer `backend/test/unit/api-entrypoint.spec.ts` (research R12) : pour chaque cas, créer un dossier temporaire (`fs.mkdtempSync`) contenant `bin/npx` et `bin/node` (scripts `#!/bin/sh` exécutables) qui ajoutent leurs arguments à un fichier journal ; le faux `npx` répond à `prisma migrate status` avec la sortie et le code relevés en T049 selon le cas, et réussit pour `prisma migrate deploy` ; lancer `deploy/api-entrypoint.sh` avec `spawnSync(shell, [script])`, `env: { PATH: <bin temporaire> + séparateur + PATH, PRE_MIGRATION_BACKUP_DIR: <dossier temporaire de sauvegardes>, PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES: '60' }`. Shell : `/bin/sh` sous Linux ; sous Windows, `bash.exe` de Git for Windows, déduit de `git --exec-path` (`…/mingw64/libexec/git-core` → `…/bin/bash.exe`) ; si aucun shell POSIX n'est trouvé, échouer avec un message explicite (aucun saut silencieux). Cas : (1) schéma à jour → `migrate deploy` non appelé, faux `node` appelé avec `dist/main.js` ; (2) migration en attente, dossier de sauvegardes vide → code 1, stderr contient « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. », ni `migrate deploy` ni `node` ; (3) migration en attente, `db-20260101T000000Z.dump` daté de 2 heures (`fs.utimesSync`) → comme (2) ; (4) migration en attente, archive datée de 5 minutes → `migrate deploy` puis `node dist/main.js`, dans cet ordre ; (5) base inaccessible (sortie d'erreur de T049) → code 1, sortie de Prisma recopiée, ni `migrate deploy` ni `node`. Constater l'échec des cas (2), (3) et (5) avec l'entrypoint actuel

### Implementation for User Story 5

- [ ] T051 [P] [US5] Créer `deploy/deploy.sh` (exécutable, `set -euo pipefail`, en-tête de commentaire au style de `deploy/backup/restore.sh`) selon `contracts/cli-and-deploy.md` : `COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)` ; étape 1 `"${COMPOSE[@]}" run --rm --no-deps --entrypoint /bin/bash backup /scripts/backup.sh`, arrêt avec message si échec ; étape 2 `"${COMPOSE[@]}" up -d --build` (R12)
- [ ] T052 [P] [US5] Dans `deploy/docker-compose.yml`, service `api` : ajouter le volume `${BACKUP_DIR:-./backups}:/backups:ro` et la variable `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES: ${PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES:-60}` ; l'ajouter commentée à `deploy/.env.example` (`contracts/configuration.md`)
- [ ] T053 [US5] Dans `deploy/api-entrypoint.sh` (shell POSIX `sh`, `set -eu` conservé), avant `npx --no-install prisma migrate deploy` : `BACKUP_DIR="${PRE_MIGRATION_BACKUP_DIR:-/backups}"` ; exécuter `npx --no-install prisma migrate status` en capturant sortie et code (sans que `set -e` interrompe) ; selon les sorties relevées en T049 : schéma à jour → démarrer sans contrôle ; migration en attente → exiger un fichier `"$BACKUP_DIR"/db-*.dump` modifié depuis moins de `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes (`find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' -mmin -"${PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES:-60}"`), sinon afficher sur stderr « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. » et `exit 1` ; toute autre erreur (base injoignable) → afficher la sortie et `exit 1` ; `exec node dist/main.js` inchangé. T050 vert en local et en CI
- [ ] T054 [P] [US5] Dans `README.md` (section production) et `docs/coverage-migration.md`, remplacer la sauvegarde manuelle avant mise à jour et la commande `docker compose … up -d --build` par `deploy/deploy.sh`, en expliquant que l'API refuse d'appliquer une migration sans sauvegarde de moins de `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes (FR-018)
- [ ] T055 [US5] Sur la préproduction, dérouler quickstart.md scénario 6 point 1 (migration de test vide, `up` sans le script → refus ; `deploy/deploy.sh` → sauvegarde puis migration) ; vérifier ensuite par `docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps` que le service `api` est `healthy` (son healthcheck interroge `http://127.0.0.1:3000/api/health` : le port de production reste 3000 malgré le changement de `main.ts`, FR-002, US1 scénario 5, constat G4) ; supprimer la migration de test du dépôt ; consigner dans `docs/validation/verification-003.md` (FR-018, A22, A23)
- [ ] T056 [US5] Sur un serveur vierge, restaurer une sauvegarde réelle avec `deploy/backup/restore.sh <horodatage>` ; contrôler la connexion, une demande avec vocal et photo, le journal d'audit ; mesurer la durée ; consigner dans un nouveau `docs/validation/restauration.md` (date, serveur, horodatage de la sauvegarde, durée, écarts) (FR-020, A24, SC-008)
- [ ] T057 [P] [US5] Sur la préproduction en HTTPS, exécuter `curl -sI https://<domaine>/` et `curl -sI https://<domaine>/api/health` ; vérifier `Content-Security-Policy` et `Strict-Transport-Security` ; envoyer un fichier de 27 Mo à l'API et constater le refus ; consigner les sorties dans un nouveau `docs/validation/en-tetes-securite.md` (FR-021, A25)
- [ ] T058 [US5] Exécuter `npm run test:e2e` (tous les profils, dont `e2e/sc001-create-timing.spec.ts`) et consigner le résultat dans `docs/validation/verification-003.md` (FR-017, FR-019 partie manuelle, A20, A26)

**Checkpoint**: toutes les user stories sont fonctionnelles et vérifiées

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: clôture documentaire et vérification finale

- [ ] T059 Mettre à jour `docs/ARCHITECTURE.md` (FR-024) : retirer la mention « trois modifications non commitées » de l'en-tête ; marquer chaque constat traité « corrigé (commit <sha>) » ; re-marquer A04, A11, A20, A23, A24, A25, A26 en [VÉRIFIÉ] (confirmé ou infirmé) avec la preuve ; ajouter N1 à N3 ; décrire l'ordre de couches et le test qui le vérifie (§10) ; lister les cycles restants hors périmètre (`auth ↔ settings`, `auth ↔ realtime`, `users`, `notifications`) ; mettre à jour §9 (port 3002, `start:dev`, `deploy/deploy.sh`, CI) et §11
- [ ] T060 [P] Mettre à jour le registre de `specs/003-corrections-audit-technique/spec.md` : statut de chaque constat CT, et note dans la table des décisions que D1 attend la confirmation de l'établissement
- [ ] T061 Exécuter `npm run verify` et `npm run -w backend typecheck`, `npm run -w frontend typecheck` ; consigner les résultats finaux dans `docs/validation/verification-003.md` (section « Vérification finale », avec les compteurs de tests comme dans `verification-finale.md`) ; vérifier que la CI est verte sur le dernier commit (SC-002)
- [ ] T062 Relire `quickstart.md` de bout en bout et vérifier que chaque scénario est consigné dans `docs/validation/` ; cocher dans `specs/003-corrections-audit-technique/spec.md` les critères SC-001 à SC-009 atteints, et lister ceux qui restent ouverts (par exemple faute de serveur de préproduction) ; avant de fusionner la fonctionnalité dans `master`, appliquer `docs/procedure-fusion.md` (T006) et cocher les quatre contrôles dans la demande de fusion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance
- **Foundational (Phase 2)** : après Phase 1 ; BLOQUE toutes les user stories (suite verte + CI)
- **US1 (Phase 3)** : après Phase 2
- **US2 (Phase 4)** : après Phase 2 ; indépendante de US1 fonctionnellement, mais T014 et T020 modifient `config.spec.ts` / `config.ts` comme T002 et T007 → faire US1 avant pour éviter les conflits
- **US3 (Phase 5)** : après Phase 2 ; indépendante de US1 et US2. T029 ajoute `AUTO_ASSIGNEE_UNAVAILABLE` dans `errors.ts` (T028) ; pas de conflit avec US4 si US3 est terminée avant T035–T040 (fichiers `request-transitions.service.ts`, `request-policy.loader.ts` touchés par les deux)
- **US4 (Phase 6)** : après Phase 2 ; **recommandé après US2 et US3**, car T035–T041 déplacent des fichiers que US2 (`origin.guard.ts`, `app-logger.ts`) et US3 (`request-policy.loader.ts`) modifient
- **US5 (Phase 7)** : T051, T052 et T054 sont indépendantes (aucune dépendance sur une autre tâche ; elles suivent les contrats) ; T053 dépend de T049 et de T050 (sorties relevées en T049, test rouge de T050, lui-même écrit après T049) ; T055 dépend de T051, T052 et T053 ; T055–T058 exigent en outre un serveur de préproduction et la fin de US1 à US4 pour valider la version finale
- **Polish (Phase 8)** : après toutes les stories

### Within Each User Story

- Tests écrits et constatés rouges avant l'implémentation (T063, T014–T017, T025–T026, test de T031, T033–T034, T050) ; seule exception, T008, qui fige un comportement existant et est vert dès son écriture
- US5 : T049 → T050 → T053 ; T051, T052 et T054 sans prérequis ; T051, T052 et T053 avant T055
- T063 → T064 → T005 (la CI doit être verte : N3 relevé par son premier passage) → T006
- US4 : T035 → T036 → T037 (même chaîne d'imports `common`/`audit`/`auth`) ; T038 avant T040 ; T039 avant T040 ; T042 après T035–T041

### Parallel Opportunities

- US1 : T009, T010, T011, T012 (fichiers distincts)
- US2 : T014, T015, T016 (tests) ; T018 et T019 (fichiers distincts)
- US3 : T026, T030 et T031 (frontend) en parallèle de T027–T029 (backend)
- US4 : T033 et T034 ; T043, T044, T045, T046, T047 entre eux et avec la chaîne T035–T042
- US5 : T051, T052 et T054 entre elles et avec la chaîne T049 → T050 → T053 ; T057 ; T049–T054 peuvent avancer pendant US3/US4
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
4. Fusion possible après la vérification manuelle de T006 : l'équipe dispose d'un environnement cohérent et d'une CI

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
- Aucun test existant ne doit voir ses attendus modifiés (SC-007), sauf T002 (port), qui aligne un test sur un choix déjà commité, et T008, qui resserre deux attendus (expression régulière → message exact) sans en changer le sens
- Si une tâche révèle un écart avec research.md, s'arrêter et le signaler plutôt que d'improviser un changement de comportement (FR-023)
- T055 à T058 dépendent d'un serveur de préproduction : s'il n'est pas disponible, les laisser ouvertes et le signaler dans `docs/validation/verification-003.md`
