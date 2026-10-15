# Implementation Plan: Corrections issues de l'audit technique

**Branch**: `003-corrections-audit-technique` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-corrections-audit-technique/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Corriger les constats « correction technique » de `docs/ARCHITECTURE.md` sans changer le
comportement visible, sauf la règle d'affectation tranchée en D1 :

- **Environnement** : aligner le développement sur le port 3002 (la production garde 3000,
  explicite), lancer l'API en mode rechargement, valider toute la configuration au démarrage.
- **Sécurité et traçabilité** : une seule liste de clés masquées, un seul contrôle d'origine,
  la réinitialisation du super administrateur intégrée à l'outil d'initialisation avec audit et
  fermeture des sessions.
- **Affectation (D1, D8, D9)** : mode **et** personne figés dans le snapshot à la soumission ;
  deux exceptions validées et tracées dans l'historique : demande antérieure → catégorie
  actuelle (EXC-1, D9) ; personne figée non affectable → refus puis choix du responsable
  (EXC-2, D8). Cela corrige aussi un blocage réel de l'approbation (constat N1).
- **Dépendances** : ordre de couches `config → common → audit → auth → files → requests →
  coverage → scheduler` vérifié par un test ; accès aux fichiers par registre ; chargeur de
  règles déclaré une fois ; code mort retiré ; énumérations serveur/interface comparées par un
  test.
- **Production** : CI GitHub pour lint, types, tests unitaires, d'intégration et d'interface,
  audit des dépendances (D3) ; sauvegarde imposée avant migration ; restauration et en-têtes
  vérifiés sur préproduction.

Aucune migration de schéma, aucune nouvelle dépendance d'exécution. Détails : [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js 24 — inchangé

**Primary Dependencies**: NestJS 11, Prisma 6, React 19, Vite, TanStack Query 5, MUI — inchangés.
Retrait : `@mui/icons-material` (inutilisée). Ajout : aucun paquet ; GitHub Actions (service
externe, pas une dépendance du code)

**Storage**: PostgreSQL 17 — **aucune migration** ; une clé ajoutée dans le JSON
`Request.rulesSnapshot` ([data-model.md](./data-model.md))

**Testing**: Jest (unitaires, intégration sur PostgreSQL embarqué), Vitest + RTL, Playwright.
Nouveaux tests : `architecture-layers.spec.ts` (Jest), `enums-sync.test.ts` (Vitest), tests
d'intégration d'affectation et de réinitialisation, cas `TRUST_PROXY` dans `config.spec.ts`

**Target Platform**: poste de développement Windows 11 ; production VPS Linux, Docker Compose,
Caddy ; CI `ubuntu-latest`

**Project Type**: application web (API `backend/` + SPA `frontend/`, workspaces npm)

**Performance Goals**: inchangés (lot 1). Les corrections n'ajoutent aucun accès base sur les
chemins chauds ; l'entrypoint n'ajoute `prisma migrate status` qu'au démarrage

**Constraints**: FR-023 — aucun changement de comportement visible hors D1 ; tests existants
inchangés dans leurs attendus (SC-007) ; une seule instance d'API (inchangé, A28)

**Scale/Scope**: 23 exigences (FR-001 à FR-024, sans FR-022), environ 35 fichiers touchés (backend surtout), 3 fichiers de
déploiement, 1 workflow CI, 3 comptes rendus de validation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Vérification | Statut |
|----------|--------------|--------|
| I. TDD (non négociable) | Chaque correction commence par un test rouge : `config.spec.ts` (port 3002, `TRUST_PROXY`), test d'intégration d'affectation (rouge sur le comportement actuel, FR-009), test de réinitialisation CLI, test de masquage commun, test de couches (rouge tant que les cycles existent), test de synchronisation des énumérations, test automatisé de `api-entrypoint.sh` (5 cas, écrit avant la modification du script), test de cohérence des ports et du script `dev:backend`. Le comportement existant de l'interface quand l'API est arrêtée est figé par un test (aucune modification, FR-023). Les refactorisations sans effet visible (R7, R8, R9) sont protégées par la suite existante, inchangée dans ses attendus. La CI, rendue obligatoire par une règle de protection de `master` (réglage GitHub manuel, T006), empêche de fusionner une suite rouge. | ✅ |
| II. Simplicité / YAGNI | Aucune nouvelle dépendance (vérification des couches et des énumérations par des tests maison de quelques dizaines de lignes) ; une dépendance retirée ; périmètre des cycles limité aux dossiers cités par l'audit (les autres sont consignés, pas corrigés) ; pas de fusion des machines à états (hors périmètre). Le seul nouveau mécanisme, le registre d'accès aux fichiers, remplace une dépendance directe à deux domaines : voir Complexity Tracking. | ✅ (1 justification) |
| III. Accessibilité et UX | Deux changements d'interface : la boîte d'approbation affiche le sélecteur d'employé après `AUTO_ASSIGNEE_UNAVAILABLE`, avec le message du serveur (composant existant, déjà accessible et testé par axe ; test RTL ajouté) ; l'historique ajoute la source de l'affectation après « Affectée à <nom> » (texte seul, autorisé par FR-023 ; test dans `HistoryTimeline.test.tsx`). | ✅ |
| IV. Sécurité et données | Masquage unifié et élargi (FR-005) ; configuration du proxy validée (FR-004) ; contrôle d'origine unique (FR-006) ; aucun secret ajouté ; mot de passe provisoire jamais journalisé ; `npm audit` bloquant en CI. Durées de conservation toujours provisoires (D4, hors périmètre) : réserve héritée du lot 1. | ⚠️ réserve héritée (D4) |
| V. Workflows et communications | Réinitialisation hors interface désormais tracée (`PASSWORD_RESET`, sessions supprimées) ; source de l'affectation tracée dans l'historique (`assigneeSource`) ; statuts et transitions inchangés ; refus d'accès aux fichiers toujours journalisés et en 404 (registre fermé par défaut). | ✅ |

