---

description: "Task list for feature 008 — export des statistiques des affectations"
---

# Tasks: Export des statistiques des affectations

**Input**: Design documents from `/specs/008-export-statistiques-affectations/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBLIGATOIRES — constitution, principe I (TDD non négociable). Chaque tâche de test
placée avant une implémentation DOIT être écrite et constatée **rouge** avant de coder. Tout
attendu existant modifié est consigné dans `docs/validation/verification-008.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallélisable (fichiers différents, aucune dépendance sur une tâche non terminée)
- **[Story]**: US1 (exporter les statistiques affichées, P1), US2 (accès réservé, état de la page et journal, P1)

---

## Phase 1: Setup

- [ ] T001 Sur `008-export-statistiques-affectations`, constater l'état de départ (référence à la vérification finale de la 007 et à la CI verte de `master` sur `85ce9c5` si aucun fichier de code n'a changé depuis, hors `.github/workflows/ci.yml`) dans un nouveau `docs/validation/verification-008.md`, section « État initial »

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: action d'audit `COVERAGE_STATS_EXPORTED` (énumération, migration, détails autorisés, libellé)

**⚠️ CRITICAL**: aucune story ne commence avant la fin de cette phase

- [ ] T002 Dans `backend/prisma/schema.prisma`, ajouter `COVERAGE_STATS_EXPORTED` à `enum AuditAction` (après `COVERAGE_MERGE_DECIDED`, sous un commentaire « // Statistiques des affectations (008) ») ; créer la migration **sur la base de développement uniquement**, selon `CLAUDE.md`, dans `backend/prisma/migrations/0010_audit_coverage_stats_export/migration.sql` (écrite en une fois : en-tête de commentaire sur le modèle de `0007_audit_request_actions/migration.sql`, puis `ALTER TYPE "AuditAction" ADD VALUE 'COVERAGE_STATS_EXPORTED';`) ; refuser toute proposition de « reset » ; `npm exec -w backend -- prisma migrate status` → « Database schema is up to date! » ; client Prisma régénéré
- [ ] T003 Nouveau `backend/prisma/migrations/0010_audit_coverage_stats_export/down.sql` sur le modèle de `0008_supervision_schema/down.sql` : transaction ; arrêt (`RAISE EXCEPTION`, message en français renvoyant à la restauration de la sauvegarde) si une ligne de `"AuditLog"` a `action = 'COVERAGE_STATS_EXPORTED'` ; sinon renommer `"AuditAction"` en `"AuditAction_old"`, recréer `"AuditAction"` avec toutes les valeurs de `schema.prisma` sauf `COVERAGE_STATS_EXPORTED`, convertir `"AuditLog"."action"`, supprimer l'ancien type, retirer la ligne `0010_audit_coverage_stats_export` de `"_prisma_migrations"` ; usage en commentaire (`npx prisma db execute --file … --schema prisma/schema.prisma`). Ne pas l'exécuter
- [ ] T004 [P] Dans `frontend/tests/admin/role-labels.test.tsx` (rouge), l'action `COVERAGE_STATS_EXPORTED` a le libellé « Export des statistiques des affectations » ; puis dans `frontend/src/features/admin/labels.ts`, ajouter `COVERAGE_STATS_EXPORTED` à `AUDIT_ACTION_LABELS` ; test au vert
- [ ] T005 [P] Dans `backend/src/audit/audit.service.ts`, ajouter `from`, `to`, `groupBy`, `period` à `ALLOWED_DETAIL_KEYS`, sous un commentaire « Statistiques des affectations (008) : période et regroupement exportés, jamais de valeur ni de nom » ; vérifier par un cas dans `backend/test/unit/audit-sanitize.spec.ts` (rouge puis vert : `{ from, to, groupBy, period }` conservés)

**Checkpoint**: l'action d'audit existe en base, côté serveur et dans le journal ; `npm run -w backend typecheck` sans erreur

---

## Phase 3: User Story 1 - Exporter les statistiques affichées (Priority: P1) 🎯 MVP

**Goal**: « Exporter (CSV) » télécharge un fichier identique à la page pour la période et le regroupement affichés

**Independent Test**: avec des affectations connues, exporter par enseignant, par classe, par semaine et par mois ; chaque valeur du fichier égale la page (SC-002)

### Tests for User Story 1 ⚠️

- [ ] T006 [P] [US1] Nouveau `backend/test/unit/coverage-stats-csv.spec.ts` (rouge), pour `statsToCsvRows(stats)` et `statsCsvFilename(stats)` de `backend/src/coverage/domain/coverage-stats-csv.ts` (research R2 à R4, data-model « Fichier d'export ») :
  - en-tête : libellé du regroupement (« Enseignant », « Classe », « Période ») puis « Événements », « Retards », « Absences », « Classes vides », « Non pourvues », « Annulées », « Durée moyenne » ;
  - une ligne par élément de `rows` dans l'ordre reçu, libellé repris tel quel (« Enseignant anonymisé », « Enseignant non précisé », « Semaine du 06/10/2026 », « octobre 2026 ») ;
  - ligne « Total de la période » depuis `totals` ;
  - ligne vide, puis « Du », « Au », « Fuseau », « Regroupement » (« Enseignant », « Classe », « Période »), « Période » (« Semaine » ou « Mois », seulement si `groupBy = period`), « Taux de non pourvue », « Doublons non tranchés (comptés une fois) » ;
  - durée moyenne : `null` → cellule vide ; 45 → « 45 min » ; 60 → « 1 h » ; 65 → « 1 h 05 » ; 125 → « 2 h 05 » (mêmes cas que `formatDuration` de `frontend/src/features/coverage/labels.tsx`) ;
  - taux : 0,166 → « 17 % » ; 0 → « 0 % » (comme `percent` de `CoverageStatsPage.tsx`) ;
  - période vide (`rows = []`) : en-tête, ligne de total à zéro, bloc de contexte ;
  - nom : `statistiques-affectations-enseignant-2026-10-01-au-2026-10-23.csv`, puis `classe`, `semaine`, `mois`
- [ ] T007 [P] [US1] Nouveau `backend/test/integration/supervision-stats-export.spec.ts` (rouge), sur le modèle des données et des aides de `backend/test/integration/supervision-stats.spec.ts` (contrat `contracts/rest-api.md`) :
  - `admin`, septembre, `groupBy=teacher` : `200`, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition` avec `statistiques-affectations-enseignant-2026-09-01-au-2026-09-30.csv`, `Cache-Control: private, no-store`, corps commençant par le BOM ;
  - pour `teacher`, `class`, `period&period=week`, `period&period=month` : chaque ligne et la ligne de total égales à `GET /api/coverage/stats` avec les mêmes paramètres (SC-002) ;
  - un enseignant nommé « =SOMME(A1) » sort en `'=SOMME(A1)` ; un enseignant anonymisé sort en « Enseignant anonymisé » ;
  - `superadmin` obtient aussi le fichier
- [ ] T008 [P] [US1] Dans `frontend/tests/coverage/stats.test.tsx` (rouge) : après le calcul, lien « Exporter (CSV) » (rôle `link`) avec l'attribut `download` et l'adresse `/api/coverage/stats/export.csv?` suivie des mêmes paramètres que la requête des statistiques (`from`, `to`, `groupBy`, et `period` seulement pour « Période ») ; l'adresse suit un changement de regroupement ; période vide (`rows: []`) : lien présent

### Implementation for User Story 1

- [ ] T009 [US1] Nouveau `backend/src/coverage/domain/coverage-stats-csv.ts` : `statsToCsvRows` et `statsCsvFilename` (fonctions pures, commentaire d'en-tête renvoyant à la spec 008 FR-002 à FR-005 et à `formatDuration` côté interface) ; T006 au vert
- [ ] T010 [US1] Dans `backend/src/coverage/coverage-stats.service.ts`, `exportCsv(user, query, ctx)` : `const stats = await this.stats(user, query, ctx)` (accès, période et calcul inchangés), puis `{ filename: statsCsvFilename(stats), body: toCsv(header, rows) }` ; dans `backend/src/coverage/coverage.controller.ts`, `@Get('stats/export.csv')` avec `@Header('Content-Type', 'text/csv; charset=utf-8')`, `@Header('Cache-Control', 'private, no-store')` et `Content-Disposition: attachment; filename="…"` posé via `@Res({ passthrough: true })` ; mettre à jour les commentaires « aucun export » du service et du contrôleur ; T007 au vert
- [ ] T011 [US1] Dans `frontend/src/features/coverage/CoverageStatsPage.tsx`, bouton-lien « Exporter (CSV) » (`Button component="a" href=… download`, icône `Download` de `lucide-react` en `aria-hidden`, comme `CoverageDashboardPage.tsx:146`), au-dessus des totaux, adresse construite à partir du même `params` que la requête ; mettre à jour le commentaire « aucun export dans ce lot » (contrat `contracts/ui.md`) ; T008 au vert
- [ ] T012 [P] [US1] Nouveau `e2e/coverage-stats-export.spec.ts` (Chromium seulement, comme `e2e/drafts.spec.ts`) : `admin` ouvre `/gardes/statistiques`, clique sur « Exporter (CSV) » ; `page.waitForEvent('download')` : nom `statistiques-affectations-enseignant-<1er du mois>-au-<aujourd'hui>.csv` (fuseau de l'école) ; contenu : première ligne commençant par « Enseignant;Événements;Retards » et ligne « Total de la période » présente

**Checkpoint**: l'export fonctionne pour les trois regroupements (US1 seule livrable ; accès et période déjà protégés par le contrôle existant de `stats`)

---

## Phase 4: User Story 2 - Accès réservé, état de la page et journal (Priority: P1)

**Goal**: export refusé hors admin et super administrateur ou pour une période invalide ; bouton seulement sur des statistiques à jour ; chaque export réussi tracé

**Independent Test**: demander l'export en `surveillant`, en `enseignante`, avec une période inversée ; vérifier le journal après un export réussi

### Tests for User Story 2 ⚠️

- [ ] T013 [P] [US2] Dans `backend/test/integration/supervision-stats-export.spec.ts` (rouge pour l'audit) :
  - `surveillant` et `enseignante` : `404` `NOT_FOUND`, une entrée `ACCESS_DENIED` de plus (motif `NOT_COVERAGE_ADMIN`, route `/api/coverage/stats/export.csv`), aucune entrée `COVERAGE_STATS_EXPORTED` ;
  - sans session : `401` ;
  - `admin`, `from=2026-09-30&to=2026-09-01` : `400` `INVALID_RANGE` (même code que `GET /api/coverage/stats`), aucune entrée `COVERAGE_STATS_EXPORTED` ; `groupBy=enseignant` : `400` ;
  - export réussi `groupBy=period&period=month` : exactement une entrée `COVERAGE_STATS_EXPORTED` avec `actorId` de l'admin, `targetType: 'Request'`, `targetId: 'coverage-stats'`, `details` égal à `{ from, to, groupBy: 'period', period: 'month' }` ; pour `groupBy=teacher`, `details` sans `period` ; aucun nom d'enseignant ni valeur statistique dans `details`
- [ ] T014 [P] [US2] Dans `frontend/tests/coverage/stats.test.tsx` (rouge) : lien « Exporter (CSV) » absent tant qu'une date est incomplète (champ « Au » vidé) ; absent pendant un recalcul après changement de filtre (anciennes valeurs encore affichées, requête en attente) ; absent après une erreur `INVALID_RANGE` ; présent de nouveau quand le calcul des nouveaux filtres a réussi

### Implementation for User Story 2

- [ ] T015 [US2] Dans `CoverageStatsService.exportCsv` (`backend/src/coverage/coverage-stats.service.ts`), après la production du fichier : `this.audit.log('COVERAGE_STATS_EXPORTED', { actorId: user.id, targetType: 'Request', targetId: 'coverage-stats', ip: ctx.ip, details: { from, to, groupBy, ...(groupBy === 'period' ? { period } : {}) } })` avec les valeurs effectives (défauts appliqués) renvoyées par `stats` ; T013 au vert
- [ ] T016 [US2] Dans `CoverageStatsPage.tsx`, n'afficher le lien que si `complete && stats.data && !stats.isPlaceholderData && !stats.error` (research R6) ; T014 au vert, T008 toujours vert
- [ ] T017 [US2] Dans `e2e/coverage-stats-export.spec.ts`, après l'export : `superadmin` ouvre Administrateur › Journal d'audit, filtre « Export des statistiques des affectations » ; une entrée de l'admin avec la période et le regroupement

**Checkpoint**: US1 et US2 complètes (export, refus, états, journal)

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Dans `backend/test/integration/supervision-stats.spec.ts`, retirer « aucun export » du titre du test « période par défaut ; paramètres invalides refusés ; aucun export » **sans changer ses attendus** (`format=csv` → `400`, `/api/coverage/stats/export` → `404`, toujours vrais) ; consigner ce changement de titre dans `docs/validation/verification-008.md`
- [ ] T019 [P] Dans `e2e/a11y-responsive.spec.ts`, test V18 (`mobile-320`) de l'écran statistiques : lien « Exporter (CSV) » visible, sans défilement horizontal, atteint au clavier, audit axe sans violation (FR-010, SC-005)
- [ ] T020 [P] Mettre à jour `docs/superadmin-fonctionnalites.md` : §2.2 (statistiques détaillées : « export CSV » au lieu de « sans export », route `GET /api/coverage/stats/export.csv`, journalisé) ; §4.3 retirer « Statistiques des affectations (`/gardes/statistiques`) : sans export » ; §2.7 (journal d'audit) : nouvelle action si les actions y sont listées
- [ ] T021 Dérouler les scénarios 1 à 7 de `specs/008-export-statistiques-affectations/quickstart.md` (couverture automatique et reste à faire à la main) et consigner dans `docs/validation/verification-008.md`
- [ ] T022 Vérification finale : `npm run verify`, typecheck backend et frontend, `npm run test:e2e` (tous les profils) avec sorties conservées ; consigner les compteurs dans `docs/validation/verification-008.md` ; CI verte sur le dernier commit ; demande de fusion selon `docs/procedure-fusion.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → **US1 (Phase 3)** → **US2 (Phase 4)** → **Polish (Phase 5)**
- Phase 2 bloque les stories : `COVERAGE_STATS_EXPORTED` doit exister (client Prisma, typecheck) avant `exportCsv`.

### User Story Dependencies

- **US1** : après la phase 2.
- **US2** : étend `exportCsv` (T015 après T010) et le bouton d'US1 (T016 après T011) ; partage `supervision-stats-export.spec.ts`, `stats.test.tsx` et `coverage-stats-export.spec.ts` : faire US1 d'abord.

### Within Each User Story

- Tests rouges avant l'implémentation (T006–T008 avant T009–T011 ; T013–T014 avant T015–T016).
- T013 : les cas de refus et de période invalide passent dès T010 (contrôle existant de `stats`) ; seuls les cas d'audit d'export sont rouges jusqu'à T015.

### Parallel Opportunities

- Phase 2 : T004 et T005 en parallèle de T002–T003.
- US1 : T006, T007, T008 en parallèle ; T012 en parallèle de T011.
- US2 : T013 et T014 en parallèle.
- Polish : T018, T019, T020 en parallèle.

---

## Parallel Example: User Story 1

```text
T006 backend/test/unit/coverage-stats-csv.spec.ts
T007 backend/test/integration/supervision-stats-export.spec.ts
T008 frontend/tests/coverage/stats.test.tsx
```

---

## Implementation Strategy

### MVP First

1. Phases 1 et 2 (T001–T005)
2. US1 (T006–T012) : export fonctionnel, déjà réservé à l'admin et au super administrateur
3. US2 (T013–T017) : journal et états du bouton — exigés par la clarification A, à livrer avec US1
4. **Arrêt et validation** : scénarios 1 à 6 du quickstart

### Incremental Delivery

1. Socle → action d'audit en base et dans le journal
2. US1 → export identique à la page
3. US2 → refus vérifiés, bouton seulement sur des données à jour, export tracé
4. Polish → titre du test existant, 320 px, documentation, vérification finale
