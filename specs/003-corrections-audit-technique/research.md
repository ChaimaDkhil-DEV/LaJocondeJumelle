# Research: Corrections issues de l'audit technique

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-15

Chaque décision s'appuie sur le code de la branche `003-corrections-audit-technique` (commit
`809b44a`), lu pour ce plan. Les marquages suivent la convention de `docs/ARCHITECTURE.md` :
**[VÉRIFIÉ]** = lu dans le code ou constaté par une commande ; **[DÉDUIT]** = interprétation.

## Constats nouveaux relevés pendant le plan

Ils complètent l'audit sans le refaire ; ils seront reportés dans `docs/ARCHITECTURE.md` (FR-024).

- **N1 [VÉRIFIÉ] — Blocage possible à l'approbation.** L'interface choisit d'afficher ou non le
  sélecteur d'employé d'après le **snapshot** (`RequestActions.tsx` :
  `automatic={request.rulesSnapshot.assignmentMode === 'AUTO'}`), alors que le serveur décide
  d'après la **catégorie actuelle** (`RequestTransitionsService.assigneeContext`). Si une
  catégorie passe d'automatique à manuelle pendant qu'une demande attend, l'interface n'affiche
  pas de sélecteur et le serveur répond `ASSIGNEE_REQUIRED` : le responsable ne peut pas
  approuver. Le constat [DÉDUIT] A04 est donc confirmé par lecture ; FR-009 le confirmera par un
  test. La décision D1 (tout figé) supprime cet écart.
- **N2 [VÉRIFIÉ] — Les cycles sont plus étendus que ne le dit l'audit.** Une analyse des imports
  relatifs de `backend/src` (script ponctuel, dossier par dossier) montre que **11 dossiers**
  forment une seule composante fortement connexe : `audit`, `auth`, `common`, `coverage`,
  `files`, `notifications`, `realtime`, `requests`, `scheduler`, `settings`, `users`. L'audit
  (§10) n'en citait que quatre. Voir R7 pour le périmètre retenu.

---

## R1 — Port 3002 en développement, 3000 en production (FR-001, FR-002, A01)

**Decision**: aligner sur 3002 toutes les sources de développement encore à 3000 :
`backend/.env.example` (`PORT=3002`), `README.md` (ligne 41), `deploy/Caddyfile.dev` (deux
`reverse_proxy host.docker.internal:3002`), `backend/test/unit/config.spec.ts` (attendu 3002).
La production garde 3000, déjà fixé explicitement par `deploy/api.Dockerfile` (`ENV PORT=3000`,
`EXPOSE`, `HEALTHCHECK`) et `docker-compose.yml` (`expose: '3000'`) : rien à changer.

**Rationale**: [VÉRIFIÉ] `config.ts`, `main.ts`, `vite.config.ts`, `frontend/package.json` et
`start.bat` sont déjà à 3002 (commit `1e6d4ee`). Le port de production est interne au réseau
Docker et indépendant de la valeur par défaut.

**Alternatives considered**: revenir à 3000 partout (annule un choix déjà commité) ; passer la
production à 3002 (aucun bénéfice, modifie trois fichiers de déploiement et le healthcheck).

## R2 — Lanceur de développement avec rechargement (FR-003, A02)

**Decision**: le script racine `dev:backend` appelle `npm run -w backend start:dev`
(`nest start --watch`) au lieu de `start` (`node dist/main.js`). `start.bat` n'a pas à changer
(il appelle `npm run dev`).

**Rationale**: [VÉRIFIÉ] le README recommande déjà `start:dev` ; `start` exige une compilation
préalable et ne recharge pas. Un seul changement aligne les deux documents.

**Alternatives considered**: compiler avant de lancer (`build && start`) : plus lent, sans
rechargement.

## R3 — Toute la configuration validée au démarrage (FR-004, A07)

**Decision**:
- `AppConfig` gagne `trustProxy: string | number | boolean`. `loadConfig` lit `TRUST_PROXY`
  (défaut `loopback`) et l'accepte si c'est : `true`/`false` ; un entier ≥ 0 (nombre de
  proxys) ; une liste séparée par des virgules de valeurs parmi `loopback`, `linklocal`,
  `uniquelocal`, adresse IPv4/IPv6 ou plage CIDR. Sinon `ConfigError` explicite.
