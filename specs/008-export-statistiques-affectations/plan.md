# Implementation Plan: Export des statistiques des affectations

**Branch**: `008-export-statistiques-affectations` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-export-statistiques-affectations/spec.md`

## Summary

Bouton « Exporter en CSV » sur `/gardes/statistiques`, affiché quand les statistiques des filtres
affichés sont calculées. Nouvelle route `GET /api/coverage/stats/export.csv` : réutilise
`CoverageStatsService.stats` (accès, période, calcul), met le résultat en forme avec les règles
d'affichage de la page et `toCsv`, puis journalise l'export (`COVERAGE_STATS_EXPORTED`, nouvelle
valeur d'énumération, migration `0010`). Détails : [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6 (backend) ; React 19, MUI 7, TanStack Query
(frontend) — pile existante, aucune dépendance ajoutée

**Storage**: PostgreSQL 17 — une valeur ajoutée à l'énumération `AuditAction` (migration
`0010_audit_coverage_stats_export`, avec `down.sql`) ; aucune table ni colonne

**Testing**: Jest (unitaires ; intégration avec PostgreSQL embarqué), Vitest + Testing Library,
Playwright + axe

**Target Platform**: navigateurs récents (desktop et mobiles), serveur Linux (Docker)

**Project Type**: application web (monorepo `backend/` + `frontend/`)

**Performance Goals**: même coût que l'affichage des statistiques (un calcul à la demande, 400 jours
au plus) plus une écriture d'audit

**Constraints**: valeurs identiques à la page (FR-003) ; WCAG 2.2 AA, 320 px ; accès admin et super
administrateur, vérifié côté serveur ; aucune donnée statistique ni nom dans l'audit

**Scale/Scope**: 1 route, 1 fonction de mise en forme, 1 valeur d'audit, 1 bouton, 1 libellé

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Avant conception | Après conception |
|----------|------------------|------------------|
| **I. Tests d'abord** | Chaque scénario a son test rouge avant le code (R7). | ✅ Unitaires (mise en forme), intégration (fichier = JSON, accès, période, audit), interface (bouton, libellé), e2e (téléchargement, 320 px). |
| **II. Simplicité / YAGNI** | Calcul existant réutilisé ; format CSV existant (`toCsv`). | ✅ Une route, une fonction pure ; pas de génération dans le navigateur ni de second format (R1) ; lien simple sans gestion d'erreur propre (R6). |
| **III. Accessibilité et UX** | Bouton explicite, clavier, 320 px ; pas d'export d'anciens filtres. | ✅ Même composant que l'export du suivi des gardes ; V18 étendu à l'écran avec le bouton. |
| **IV. Sécurité et données** | Accès vérifié côté serveur (contrôle existant de `stats`) ; paramètres validés (`CoverageStatsQuery`) ; formules neutralisées. | ✅ Aucune colonne de plus que la page ; nom de fichier issu de valeurs validées ; `Cache-Control: private, no-store`. |
| **V. Intégrité et audit** | Refus journalisé (existant) ; export réussi journalisé (clarification A). | ✅ `COVERAGE_STATS_EXPORTED`, détails limités à la période et au regroupement ; `down.sql` refuse de retirer une valeur déjà utilisée. |

Aucune violation : « Complexity Tracking » sans objet.

## Project Structure

### Documentation (this feature)

```text
specs/008-export-statistiques-affectations/
├── plan.md
├── research.md          # R1 à R7
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md      # GET /api/coverage/stats/export.csv
│   └── ui.md            # bouton « Exporter en CSV », libellé du journal
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/schema.prisma                                  # AuditAction : COVERAGE_STATS_EXPORTED
├── prisma/migrations/0010_audit_coverage_stats_export/   # migration.sql + down.sql (nouveau)
├── src/audit/audit.service.ts                            # ALLOWED_DETAIL_KEYS : from, to, groupBy, period
├── src/coverage/domain/coverage-stats-csv.ts             # statsToCsvRows, nom du fichier (nouveau)
├── src/coverage/coverage-stats.service.ts                # exportCsv : stats → CSV → audit
├── src/coverage/coverage.controller.ts                   # GET stats/export.csv
├── test/unit/coverage-stats-csv.spec.ts                  # nouveau
└── test/integration/supervision-stats-export.spec.ts     # nouveau

frontend/
├── src/features/coverage/CoverageStatsPage.tsx    # bouton « Exporter en CSV »
├── src/features/admin/labels.ts                   # libellé COVERAGE_STATS_EXPORTED
├── tests/coverage/stats.test.tsx                  # bouton : présence, adresse, états
└── tests/admin/role-labels.test.tsx               # libellé de l'action

e2e/
├── coverage-stats-export.spec.ts                  # téléchargement et journal (nouveau)
└── a11y-responsive.spec.ts                        # statistiques à 320 px avec le bouton

docs/superadmin-fonctionnalites.md                 # §2.2 et §4.3 : export livré
```

**Structure Decision**: monorepo existant ; module `coverage` (serveur et interface), journal
d'audit existant.

## Complexity Tracking

Sans objet : aucune violation de la constitution.
