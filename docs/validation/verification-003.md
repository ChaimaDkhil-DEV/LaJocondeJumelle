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