- `app.setup.ts` lit `config.trustProxy` via `APP_CONFIG` au lieu de `process.env.TRUST_PROXY`.
- `main.ts` écoute sur `app.get(APP_CONFIG).port` au lieu de relire `process.env.PORT`.
- `app.setup.ts` lit `config.isProduction` au lieu de `process.env.NODE_ENV` (même principe).

**Rationale**: [VÉRIFIÉ] `TRUST_PROXY` et `PORT` sont lus hors de `loadConfig` ; une valeur
invalide de `TRUST_PROXY` n'est aujourd'hui rejetée que par Express, avec un message technique.
Une seule porte d'entrée pour la configuration rend la validation testable par
`config.spec.ts`.

**Alternatives considered**: bibliothèque de validation (Joi, zod) : nouvelle dépendance pour
trois lignes de contrôle (principe II).

## R4 — Liste unique des clés sensibles (FR-005, A06)

**Decision**: créer `backend/src/common/sensitive-keys.ts` exportant `SENSITIVE_KEY`, union des
deux expressions actuelles :
`/pass(word)?|hash|token|secret|cookie|authorization|^sid$|^text$|^message$|^content$/i`.
`common/app-logger.ts` et `audit/audit.service.ts` l'importent. Les motifs de texte du logger
(`argon2`, en-têtes `cookie`/`authorization`, `sid=`) restent propres au logger, car ils
portent sur des chaînes, pas sur des clés.

**Rationale**: [VÉRIFIÉ] `authorization` manque côté audit et `^message$` côté logger. Le
masquage d'une clé `message` dans un objet journalisé ne touche pas le message d'une erreur
(`redact` traite `Error.message` à part) ni le premier argument des journaux Nest.

**Risque [DÉDUIT]**: un objet journalisé dont la clé `message` porte une information utile
(sans donnée personnelle) sera masqué. Le test unitaire du logger vérifiera que les messages
d'erreur restent lisibles.

**Alternatives considered**: deux listes synchronisées par un test : la duplication reste.

## R5 — Contrôle d'origine unique (FR-006, A08)

**Decision**: déplacer `originOf` dans `backend/src/common/origin.ts` avec une fonction
`isAllowedOrigin(headers: { origin?: string; referer?: string }, appOrigin): boolean`.
`auth/origin.guard.ts` et `realtime/realtime.gateway.ts` l'utilisent tous deux.

**Point à préserver [VÉRIFIÉ]**: aujourd'hui la garde HTTP accepte `Origin` **ou**, à défaut,
`Referer` ; la passerelle Socket.IO n'accepte que `Origin`. La fonction unique prend
`referer` en option : la passerelle ne le passe pas, pour ne rien changer au comportement
(FR-023). Les tests d'intégration existants (`auth.spec.ts`, tests temps réel) vérifient les deux
voies.

**Alternatives considered**: aligner la passerelle sur `Referer` : changement de comportement
non demandé.

## R6 — Réinitialisation du super administrateur dans l'outil d'initialisation (FR-007, FR-010, A05, D2)

**Decision**:
- Nouvelle sous-commande de `backend/src/cli/bootstrap.ts` :
  `node dist/cli/bootstrap.js --reset-password [identifiant]` (identifiant par défaut : le plus
  ancien super administrateur actif). Le premier argument `--reset-password` est réservé ;
  l'appel historique `bootstrap.js <identifiant> "<nom>"` reste inchangé.
- Fonction exportée et testable `resetSuperAdminPassword(prisma, username?)`, qui, dans **une
  seule transaction** : vérifie que le compte existe et a le rôle `SUPER_ADMIN` ; écrit le
  nouveau haché Argon2id avec `mustChangePassword: true` ; supprime toutes les sessions du
  compte ; écrit l'audit `PASSWORD_RESET` (`actorId: null`, `targetType: 'User'`, `targetId`,
  `details: { reason: 'CLI' }`, `ip: null`). Mot de passe provisoire de 16 octets aléatoires
  (base64url), affiché une seule fois.
- Les connexions temps réel encore ouvertes sont fermées par le job existant
  `SessionRevalidationJob` (≤ 60 s), puisque les sessions n'existent plus en base.
- `backend/scripts/reset-superadmin-password.ts` est supprimé ; le README et la documentation
  d'exploitation pointent vers la sous-commande, utilisable aussi dans le conteneur de
  production (`docker compose … exec api node dist/cli/bootstrap.js --reset-password`).

