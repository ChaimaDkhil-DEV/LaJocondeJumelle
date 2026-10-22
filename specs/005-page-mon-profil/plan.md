# Implementation Plan: Page « Mon profil » et accès au changement de mot de passe

**Branch**: `005-page-mon-profil` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-page-mon-profil/spec.md`

## Summary

Le bloc profil du menu devient un lien vers une nouvelle page `/profil` qui affiche, en lecture
seule, le nom, l'identifiant, la fonction, le rôle et les groupes d'affectation du compte
connecté, et propose « Changer mon mot de passe ». La page de changement existante gagne un mode
volontaire (annulation, retour au profil avec confirmation), choisi d'après l'état serveur
`mustChangePassword` ; le mode imposé est inchangé. Côté serveur, seule la réponse
`GET /api/auth/me` gagne deux champs (`username`, `jobTitle`). Détails : [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (backend et frontend), Node.js 24

**Primary Dependencies**: NestJS 11 et Prisma 6 (backend) ; React 19, React Router 7, MUI 7,
TanStack Query (frontend) — pile existante, aucune dépendance ajoutée

**Storage**: PostgreSQL 17 — aucune modification de schéma ni migration (`User.jobTitle` existe)

**Testing**: Jest (unitaires et intégration backend, PostgreSQL embarqué), Vitest + Testing
Library (frontend), Playwright + axe (bout en bout, 6 profils)

**Target Platform**: navigateurs récents (desktop, iOS Safari, Android Chrome), serveur Linux
(Docker) en production

**Project Type**: application web (monorepo `backend/` + `frontend/`)

**Performance Goals**: aucune requête supplémentaire à l'ouverture du profil (cache de
`/api/auth/me` réutilisé) ; changement de mot de passe : performances actuelles

**Constraints**: WCAG 2.2 AA ; 320 px sans défilement horizontal ; parcours imposé et règles de
mot de passe inchangés ; aucune donnée nouvelle collectée

**Scale/Scope**: 1 page nouvelle, 1 page adaptée, 1 lien, 2 champs ajoutés à une réponse
existante ; quelques dizaines d'utilisateurs (un établissement)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Vérification avant conception | Après conception |
|----------|-------------------------------|------------------|
| **I. Tests d'abord** | Chaque scénario d'acceptation a un test qui échoue avant le code (R6) : unitaire et intégration pour `/me`, Vitest pour la page et le parcours, e2e pour le parcours complet et l'accessibilité. | ✅ Plan de tests R6 rattaché aux FR-001 à FR-013 (voir quickstart). Les tests existants du parcours imposé restent inchangés (SC-005). |
| **II. Simplicité / YAGNI** | Pas de nouvel endpoint, de dépendance, de migration ni de configuration. | ✅ Deux champs sur une réponse existante, une route frontend, un mode dérivé de l'état serveur. Rien à consigner en « Complexity Tracking ». |
| **III. Accessibilité et UX** | Lien au nom accessible complet, focus visible, erreurs reliées aux champs, confirmation annoncée, 320 px, axe dans V18. | ✅ R3 (Label in Name), R4 (statut annoncé), V18 étendu. États chargement et erreur : ceux de `RequireAuth`, communs à toutes les pages protégées. |
| **IV. Sécurité et données** | Validation serveur du changement inchangée ; aucune donnée nouvelle ; secrets : aucun. | ✅ `username` et `jobTitle` renvoyés au seul compte connecté (session). Mode volontaire non manipulable (état serveur, pas d'URL). |
| **V. Intégrité et audit** | Aucune demande ni statut touché ; `PASSWORD_CHANGED` déjà journalisé ; aucun nouvel accès à une ressource d'autrui. | ✅ Inchangé ; test e2e vérifiant la fermeture des autres sessions. |

Aucune violation : section « Complexity Tracking » sans objet.

## Project Structure

### Documentation (this feature)

```text
specs/005-page-mon-profil/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 : décisions R1 à R6
├── data-model.md        # Phase 1 : données lues (aucune modification de schéma)
├── quickstart.md        # Phase 1 : scénarios de validation
├── contracts/
│   ├── rest-api.md      # GET /api/auth/me (champs ajoutés), POST /api/auth/password (inchangé)
│   └── ui.md            # Route /profil, lien du bloc profil, modes de /mot-de-passe
├── checklists/
│   └── requirements.md  # Qualité de la spec
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/auth/
│   ├── auth.types.ts            # AuthenticatedUser + MeResponse : username, jobTitle
│   └── session.service.ts       # toAuthenticatedUser : jobTitle
└── test/
    ├── unit/                    # toMeResponse
    └── integration/auth.spec.ts # GET /api/auth/me

frontend/
├── src/
│   ├── api/types.ts             # Me : username, jobTitle
│   ├── app/AppLayout.tsx        # bloc profil → lien /profil
│   ├── app/routes.tsx           # route /profil
│   └── features/auth/
│       ├── ProfilePage.tsx      # nouvelle page
│       └── ChangePasswordPage.tsx # mode volontaire (annuler, retour, confirmation)
└── tests/auth/
    ├── profile.test.tsx         # nouvelle suite
    └── change-password.test.tsx # modes volontaire et imposé

e2e/
├── auth.spec.ts                 # parcours profil → changement → autres sessions fermées
└── a11y-responsive.spec.ts      # V18 : page « Mon profil » à 320 px
```

**Structure Decision**: monorepo existant (`backend/`, `frontend/`, `e2e/`) ; le profil relève
du domaine `auth` côté frontend comme côté backend (aucun nouveau dossier de domaine).

## Complexity Tracking

Sans objet : aucune violation de la constitution.
