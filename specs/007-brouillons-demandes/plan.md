# Implementation Plan: Brouillons de demande de travail

**Branch**: `007-brouillons-demandes` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-brouillons-demandes/spec.md`

## Summary

Interface des brouillons sur une API existante : « Enregistrer en brouillon » dans « Nouvelle
demande » (si le réglage l'autorise), onglet « Brouillons » dans « Mes demandes » (seulement s'il y
en a), page `/demandes/:id/brouillon` qui reprend le formulaire pré-rempli pour enregistrer, envoyer
ou supprimer. Seul changement serveur : périmètre de liste `drafts`, et `mine` (« Envoyées ») sans
brouillon. Détails : [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6 (backend) ; React 19, React Router 7, MUI 7,
TanStack Query (frontend) — pile existante, aucune dépendance ajoutée

**Storage**: PostgreSQL 17 — aucune modification de schéma ni migration

**Testing**: Jest (intégration avec PostgreSQL embarqué), Vitest + Testing Library, Playwright + axe

**Target Platform**: navigateurs récents (desktop et mobiles), serveur Linux (Docker)

**Project Type**: application web (monorepo `backend/` + `frontend/`)

**Performance Goals**: une requête légère de plus sur « Mes demandes » (présence de brouillons,
`limit=1`)

**Constraints**: WCAG 2.2 AA, 320 px ; aucune règle métier nouvelle ; réglage `draftsEnabled`
respecté (création seulement)

**Scale/Scope**: 1 périmètre de liste, 1 page, 1 composant de formulaire extrait, 1 onglet

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Avant conception | Après conception |
|----------|------------------|------------------|
| **I. Tests d'abord** | Chaque scénario a son test rouge avant le code (R7). | ✅ Intégration (périmètres, envoi d'un brouillon, réglage), frontend (formulaire, onglet, page), e2e (parcours, 320 px). |
| **II. Simplicité / YAGNI** | API existante réutilisée ; formulaire extrait plutôt que dupliqué. | ✅ Un périmètre serveur ; pas de tri ni de pagination propres (R2) ; pas de boîte d'envoi pour les brouillons (R6). |
| **III. Accessibilité et UX** | Actions explicites, confirmation de suppression, erreurs reliées, 320 px. | ✅ Composants existants (`ConfirmDialog`, `VoicePlayer`, `VoiceRecorder`) ; V18 étendu. |
| **IV. Sécurité et données** | Visibilité de l'auteur seul (existante) ; validation serveur existante. | ✅ `scope=drafts` limité à l'utilisateur de la session ; aucune donnée nouvelle. |
| **V. Intégrité et audit** | Transitions existantes (`SUBMIT`) ; un brouillon n'a ni historique ni notification (existant). | ✅ Envoi par la machine à états existante, version optimiste. |

Aucune violation : « Complexity Tracking » sans objet.

## Project Structure

### Documentation (this feature)

```text
specs/007-brouillons-demandes/
├── plan.md
├── research.md          # R1 à R7
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md      # GET /api/requests?scope=drafts ; scope=mine sans brouillon ; appels réutilisés
│   └── ui.md            # bouton, onglet, page brouillon
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/requests/requests.dto.ts           # REQUEST_SCOPES : 'drafts'
├── src/requests/requests.service.ts       # list : 'mine' sans DRAFT ; 'drafts'
└── test/integration/requests-drafts.spec.ts   # nouveau

frontend/
├── src/features/requests/
│   ├── types.ts                 # RequestScope : 'drafts'
│   ├── api.ts                   # saveDraft, updateDraft, submitDraft, deleteDraft
│   ├── RequestForm.tsx          # formulaire extrait de CreateRequestPage (nouveau)
│   ├── CreateRequestPage.tsx    # utilise RequestForm ; « Enregistrer en brouillon »
│   ├── DraftPage.tsx            # /demandes/:id/brouillon (nouveau)
│   ├── RequestListPage.tsx      # onglet « Brouillons », lien des brouillons
│   └── RequestDetailPage.tsx    # brouillon → redirection vers la page brouillon
├── src/app/routes.tsx           # route demandes/:id/brouillon
└── tests/requests/drafts.test.tsx   # nouveau

e2e/
├── drafts.spec.ts               # parcours (nouveau)
└── a11y-responsive.spec.ts      # page brouillon à 320 px
```

**Structure Decision**: monorepo existant ; module `requests` côté serveur et interface.

## Complexity Tracking

Sans objet : aucune violation de la constitution.