**Rationale**: [VÉRIFIÉ] le même enchaînement existe déjà dans
`UsersService.resetPassword` (transaction, `session.deleteMany`, audit `PASSWORD_RESET`) ;
l'outil d'initialisation journalise déjà (`USER_CREATED`, `reason: 'BOOTSTRAP'`). Le script
actuel n'est pas compilé dans `dist/` : il n'est pas utilisable en production. Le champ
`details.reason` fait partie de la liste blanche de l'audit [VÉRIFIÉ : `USER_CREATED` l'utilise
déjà].

**Alternatives considered**: garder le script séparé (D2 option A, écartée par la décision) ;
réutiliser `UsersService` hors de Nest (il dépend de `RealtimeService` et de l'injection).

## R7 — Dépendances entre dossiers : périmètre et vérification (FR-012, FR-013, A09, A12, N2)

**Decision — périmètre**: rendre acyclique, et garder acyclique, le sous-graphe des dossiers
`common`, `audit`, `auth`, `files`, `requests`, `coverage`, `scheduler`, selon l'ordre de
couches suivant (un dossier ne peut importer que des dossiers situés **avant** lui, plus
`config`) :

```text
config → common → audit → auth → files → requests → coverage → scheduler
```

Les autres cycles relevés en N2 (`auth ↔ settings`, `auth ↔ realtime`, `users`, `notifications`)
sont **hors périmètre** : ils sont consignés comme constats [VÉRIFIÉ] restants dans
`docs/ARCHITECTURE.md`, sans correction (principe II).

**Decision — déplacements** (aucune règle métier modifiée) :

| Élément | De | Vers | Cycle supprimé |
|---|---|---|---|
| `PolicyUser`, `ALL_PERMISSIONS`, `permissionsFor`, `canManageAdministration`, `canReadAudit` | `requests/domain/access-policy.ts` | `common/authorization.ts` | `auth → requests` (A09, A12) |
| `clientIp`, `requestPath` | `auth/request-info.ts` | `common/request-info.ts` | `common → auth` |
| `SuperAdminGuard` (utilise désormais `canManageAdministration`) | `common/super-admin.guard.ts` | `audit/super-admin.guard.ts` | `common → audit` |
| Décision d'accès aux fichiers | `files/files.service.ts` | registre par type de demande (R8) | `files → requests`, `files → coverage` (A10) |
| `CoverageDeadlinesJob` | `coverage/` | `scheduler/` | `coverage → scheduler` (A15) |
| `JOB_INTERVAL_MS` | `scheduler/auto-close.job.ts` | `scheduler/job-interval.ts` | — (clarté) |

Pourquoi `SuperAdminGuard` va dans `audit/` et pas dans `auth/` : il dépend d'`AuditService` ;
le placer dans `auth/` créerait `audit → auth` (le contrôleur d'audit l'utilise) alors que
`auth → audit` existe déjà.

**Decision — vérification automatique**: test Jest
`backend/test/unit/architecture-layers.spec.ts`, sans nouvelle dépendance : il parcourt
`backend/src/**/*.ts`, extrait les imports relatifs (y compris `import type`), les rapporte au
dossier de premier niveau, et échoue si un dossier de la liste importe un dossier situé après
lui, en nommant le fichier source et la cible. Il tourne avec la suite unitaire, donc dans la CI
(R11).

**Rationale**: [VÉRIFIÉ] ESLint n'a pas de plugin d'import installé ; `madge` ou
`dependency-cruiser` raisonnent par fichier ou demandent une configuration plus lourde qu'un
test de 50 lignes. Un test dans la suite existante respecte le principe I et ne coûte aucune
dépendance.

**Le module `RealtimeGatewayModule` est conservé [VÉRIFIÉ]** : il sépare le registre des
connexions (`RealtimeService`, global, sans dépendance à l'authentification) de la passerelle
(qui authentifie avec `SessionService`). C'est un découpage légitime, pas seulement un
contournement ; seul son commentaire est reformulé. Le scénario 1 de la user story 4 de la spec
est ajusté en conséquence.

**Alternatives considered**: supprimer tous les cycles des 11 dossiers (refonte large, risque
élevé, hors du besoin exprimé) ; `forwardRef` NestJS (masque le cycle sans le supprimer).

## R8 — Accès aux fichiers par registre (FR-014, A10, A11)

**Decision**: `files/` définit une interface `RequestFileAccess` :

```text
canRead(user, file, request): Promise<boolean>
canAttach(user, request): Promise<boolean>
```

et `FilesService` expose `registerAccess(kind: RequestKind, access: RequestFileAccess)`.
`RequestsModule` (kind `WORK`) et `CoverageModule` (kind `COVERAGE`) enregistrent leur
implémentation au démarrage (`onModuleInit`), qui reprend **mot pour mot** la logique actuelle
de `findReadable` et `assertCanAttach`. `FilesService` garde : fichier sans demande → lisible par
son auteur seul ; type non enregistré → refus (fermé par défaut). `FilesModule` n'importe plus ni
`RequestPolicyLoader` ni `CoverageAccessLoader`.

**Rationale**: [VÉRIFIÉ] `FilesModule` déclare aujourd'hui les chargeurs des deux domaines.
L'enregistrement au démarrage évite toute injection circulaire (`files` ne connaît aucun
module métier). Les tests d'intégration de lecture de fichiers (demandes et preuves de
présence) restent inchangés dans leurs attendus (SC-007).

