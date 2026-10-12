---

description: "Task list for Lot 1 – Demandes de travail et messagerie vocale"
---

# Tasks: Lot 1 – Demandes de travail et messagerie vocale

**Input**: Design documents from `/specs/001-demandes-travail-vocales/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rest-api.md,
contracts/realtime-events.md, quickstart.md

**Tests**: OBLIGATOIRES. La constitution (principe I, non négociable) impose le TDD : dans
chaque phase, les tâches de test sont écrites en premier et DOIVENT échouer avant
l'implémentation correspondante.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Backend : `backend/src/`, `backend/test/unit/`, `backend/test/integration/`, `backend/prisma/`
- Frontend : `frontend/src/`, `frontend/tests/`
- Bout en bout : `e2e/` ; déploiement : `deploy/`
- Références : `data-model.md` (DM), `contracts/rest-api.md` (REST), `contracts/realtime-events.md` (RT), `research.md` (R1–R13), `quickstart.md` (V1–V18)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Créer le `package.json` racine avec npm workspaces `["backend", "frontend"]` et les scripts `lint`, `test`, `test:e2e`, `verify` (lint + tests + `npm audit --audit-level=high`), plus `.gitignore` (node_modules, dist, .env, data/), `.editorconfig` et `.nvmrc` (`24`) à la racine du dépôt
- [X] T002 [P] Initialiser NestJS 11 en TypeScript strict dans `backend/` (`backend/package.json`, `backend/tsconfig.json`, `backend/nest-cli.json`, `backend/src/main.ts`, `backend/src/app.module.ts`) avec les dépendances : `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/websockets`, `socket.io`, `@nestjs/schedule`, `@nestjs/throttler`, `@nestjs/swagger`, `prisma`, `@prisma/client`, `class-validator`, `class-transformer`, `argon2`, `cookie-parser`, `file-type`, `sharp` ; dev : `jest`, `ts-jest`, `supertest`, `socket.io-client`
- [X] T003 [P] Initialiser Vite + React 19 + TypeScript strict dans `frontend/` (`frontend/package.json`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`) avec `react-router`, `@tanstack/react-query`, `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`, `socket.io-client`, `idb-keyval` ; configurer dans `frontend/vite.config.ts` le proxy de `/api` et `/socket.io` (ws) vers `http://localhost:3000`
- [X] T004 [P] Configurer ESLint (typescript-eslint, règles React Hooks et jsx-a11y pour le frontend) et Prettier dans `eslint.config.mjs` et `.prettierrc` à la racine
- [X] T005 [P] Configurer Jest dans `backend/jest.config.ts` (unitaires, `backend/test/unit/**`) et `backend/test/jest-integration.config.ts` (intégration, `backend/test/integration/**`, exécution en série) ; créer `backend/test/utils/test-app.ts` (démarre l'application Nest sur une base de test) et `backend/test/utils/test-db.ts` (applique les migrations sur `DATABASE_URL_TEST` et vide les tables entre les tests, sauf triggers)
- [X] T006 [P] Configurer Vitest + React Testing Library + jsdom dans `frontend/vitest.config.ts` et `frontend/tests/setup.ts` (jest-dom, nettoyage, faux `MediaRecorder` réutilisable dans `frontend/tests/mocks/media-recorder.ts`)
- [X] T007 [P] Configurer Playwright dans `e2e/playwright.config.ts` : projets `chromium`, `webkit`, `firefox`, `iPhone 13`, `Pixel 7` et un projet `mobile-320` (viewport 320×640) ; options Chromium `--use-fake-ui-for-media-stream` et `--use-fake-device-for-media-stream` ; pour WebKit (dont le profil `iPhone 13`), qui n'a pas de micro simulé, `e2e/support/fake-media-recorder.ts` injecté par `page.addInitScript` remplace `navigator.mediaDevices.getUserMedia` et `MediaRecorder` par une simulation produisant un Blob `audio/mp4` réel tiré d'une fixture, la lecture restant celle du vrai élément `<audio>` ; `webServer` qui lance backend et frontend ; créer `e2e/support/axe.ts` (assertion `expectNoA11yViolations(page)` avec @axe-core/playwright, tags wcag2a, wcag2aa, wcag21aa, wcag22aa) et `e2e/support/login.ts` (connexion par compte de démo)
- [X] T008 [P] Créer `deploy/docker-compose.dev.yml` (services `db` PostgreSQL 17 avec bases `app` et `app_test`, `caddy` en HTTPS interne sur le port 8443) et `deploy/Caddyfile.dev` (`tls internal`, proxy `/api/*` et `/socket.io/*` vers l'API, le reste vers Vite) pour tester le micro sur téléphone (R2)
- [X] T009 [P] Créer `backend/.env.example` (`DATABASE_URL`, `DATABASE_URL_TEST`, `SESSION_SECRET`, `FILES_DIR`, `APP_ORIGIN`, `PORT`, `FFMPEG_PATH`, `FFPROBE_PATH`) et `backend/src/config/config.ts` qui valide ces variables au démarrage et refuse de démarrer si l'une manque (principe IV : aucun secret dans le code)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Base de données

- [X] T010 Écrire le schéma Prisma complet dans `backend/prisma/schema.prisma` selon DM : énumérations `Role`, `Priority`, `RequestStatus` (11 valeurs : `DRAFT`, `PENDING_ADMIN_VALIDATION`, `SENT`, `ACCEPTED`, `IN_PROGRESS`, `DONE`, `PENDING_FINAL_VALIDATION`, `TO_CORRECT`, `CLOSED`, `REJECTED`, `CANCELLED`), `Circuit`, `ClosureMode`, `AssignmentMode`, `DeadlineStage`, `MessageKind`, `FileKind`, `Permission` ; modèles `User`, `Session`, `RolePermission`, `Category`, `CategoryRecipient`, `CategoryManager`, `DeadlineRule`, `Setting`, `Request`, `Message`, `File`, `RequestEvent`, `AuditLog`, `Notification`. Contraintes à respecter : `username` « unique, insensible à la casse, 3–64 caractères » (colonne `citext` ou index unique sur `lower(username)`) ; `Category.name` « unique, 1–60 caractères » ; `Request.title` « 1–120 caractères, obligatoire » ; `description` et `Message.text` « ≤ 4 000 caractères » ; `File.originalName` « ≤ 255 caractères » ; uniques `(requesterId, clientId)` sur `Request`, `(authorId, clientId)` sur `Message`, `(categoryId, priority)` sur `DeadlineRule`, `(role, permission)` sur `RolePermission` ; `Request.reference` unique ; `Request.version` entier défaut 0 ; `rulesSnapshot` en `Json` ; tous les horodatages d'étape de DM `Request` ; index sur `Request` : `status`, `categoryId`, `assigneeId`, `requesterId`, `priority`, `createdAt`, `currentDueAt`
- [X] T011 Écrire le test d'intégration `backend/test/integration/append-only.spec.ts` (V17) : un `UPDATE` ou un `DELETE` brut sur `AuditLog` et sur `RequestEvent` lève une erreur et ne modifie aucune ligne ; un `INSERT` réussit
- [X] T012 Générer la migration initiale `backend/prisma/migrations/0001_init/migration.sql` (`prisma migrate dev --create-only`) puis y ajouter en SQL la fonction `forbid_modification()` et les triggers `BEFORE UPDATE OR DELETE` sur `"AuditLog"` et `"RequestEvent"` (R6) ; faire passer T011
- [X] T013 [P] Créer `backend/src/common/prisma.service.ts` (PrismaClient, connexion au démarrage, arrêt propre) et l'exporter dans un `PrismaModule` global

### Domaine pur (TDD)

- [X] T014 [P] Écrire les tests table-driven `backend/test/unit/request-state-machine.spec.ts` : chaque transition T1–T18 de DM §Machine à états est autorisée pour son acteur et ses gardes (destinataire actif dans la catégorie, vocal ou description, motif obligatoire pour `REJECT`/`DECLINE`, commentaire obligatoire pour `REQUEST_CORRECTION`, photo de preuve si `photoRequired`, choix de T1/T2 selon le circuit, T11/T12 automatiques après `COMPLETE`, `CLOSE` selon `closureMode` `AUTO`/`REQUESTER`/`MANAGER`) ; pour chacun des 11 statuts, toute action non listée est refusée (`INVALID_TRANSITION`) ; tout acteur non prévu est refusé (`FORBIDDEN`) ; `CLOSED`, `REJECTED`, `CANCELLED` n'acceptent aucune action ; `CANCEL` refusé depuis `ACCEPTED`
- [X] T015 Implémenter `backend/src/requests/domain/request-state-machine.ts` : table de transitions `{ from, action, to, actor, guards }` et fonction pure `applyAction(request, action, actor, context) → { ok: true, to, effects } | { ok: false, code }` sans accès base ; faire passer T014
- [X] T016 [P] Écrire les tests table-driven `backend/test/unit/access-policy.spec.ts` couvrant DM §Matrice d'accès : `canReadRequest` (demandeur, affecté actuel, responsable de la catégorie, super admin → oui ; ancien affecté après réaffectation, destinataire de la catégorie non affecté, autre employé → non ; demande circuit B avant approbation invisible pour les destinataires), `allowedActions` (combine machine à états, rôle, relation et permissions `PRIORITY_CHANGE_OWN`/`PRIORITY_CHANGE_MANAGED`/`REQUEST_REASSIGN`), `canCreateInCategory` (`creatorRoles` + `REQUEST_CREATE`, catégorie active), `canPickRecipient` (utilisateur actif dans `CategoryRecipient`), `canWriteInThread` (participant et statut non final)
- [X] T017 Implémenter `backend/src/requests/domain/access-policy.ts` (fonctions pures) et `backend/src/requests/domain/visibility.ts` (construit le filtre Prisma `where` équivalent à `canReadRequest` pour les listes et la recherche) ; faire passer T016

### Socle API

- [X] T018 [P] Créer dans `backend/src/common/` : `validation.pipe.ts` (ValidationPipe global `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`), `http-exception.filter.ts` (format `{ "error": { "code", "message", "details" } }`, messages en français, codes métier de REST §Règles communes), `server-time.interceptor.ts` (en-tête `X-Server-Time`), `pagination.ts` (curseur opaque `createdAt`+`id`, `limit` défaut 25) ; brancher le tout et Swagger (`/api/docs-json` hors production) dans `backend/src/main.ts` avec le préfixe `/api`
- [X] T019 [P] Créer `backend/src/audit/audit.service.ts` et `backend/src/audit/audit.module.ts` : `log(action, { actorId, targetType, targetId, details, ip })` en insertion seule, avec liste blanche des champs de `details` (jamais de mot de passe, jeton ni contenu de message) ; test `backend/test/unit/audit-sanitize.spec.ts` écrit d'abord
- [X] T020 Écrire `backend/test/integration/auth.spec.ts` : connexion réussie → cookie `sid` `HttpOnly`, `Secure`, `SameSite=Strict` et audit `LOGIN_SUCCESS` ; échec → `401` message générique et audit `LOGIN_FAILURE` ; 6e tentative en une minute → `429 RATE_LIMITED` ; session expirée après `sessionIdleMinutes` d'inactivité ou `sessionMaxHours` → `401` ; `mustChangePassword` → toute route hors `/auth/*` répond `403 PASSWORD_CHANGE_REQUIRED` ; `POST /auth/password` refuse moins de 12 caractères ; requête modifiante avec `Origin` étranger → `403` ; compte désactivé → sessions supprimées ; toute réponse `401` (session absente, invalide ou expirée) produit une entrée d'audit `ACCESS_DENIED` avec `details.reason = "UNAUTHENTICATED"`, la route et l'IP
- [X] T021 Implémenter `backend/src/auth/` (`auth.module.ts`, `auth.controller.ts`, `auth.service.ts`, `session.service.ts`, `session.guard.ts` global, `origin.guard.ts`, `current-user.decorator.ts`) : Argon2id, jeton de session aléatoire de 256 bits stocké haché, expirations lues dans les réglages, throttler 5/min par identifiant+IP sur `/auth/login`, routes `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` (REST §Authentification) ; journaliser chaque authentification refusée : échec de connexion (`LOGIN_FAILURE`), connexion bloquée par le throttler et toute réponse `401` (`ACCESS_DENIED`, `details.reason = "UNAUTHENTICATED"`, route, IP) ; faire passer T020
- [X] T022 [P] Créer `backend/src/settings/settings.service.ts` : lecture typée des réglages de DM §Valeurs par défaut avec repli sur les valeurs par défaut et cache invalidé à l'écriture
- [X] T023 [P] Créer `backend/src/notifications/notifications.service.ts` : `notifyInTx(tx, recipients[], { type, requestId, priority })` qui écrit les lignes `Notification` dans la transaction en excluant l'auteur de l'action, puis `flushAfterCommit()` qui transmet à une interface `NotificationPublisher` ; fournir `NoopNotificationPublisher` (remplacé en US4) ; test `backend/test/unit/notifications-recipients.spec.ts` écrit d'abord (l'auteur n'est jamais notifié)
- [X] T024 Écrire le seed `backend/prisma/seed.ts` : réglages de DM §Valeurs par défaut (`voiceMaxSeconds` 180, `voiceMaxBytes` 5 Mo, `attachmentMaxBytes` 10 Mo, `attachmentMaxPerMessage` 5, `allowedPhotoTypes` image/jpeg, image/png, image/webp, `allowedDocumentTypes` application/pdf, `draftsEnabled` vrai, `deadlineWarnPercent` 20, `sessionIdleMinutes` 60, `sessionMaxHours` 12) ; permissions par défaut par rôle ; catégorie « Photocopies » (circuit A, clôture `AUTO` après 1 440 min, photo non obligatoire, délais par défaut, Urgente : prise en charge 1 min, réalisation 5 min) ; une catégorie de démonstration en circuit B avec validation finale et photo obligatoire ; comptes `superadmin`, `responsable`, `enseignante`, `reprographie` avec mots de passe provisoires affichés et `mustChangePassword` vrai

### Socle frontend

- [X] T025 [P] Créer `frontend/src/app/theme.ts` (thème MUI aux contrastes AA vérifiés, focus visible, cibles tactiles ≥ 44 px, locale française) et `frontend/src/app/providers.tsx` (QueryClient, ThemeProvider, CssBaseline, Router)
- [X] T026 [P] Créer `frontend/src/api/client.ts` : `fetch` avec `credentials: 'same-origin'`, analyse du format d'erreur `{ error: { code, message, details } }` en `ApiError`, mesure du décalage d'horloge depuis `X-Server-Time` et export `serverNow()` ; ajouter le script `npm run -w frontend api:types` (openapi-typescript depuis `/api/docs-json` vers `frontend/src/api/schema.d.ts`) ; test `frontend/tests/api/client.test.ts` écrit d'abord
- [X] T027 [P] Créer les composants d'état partagés `frontend/src/components/LoadingState.tsx`, `EmptyState.tsx`, `ErrorState.tsx` (message + action corrective), `StatusChip.tsx` (libellés français des 11 statuts, couleur + texte, jamais la couleur seule) et `PriorityChip.tsx` (Urgente : icône + texte) ; tests `frontend/tests/components/chips.test.tsx` écrits d'abord
- [X] T028 Créer `frontend/src/features/auth/LoginPage.tsx`, `ChangePasswordPage.tsx`, `RequireAuth.tsx` (redirection vers connexion sur `401`, vers changement de mot de passe sur `PASSWORD_CHANGE_REQUIRED`) et `useCurrentUser.ts` ; tests `frontend/tests/auth/login.test.tsx` écrits d'abord
- [X] T029 Créer `frontend/src/app/AppLayout.tsx` et `frontend/src/app/routes.tsx` : barre supérieure et navigation responsive (tiroir sous 600 px), lien d'évitement « Aller au contenu », routes protégées, sans défilement horizontal à 320 px
- [X] T030 Écrire `e2e/auth.spec.ts` : connexion, changement de mot de passe imposé, déconnexion, contrôle axe des pages de connexion et de changement de mot de passe à 320 px

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Créer et envoyer une demande vocale (Priority: P1) 🎯 MVP

**Goal**: un employé crée une demande (titre, catégorie, destinataire de la catégorie, priorité, vocal et/ou description) et l'envoie ; le destinataire la retrouve et écoute le vocal.

**Independent Test**: `enseignante` crée une demande « Photocopies » vocale pour `reprographie` ; `reprographie` la voit dans « Reçues » et lit le vocal sur Chromium, WebKit et Firefox (V1–V4).

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T031 [P] [US1] Ajouter des fixtures audio (`sample.webm` Opus, `sample.mp4` AAC, `sample.ogg` Opus, `silence-0.5s.webm`, `not-audio.webm` = PNG renommé, `too-long.webm` = `voiceMaxSeconds` + 5 s) dans `backend/test/fixtures/audio/` et écrire `backend/test/unit/voice-processing.spec.ts` : chaque format valide produit un fichier `audio/mp4` AAC mono lisible par ffprobe ; durée < 1 s → `VOICE_TOO_SHORT` ; durée > `voiceMaxSeconds` + 2 s → `VOICE_TOO_LONG` ; fichier non audio → `FILE_TYPE_NOT_ALLOWED`
- [X] T032 [P] [US1] Écrire `backend/test/integration/files-voice.spec.ts` : `POST /api/files` `kind=VOICE` → `201 { id, kind, mimeType: "audio/mp4", sizeBytes, durationSeconds }` ; au-delà de `voiceMaxBytes` → `413 FILE_TOO_LARGE` ; `GET /api/files/:id` par l'auteur d'un fichier provisoire → `200` avec `nosniff` et `Cache-Control: private, no-store` ; en-tête `Range: bytes=0-99` → `206` ; sans cookie → `401` ; autre utilisateur → `404` et audit `ACCESS_DENIED` ; le chemin de stockage n'apparaît dans aucune réponse
- [X] T033 [P] [US1] Écrire `backend/test/integration/requests-create.spec.ts` : création circuit A → `201`, statut `SENT`, `assigneeId` = destinataire, `reference` au format `D-AAAA-NNNNNN`, `rulesSnapshot` copié, `submittedAt`/`assignedAt` renseignés, `RequestEvent` `CREATED` et `STATUS_CHANGED`, notification `REQUEST_NEW` (ou `URGENT`) pour le destinataire ; destinataire hors `CategoryRecipient` ou inactif → `422 RECIPIENT_NOT_ALLOWED` et rien n'est créé (V2) ; ni vocal ni description → `422 CONTENT_REQUIRED` ; titre vide ou > 120 caractères → `400` ; même `clientId` renvoyé → `200` et une seule demande (V3) ; `asDraft: true` → `DRAFT`, modifiable par `PATCH` et supprimable par `DELETE` par son auteur seulement ; catégorie hors `creatorRoles` → `403` ; `GET /api/categories` et `GET /api/categories/:id/recipients` ne listent que les catégories et destinataires autorisés ; `GET /api/requests?scope=assigned` du destinataire contient la demande ; `GET /api/requests/:id` par un tiers → `404`
- [X] T034 [P] [US1] Écrire `frontend/tests/voice/recorder-format.test.ts` et `frontend/tests/voice/VoiceRecorder.test.tsx` : ordre de choix `audio/webm;codecs=opus` puis `audio/mp4` puis `audio/ogg;codecs=opus` ; enregistrer → réécouter → « Refaire » remplace l'enregistrement ; avertissement à 80 % de `voiceMaxSeconds` et arrêt automatique à 100 % ; envoi bloqué sous 1 s ; permission refusée ou `MediaRecorder` absent → message explicatif et bascule vers la description écrite ; boutons utilisables au clavier avec libellés accessibles
- [X] T035 [P] [US1] Écrire `frontend/tests/requests/CreateRequestPage.test.tsx` : la catégorie se choisit avant le destinataire et seule la liste de la catégorie est proposée ; chaque champ manquant est signalé (titre, catégorie, destinataire, priorité, contenu) ; erreur réseau → contenu placé dans la boîte d'envoi avec bouton « Réessayer »
- [X] T036 [P] [US1] Écrire `e2e/us1-create-voice-request.spec.ts` couvrant V1 (création vocale sur profils iPhone 13 — enregistrement simulé par `fake-media-recorder.ts` — et Pixel 7, lecture réelle par le destinataire sur chromium, webkit et firefox), V3 (`context.setOffline(true)` pendant l'envoi puis relance, une seule demande créée) et V4 (permission micro refusée → description écrite), avec contrôle axe des écrans de création, de liste et de détail

### Implementation for User Story 1

- [X] T037 [P] [US1] Implémenter `backend/src/files/file-storage.service.ts` : écriture sous `FILES_DIR/{aaaa}/{mm}/{uuid}` (sans extension), lecture du chemin, suppression ; aucun chemin exposé
- [X] T038 [P] [US1] Implémenter `backend/src/files/voice-processing.ts` (R2) : ffprobe (flux audio présent, durée), refus `VOICE_TOO_SHORT` < 1 s et `VOICE_TOO_LONG` > `voiceMaxSeconds` + 2 s, conversion ffmpeg `-ac 1 -c:a aac -b:a 64k -movflags +faststart` vers `audio/mp4`, suppression du fichier d'origine après succès, nettoyage des fichiers temporaires en cas d'erreur ; faire passer T031
- [X] T039 [US1] Implémenter `backend/src/files/files.controller.ts`, `files.service.ts` et `files.module.ts` : `POST /api/files` (Multer, limite selon `kind`, type réel par `file-type`, `kind=VOICE` → T038 ; fichier provisoire si `requestId` absent), `GET /api/files/:id` (contrôle `canReadRequest` sur la demande parente ou auteur du fichier provisoire, `res.sendFile` pour Range/ETag, `Content-Type` stocké, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `Content-Disposition` `inline` pour audio/image sinon `attachment`, refus → `404` + audit `ACCESS_DENIED`) ; faire passer T032
- [X] T040 [P] [US1] Implémenter `backend/src/categories/categories.controller.ts`, `categories.service.ts`, `categories.module.ts` : `GET /api/categories` (actives où l'utilisateur peut créer : `{ id, name, circuit, photoRequired }`) et `GET /api/categories/:id/recipients` (circuit A : destinataires actifs `{ id, displayName, jobTitle }` ; circuit B : `[]`)
- [X] T041 [US1] Implémenter la création dans `backend/src/requests/requests.service.ts` : vérification `canCreateInCategory` et `canPickRecipient` côté serveur (`422 RECIPIENT_NOT_ALLOWED`), `CONTENT_REQUIRED`, idempotence par `(requesterId, clientId)`, génération de `reference` `D-AAAA-NNNNNN` (séquence PostgreSQL), copie de `rulesSnapshot` (circuit, closureMode, autoCloseAfterMinutes, finalValidation, assignmentMode, photoRequired, durées de `DeadlineRule` pour la priorité), brouillon si `asDraft` et `draftsEnabled`, sinon transition T1 (circuit A) ou T2 (circuit B) via `applyAction`, rattachement du fichier vocal provisoire, `RequestEvent`, notifications, le tout dans une transaction
- [X] T042 [US1] Implémenter `backend/src/requests/requests.controller.ts` et `requests.module.ts` : `POST /api/requests`, `GET /api/requests` (filtre de visibilité T017, `scope` `mine`/`assigned`/`managed`/`all`, `status[]`, pagination), `GET /api/requests/:id` (`RequestDetail` avec `allowedActions`), `PATCH /api/requests/:id` et `DELETE /api/requests/:id` (brouillon, auteur seul, T19) ; DTO conformes à REST §Demandes ; faire passer T033
- [X] T043 [P] [US1] Implémenter `frontend/src/features/voice/recorderFormat.ts`, `useVoiceRecorder.ts` (états `idle`, `recording`, `recorded`, `denied`, `unsupported` ; minuterie ; arrêt automatique), `VoiceRecorder.tsx` (Enregistrer/Arrêter, Écouter, Refaire, Supprimer, durée annoncée en `aria-live`) et `VoicePlayer.tsx` (élément `<audio>` natif avec contrôles MUI accessibles : lecture/pause, curseur clavier, durée) ; faire passer T034
- [X] T044 [P] [US1] Implémenter `frontend/src/features/outbox/outbox.ts` (stockage idb-keyval des envois échoués : champs, Blob audio, `clientId`) et `frontend/src/features/outbox/OutboxPanel.tsx` (liste, « Réessayer », « Abandonner ») ; relance qui renvoie le même `clientId`
- [X] T045 [US1] Implémenter `frontend/src/features/requests/CreateRequestPage.tsx` et `frontend/src/features/requests/api.ts` (hooks TanStack Query) : ordre catégorie → destinataire → priorité → titre → vocal/description ; téléversement du vocal puis création avec `clientId` ; erreurs par champ ; échec réseau → boîte d'envoi ; utilisable à 320 px ; faire passer T035
- [X] T046 [US1] Implémenter `frontend/src/features/requests/RequestListPage.tsx` (onglets « Reçues » et « Envoyées », cartes avec `StatusChip`, `PriorityChip`, état vide) et `frontend/src/features/requests/RequestDetailPage.tsx` (titre, catégorie, priorité, statut, horodatages, `VoicePlayer`, description) ; brancher les routes dans `frontend/src/app/routes.tsx` ; faire passer T036

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Traiter une demande en circuit direct (Priority: P1)

**Goal**: l'employé affecté accepte, démarre, termine (photo si exigée) ou refuse avec motif ; la demandeuse clôture, renvoie « À corriger » avec commentaire, ou annule tant que la demande n'est pas acceptée ; clôture automatique différée.

**Independent Test**: à partir d'une demande « Envoyée », `reprographie` la mène à « Terminée » ; `enseignante` la renvoie « À corriger » puis elle est clôturée (V5–V9).

### Tests for User Story 2 ⚠️

- [X] T047 [P] [US2] Ajouter les fixtures `backend/test/fixtures/images/` (`gps.jpg` avec EXIF GPS et orientation 6, `photo.png`, `photo.webp`, `photo.heic`, `exe-renamed.jpg`) et écrire `backend/test/unit/photo-processing.spec.ts` : sortie `image/jpeg` qualité 85, côté long ≤ 2560 px, orientation appliquée, aucune métadonnée EXIF restante (dont GPS) ; HEIC et exécutable renommé → `FILE_TYPE_NOT_ALLOWED`
- [X] T048 [P] [US2] Écrire `backend/test/integration/requests-actions-circuit-a.spec.ts` : `ACCEPT`, `START`, `COMPLETE` par l'affecté avec horodatages `acceptedAt`, `startedAt`, `doneAt` ; `COMPLETE` sans photo quand `photoRequired` → `422 PHOTO_REQUIRED`, avec `proofFileIds` → `DONE` et `isCompletionProof` vrai ; `DECLINE` sans motif → `422 REASON_REQUIRED`, avec motif → `REJECTED`, `rejectionReason` stocké, notification `REJECTED` ; `CANCEL` par le demandeur depuis `SENT` → `CANCELLED`, depuis `ACCEPTED` → `409 INVALID_TRANSITION` ; `REQUEST_CORRECTION` sans commentaire → `422`, avec → `TO_CORRECT` et notification `TO_CORRECT` ; `RESUME` → `IN_PROGRESS` ; `CLOSE` selon `closureMode` `REQUESTER`/`MANAGER` ; `closureMode AUTO` → `autoCloseAt` = `doneAt` + `autoCloseAfterMinutes` et annulé par `REQUEST_CORRECTION` ; action par un tiers → `403` ou `404` + audit `ACCESS_DENIED` ; deux `ACCEPT` simultanés avec la même `version` → un `200` et un `409 STATE_CHANGED` (V9) ; action sur `CLOSED`/`REJECTED`/`CANCELLED` → `409`
- [X] T049 [P] [US2] Écrire `backend/test/integration/auto-close-job.spec.ts` : une demande `DONE` dont `autoCloseAt` est dépassé passe `CLOSED` avec acteur `SYSTEM` et `closedAt` ; une demande renvoyée `TO_CORRECT` n'est pas clôturée ; exécution répétée sans double événement
- [X] T050 [P] [US2] Écrire `frontend/tests/requests/RequestActions.test.tsx` : seuls les boutons de `allowedActions` sont affichés avec des libellés en langage courant ; `DECLINE`, `REJECT`, `REQUEST_CORRECTION` ouvrent une boîte de dialogue dont le motif est obligatoire ; `COMPLETE` avec photo exigée impose une photo ; réponse `409 STATE_CHANGED` → message « La demande a été modifiée entre-temps » et rechargement
- [X] T051 [P] [US2] Écrire `e2e/us2-process-request.spec.ts` couvrant V5, V6 (photo prise via `setInputFiles` sur le champ `capture`), V7, V8 et V9, avec contrôle axe du détail et des boîtes de dialogue

### Implementation for User Story 2

- [X] T052 [P] [US2] Implémenter `backend/src/files/photo-processing.ts` avec sharp (`rotate()`, suppression des métadonnées, JPEG qualité 85, redimensionnement côté long ≤ 2560 px, refus des types hors `allowedPhotoTypes`) et accepter `kind=PHOTO` dans `backend/src/files/files.service.ts` ; faire passer T047
- [X] T053 [US2] Implémenter `applyTransition(requestId, action, actor, { version, reason, assigneeId, proofFileIds })` dans `backend/src/requests/requests.service.ts` : appel de `applyAction`, mise à jour conditionnelle `updateMany({ where: { id, status: from, version } })` (0 ligne → `409 STATE_CHANGED`), `version + 1`, horodatage de l'étape, `rejectionReason`, rattachement des photos de preuve, transitions automatiques T11/T12 (fixe `autoCloseAt`), message `SYSTEM` portant le motif ou le commentaire, `RequestEvent` `STATUS_CHANGED`, notifications selon RT §Qui est notifié, audit `ACCESS_DENIED` sur refus d'autorisation, le tout en une transaction
- [X] T054 [US2] Ajouter `POST /api/requests/:id/actions` dans `backend/src/requests/requests.controller.ts` (DTO `{ action, version, reason?, assigneeId?, proofFileIds? }`, `reason` ≤ 1 000 caractères) ; faire passer T048
- [X] T055 [US2] Implémenter `backend/src/scheduler/scheduler.module.ts` et `backend/src/scheduler/auto-close.job.ts` (`@Interval(15_000)` : clôture des demandes `DONE` dont `autoCloseAt` ≤ maintenant, via `applyTransition` avec l'acteur `SYSTEM`) ; faire passer T049
- [X] T056 [P] [US2] Implémenter `frontend/src/features/thread/PhotoCapture.tsx` : bouton « Prendre une photo » (`<input type="file" accept="image/*" capture="environment">`) et bouton « Choisir dans la galerie » (sans `capture`), aperçu, téléversement `kind=PHOTO`, messages d'erreur de format et de taille
- [X] T057 [US2] Implémenter `frontend/src/features/requests/RequestActions.tsx` et `frontend/src/features/requests/ReasonDialog.tsx` (motif ou commentaire obligatoire, focus géré) : un bouton par action de `allowedActions`, `PhotoCapture` pour `COMPLETE` si `photoRequired`, envoi de `version`, gestion de `STATE_CHANGED` ; intégrer dans `RequestDetailPage.tsx` ; faire passer T050 et T051

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Échanger dans le fil de la demande (Priority: P2)

**Goal**: fil par demande avec messages texte et vocaux, photos et fichiers autorisés, accessible aux seuls participants autorisés.

**Independent Test**: sur une demande existante, deux participants échangent un texte, un vocal et une photo ; un non-participant ne peut rien lire (V10, V11).

### Tests for User Story 3 ⚠️

- [X] T058 [P] [US3] Ajouter `backend/test/fixtures/docs/sample.pdf` et `big.pdf` (> 10 Mo) et écrire `backend/test/unit/document-validation.spec.ts` : PDF accepté ; type hors `allowedDocumentTypes` ou exécutable renommé → `FILE_TYPE_NOT_ALLOWED` ; nom d'origine nettoyé et tronqué à 255 caractères
- [X] T059 [P] [US3] Écrire `backend/test/integration/messages.spec.ts` : `POST /api/requests/:id/messages` texte (≤ 4 000 caractères), vocal (`voiceFileId`) et pièces jointes (≤ `attachmentMaxPerMessage` = 5) → `201` avec auteur et `createdAt` ; idempotence par `clientId` ; statut final → `403` ; `RequestEvent` `MESSAGE_ADDED` et `FILE_ADDED` ; notification `MESSAGE_NEW` aux autres participants seulement ; `GET` des messages et `GET /api/files/:id` d'une pièce jointe par un non-participant → `404` + audit `ACCESS_DENIED` (V10) ; aucune route de modification ni de suppression de message (FR-012) ; PDF de 20 Mo → `413` (V11)
- [X] T060 [P] [US3] Écrire `frontend/tests/thread/ThreadPanel.test.tsx` : messages avec auteur et date/heure, messages `SYSTEM` distingués, composeur texte/vocal/photo/fichier, erreurs de format et de taille affichées, envoi échoué placé dans la boîte d'envoi
- [X] T061 [P] [US3] Écrire `e2e/us3-thread.spec.ts` couvrant V10 et V11 avec contrôle axe du fil

### Implementation for User Story 3

- [X] T062 [P] [US3] Accepter `kind=DOCUMENT` dans `backend/src/files/files.service.ts` (octets magiques, `allowedDocumentTypes`, `attachmentMaxBytes`, nom nettoyé) ; faire passer T058
- [X] T063 [US3] Implémenter `backend/src/messages/messages.service.ts`, `messages.controller.ts`, `messages.module.ts` : `GET` et `POST /api/requests/:id/messages` (REST §Fil de discussion), contrôle `canWriteInThread`, rattachement des fichiers provisoires à la demande et au message, `RequestEvent`, notifications `MESSAGE_NEW`, en une transaction ; faire passer T059
- [X] T064 [P] [US3] Implémenter `frontend/src/features/thread/AttachmentList.tsx` (miniatures d'images avec texte alternatif, lien de téléchargement pour les documents, `VoicePlayer` pour les vocaux)
- [X] T065 [US3] Implémenter `frontend/src/features/thread/MessageComposer.tsx` (texte, `VoiceRecorder`, `PhotoCapture`, sélection de fichier, `clientId`, boîte d'envoi en cas d'échec) et `frontend/src/features/thread/ThreadPanel.tsx` (liste paginée, chargement des anciens messages) ; intégrer dans `RequestDetailPage.tsx` ; faire passer T060 et T061

**Checkpoint**: User Stories 1–3 fonctionnent indépendamment

---

## Phase 6: User Story 4 - Recevoir les notifications en temps réel (Priority: P2)

**Goal**: notifications dans l'application, sans rechargement, persistées et récupérées à la reconnexion ; urgences visuellement distinctes. Ni push, ni e-mail, ni service worker.

**Independent Test**: un utilisateur garde l'application ouverte ; un autre lui envoie une demande urgente ; la notification apparaît en moins de 5 s (V12).

### Tests for User Story 4 ⚠️

- [ ] T066 [P] [US4] Écrire `backend/test/integration/realtime.spec.ts` (socket.io-client) : poignée de main sans cookie ou avec `Origin` étranger → `connect_error` `UNAUTHENTICATED` et entrée d'audit `ACCESS_DENIED` (`details.reason`, `channel = "socket"`, IP) ; un socket ne reçoit que les événements de sa salle `user:{id}` ; `notification:new`, `request:updated`, `message:new` émis après validation de la transaction (aucun émis si la transaction échoue) ; charge utile limitée aux identifiants et métadonnées de RT ; déconnexion ou désactivation du compte → `session:ended` puis fermeture ; latence d'émission < 1 s en local
- [ ] T067 [P] [US4] Écrire `backend/test/integration/notifications.spec.ts` : `GET /api/notifications?unread=true` ne renvoie que celles de l'utilisateur, avec `unreadTotal` ; `POST /api/notifications/read` `{ ids }` et `{ all: true }` → `204`
- [ ] T068 [P] [US4] Écrire `frontend/tests/notifications/NotificationCenter.test.tsx` : badge du nombre de non lues, annonce `aria-live="polite"` (et `assertive` pour une urgence), style urgent avec icône et texte, rattrapage des non lues à la reconnexion, invalidation des requêtes de la demande concernée
- [ ] T069 [P] [US4] Écrire `e2e/us4-notifications.spec.ts` (V12) : deux contextes de navigation, demande urgente envoyée, notification visible en < 5 s sans rechargement ; fermeture puis réouverture → notification non lue présente

### Implementation for User Story 4

- [ ] T070 [US4] Implémenter `backend/src/notifications/notifications.gateway.ts` (authentification par cookie `sid` et contrôle d'`Origin` à la poignée de main, chaque poignée de main refusée journalisée en `ACCESS_DENIED` avec `details.reason` et `channel = "socket"`, salle `user:{userId}` uniquement, aucun événement client accepté, fermeture sur fin de session) et `SocketNotificationPublisher` dans `backend/src/notifications/socket-notification.publisher.ts` remplaçant `NoopNotificationPublisher` ; émettre `request:updated` et `message:new` depuis `requests.service.ts` et `messages.service.ts` après validation ; faire passer T066
- [ ] T071 [US4] Implémenter `backend/src/notifications/notifications.controller.ts` (`GET /api/notifications`, `POST /api/notifications/read`) ; faire passer T067
- [ ] T072 [P] [US4] Implémenter `frontend/src/features/notifications/SocketProvider.tsx` : connexion Socket.IO, à chaque `connect` relecture des non lues et invalidation du cache, invalidation ciblée sur `request:updated`/`message:new`, retour à la connexion sur `session:ended`
- [ ] T073 [US4] Implémenter `frontend/src/features/notifications/NotificationCenter.tsx` et `NotificationBadge.tsx` (menu des notifications, marquer comme lu, lien vers la demande, région `aria-live`, alerte visuelle distincte pour `URGENT`) ; intégrer dans `AppLayout.tsx` ; faire passer T068 et T069

**Checkpoint**: User Stories 1–4 fonctionnent indépendamment

---

## Phase 7: User Story 5 - Circuit avec validation administrative (Priority: P2)

**Goal**: pour les catégories en circuit B, approbation ou refus motivé par un responsable, affectation manuelle ou automatique, validation finale optionnelle.

**Independent Test**: demande en circuit B soumise, refusée avec motif ; nouvelle demande approuvée et affectée, réalisée, validée (V13).

### Tests for User Story 5 ⚠️

- [ ] T074 [P] [US5] Écrire `backend/test/integration/requests-circuit-b.spec.ts` : soumission → `PENDING_ADMIN_VALIDATION`, invisible pour les destinataires de la catégorie et visible des responsables (`scope=managed`) ; `REJECT` sans motif → `422`, avec motif → `REJECTED` et notification `REJECTED` au demandeur ; `APPROVE` sans `assigneeId` en affectation `MANUAL` → `422`, avec un affecté hors `CategoryRecipient` → `422 RECIPIENT_NOT_ALLOWED`, valide → `SENT`, `approvedAt`/`assignedAt`, notification `ASSIGNED` ; affectation `AUTO` → `autoAssigneeId` sans saisie ; `CANCEL` par le demandeur en attente de validation → `CANCELLED` ; validation finale : `COMPLETE` → `PENDING_FINAL_VALIDATION` (T11), `VALIDATE_FINAL` → `CLOSED`, `REQUEST_CORRECTION` par le responsable → `TO_CORRECT` ; un employé non responsable ne peut ni approuver ni valider (`403` + audit)
- [ ] T075 [P] [US5] Écrire `frontend/tests/requests/ApprovalPanel.test.tsx` : liste « À valider », approbation avec choix de l'affecté parmi les destinataires de la catégorie (masqué en affectation automatique), refus avec motif obligatoire, actions de validation finale
- [ ] T076 [P] [US5] Écrire `e2e/us5-admin-validation.spec.ts` couvrant V13 avec contrôle axe

### Implementation for User Story 5

- [ ] T077 [US5] Compléter `backend/src/requests/requests.service.ts` pour `APPROVE` (affecté manuel vérifié par `canPickRecipient`, ou `autoAssigneeId`), `REJECT`, `VALIDATE_FINAL` et `REQUEST_CORRECTION` par un responsable, avec notifications aux responsables à la soumission (RT §Qui est notifié) et `scope=managed` dans `GET /api/requests` ; faire passer T074
- [ ] T078 [US5] Implémenter `frontend/src/features/requests/ApprovalPanel.tsx` (approuver avec choix de l'affecté, refuser avec `ReasonDialog`) et l'onglet « À valider » dans `RequestListPage.tsx` pour les responsables ; actions de validation finale via `RequestActions.tsx` ; faire passer T075 et T076

**Checkpoint**: User Stories 1–5 fonctionnent indépendamment

---

## Phase 8: User Story 6 - Suivre les délais et les retards (Priority: P3)

**Goal**: temps restant par étape, signalement « proche de l'échéance » et « En retard (étape) », notification des responsables, réaffectation manuelle, aucune suppression automatique.

**Independent Test**: règle Urgente à 1 min de prise en charge ; demande envoyée non acceptée → compte à rebours, alerte, puis « En retard (prise en charge) » en < 30 s après l'échéance (V14).

### Tests for User Story 6 ⚠️

- [ ] T079 [P] [US6] Écrire `backend/test/unit/deadlines.spec.ts` selon DM §Délais : VALIDATION démarre à T2 et s'arrête à T3/T4/T5 ; TAKEOVER démarre à T1/T3/T18 et s'arrête à T6/T7/T8/T18 ; COMPLETION démarre à T6/T17 et s'arrête à T10/T18 ; durée `null` → étape non suivie ; `warnAt = currentDueAt − durée × deadlineWarnPercent / 100` ; fin d'étape → `overdueStage := null` ; durées lues dans `rulesSnapshot` et non dans la configuration courante
- [ ] T080 [P] [US6] Écrire `backend/test/integration/overdue-job.spec.ts` : demande dont `currentDueAt` est passé → `overdueStage` = étape courante, un seul `RequestEvent` `OVERDUE` même après plusieurs exécutions, notifications `OVERDUE` aux responsables de la catégorie et à l'affecté ; rattrapage des échéances passées pendant un arrêt ; aucune demande supprimée ni masquée ; marquage en < 30 s après l'échéance (SC-006)
- [ ] T081 [P] [US6] Écrire `backend/test/integration/reassign.spec.ts` : `REASSIGN` par un responsable avec `REQUEST_REASSIGN` depuis `SENT`, `ACCEPTED`, `IN_PROGRESS`, `TO_CORRECT` → `SENT` pour le nouvel affecté (doit appartenir à `CategoryRecipient`), nouveau délai de prise en charge, `RequestEvent` `REASSIGNED`, ancien affecté sans accès (`404`) ; refusé pour un employé
- [ ] T082 [P] [US6] Écrire `frontend/tests/components/Countdown.test.tsx` : temps restant calculé avec `serverNow()`, état « proche de l'échéance » à partir de `warnAt`, état « En retard (validation | prise en charge | réalisation) », texte lisible par les lecteurs d'écran sans annonce à chaque seconde
- [ ] T083 [P] [US6] Écrire `e2e/us6-deadlines.spec.ts` couvrant V14

### Implementation for User Story 6

- [ ] T084 [US6] Implémenter `backend/src/requests/domain/deadlines.ts` (fonctions pures de démarrage et d'arrêt d'étape à partir de la transition et de `rulesSnapshot`) ; faire passer T079
- [ ] T085 [US6] Brancher `deadlines.ts` dans `applyTransition` et la création de `backend/src/requests/requests.service.ts` (mise à jour de `currentStage`, `currentDueAt`, `warnAt`, `overdueStage`) et ajouter l'action `REASSIGN` (T18) ; faire passer T081
- [ ] T086 [US6] Implémenter `backend/src/scheduler/overdue.job.ts` (`@Interval(15_000)` : `UPDATE … WHERE "currentDueAt" < now() AND "overdueStage" IS DISTINCT FROM "currentStage" RETURNING …`, puis `RequestEvent` `OVERDUE` et notifications, R4) et l'enregistrer dans `scheduler.module.ts` ; faire passer T080
- [ ] T087 [P] [US6] Implémenter `frontend/src/components/Countdown.tsx` et les indicateurs de retard dans `RequestListPage.tsx` et `RequestDetailPage.tsx` ; faire passer T082
- [ ] T088 [US6] Implémenter `frontend/src/features/requests/ReassignDialog.tsx` (choix parmi les destinataires de la catégorie) accessible depuis `RequestActions.tsx` ; faire passer T083

**Checkpoint**: User Stories 1–6 fonctionnent indépendamment

---

## Phase 9: User Story 7 - Consulter l'historique, rechercher et filtrer (Priority: P3)

**Goal**: recherche par titre et filtres combinés (statut, priorité, catégorie, destinataire, période, retard), historique complet par demande, changement de priorité tracé.

**Independent Test**: sur un jeu varié, filtres combinés ne renvoyant que les demandes autorisées ; historique complet d'une demande traitée (V15).

### Tests for User Story 7 ⚠️

- [ ] T089 [P] [US7] Écrire `backend/test/integration/requests-search.spec.ts` : filtres `status[]`, `priority[]`, `categoryId[]`, `assigneeId`, `requesterId`, `from`, `to`, `overdue`, `q` (ILIKE sur le titre) combinés ; aucune demande non autorisée dans les résultats ni dans les totaux ; pagination par curseur stable
- [ ] T090 [P] [US7] Écrire `backend/test/integration/history-priority.spec.ts` : `GET /api/requests/:id/history` liste chronologiquement tous les `RequestEvent` avec nom de l'acteur ou « Système » ; `PATCH /api/requests/:id/priority` par le demandeur avec `PRIORITY_CHANGE_OWN` en `DRAFT`/`PENDING_ADMIN_VALIDATION`/`SENT` → `200` et événement `PRIORITY_CHANGED` (avant/après) ; après acceptation → `403` ; par un responsable avec `PRIORITY_CHANGE_MANAGED` tant que non final et non `DONE` → `200` ; échéances en cours non recalculées
- [ ] T091 [P] [US7] Écrire `backend/test/integration/search-performance.spec.ts` : avec 10 000 demandes générées par `backend/prisma/seed-volume.ts`, une recherche filtrée combinée répond en < 2 s (SC-009)
- [ ] T092 [P] [US7] Écrire `frontend/tests/requests/RequestFilters.test.tsx` et `frontend/tests/requests/HistoryTimeline.test.tsx` : filtres synchronisés avec l'URL, réinitialisation, état vide ; historique lisible (auteur, action en français, date et heure, avant → après)
- [ ] T093 [P] [US7] Écrire `e2e/us7-search-history.spec.ts` couvrant V15

### Implementation for User Story 7

- [ ] T094 [P] [US7] Écrire `backend/prisma/seed-volume.ts` (10 000 demandes réparties sur catégories, statuts, priorités et 24 mois)
- [ ] T095 [US7] Compléter les filtres de `GET /api/requests` dans `backend/src/requests/requests.controller.ts` et `requests.service.ts` (REST §Demandes) ; faire passer T089 et T091
- [ ] T096 [US7] Ajouter `GET /api/requests/:id/history` et `PATCH /api/requests/:id/priority` dans `backend/src/requests/requests.controller.ts` et `requests.service.ts` ; faire passer T090
- [ ] T097 [P] [US7] Implémenter `frontend/src/features/requests/RequestFilters.tsx` (filtres repliables sur mobile, paramètres d'URL) et l'intégrer dans `RequestListPage.tsx`
- [ ] T098 [US7] Implémenter `frontend/src/features/requests/HistoryTimeline.tsx` et `PriorityDialog.tsx` et les intégrer dans `RequestDetailPage.tsx` ; faire passer T092 et T093

**Checkpoint**: User Stories 1–7 fonctionnent indépendamment

---

## Phase 10: User Story 8 - Administrer comptes, rôles et paramètres (Priority: P3)

**Goal**: le super administrateur gère comptes, permissions par rôle, catégories (circuit, destinataires, responsables, modes, photo), délais et réglages, et consulte le journal d'audit.

**Independent Test**: création d'un compte, d'une catégorie circuit B avec photo obligatoire et modification d'un délai, appliquées aux nouvelles demandes seulement ; un responsable ne peut pas accéder à l'administration (V16).

### Tests for User Story 8 ⚠️

- [ ] T099 [P] [US8] Écrire `backend/test/integration/admin-users.spec.ts` : création (mot de passe provisoire renvoyé une seule fois, `mustChangePassword` vrai), modification du rôle, désactivation (sessions supprimées, sockets fermés), réinitialisation du mot de passe, `username` dupliqué à la casse près → `409` ; audit `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `PASSWORD_RESET` ; toute route `/api/admin/*` par un non super admin → `403` + audit `ACCESS_DENIED`
- [ ] T100 [P] [US8] Écrire `backend/test/integration/admin-categories.spec.ts` : création et modification de catégorie (`name` unique 1–60 caractères ; `autoAssigneeId` obligatoire si `assignmentMode = AUTO` ; `finalValidation` et `assignmentMode` ignorés ou refusés en circuit A), `PUT` destinataires et responsables (responsables de rôle `MANAGER` ou `SUPER_ADMIN` uniquement), règles de délai (entiers > 0 ou `null`), permissions par rôle, réglages (valeurs typées) ; chaque écriture produit un `AuditLog` avant/après ; une demande créée avant la modification garde son `rulesSnapshot` (FR-022)
- [ ] T101 [P] [US8] Écrire `backend/test/integration/admin-audit.spec.ts` : `GET /api/admin/audit` filtré par `actorId`, `action`, période ; lecture seule ; aucune donnée sensible dans `details`
- [ ] T102 [P] [US8] Écrire `frontend/tests/admin/admin-pages.test.tsx` (formulaires validés, mot de passe provisoire affiché une seule fois avec bouton copier, confirmation avant désactivation) et `e2e/us8-admin.spec.ts` couvrant V16 avec contrôle axe

### Implementation for User Story 8

- [ ] T103 [US8] Implémenter `backend/src/users/admin-users.controller.ts`, `users.service.ts`, `users.module.ts` (REST §Administration : utilisateurs et réinitialisation) avec garde `SuperAdminGuard` dans `backend/src/common/super-admin.guard.ts` ; faire passer T099
- [ ] T104 [US8] Implémenter `backend/src/categories/admin-categories.controller.ts` (catégories, destinataires, responsables, délais) et `backend/src/settings/admin-settings.controller.ts` (réglages, permissions par rôle) avec audit avant/après ; faire passer T100
- [ ] T105 [US8] Implémenter `backend/src/audit/admin-audit.controller.ts` (`GET /api/admin/audit`, pagination, filtres) ; faire passer T101
- [ ] T106 [P] [US8] Implémenter `frontend/src/features/admin/UsersAdminPage.tsx` et `UserFormDialog.tsx`
- [ ] T107 [P] [US8] Implémenter `frontend/src/features/admin/CategoriesAdminPage.tsx`, `CategoryFormDialog.tsx` (circuit, modes, photo, destinataires, responsables) et `DeadlineRulesTable.tsx` (4 priorités × 3 délais)
- [ ] T108 [P] [US8] Implémenter `frontend/src/features/admin/SettingsAdminPage.tsx` (réglages et permissions par rôle) et `AuditLogPage.tsx` (filtres, lecture seule)
- [ ] T109 [US8] Ajouter les routes `/admin/*` réservées au super administrateur dans `frontend/src/app/routes.tsx` et le menu d'administration dans `AppLayout.tsx` ; faire passer T102

**Checkpoint**: All user stories should now be independently functional

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T110 [P] Écrire `backend/test/integration/orphan-files-job.spec.ts` puis implémenter `backend/src/scheduler/orphan-files.job.ts` : suppression (disque et base) des fichiers provisoires non rattachés depuis plus de 24 h
- [ ] T111 [P] Écrire `e2e/a11y-responsive.spec.ts` (V18) : parcours de création, de traitement et du fil à 320 px, au clavier seul, sans défilement horizontal, contrôle axe sur chaque écran livré (liste, détail, création, notifications, administration)
- [ ] T112 [P] Créer `deploy/api.Dockerfile` (Node 24, ffmpeg installé, build multi-étapes, utilisateur non root, `prisma migrate deploy` au démarrage) et `deploy/web.Dockerfile` ou étape de build de la SPA copiée dans l'image Caddy
- [ ] T113 [P] Créer `deploy/docker-compose.yml` (services `caddy`, `api`, `db` sans port exposé, `backup` ; volumes `pgdata`, `files` monté uniquement dans `api`, `caddy_data`) et `deploy/.env.example`
- [ ] T114 [P] Créer `deploy/Caddyfile` : HTTPS automatique, HSTS, CSP stricte (`default-src 'self'`, `media-src 'self' blob:`, `img-src 'self' blob: data:`, `connect-src 'self' wss:`), `Permissions-Policy` autorisant `microphone=(self)` et `camera=(self)`, `request_body max_size` aligné sur `attachmentMaxBytes`, SPA avec repli sur `index.html`, proxy `/api/*` et `/socket.io/*`
- [ ] T115 [P] Créer `deploy/backup/backup.sh` (pg_dump compressé + archive du volume `files`, rotation 14 jours, copie hors VPS configurable) et `deploy/backup/restore.sh` ; documenter un test de restauration
- [ ] T116 [P] Vérifier la journalisation dans `backend/src/main.ts` : journaux JSON sur la sortie standard, sans mot de passe, jeton, cookie ni contenu de message (test `backend/test/unit/log-redaction.spec.ts`)
- [ ] T117 Écrire le `README.md` racine (présentation, liens vers `specs/001-demandes-travail-vocales/quickstart.md`, commandes principales, rappel des points ouverts et de la durée de conservation à fixer avant production)
- [ ] T118 [P] Écrire `e2e/sc001-create-timing.spec.ts` (SC-001) : sur les profils Pixel 7 et iPhone 13, mesurer le parcours complet de création d'une demande vocale (ouverture du formulaire, catégorie, destinataire, priorité, titre, enregistrement de 10 s, réécoute, envoi, confirmation « Envoyée ») et échouer s'il dépasse 60 s
- [ ] T119 Vérification manuelle sur un vrai iPhone (Safari iOS 17 ou plus récent, en HTTPS) : autorisation du micro, enregistrement, réécoute, refaire, envoi, lecture d'un vocal enregistré sur Chrome Android, prise de photo avec l'appareil et depuis la galerie ; consigner le modèle, la version d'iOS et le résultat dans `docs/validation/iphone-manuel.md`
- [ ] T120 Organiser une séance de test d'utilisabilité avec 5 employés non techniques (SC-002) : protocole (tâches : créer une demande vocale, la réécouter, l'envoyer ; traiter une demande avec photo), observation sans aide, mesure du taux de réussite et des durées ; consigner protocole et résultats dans `docs/validation/test-utilisabilite-lot1.md` (avec 5 participants, l'objectif de 90 % impose 5 réussites sur 5)
- [ ] T121 Exécuter `npm run verify` puis tous les scénarios V1–V18 de `specs/001-demandes-travail-vocales/quickstart.md` et consigner le résultat

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: aucune dépendance
- **Foundational (Phase 2)**: dépend de la phase 1 — BLOQUE toutes les user stories
- **User Stories (Phases 3–10)**: dépendent de la phase 2
- **Polish (Phase 11)**: après les user stories souhaitées (T112–T115 peuvent démarrer dès la phase 2)

### User Story Dependencies

- **US1 (P1)**: après la phase 2 ; aucune autre dépendance
- **US2 (P1)**: après la phase 2 ; s'appuie sur la création de demande de US1 (T041–T042) pour ses données de test et sur `RequestDetailPage.tsx` (T046)
- **US3 (P2)**: après US1 (fichiers T039, `VoiceRecorder` T043) ; utilise `PhotoCapture` de US2 (T056)
- **US4 (P2)**: après la phase 2 (`NotificationsService` T023) ; branche l'émission dans les services de US1/US2/US3 existants
- **US5 (P2)**: après US2 (`applyTransition` T053)
- **US6 (P3)**: après US2 (T053) ; modifie `requests.service.ts`
- **US7 (P3)**: après US1 (T042) ; l'historique est alimenté par toutes les stories
- **US8 (P3)**: après la phase 2 ; indépendante des autres (le seed fournit le paramétrage initial)

### Within Each User Story

- Les tests DOIVENT être écrits et échouer avant l'implémentation (principe I)
- Domaine pur → services → contrôleurs → interface
- Story terminée et validée avant la suivante en priorité

### Parallel Opportunities

- Phase 1 : T002–T009 en parallèle après T001
- Phase 2 : T013, T014, T016, T018, T019, T022, T023, T025, T026, T027 en parallèle ; T015 après T014 ; T017 après T016
- Dans chaque story, toutes les tâches de test [P] en parallèle
- Après la phase 2 : US1 et US8 en parallèle ; après US2 : US5 et US6 en parallèle (attention : fichier `requests.service.ts` commun, à fusionner prudemment) ; US4 en parallèle de US3
- Phase 11 : T110–T116 et T118 en parallèle ; T119 et T120 après la livraison en recette ; T121 en dernier

---

## Parallel Example: User Story 1

```bash
# Tests US1 (à écrire d'abord, ils doivent échouer) :
Task: "T031 voice-processing.spec.ts dans backend/test/unit/"
Task: "T032 files-voice.spec.ts dans backend/test/integration/"
Task: "T033 requests-create.spec.ts dans backend/test/integration/"
Task: "T034 VoiceRecorder.test.tsx dans frontend/tests/voice/"
Task: "T035 CreateRequestPage.test.tsx dans frontend/tests/requests/"
Task: "T036 us1-create-voice-request.spec.ts dans e2e/"

# Implémentation parallèle :
Task: "T037 file-storage.service.ts"
Task: "T038 voice-processing.ts"
Task: "T040 categories.controller.ts"
Task: "T043 VoiceRecorder et VoicePlayer"
Task: "T044 boîte d'envoi IndexedDB"
```

## Parallel Example: User Story 2

```bash
Task: "T047 photo-processing.spec.ts"
Task: "T048 requests-actions-circuit-a.spec.ts"
Task: "T049 auto-close-job.spec.ts"
Task: "T050 RequestActions.test.tsx"
Task: "T051 us2-process-request.spec.ts"
# puis
Task: "T052 photo-processing.ts"
Task: "T056 PhotoCapture.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Phase 1 : Setup
2. Phase 2 : Foundational (bloquante)
3. Phase 3 : US1 → **valider V1–V4**
4. Phase 4 : US2 → **valider V5–V9** : le scénario principal (photocopies) fonctionne de bout en bout
5. Déployer en recette (T112–T115) et faire tester par quelques employés (SC-002)

### Incremental Delivery

1. Setup + Foundational → socle prêt
2. US1 + US2 → MVP (demande vocale et traitement direct)
3. US3 (fil) et US4 (temps réel) → échanges et réactivité
4. US5 (circuit B) → catégories avec validation
5. US6 (délais), US7 (recherche, historique), US8 (administration dans l'interface)
6. Chaque incrément est testé indépendamment et n'altère pas les précédents

### Points ouverts à fixer avant la mise en production

- Durées de conservation provisoires (spec, section « Données personnelles ») à valider par le client ; aucune purge automatique dans ce lot
- Valeurs définitives des réglages (délais, limites des vocaux et des pièces jointes, catégories en circuit B, photo obligatoire, mode de clôture) : modifiables sans code via US8

---

## Notes

- [P] = fichiers différents, sans dépendance sur une tâche inachevée
- Le label [Story] relie chaque tâche à sa user story
- Vérifier que chaque test échoue avant d'implémenter
- Valider chaque story à son checkpoint
- `requests.service.ts` est modifié par US1, US2, US5, US6 et US7 : éviter de faire ces stories en parallèle sur ce fichier
