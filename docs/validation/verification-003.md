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
