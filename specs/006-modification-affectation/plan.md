# Implementation Plan: Modification d'une affectation par l'admin (classe, créneau)

**Branch**: `006-modification-affectation` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-modification-affectation/spec.md`

## Summary

Les admins et le super administrateur peuvent modifier la classe et le créneau d'une affectation
existante par une nouvelle route `PATCH /api/coverage/:id`, autorisée par une règle `UPDATE` admin
de la machine à états. Les champs modifiables dépendent du statut (classe et créneau avant
présence, fin seulement pendant la présence). Le serveur revérifie la disponibilité du surveillant
(conflit nommé, refus), recalcule échéances et rappels, ajoute un événement `UPDATED` détaillé,
journalise `COVERAGE_MANAGED` et notifie `COVERAGE_UPDATED`. Le détail de l'affectation gagne un
bouton « Modifier » et un dialogue. Aucune migration. Détails : [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (backend et frontend), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6, class-validator (backend) ; React 19, React Router 7,
MUI 7, TanStack Query (frontend) — pile existante, aucune dépendance ajoutée

**Storage**: PostgreSQL 17 — aucune modification de schéma ni migration (`CoverageDetail.classId`,
`floorId`, `startAt`, `plannedEndAt` existent ; types `UPDATED` et `COVERAGE_UPDATED` existent)

**Testing**: Jest (unitaires, intégration avec PostgreSQL embarqué), Vitest + Testing Library,
Playwright + axe

**Target Platform**: navigateurs récents (desktop et mobiles), serveur Linux (Docker)

**Project Type**: application web (monorepo `backend/` + `frontend/`)

**Performance Goals**: mise à jour visible du surveillant en moins de 5 s (temps réel existant,
SC-002) ; une requête par modification

**Constraints**: WCAG 2.2 AA, 320 px ; aucun forçage de disponibilité ; motif jamais journalisé ni
historisé ; fuseau de l'école ; contrôle d'accès serveur

**Scale/Scope**: 1 route, 1 règle de machine à états, 1 fonction de domaine, 1 dialogue ; un
établissement (quelques dizaines d'affectations par jour)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Avant conception | Après conception |
|----------|------------------|------------------|
| **I. Tests d'abord** | Chaque scénario d'acceptation a son test rouge avant le code (R9). | ✅ Unitaires (domaine), intégration (route), frontend (dialogue, historique), e2e (parcours, 320 px). |
| **II. Simplicité / YAGNI** | Réutilisation de `UPDATE`, `UPDATED`, `COVERAGE_UPDATED`, `availabilityFor`, `nextCoverageDeadline`. | ✅ Aucune migration, dépendance, ni type nouveau ; une route sur le modèle existant. Rien en « Complexity Tracking ». |
| **III. Accessibilité et UX** | Dialogue au clavier, libellés, erreurs reliées, confirmation annoncée, 320 px. | ✅ R8 ; dialogue ajouté au test axe 320 px de la 004. |
| **IV. Sécurité et données** | Validation serveur de tous les champs (DTO + règle par statut) ; motif exclu des traces. | ✅ R1 à R3 ; aucune donnée nouvelle collectée. |
| **V. Intégrité et audit** | Transition définie (`UPDATE`, statut inchangé), version optimiste, audit `COVERAGE_MANAGED`, historique `UPDATED`, refus journalisés. | ✅ R1, R6, R7 ; conflits refusés sans écriture. |

Aucune violation : « Complexity Tracking » sans objet.

## Project Structure

### Documentation (this feature)

```text
specs/006-modification-affectation/
├── plan.md
├── research.md          # R1 à R9
├── data-model.md        # champs modifiés, règle par statut, événement, audit
├── quickstart.md        # scénarios de validation
├── contracts/
│   ├── rest-api.md      # PATCH /api/coverage/:id ; détail : modifiableFields
│   └── ui.md            # bouton « Modifier », dialogue, historique, notification
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/common/errors.ts                          # (NOT_AVAILABLE avec message nommant le conflit : message fourni à l'appel)
├── src/coverage/
│   ├── domain/coverage-state-machine.ts          # règle UPDATE admin
│   ├── domain/coverage-modification.ts           # modifiableFields(status) (nouveau)
│   ├── domain/coverage-reminders.ts              # UPDATE sur affectation assignée ou en cours
│   ├── coverage.dto.ts                           # UpdateCoverageDto
│   ├── coverage.controller.ts                    # PATCH :id
│   ├── coverage.service.ts                       # updateCoverage ; historyOf : className
│   └── coverage.mapper.ts                        # détail : modifiableFields
└── test/
    ├── unit/                                     # domaine
    └── integration/supervision-update.spec.ts    # nouveau

frontend/
├── src/features/coverage/
│   ├── api.ts                                    # useUpdateCoverage
│   ├── types.ts                                  # modifiableFields
│   ├── EditCoverageDialog.tsx                    # nouveau
│   ├── CoverageDetailPage.tsx                    # bouton « Modifier », texte d'historique
│   └── labels.tsx                                # libellés
├── src/features/notifications/api.ts             # libellé COVERAGE_UPDATED
└── tests/coverage/edit-coverage.test.tsx         # nouveau

e2e/
├── coverage-class.spec.ts                        # parcours de modification
└── a11y-responsive.spec.ts                       # dialogue à 320 px
```

**Structure Decision**: monorepo existant ; tout relève du module `coverage` (backend et
frontend), sans nouveau dossier de domaine.

## Complexity Tracking

Sans objet : aucune violation de la constitution.
