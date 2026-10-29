# Tasks: Assistance aux demandes — fournisseurs réels et demandes similaires

**Input**: Design documents from `/specs/010-assistance-fournisseurs-similaires/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obligatoires (constitution, principe I) : chaque test est écrit et vu rouge avant le code.
Aucun test n'appelle un service extérieur (`fetch` et SDK simulés).

**Organization**: une phase par user story ; US1 (demandes similaires) est le MVP.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Sur `010-assistance-fournisseurs-et-similaires`, constater l'état de départ (`npm run lint`, typages, `npm test -w backend`, `npm run -w backend test:integration`, `npm test -w frontend`) et le consigner dans un nouveau `docs/validation/verification-010.md`, section « État initial »
- [X] T002 Ajouter `@anthropic-ai/sdk` aux dépendances de `backend/package.json` (`npm install -w backend @anthropic-ai/sdk`), vérifier `npm audit --audit-level=high` sans nouvelle vulnérabilité due à ce paquet ; noter la version dans `docs/validation/verification-010.md`

---

## Phase 2: Foundational (configuration)

- [X] T003 Dans `backend/test/unit/config.spec.ts` (rouge) : `ASSIST_SUGGESTION_PROVIDER` accepte `disabled | demo | claude` ; `claude` sans `ANTHROPIC_API_KEY` → `ConfigError` (message sans valeur de clé) ; `ASSIST_CLAUDE_MODEL` par défaut `claude-opus-5-5` ; `ASSIST_TRANSCRIPTION_PROVIDER` accepte `disabled | demo | whisper` ; `whisper` sans `ASSIST_WHISPER_URL` ou avec une URL invalide → `ConfigError` ; « `https` en production, `http`/`https` sinon » ; `ASSIST_WHISPER_MODEL` par défaut `Systran/faster-whisper-small` ; `ASSIST_WHISPER_API_KEY` facultative ; `demo` toujours refusé en production
- [X] T004 Implémenter T003 dans `backend/src/config/config.ts` (`AssistConfig` : `claude?: { apiKey, model }`, `whisper?: { url, model, apiKey }`) ; documenter les variables, sans valeur secrète, dans `backend/.env.example`

**Checkpoint**: configuration validée au démarrage

---

## Phase 3: User Story 1 - Demandes similaires (Priority: P1) 🎯 MVP

**Goal**: jusqu'à 3 demandes proches et visibles affichées dans le panneau, transmises au fournisseur réduites à titre, catégorie et priorité

**Independent Test**: avec `demo`, une demande visible proche apparaît ; une invisible, un brouillon ou une garde jamais

### Tests for User Story 1 ⚠️

- [X] T005 [P] [US1] Nouveau `backend/test/integration/assist-similar.spec.ts` (rouge) : `SimilarRequestsService.find(user, text)` renvoie au plus 3 demandes `{ id, reference, title, categoryName, priority, status }`, triées par proximité puis `createdAt` décroissant ; jamais une demande non visible (autre demandeur, autre service), un brouillon, même le sien, ni une garde ; texte sans mot commun → `[]` ; texte avec `'`, `|`, `&`, `!`, `:`, `\` → aucune erreur ; admin d'une catégorie : voit les demandes de sa catégorie
- [X] T006 [P] [US1] Dans `backend/test/integration/assist-suggestions.spec.ts` (rouge) : la réponse contient `similar` (visible seulement) ; le fournisseur simulé reçoit `similar` sous la forme `[{ title, categoryName, priority }]` uniquement, sans description ni identifiant ; aucune écriture
- [X] T007 [P] [US1] Dans `frontend/tests/assist/assist-panel.test.tsx` (rouge) : section « Demandes similaires » (liste nommée, lien « référence · titre » vers `/demandes/:id` avec `target="_blank"` et `rel="noopener"`, mention « nouvel onglet », catégorie, priorité et statut en libellés) ; absente quand `similar` est vide ; formulaire inchangé