**Alternatives considered**: jeton d'injection multi-fournisseurs (non natif dans NestJS) ;
déplacer le contrôle dans chaque contrôleur métier (dupliquerait le service de téléchargement).

## R9 — Déclaration unique du chargeur de règles et nettoyage (FR-015, A13, A15, A16, A18, A19)

**Decision**:
- `requests/request-policy.module.ts` fournit et exporte `RequestPolicyLoader` ;
  `requests`, `categories`, `messages`, `coverage` l'importent ; `files` n'en a plus besoin (R8).
- Suppression de `NoopNotificationPublisher` et de son commentaire périmé
  (`notifications.service.ts`) [VÉRIFIÉ : aucun usage dans `src` ni `test`].
- Suppression de `@mui/icons-material` de `frontend/package.json` [VÉRIFIÉ : aucun import].
- `backend/scripts/check-users.ts` reformaté par Prettier (l'autre script est supprimé en R6).
- `CoverageDeadlinesJob` déplacé dans `scheduler/` (voir R7).

**Rationale**: corrections mécaniques, couvertes par la suite existante.

## R10 — Statuts et énumérations synchronisés entre serveur et interface (FR-016, A17)

**Decision**: test Vitest `frontend/tests/api/enums-sync.test.ts` qui lit
`backend/prisma/schema.prisma` et `frontend/src/api/types.ts` (et
`frontend/src/features/requests/types.ts` si une énumération y est redéclarée), extrait les
valeurs des énumérations communes (`Role`, `Priority`, `RequestStatus`, `RequestKind`,
`Circuit`, `ClosureMode`, `AssignmentMode`, `Permission` et les autres présentes des deux
côtés) et échoue en listant les valeurs manquantes ou en trop. Le commentaire de `types.ts`
annonçant des types générés est retiré ; le script `api:types` est conservé comme outil
facultatif, sans promesse.

**Rationale**: [VÉRIFIÉ] le backend ne décore pas ses DTO pour OpenAPI (aucun `@ApiProperty`) :
les types générés seraient pauvres sans un chantier d'annotation. La base de données est la
source de vérité des énumérations ; un test de lecture de fichiers suffit, sans dépendance.

**Alternatives considered**: génération OpenAPI complète (chantier lourd, hors besoin) ;
paquet partagé de types (nouveau workspace, principe II).

## R11 — Intégration continue partielle (FR-017, FR-019, A20, A21, D3)

**Decision**: `.github/workflows/ci.yml` (dépôt GitHub `origin` [VÉRIFIÉ]), déclenché sur
`push` et `pull_request`, avec un seul job d'identifiant `verify` et de nom « Contrôles qualité »
(nom stable, nécessaire pour le rendre obligatoire dans la protection de branche) :
1. `ubuntu-latest`, Node 24 (`.nvmrc`), `npm ci`, installation de `ffmpeg` (apt) ;
2. `npm run lint` ; `npm run -w backend typecheck` ; `npm run -w frontend typecheck` ;
3. `npm run -w backend test` ; `npm run -w backend test:integration` ;
   `npm run -w frontend test` ;
4. `npm audit --audit-level=high`.

Les tests de bout en bout (dont le chronométrage `e2e/sc001-create-timing.spec.ts`) restent
manuels, avec compte rendu daté dans `docs/validation/` (modèle : `verification-finale.md`).
[VÉRIFIÉ] Le test de performance de recherche (`search-performance.spec.ts`) est un test
d'intégration : il tourne donc en CI ; s'il est instable sur les machines GitHub, il en sera
exclu et rejoué à la main.

**Points à vérifier au premier passage de la CI [DÉDUIT]** :
- les tests d'intégration démarrent leur propre PostgreSQL via `embedded-postgres`
  (`test/utils/global-setup.ts`) : il faut que `package-lock.json`, produit sous Windows,
  contienne le binaire optionnel Linux (`@embedded-postgres/linux-x64`) ; sinon, régénérer le
  verrou ou utiliser un service `postgres:17` dans la CI ;
- `prisma generate` doit tourner avant les tests (via `postinstall` ou une étape dédiée).

**Protection de branche (constat G3)** : la CI signale les échecs mais ne bloque pas la fusion
par elle-même. Il faut une règle de protection sur `master` (GitHub → Settings → Branches →
Branch protection rules) : « Require a pull request before merging » et « Require status checks
to pass before merging » avec le contrôle « Contrôles qualité », plus « Require branches to be up
to date before merging ». C'est un réglage du dépôt GitHub, fait à la main par son
administrateur ; il ne fait pas partie du code.

**Rationale**: décision D3 ; reprend exactement `npm run verify`, sans les navigateurs.

**Alternatives considered**: tout en CI, y compris Playwright (écarté par D3) ; autre service
de CI (le dépôt est sur GitHub).

## R12 — Sauvegarde garantie avant migration (FR-018, A22, A23)

**Decision**:
- `deploy/deploy.sh` (hôte) : (1) sauvegarde ponctuelle via le service `backup`
  (`docker compose run --rm --entrypoint /bin/bash backup /scripts/backup.sh`), arrêt si elle
  échoue ; (2) `docker compose up -d --build`.
- `deploy/api-entrypoint.sh` : avant `prisma migrate deploy`, exécute `prisma migrate status` ;
  s'il reste des migrations à appliquer, exige une archive `db-*.dump` de moins de
  `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` (défaut 60) dans `/backups`, monté **en lecture seule**
  dans le conteneur `api` ; sinon il s'arrête avec un message explicite sans toucher la base.
  Sans migration en attente, démarrage normal (aucun ralentissement des redémarrages).
- `README.md` et `docs/coverage-migration.md` remplacent l'étape manuelle « faire une sauvegarde »
  par `deploy/deploy.sh`.
- **Testabilité (constat C1 de l'analyse, principe I)** : le dossier des sauvegardes est lu dans
  `PRE_MIGRATION_BACKUP_DIR` (défaut `/backups`) au lieu d'être écrit en dur, et les commandes
  `npx` et `node` sont résolues par le `PATH`. Un test Jest
  `backend/test/unit/api-entrypoint.spec.ts` lance le script avec un shell POSIX, un faux `npx`
  et un faux `node` (scripts placés en tête du `PATH`, qui écrivent leurs arguments dans un
  journal et simulent la sortie de `prisma migrate status`) et un dossier temporaire de
  sauvegardes dont l'ancienneté est réglée par `fs.utimesSync`. Cas : schéma à jour (aucune
  migration, démarrage) ; migration en attente sans archive (code 1, message, ni `migrate
  deploy` ni démarrage) ; migration en attente avec archive trop ancienne (idem) ; migration en
  attente avec archive récente (`migrate deploy` puis démarrage) ; base inaccessible (code 1,
  sortie de Prisma affichée, ni `migrate deploy` ni démarrage). Shell : `sh` sous Linux (CI) ;
  sous Windows, `bash.exe` de Git for Windows, trouvé à partir de `git --exec-path`
  (`…/mingw64/libexec/git-core` → `…/bin/bash.exe`). Si aucun shell POSIX n'est trouvé, le test
  échoue avec un message qui l'explique (pas de saut silencieux). Le test tourne dans la suite
  unitaire, donc dans la CI.

**Rationale**: [VÉRIFIÉ] le conteneur `api` n'a pas `pg_dump` ; le service `backup` l'a et sait
déjà produire et contrôler une archive (`pg_restore --list`). La vérification dans l'entrypoint
couvre aussi un `docker compose up` lancé à la main, sans le script.

**Point à vérifier [DÉDUIT]**: le code de sortie et le texte de `prisma migrate status`
(Prisma 6) quand des migrations sont en attente ; l'entrypoint s'appuiera sur le texte
« Database schema is up to date » si le code de sortie ne suffit pas. Relevé avant le test
(tâche T049), puis vérifié sur la préproduction (quickstart, scénario 6).

**Alternatives considered**: sauvegarde dans l'entrypoint de l'API (ajoute le client
PostgreSQL à l'image, mélange les responsabilités) ; confiance dans la procédure manuelle
(c'est la situation dénoncée par A22).

## R13 — Restauration et en-têtes de sécurité vérifiés (FR-020, FR-021, A24, A25)

**Decision**: pas de code ; deux comptes rendus à produire sur un serveur de préproduction :
`docs/validation/restauration.md` (sauvegarde réelle → `deploy/backup/restore.sh` sur un
serveur vierge, durée, contrôles : connexion, une demande avec vocal et photo, journal d'audit)
et `docs/validation/en-tetes-securite.md` (sortie de `curl -sI` sur `/` et `/api/health` :
`Content-Security-Policy`, `Strict-Transport-Security`, et refus d'un envoi de plus de 26 Mo).

**Rationale**: ces constats [DÉDUIT] ne peuvent être confirmés qu'en conditions réelles.

## R14 — Affectation automatique figée à la soumission (FR-008, FR-009, FR-011, A03, A04, D1, D8, D9)

**Décisions métier appliquées** (toutes validées le 2026-10-15, voir spec « Clarifications ») :
D1 (tout figé), D8 (personne non affectable → refus puis choix du responsable), D9 (demandes
antérieures → catégorie actuelle). Aucune autre règle n'est introduite.

**Decision**:
- `RequestRulesSnapshot` gagne `autoAssigneeId: string | null`, renseigné par
  `RequestPolicyLoader.rulesSnapshot` (`category.assignmentMode === 'AUTO' ?
  category.autoAssigneeId : null`). Champ JSON : **aucune migration**.
- `assigneeContext`, pour `APPROVE`, lit `rules.assignmentMode` et `rules.autoAssigneeId` du
  snapshot. Si le snapshot ne contient pas la clé `autoAssigneeId` (demande soumise avant la
  correction, exception EXC-1, D9), il lit `category.autoAssigneeId`, et seulement dans ce cas.
- Si la personne à affecter est absente ou n'est plus affectable (`canPickRecipient` : compte
  inactif ou retiré des destinataires de la catégorie ; exception EXC-2, D8), une approbation
  sans `assigneeId` reçoit le nouveau code `AUTO_ASSIGNEE_UNAVAILABLE` (422, « La personne
  désignée pour cette catégorie n'est plus disponible. Choisissez l'employé qui réalisera la
  demande. »). Le responsable peut alors approuver en fournissant `assigneeId` ; le serveur ne
  l'accepte en mode automatique que dans ce cas, et refuse un compte non affectable
  (`RECIPIENT_NOT_ALLOWED`).
- L'événement d'historique `ASSIGNED` créé par l'approbation (`RequestEvent`, `toValue`) porte
  `assigneeSource` : `SNAPSHOT`, `CATEGORY_CURRENT` (EXC-1) ou `MANAGER_CHOICE` (mode manuel ou
  EXC-2). `HistoryTimeline` l'affiche après « Affectée à <nom> ».
- Interface : `ApprovalDialog` affiche le sélecteur quand le serveur renvoie
  `AUTO_ASSIGNEE_UNAVAILABLE`.
- Tests d'abord (FR-009) : un test d'intégration qui reproduit le cas « E1 désigné à la
  soumission, E2 désigné ensuite » (rouge aujourd'hui : affecté à E2), le cas « catégorie passée
  en manuelle » (rouge aujourd'hui : `ASSIGNEE_REQUIRED`, voir N1), les cas « E1 désactivé » et
  « E1 retiré des destinataires » (EXC-2), et le cas « demande ancienne sans `autoAssigneeId` »
  (EXC-1).

**Rationale**: décision D1. Le snapshot existe déjà pour cette raison (FR-022 du lot 1) ; il
suffit d'y ajouter la personne. Le repli explicite évite qu'une demande reste bloquée sans
affecter de compte inactif (FR-011).

**Alternatives considered**: reprise des snapshots existants par migration de données (fige
après coup une valeur qui n'était peut-être pas celle de la soumission, donc inexacte) ;
refus sans repli (demande bloquée jusqu'à intervention de l'administrateur).
