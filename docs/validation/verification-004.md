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
