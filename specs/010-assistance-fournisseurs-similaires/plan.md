# Implementation Plan: Assistance aux demandes — fournisseurs réels et demandes similaires

**Branch**: `010-assistance-fournisseurs-et-similaires` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-assistance-fournisseurs-similaires/spec.md`

## Summary

Suite de 009 (module `assist`) :

- **Demandes similaires** : `AssistService.suggest` recherche jusqu'à 3 demandes de travail proches
  (plein texte PostgreSQL en français sur titre et description, hors brouillons et gardes), filtrées
  par la règle de visibilité de la liste (`visibleRequestsWhere`). Elles sont renvoyées dans la
  réponse (`similar`) et transmises au fournisseur réduites à titre, catégorie et priorité.
- **Connecteur Whisper** (`whisper`) : serveur de transcription de l'établissement, interface
  compatible OpenAI (`/v1/audio/transcriptions`), `fetch` natif.
- **Connecteur Claude** (`claude`) : SDK officiel `@anthropic-ai/sdk`, sortie structurée par schéma
  JSON, puis le contrôle existant `sanitizeSuggestion`.
- Configuration : désactivé par défaut ; démarrage refusé si un connecteur réel est incomplet.
- Frontend : section « Demandes similaires » du panneau ; test du remplacement de la transcription.

Détails : [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24

**Primary Dependencies**: pile existante (NestJS 11, Prisma 6, React 19, MUI 7) ; **ajout backend :
`@anthropic-ai/sdk`** (voir Complexity Tracking) ; `fetch` et `FormData` natifs de Node pour Whisper

**Storage**: PostgreSQL 17, **aucune migration** : recherche `to_tsvector('french', …)` à la volée
sur `Request` (pas d'index GIN dans ce lot, R2)

**Testing**: Jest (unitaires : connecteurs avec `fetch` et SDK simulés, configuration ; intégration :
demandes similaires et droits sur PostgreSQL embarqué), Vitest + Testing Library, Playwright + axe

**Target Platform**: navigateurs récents ; serveur Linux (Docker, une instance d'API)

**Project Type**: application web (monorepo `backend/` + `frontend/`)

**Performance Goals**: propositions avec demandes similaires en moins de 2 s avec `demo` (SC-002) ;
délai des connecteurs réels borné par `ASSIST_TIMEOUT_MS` (15 s par défaut)

**Constraints**: aucun appel réseau dans les tests ni avec la configuration par défaut ; aucune
donnée d'une demande non visible transmise ou affichée ; clé et adresse jamais journalisées ;
HTTPS obligatoire en production pour le serveur Whisper ; WCAG 2.2 AA, 320 px

**Scale/Scope**: 2 connecteurs, 1 recherche, 1 champ de réponse, 1 section d'interface, 6 variables
d'environnement

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Avant conception | Après conception |
| --- | --- | --- |
| **I. Tests d'abord** | Chaque comportement a son test rouge : droits des demandes similaires, requêtes des connecteurs, erreurs, configuration. | ✅ Intégration (visibilité, brouillons, gardes, caractères spéciaux), unitaires (connecteurs simulés, configuration), interface (section, transcription remplacée), e2e. |
| **II. Simplicité / YAGNI** | Recherche existante réutilisée ; pas de pgvector ; pas de nouvelle table. | ✅ Une dépendance justifiée (SDK Anthropic, R3) ; Whisper par `fetch` natif (pas de SDK) ; pas d'index ni de migration. |
| **III. Accessibilité et UX** | Section facultative, jamais bloquante ; liens dans un nouvel onglet pour garder le formulaire. | ✅ Liste nommée, liens avec mention « nouvel onglet » ; mêmes messages d'erreur ; 320 px. |
| **IV. Sécurité et données** | Clés côté serveur ; minimisation (titre, catégorie, priorité des similaires seulement) ; HTTPS en production. | ✅ Filtre de visibilité réutilisé (R1) ; texte délimité et sortie contrainte puis filtrée (R4) ; erreurs sans clé ni adresse ; activation conditionnée à la décision de l'établissement. |
| **V. Intégrité et audit** | Aucune écriture par l'assistance ; création inchangée. | ✅ Inchangé depuis 009 ; refus et limite toujours journalisés. |

## Project Structure

### Documentation (this feature)

```text
specs/010-assistance-fournisseurs-similaires/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest-api.md      # champ similar ; requêtes sortantes Whisper et Claude
│   └── ui.md            # section « Demandes similaires »
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── package.json                                   # + @anthropic-ai/sdk
├── .env.example                                   # variables ASSIST_* et ANTHROPIC_API_KEY
├── src/config/config.ts                           # whisper / claude, contrôles de complétude
├── src/assist/
│   ├── similar-requests.service.ts                # nouveau : recherche + visibilité
│   ├── assist.service.ts                          # similar dans suggest
│   └── providers/
│       ├── assist-providers.ts                    # fabrique étendue, SuggestionInput.similar
│       ├── whisper-transcription.ts               # nouveau
│       └── claude-suggestion.ts                   # nouveau
└── test/
    ├── unit/assist-whisper.spec.ts, assist-claude.spec.ts, config.spec.ts
    └── integration/assist-similar.spec.ts

frontend/
├── src/features/assist/{api.ts, AssistPanel.tsx}
└── tests/assist/assist-panel.test.tsx
```

**Structure Decision**: tout reste dans le module `assist` (couche après `requests`, qui fournit
`visibleRequestsWhere`) ; un fichier par connecteur derrière les interfaces existantes.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Nouvelle dépendance `@anthropic-ai/sdk` | Référence officielle de l'API : SDK obligatoire dans un projet TypeScript ; erreurs typées, annulation, en-têtes et versions gérés par Anthropic. | `fetch` brut : en-têtes, versions d'API et formes de requête à maintenir à la main, déconseillé par la référence. |
| Nouveau service `SimilarRequestsService` | Requête SQL et filtre d'accès isolés et testables séparément de `AssistService`. | Intégrer dans `AssistService` : mélange recherche, droits et appel au fournisseur dans une méthode déjà longue. |
