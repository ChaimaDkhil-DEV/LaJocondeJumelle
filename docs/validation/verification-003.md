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