### Implementation for User Story 1

- [X] T008 [US1] Nouveau `backend/src/assist/similar-requests.service.ts` (research R1) : `$queryRaw` paramétré (`kind = 'WORK'`, `status <> 'DRAFT'`, `to_tsvector('french', title || ' ' || coalesce(description, ''))`, `ts_rank > 0`, 20 candidats), puis `prisma.request.findMany` avec `AND: [visibleRequestsWhere(user), { id: { in } }]`, 3 premiers dans l'ordre du rang ; enregistré dans `backend/src/assist/assist.module.ts` ; T005 au vert
- [X] T009 [US1] `backend/src/assist/providers/assist-providers.ts` : `SuggestionInput.similar: Array<{ title; categoryName; priority }>` ; `backend/src/assist/assist.service.ts` : `similar` calculé, transmis réduit (R7) et renvoyé dans `SuggestionResult` ; T006 au vert
- [X] T010 [US1] `frontend/src/features/assist/api.ts` (`similar` dans `SuggestionResult`) et `frontend/src/features/assist/AssistPanel.tsx` (section, contrat `contracts/ui.md`) ; T007 au vert

**Checkpoint**: demandes similaires livrables seules

---

## Phase 4: User Story 2 - Connecteur Whisper (Priority: P2)

**Goal**: transcription par le serveur de l'établissement, prête à activer

**Independent Test**: connecteur sur `fetch` simulé

### Tests for User Story 2 ⚠️

