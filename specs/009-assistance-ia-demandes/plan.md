# Implementation Plan: Assistance IA à la création des demandes (socle)

**Branch**: `009-assistance-ia-demandes` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-assistance-ia-demandes/spec.md`

## Summary

Nouveau module backend `assist` :

- transcription d'un enregistrement (`POST /api/assist/transcriptions`, mêmes contrôles audio que
  l'envoi, rien de conservé) ;
- propositions (`POST /api/assist/suggestions`) : recherche plein texte PostgreSQL dans les
  consignes autorisées, appel d'un `SuggestionProvider` configurable, validation stricte champ par
  champ, jeton signé ;
- gestion des consignes par le super administrateur (`/api/admin/guidelines`, audit
  `GUIDELINE_CHANGED`).

La création existante accepte un `assistToken` facultatif et écrit un événement d'historique
`ASSIST_SUGGESTED` (valeurs proposées et retenues). Fournisseurs `disabled` (par défaut) et `demo`
(déterministe, local, refusé en production) ; aucun appel externe. Frontend : panneau
« Propositions automatiques » dans « Nouvelle demande » et onglet « Consignes ». Détails :
[research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6, class-validator, `node:crypto` (backend) ; React 19,
MUI 7, TanStack Query, lucide-react (frontend) — pile existante, **aucune dépendance ajoutée**

**Storage**: PostgreSQL 17 — table `Guideline`, valeurs `ASSIST_SUGGESTED` (`RequestEventType`) et
`GUIDELINE_CHANGED` (`AuditAction`) ; migration `0011_request_assist` avec `down.sql` ; recherche
`to_tsvector('french', …)` sans extension

**Testing**: Jest (unitaires ; intégration avec PostgreSQL embarqué), Vitest + Testing Library,
Playwright + axe

**Target Platform**: navigateurs récents (desktop et mobiles), serveur Linux (Docker, une seule
instance d'API)

**Project Type**: application web (monorepo `backend/` + `frontend/`)

**Performance Goals**: propositions en moins de 3 s avec `demo`, moins de 20 s dans tous les cas
(délai `ASSIST_TIMEOUT_MS` = 15 s par défaut) ; recherche sur quelques dizaines de consignes

**Constraints**: aucune écriture métier par l'assistance ; contrôles de création inchangés ;
aucun appel réseau sortant ; aucune transcription, texte transmis ni audio en base ou dans les
journaux ; WCAG 2.2 AA, 320 px ; 10 appels par 5 minutes et par utilisateur

**Scale/Scope**: 1 module backend (3 routes publiques + 4 d'administration), 1 table, 2 valeurs
d'énumération, 1 champ de DTO, 1 panneau, 1 page d'administration, 1 libellé d'historique

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Avant conception | Après conception |
| --- | --- | --- |
| **I. Tests d'abord** | Chaque scénario a son test rouge avant le code (R10) ; règles d'accès et de validation en unitaires. | ✅ Unitaires (validation, démonstration, jeton, limite, configuration), intégration (accès, consignes, aucune écriture, événement, brouillon, audit), interface, e2e et axe. |
| **II. Simplicité / YAGNI** | Pas de base vectorielle, pas de fournisseur réel, pas de nouvelle dépendance. | ✅ Recherche plein texte PostgreSQL (R5) ; jeton signé plutôt qu'une table (R6) ; limite en mémoire (R7) ; deux interfaces justifiées par la décision de cadrage (fournisseur réel ultérieur) — voir « Complexity Tracking ». |
| **III. Accessibilité et UX** | Panneau facultatif, jamais bloquant ; formulaire inchangé sans IA. | ✅ Région `aria-live`, boutons « Appliquer » nommés, confirmation avant remplacement, 320 px ; messages d'erreur avec action corrective. |
| **IV. Sécurité et données** | Entrées validées côté serveur ; aucune clé côté navigateur ; minimisation (rien conservé hors historique). | ✅ Réponse du fournisseur `unknown` puis filtrée (R3) ; consignes filtrées dans la requête SQL paramétrée ; audio effacé (R4) ; `demo` refusé en production ; finalité documentée (spec, « Assumptions »). |
| **V. Intégrité et audit** | Création par le parcours existant seulement ; refus journalisés ; historique en ajout seul. | ✅ `ASSIST_SUGGESTED` dans la transaction de création ; `GUIDELINE_CHANGED` sans texte ; `ACCESS_DENIED` pour les refus et la limite ; `down.sql` refuse de retirer une valeur déjà utilisée. |

## Project Structure

### Documentation (this feature)

```text
specs/009-assistance-ia-demandes/
├── plan.md
├── research.md          # R1 à R10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md      # assist/*, admin/guidelines, assistToken
│   └── ui.md            # panneau, historique, onglet « Consignes »
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/schema.prisma                         # Guideline, ASSIST_SUGGESTED, GUIDELINE_CHANGED
├── prisma/migrations/0011_request_assist/       # migration.sql + down.sql (nouveau)
├── scripts/e2e-server.ts                        # fournisseurs demo pour les e2e
├── .env.example                                 # variables ASSIST_* (sans secret)
├── src/config/config.ts                         # assist : fournisseurs, délai, limite
├── src/common/errors.ts                         # ASSIST_DISABLED, ASSIST_UNAVAILABLE, TRANSCRIPTION_EMPTY
├── src/audit/audit.service.ts                   # ALLOWED_DETAIL_KEYS : guidelineId, title
├── src/files/files.service.ts                   # prepareVoice extrait de upload (réutilisé)
├── src/settings/admin-settings.service.ts       # clientSettings : assistSuggestions, assistTranscription
├── src/requests/requests.dto.ts                 # assistToken
├── src/requests/requests.service.ts             # événement ASSIST_SUGGESTED dans create
├── src/assist/                                  # nouveau module
│   ├── assist.module.ts
│   ├── assist.controller.ts                     # transcriptions, suggestions
│   ├── assist.service.ts                        # orchestration, délai, journal sans contenu
│   ├── assist.dto.ts
│   ├── assist-token.ts                          # signature et lecture du jeton
│   ├── assist-rate-limiter.ts
│   ├── guidelines.service.ts                    # CRUD, recherche, audit
│   ├── admin-guidelines.controller.ts
│   ├── domain/sanitize-suggestion.ts            # validation stricte (pure)
│   ├── domain/demo-suggest.ts                   # propositions de démonstration (pure)
│   └── providers/                               # interfaces, disabled, demo, fabrique
└── test/
    ├── unit/assist/*.spec.ts
    └── integration/assist*.spec.ts

frontend/
├── src/api/settings.ts                          # assistSuggestions, assistTranscription
├── src/features/assist/AssistPanel.tsx          # nouveau
├── src/features/assist/api.ts                   # nouveau
├── src/features/requests/CreateRequestPage.tsx  # panneau + assistToken
├── src/features/requests/api.ts                 # assistToken dans submitRequest
├── src/features/outbox/*                        # assistToken conservé hors ligne
├── src/features/requests/HistoryTimeline.tsx    # libellé ASSIST_SUGGESTED
├── src/features/admin/GuidelinesAdminPage.tsx   # nouveau
├── src/features/admin/GuidelineFormDialog.tsx   # nouveau
├── src/features/admin/AdminLayout.tsx           # onglet « Consignes »
├── src/features/admin/adminRoutes.tsx           # /admin/consignes
├── src/features/admin/labels.ts                 # libellé d'audit GUIDELINE_CHANGED
└── tests/assist/*.test.tsx, tests/admin/guidelines.test.tsx

e2e/assist.spec.ts                               # nouveau ; a11y-responsive.spec.ts étendu
docs/ARCHITECTURE.md                             # module assist, aucun appel externe
```

**Structure Decision**: application web existante ; un module NestJS `assist` regroupe
fournisseurs, consignes et propositions, comme `coverage` ou `dashboard`. Pas de nouveau
service ni conteneur.

## Incréments

1. **Socle backend** : migration, configuration, fournisseurs, validation, consignes (CRUD et
   recherche), propositions, limite, jeton ; tests unitaires et d'intégration.
2. **Création et historique** : `assistToken`, événement `ASSIST_SUGGESTED`, invariants de création.
3. **Transcription** : `prepareVoice`, route, effacement de l'audio.
4. **Interface** : réglages client, panneau, historique, onglet « Consignes » ; tests Vitest.
5. **E2E, accessibilité, documentation**.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Interfaces `TranscriptionProvider` / `SuggestionProvider` avec deux implémentations chacune | Décision de cadrage : brancher plus tard un fournisseur réel sans changer le parcours (FR-020), et désactiver l'assistance par défaut (FR-019) | Appeler directement un fournisseur : impossible sans la décision RGPD ; coder la démonstration en dur : à réécrire au premier vrai fournisseur |
| Jeton signé dans la réponse des propositions | Historique fiable des valeurs proposées sans conserver de proposition (FR-023, FR-025) | Table des propositions : données gardées pour des formulaires abandonnés ; valeurs renvoyées en clair : falsifiables |
