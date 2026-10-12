# Implementation Plan: Lot 1 – Demandes de travail et messagerie vocale

**Branch**: `001-demandes-travail-vocales` | **Date**: 2026-10-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-demandes-travail-vocales/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Application web responsive (smartphone, tablette, ordinateur) permettant au personnel d'une
école d'adresser des demandes de travail vocales à des destinataires définis par catégorie, de
les traiter selon une machine à états stricte (circuit direct A ou circuit B avec validation
administrative), d'échanger dans un fil par demande (texte, vocal, photos, fichiers), de suivre
trois délais par demande et d'être notifié en temps réel dans l'application.

Approche technique : un frontend React (SPA) et une API NestJS monolithique sur un seul VPS,
PostgreSQL via Prisma, Socket.IO en processus unique (sans Redis), un job planifié en processus
pour les retards et la clôture automatique, des fichiers stockés sur un volume privé et servis
uniquement par l'API après contrôle d'accès, et des vocaux normalisés côté serveur en AAC/MP4
pour une lecture identique sur tous les navigateurs. La machine à états et la politique d'accès
sont des fonctions pures testées avant le code. Détails et justifications : [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (strict) sur Node.js 24 LTS, côté serveur comme côté client

**Primary Dependencies**: Backend : NestJS 11 (REST + gateway WebSocket), Socket.IO 4,
Prisma ORM, class-validator / class-transformer (DTO), @nestjs/schedule, @nestjs/throttler,
argon2, Multer (intégré à Nest), file-type, sharp (photos), ffmpeg/ffprobe (vocaux, binaire
système). Frontend : React 19, Vite, React Router, TanStack Query 5, Material UI, client
Socket.IO, idb-keyval (conservation locale des envois échoués). Versions exactes figées dans
les lockfiles à l'initialisation.

**Storage**: PostgreSQL 17 (données, historique, audit, sessions) ; volume disque privé pour
vocaux, photos et fichiers (hors de toute racine web)

**Testing**: Backend : Jest + Supertest (unitaires et intégration sur une base PostgreSQL de
test réelle). Frontend : Vitest + React Testing Library. Bout en bout : Playwright (Chromium,
WebKit, Firefox ; profils mobiles) avec @axe-core/playwright pour l'accessibilité

**Target Platform**: Navigateurs récents : Safari iOS/iPadOS 17+, Chrome Android, Chrome, Edge,
Firefox, Safari macOS. Serveur : un VPS Linux, Docker Compose, Caddy (HTTPS automatique)

**Project Type**: Application web (frontend SPA + API backend)

**Performance Goals**: Notification visible en < 5 s pour 95 % des événements (SC-003) ;
retard détecté et notifié en < 30 s (SC-006) ; recherche filtrée < 2 s sur 10 000 demandes
(SC-009) ; création d'une demande vocale < 60 s côté utilisateur (SC-001)

**Constraints**: HTTPS obligatoire (MediaRecorder exige un contexte sécurisé) ; un seul VPS et
un seul processus API ; aucun fichier accessible publiquement ; pas de push, pas d'e-mail, pas
de service worker ; WCAG 2.2 AA ; utilisable dès 320 px de large

**Scale/Scope**: Une école : environ 50 à 300 comptes, quelques dizaines à quelques centaines
de demandes par jour, 10 000 à 100 000 demandes sur plusieurs années, 8 user stories,
environ 15 écrans

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Vérification | Statut |
|----------|--------------|--------|
| I. TDD (non négociable) | La machine à états, la politique d'accès, le calcul des délais et la validation des fichiers sont des modules purs dont les tests (tables de cas exhaustives) sont écrits et échouent avant le code. Chaque user story a des tests d'intégration API et un parcours Playwright traçables vers ses scénarios d'acceptation. Aucune fusion si la suite échoue. | ✅ |
| II. Simplicité / YAGNI | Un seul processus API, pas de Redis, pas de file de messages, pas de microservices ; job planifié en processus ; stockage fichiers sur disque local ; aucune escalade automatique (non spécifiée). Deux ajouts justifiés dans Complexity Tracking : ffmpeg et sharp. | ✅ (avec justifications) |
| III. Accessibilité et UX | Material UI (composants accessibles), contrôles d'enregistrement et de lecture utilisables au clavier et libellés, tests axe automatisés sur chaque écran livré, tests Playwright à 320 px, états chargement/vide/erreur/succès normalisés. | ✅ |
| IV. Sécurité et données | DTO avec liste blanche et rejet des champs inconnus ; contrôle de type réel des fichiers (octets magiques + ffprobe) ; secrets par variables d'environnement ; Argon2id ; HTTPS par Caddy (HSTS) ; métadonnées EXIF (dont GPS) supprimées des photos ; `npm audit` bloquant en niveau élevé. Finalités et durées de conservation documentées dans la spec (section « Données personnelles ») : vocaux, photos et pièces jointes 12 mois après clôture, historique 5 ans, audit 5 ans. **Ces durées sont des hypothèses provisoires à faire valider par le client avant la mise en production.** | ⚠️ durées provisoires à valider avant la production |
| V. Workflows et communications | Ensemble fini de 11 statuts et table de transitions unique côté serveur ; historique de demande et journal d'audit en ajout seul, protégés par des triggers PostgreSQL contre UPDATE/DELETE ; RBAC + appartenance aux catégories vérifiés à chaque requête REST, chaque événement Socket.IO et chaque téléchargement de fichier ; refus d'accès journalisé et renvoyé en 404. | ✅ |

**Résultat avant Phase 0** : passe. **Résultat après Phase 1** (re-vérifié sur
[data-model.md](./data-model.md) et [contracts/](./contracts/)) : passe, sous réserve de la
validation par le client des durées de conservation provisoires avant la mise en production.

## Traitement des contraintes imposées

| # | Contrainte | Réponse du plan | Référence |
|---|------------|-----------------|-----------|
| 1 | Détection des retards | Job `@Interval` toutes les 15 s dans le processus API : sélectionne les demandes dont l'échéance de l'étape en cours est dépassée et non encore signalée, les marque « En retard » (étape précisée) par mise à jour conditionnelle idempotente, écrit l'événement d'historique et notifie les responsables de la catégorie. Le même job applique la clôture automatique. Rattrapage naturel après redémarrage (le job lit l'état en base). | research R4, data-model §Délais |
| 2 | Enregistrement vocal | Choix du format d'enregistrement par `MediaRecorder.isTypeSupported` (WebM/Opus, puis MP4/AAC, puis Ogg/Opus) ; envoi du fichier brut ; validation par ffprobe et conversion systématique côté serveur en AAC mono dans un conteneur MP4 (`.m4a`), lu nativement par tous les navigateurs cibles. Repli sur la description écrite si micro refusé ou API absente. HTTPS partout, y compris en test sur téléphone. | research R2 |
| 3 | Fichiers privés | Volume privé, noms de fichiers = UUID, aucune route statique. Accès uniquement par `GET /api/files/:id` (cookie de session, contrôle d'accès à la demande parente, prise en charge des requêtes Range pour Safari, `nosniff`, `Cache-Control: private`). Formats vérifiés par octets magiques, tailles limitées à Caddy, à Multer et selon les réglages. | research R3, contracts/rest-api.md §Fichiers |
| 4 | Machine à états et droits testés d'abord | `request-state-machine.ts` et `access-policy.ts` sont des fonctions pures ; tests table-driven couvrant chaque couple (statut, action, rôle/relation) — autorisé et refusé — écrits en premier. Statuts Refusée et Annulée inclus. | data-model §Machine à états, §Matrice d'accès |
| 5 | Journal d'audit non modifiable | Tables `AuditLog` et `RequestEvent` en ajout seul ; triggers PostgreSQL levant une erreur sur UPDATE/DELETE ; aucune route d'écriture exposée ; consultation réservée au super administrateur. | research R6 |
| 6 | Notifications dans l'application | Notification persistée en base puis émise par Socket.IO dans la salle `user:{id}` après validation de la transaction ; récupération des non lues à la (re)connexion. Ni push, ni e-mail, ni service worker. | contracts/realtime-events.md |
| 7 | Destinataires par catégorie | Table `CategoryRecipient` ; la création vérifie côté serveur que le destinataire est un utilisateur actif de la catégorie (sinon 422) ; l'interface ne propose que cette liste. | data-model §Catégorie |
| 8 | Paramétrage | Réglages en base (`Setting`, `Category`, `DeadlineRule`) modifiables par le super administrateur, chaque modification auditée ; valeurs par défaut provisoires listées dans data-model §Valeurs par défaut et chargées par le script de seed. | data-model §Valeurs par défaut |

## Project Structure

### Documentation (this feature)

```text
specs/001-demandes-travail-vocales/
├── plan.md              # Ce fichier
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── rest-api.md          # Routes REST, autorisations, erreurs
│   └── realtime-events.md   # Événements Socket.IO
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/            # migrations versionnées (+ SQL des triggers d'ajout seul)
│   └── seed.ts                # valeurs par défaut provisoires, compte super admin initial
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/                # garde de session, filtres d'erreurs, pipes de validation
│   ├── auth/                  # connexion, sessions, changement de mot de passe
│   ├── users/                 # comptes et rôles (super admin)
│   ├── categories/            # catégories, destinataires, responsables, règles de délais
│   ├── settings/              # réglages globaux (vocaux, pièces jointes, brouillons…)
│   ├── requests/
│   │   ├── domain/
│   │   │   ├── request-state-machine.ts   # transitions pures
│   │   │   ├── access-policy.ts           # droits pures (lecture, actions)
│   │   │   └── deadlines.ts               # calcul des échéances
│   │   ├── requests.controller.ts
│   │   └── requests.service.ts
│   ├── messages/              # fil de discussion
│   ├── files/                 # stockage privé, validation, ffmpeg, sharp, téléchargement
│   ├── notifications/         # persistance + gateway Socket.IO
│   ├── audit/                 # journal d'audit (écriture interne, lecture super admin)
│   └── scheduler/             # job retards + clôture automatique
└── test/
    ├── unit/                  # machine à états, politique d'accès, délais, validation fichiers
    └── integration/           # API + base PostgreSQL de test, par user story

frontend/
├── src/
│   ├── main.tsx
│   ├── app/                   # routeur, thème MUI, fournisseurs (Query, Socket)
│   ├── api/                   # client HTTP, types générés depuis l'OpenAPI du backend
│   ├── features/
│   │   ├── requests/          # liste, filtres, création, détail, actions de statut
│   │   ├── voice/             # enregistreur, lecteur, détection des formats
│   │   ├── thread/            # fil, pièces jointes, prise de photo
│   │   ├── notifications/     # centre de notifications, connexion Socket.IO
│   │   ├── outbox/            # envois échoués conservés (IndexedDB) et relance
│   │   └── admin/             # comptes, catégories, délais, réglages, audit
│   └── components/            # composants partagés (états, compte à rebours…)
└── tests/                     # Vitest + Testing Library

e2e/                           # Playwright + axe, un fichier par user story
deploy/
├── docker-compose.yml         # caddy, api, db, backup
├── Caddyfile
├── api.Dockerfile             # Node 24 + ffmpeg
└── backup/                    # pg_dump + archive du volume fichiers
```

**Structure Decision**: application web à deux projets (`backend/`, `frontend/`) dans un même
dépôt avec npm workspaces, plus `e2e/` et `deploy/`. Pas de paquet partagé : le frontend
consomme des types générés depuis l'OpenAPI du backend, et le serveur renvoie pour chaque
demande la liste des actions permises (`allowedActions`), si bien que la machine à états
n'existe qu'à un seul endroit.

## Complexity Tracking

| Ajout | Pourquoi c'est nécessaire | Alternative plus simple rejetée parce que |
|-------|---------------------------|-------------------------------------------|
| ffmpeg/ffprobe dans l'image de l'API (conversion des vocaux en AAC/MP4) | Safari/iOS enregistre en MP4/AAC, Chrome et Firefox en WebM/Opus ou Ogg ; la lecture croisée n'est pas garantie sur toutes les versions cibles. ffprobe sert aussi à vérifier que le fichier est bien un audio valide et à mesurer sa durée réelle (FR-007). | Stocker et servir le format d'origine : un vocal enregistré sur un navigateur peut être illisible sur un autre, ce qui casse le parcours principal (US1). |
| sharp (traitement des photos) | Supprimer les métadonnées EXIF, dont la position GPS des photos prises au téléphone (principe IV, minimisation RGPD), et corriger l'orientation. | Enregistrer les photos telles quelles : diffuse la localisation des employés aux autres participants. |
| Redis | **Non ajouté.** Un seul processus API sur un seul VPS : l'adaptateur Socket.IO en mémoire, le throttler en mémoire et le job en processus suffisent. À réévaluer uniquement si l'API passe à plusieurs instances. | — |