**Résultat avant Phase 0** : passe. **Résultat après Phase 1** (re-vérifié sur
[data-model.md](./data-model.md) et [contracts/](./contracts/)) : passe ; aucune migration,
aucun nouveau statut, contrat REST modifié sur un seul point (approbation) ; la réserve D4
reste celle du lot 1.

## Correspondance exigences → décisions

| Exigences | Décision | Constats |
|---|---|---|
| FR-001, FR-002 | R1 | A01 |
| FR-003 | R2 | A02 |
| FR-004 | R3 | A07 |
| FR-005 | R4 | A06 |
| FR-006 | R5 | A08 |
| FR-007, FR-010 | R6 | A05 |
| FR-008, FR-009, FR-011 | R14 | A03, A04, N1 |
| FR-012, FR-013 | R7 | A09, A12, N2 |
| FR-014 | R8 | A10, A11 |
| FR-015 | R9 | A13, A15, A16, A18, A19 |
| FR-016 | R10 | A17 |
| FR-017, FR-019 | R11 | A20, A21, A26 |
| FR-018 | R12 | A22, A23 |
| FR-020, FR-021 | R13 | A24, A25 |
| FR-023 | toutes (non-régression) | — |
| FR-024 | clôture ([quickstart.md](./quickstart.md)) | A01–A35, N1, N2 |

## Ordre de réalisation recommandé

1. **US1** (port, `dev:backend`, configuration) : remet la suite au vert ; prérequis de tout le
   reste (principe I).
2. **CI (R11)** dès que la suite est verte, pour protéger les étapes suivantes ; puis rendre le
   contrôle obligatoire sur `master` (réglage GitHub manuel).
3. **US2** (masquage, origine, réinitialisation CLI).
4. **US3** (affectation figée) : test rouge d'abord.
5. **US4** (couches, registre de fichiers, nettoyage, énumérations) : en dernier côté code, car
   ce sont des déplacements larges ; un commit par déplacement pour faciliter la relecture.
6. **US5** (sauvegarde avant migration, restauration, en-têtes) puis clôture FR-024.

## Project Structure

### Documentation (this feature)