- [X] T011 [P] [US2] Nouveau `backend/test/unit/assist-whisper.spec.ts` (rouge) : `POST {url}/v1/audio/transcriptions` (barre finale de l'URL tolérée) ; `FormData` avec `file` (contenu du vocal converti, type `audio/mp4`), `model`, `language=fr`, `response_format=json` ; `Authorization: Bearer` seulement si une clé est configurée ; `signal` transmis ; réponse `{ text }` renvoyée ; statut non 2xx, JSON invalide, `text` absent → erreur dont le message ne contient ni l'adresse, ni la clé, ni le corps ; aucun appel réseau réel (`fetch` simulé)

### Implementation for User Story 2

- [X] T012 [US2] Nouveau `backend/src/assist/providers/whisper-transcription.ts` (R5) et branchement dans `transcriptionProviderFor` (`backend/src/assist/providers/assist-providers.ts`) ; T011 au vert

---

## Phase 5: User Story 3 - Connecteur Claude (Priority: P3)

**Goal**: analyse par un modèle Claude, prête à activer, sortie contrôlée

**Independent Test**: connecteur sur un client SDK simulé

### Tests for User Story 3 ⚠️

- [X] T013 [P] [US3] Nouveau `backend/test/unit/assist-claude.spec.ts` (rouge) : requête `beta.messages.create` avec `model` configuré, `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`, `output_config.effort: 'low'`, `output_config.format.type: 'json_schema'` dont `categoryId` est en `enum` des catégories transmises plus `null` et `priority` en `enum` `NORMAL | MEDIUM | HIGH | URGENT` plus `null`, `additionalProperties: false` ; consigne système de traitement en donnée ; texte entre `<demande>` et `</demande>` ; consignes et demandes similaires (titre, catégorie, priorité) dans le message ; `signal` transmis ; réponse JSON → objet sans les `null` ; `stop_reason: 'refusal'`, JSON invalide ou bloc texte absent → erreur sans la clé ; client construit avec `maxRetries: 0`
- [X] T014 [P] [US3] Dans `backend/test/unit/assist-sanitize.spec.ts` : une sortie simulée du connecteur avec catégorie hors liste, priorité `CRITICAL` et source inconnue est filtrée (garde-fou indépendant de la contrainte de sortie)

### Implementation for User Story 3

- [X] T015 [US3] Nouveau `backend/src/assist/providers/claude-suggestion.ts` (R3, R4, contrat `contracts/rest-api.md`) et branchement dans `suggestionProviderFor` ; T013 et T014 au vert

---

## Phase 6: User Story 4 - Transcription remplacée (Priority: P3)

- [X] T016 [US4] Dans `frontend/tests/assist/assist-panel.test.tsx` : après une transcription, refaire le vocal masque la transcription précédente et le clic suivant demande une nouvelle transcription (2 appels `/api/assist/transcriptions`) ; corriger `frontend/src/features/assist/AssistPanel.tsx` si le test échoue

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T017 [P] `e2e/assist.spec.ts` : demande similaire visible dans le panneau (création préalable par l'API, même compte), lien ouvrant un nouvel onglet ; audit axe sans violation
- [X] T018 [P] Documentation : `docs/ARCHITECTURE.md` (section 14 : connecteurs, demandes similaires, variables), `specs/009-assistance-ia-demandes/spec.md` inchangée sauf renvoi vers 010 dans « Assumptions »
- [X] T019 Vérification finale dans `docs/validation/verification-010.md` : lint, typages, unitaires, intégration, frontend, e2e concernés, `npm audit` ; résultats réels ; limites (connecteurs non essayés avec un vrai service)

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1, US2, US3 (indépendantes entre elles) → US4 → Phase 7
- Dans chaque story : tests rouges, puis implémentation
- US3 dépend de T002 (SDK) et T004 (configuration) ; US2 de T004

### Parallel Opportunities

- T005, T006, T007 (fichiers distincts) ; T011 et T013, T014 ; T017 et T018

## Implementation Strategy

1. MVP : Phases 1-3 (demandes similaires), utile sans décision de l'établissement.
2. Connecteurs (US2, US3) : livrés désactivés.
3. US4 et finitions.

---

## Phase 8: Complément 011 — sans abonnement (US5, US6)

- [X] T020 [US5] `backend/test/unit/config.spec.ts`, nouveau `backend/test/unit/assist-providers.spec.ts` (rouges) : `rules` accepté en production pour les propositions, refusé pour la transcription ; transcription `demo` refusée en production ; `rules` = `demoSuggest`, annulable ; puis `backend/src/config/config.ts` et `backend/src/assist/providers/assist-providers.ts`
- [X] T021 [US6] Tests (rouges) : `ASSIST_TRANSCRIPTION_TIMEOUT_MS` de 1 000 à 300 000 ms, défaut 120 000 ; fournisseur simulé de 2 s : transcription aboutie (délai 4 s), propositions indisponibles (délai 1 s) ; puis `config.ts` et `AssistService.callProvider` (délai par appel)
- [X] T022 [US6] Tests (rouges) puis `ASSIST_WHISPER_CA_FILE` : certificat lu à chaque appel et transmis à la connexion TLS (vérification jamais désactivée) ; transport HTTP(S) natif de Node vérifié contre un serveur local de test
- [X] T023 [US6] `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/.env.example` : variables `ASSIST_*` transmises à l'API ; service `whisper` (image figée, sans port, volume des modèles, profil désactivé par défaut) ; bloc Caddy interne `:8444` `tls internal` ; volume de Caddy monté en lecture seule dans l'API
- [X] T024 [US6] `deploy/docker-compose.dev.yml` : service `whisper` (même image, profil), sans changer les services existants
- [X] T025 [US6] Test d'intégration facultatif `backend/test/integration/assist-whisper-live.spec.ts`, ignoré sans `ASSIST_WHISPER_TEST_URL`
- [ ] T026 [US6] Mesure réelle (Docker) : transcription d'un vocal sans donnée personnelle, compatibilité du connecteur, calibrage du délai par défaut ; `docs/validation/verification-011.md`
- [ ] T027 Documentation (`docs/ARCHITECTURE.md`, `quickstart.md`) et vérifications (lint, typages, unitaires, intégration, frontend, E2E concernés, `npm audit`)