```text
specs/003-corrections-audit-technique/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 : R1–R14, constats N1–N2
├── data-model.md        # Phase 1 : snapshot, historique, audit, configuration
├── quickstart.md        # Phase 1 : scénarios de validation
├── contracts/
│   ├── rest-api.md          # APPROVE et AUTO_ASSIGNEE_UNAVAILABLE
│   ├── configuration.md     # variables d'environnement et ports
│   └── cli-and-deploy.md    # bootstrap --reset-password, deploy.sh, entrypoint, CI
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

Fichiers touchés (N = nouveau, M = modifié, D = déplacé, S = supprimé) :

```text
.github/workflows/ci.yml                              N  CI (R11)
package.json                                          M  dev:backend → start:dev (R2)
README.md                                             M  port 3002, --reset-password, deploy.sh
backend/
├── .env.example                                      M  PORT=3002
├── scripts/
│   ├── reset-superadmin-password.ts                  S  (R6)
│   └── check-users.ts                                M  formatage
├── src/
│   ├── main.ts                                       M  port lu dans APP_CONFIG
│   ├── app.setup.ts                                  M  trustProxy, isProduction depuis APP_CONFIG
│   ├── config/config.ts                              M  trustProxy validé
│   ├── cli/bootstrap.ts                              M  --reset-password, resetSuperAdminPassword()
│   ├── common/
│   │   ├── authorization.ts                          N  PolicyUser, permissionsFor, canManageAdministration, canReadAudit
│   │   ├── request-info.ts                           D  depuis auth/
│   │   ├── origin.ts                                 N  originOf + isAllowedOrigin
│   │   ├── sensitive-keys.ts                         N  SENSITIVE_KEY unique
│   │   ├── app-logger.ts                             M
│   │   ├── errors.ts                                 M  AUTO_ASSIGNEE_UNAVAILABLE
│   │   └── super-admin.guard.ts                      D  → audit/
│   ├── audit/
│   │   ├── super-admin.guard.ts                      D  depuis common/
│   │   └── audit.service.ts                          M  SENSITIVE_KEY commun
│   ├── auth/ (origin.guard, session.service, auth.types)  M  imports depuis common/
│   ├── realtime/realtime.gateway.ts                  M  isAllowedOrigin ; commentaire du module reformulé
│   ├── files/ (files.service, files.module, file-access.ts N)  M  registre RequestFileAccess (R8)
│   ├── requests/
│   │   ├── request-policy.module.ts                  N  fournit et exporte RequestPolicyLoader
│   │   ├── request-policy.loader.ts                  M  autoAssigneeId dans le snapshot
│   │   ├── request-transitions.service.ts            M  assigneeContext lit le snapshot (R14)
│   │   ├── work-file-access.ts                       N  implémentation WORK du registre
│   │   └── domain/access-policy.ts                   M  règles transverses retirées
│   ├── coverage/ (coverage.module, coverage-file-access.ts N)  M  implémentation COVERAGE ; job déplacé
│   ├── categories/, messages/ (*.module.ts)          M  importent RequestPolicyModule
│   ├── notifications/notifications.service.ts        M  NoopNotificationPublisher retiré
│   └── scheduler/
│       ├── job-interval.ts                           N  JOB_INTERVAL_MS
│       ├── coverage-deadlines.job.ts                 D  depuis coverage/
│       └── scheduler.module.ts                       M
└── test/
    ├── unit/config.spec.ts                           M  3002, TRUST_PROXY
    ├── unit/dev-port-consistency.spec.ts             N  ports et dev:backend (US1)
    ├── unit/api-entrypoint.spec.ts                   N  5 cas de l'entrypoint (R12)
    ├── unit/architecture-layers.spec.ts              N  (R7)
    ├── unit/sensitive-keys.spec.ts                   N  (R4)
    ├── integration/auto-assignment-snapshot.spec.ts  N  (R14, écrit en premier)
    └── integration/cli-reset-password.spec.ts        N  (R6)
frontend/
├── package.json                                      M  @mui/icons-material retiré
├── src/api/types.ts                                  M  commentaire « types générés » retiré
├── src/features/requests/ApprovalDialog.tsx          M  sélecteur sur AUTO_ASSIGNEE_UNAVAILABLE
├── src/features/requests/HistoryTimeline.tsx         M  source de l'affectation (assigneeSource, US3)
├── tests/api/client.test.ts                         M  API arrêtée : tests existants renforcés, messages exacts (US1)
├── tests/requests/HistoryTimeline.test.tsx           M  source de l'affectation (US3)
└── tests/api/enums-sync.test.ts                      N  (R10)
deploy/
├── Caddyfile.dev                                     M  3002
├── deploy.sh                                         N  sauvegarde puis up (R12)
├── api-entrypoint.sh                                 M  contrôle de sauvegarde avant migration (PRE_MIGRATION_BACKUP_DIR)
└── docker-compose.yml                                M  /backups:ro dans api
docs/
├── ARCHITECTURE.md                                   M  clôture FR-024
├── coverage-migration.md                             M  deploy.sh
└── validation/ (restauration.md, en-tetes-securite.md, verification-003.md)  N
```

**Structure Decision**: structure existante conservée (workspaces `backend/` et `frontend/`,
`deploy/`, `docs/`). Seuls changent l'emplacement de quelques fichiers pour respecter l'ordre de
couches de R7, et l'ajout de `.github/workflows/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Registre d'accès aux fichiers par type de demande (`registerAccess`), au lieu d'appels directs | FR-014 : le stockage de fichiers ne doit plus connaître la politique d'accès de chaque domaine ; supprime les cycles `files ↔ requests` et `files → coverage` | Appels directs actuels : ce sont eux qui créent les cycles (A09, A10). `forwardRef` NestJS : garde le cycle et le cache. Contrôle dans chaque contrôleur métier : duplique le téléchargement et le streaming de fichiers. |
