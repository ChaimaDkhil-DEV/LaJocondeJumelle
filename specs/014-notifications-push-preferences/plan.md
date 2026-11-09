# Plan d'implémentation : Notifications push et préférences utilisateur

**Branche** : `014-notifications-push-preferences` | **Date** : 2026-11-09 | **Spec** : [spec.md](spec.md)

**Entrée** : spécification `specs/014-notifications-push-preferences/spec.md` (clarifiée le 2026-11-09, NC-1 à
NC-10)

## Résumé

Le push devient un second diffuseur des notifications existantes, branché au seul point déjà situé après la
validation des transactions (`NotificationsService.flushAfterCommit` → `NOTIFICATION_PUBLISHER`). Un nouveau module
backend `push` décide pour chaque notification créée s'il faut l'envoyer, puis l'envoie à chaque appareil abonné
du destinataire avec `web-push@3.6.7` (validité 30 min, 3 tentatives au plus, en mémoire). Les conditions sont :

- clés présentes ;
- type autorisé dans la correspondance validée, et filtre D4 respecté ;
- compte actif ;
- catégorie active dans les préférences du destinataire ;
- plage horaire ouverte.

Les notifications existantes, leurs destinataires et la diffusion Socket.IO ne changent pas. Deux tables sont
ajoutées : `PushSubscription` (lié à la session pour la déconnexion) et `NotificationPreference` (quatre
catégories et son des urgences). La plage horaire est un réglage global de plus.

Côté navigateur :

- un service worker minimal (`public/sw.js`), sans cache, compose le texte à partir d'un contenu sans donnée
  personnelle et ne l'affiche pas quand l'application est au premier plan (sauf iPhone/iPad) ;
- un manifeste rend l'application installable (parcours iPhone) ;
- « Mon profil » reçoit une section « Notifications » (état de l'appareil, catégories, son, appareils) ;
- les « Réglages » reçoivent la plage d'envoi.

Voir [research.md](research.md).

## Contexte technique

**Langage/Version** : TypeScript 5.9, Node.js 24

**Dépendances principales** : NestJS 11 (`@nestjs/schedule` pour le job de nettoyage), Prisma 6.19, React 19,
MUI 9, React Router 7, TanStack Query 5. **Nouvelle** : `web-push` 3.6.7, épinglée (+ `@types/web-push` en
développement) — research R1

**Stockage** : PostgreSQL 17 ; tables `PushSubscription` et `NotificationPreference` (migration
`0019_push_notifications` avec `down.sql`) ; trois clés dans la table `Setting` existante

**Tests** : Jest 30 (unitaires et intégration backend sur base de test), Vitest 5 + Testing Library (frontend et
service worker), Playwright + axe (bout en bout, serveur sans clés). Aucun appel à un vrai service de push :
envoyeur simulé injecté par le jeton `PUSH_SENDER`

**Plateforme cible** : application web en HTTPS. Push sur Chrome/Edge/Firefox (ordinateur et Android), Safari
macOS, iOS/iPadOS ≥ 16.4 avec l'application sur l'écran d'accueil. De 320 px à l'ordinateur

**Type de projet** : application web (espaces de travail `backend/` et `frontend/`), plus `e2e/`, `deploy/`, `docs/`

**Objectifs de performance** :

- aucun ralentissement perceptible des actions : l'envoi n'est pas attendu (FR-005, SC-005) ;
- affichage en moins de 10 s dans 95 % des cas en préproduction (SC-001, mesure, pas une garantie) ;
- au plus 10 envois simultanés.

**Contraintes** :

- contenu limité (D7) ;
- clé privée uniquement dans l'environnement du serveur ;
- adresses d'envoi limitées aux services de push reconnus (SSRF) ;
- service worker sans cache ;
- politique de sécurité du contenu inchangée ;
- textes via `t()` avec dictionnaire anglais ;
- migration créée sur la base locale seulement (CLAUDE.md).

**Échelle/Périmètre** : un établissement (quelques centaines de comptes au plus, une instance backend). Environ :

- 16 types envoyés en push ;
- 1 nouveau module backend (≈ 8 fichiers), 3 services existants modifiés (auth, utilisateurs, réglages) ;
- 1 nouveau dossier frontend (`features/push`), 5 pages ou composants modifiés ;
- 1 service worker et 1 manifeste.

## Vérification de la constitution

*PORTE : doit passer avant la phase 0. Revérifiée après la phase 1.*

| Principe | Vérification | Statut |
|---|---|---|
| I. TDD | Tests écrits en premier et en échec. **Unitaires** : `pushCategoryOf` sur chaque valeur de `NotificationType` × nature de demande ; contenu sans donnée interdite ; plage (bords, jours, fuseau) ; adresses ; libellé d'appareil ; nouvelles tentatives. **Intégration** : routes et droits ; suppressions D8/NC-8 ; réglages et audit ; chaîne action → envoyeur simulé ; push en panne. **Frontend** : états de la section ; 3 actions au plus ; reprise du son ; lecture après ouverture ; service worker. **Bout en bout** : section, réglages, axe, 320 px. Détail : research R18. | ✅ |
| II. Simplicité / YAGNI | Un seul point d'intégration, sans toucher les 8 appels. Pas de file d'envoi persistante (NC-4), ni de Workbox/`vite-plugin-pwa`, ni de modèle générique. Plage dans les réglages existants. Service worker en JavaScript simple. Écarts justifiés ci-dessous : dépendance `web-push`, service worker et manifeste. | ✅ (justifié) |
| III. Accessibilité / UX | WCAG 2.2 AA : interrupteurs libellés, état annoncé (`role="status"`), instructions iPhone en texte, `fieldset`/`legend` pour les jours, cibles de 44 px, 320 px en portrait et en paysage, axe dans Playwright ; messages d'erreur avec action corrective ([contracts/ui.md](contracts/ui.md)). | ✅ |
| IV. Sécurité / données | Clés dans l'environnement, clé privée jamais exposée. Validation serveur de tous les champs (DTO avec liste blanche). Adresses limitées aux services reconnus. Minimisation (FR-011, pas d'agent utilisateur brut, pas de langue stockée). Conservation documentée (spec, data-model) avec nettoyage à 90 jours. Journaux sans contenu ni adresse ni clés. HTTPS exigé par les navigateurs. `npm audit --audit-level=high` vert. | ✅ |
| V. Intégrité des processus / RBAC | Aucun statut, transition ni destinataire dans l'application modifié. Push ⊆ destinataires existants (filtre D4 en plus). Droits vérifiés côté serveur sur chaque route ; abonnement d'un autre → 404 + `ACCESS_DENIED`. Plage réservée au super administrateur, auditée (`SETTING_CHANGED`). Modèles documentés dans [data-model.md](data-model.md) avant l'implémentation. | ✅ |

**Revérification après la phase 1** : inchangée, tout ✅ ; les trois écarts restent justifiés dans « Suivi de la
complexité ».

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/014-notifications-push-preferences/
├── spec.md
├── plan.md                 # ce fichier
├── research.md             # phase 0
├── data-model.md           # phase 1
├── quickstart.md           # phase 1
├── contracts/
│   ├── http-api.md         # routes push, préférences, réglages
│   ├── push-payload.md     # contenu du push et service worker
│   └── ui.md               # section « Notifications », réglages, ouverture, déconnexion
├── checklists/
│   └── requirements.md
└── tasks.md                # /speckit-tasks (non créé par /speckit-plan)
```

### Code source (racine du dépôt)

```text
backend/
├── prisma/
│   ├── schema.prisma                                  # + PushSubscription, NotificationPreference, relations User
│   └── migrations/0019_push_notifications/            # migration.sql + down.sql
├── src/
│   ├── push/                                          # nouveau module
│   │   ├── push.module.ts
│   │   ├── push.controller.ts                         # /api/push/config, /api/push/subscriptions
│   │   ├── push.dto.ts
│   │   ├── push-subscriptions.service.ts              # upsert/bascule, touch, suppressions (D8, NC-8)
│   │   ├── push-dispatcher.service.ts                 # décision d'envoi, nouvelles tentatives, 404/410
│   │   ├── web-push.sender.ts                         # jeton PUSH_SENDER, enveloppe web-push
│   │   └── domain/
│   │       ├── push-category.ts                       # correspondance exhaustive + filtre D4
│   │       ├── push-payload.ts                        # { v, id, type, place, url }
│   │       ├── push-window.ts                         # plage horaire (fuseau de l'école)
│   │       ├── push-endpoint.ts                       # validation des adresses et clés
│   │       └── device-label.ts                        # « iPhone · Safari »
│   ├── notifications/
│   │   ├── notifications.module.ts                    # NOTIFICATION_PUBLISHER = Socket.IO puis push
│   │   ├── notification-preferences.controller.ts     # GET/PATCH /api/notifications/preferences
│   │   └── notification-preferences.service.ts
│   ├── auth/auth.service.ts                           # logout, changePassword : suppressions
│   ├── users/users.service.ts                         # désactivation, réinitialisation : suppressions (transaction)
│   ├── settings/settings.service.ts                   # + pushWindowDays/Start/End, règles
│   ├── settings/admin-settings.service.ts             # contrôle croisé début < fin
│   ├── scheduler/push-subscriptions-cleanup.job.ts    # 90 jours sans utilisation
│   ├── config/config.ts                               # PUSH_VAPID_* (désactivé / complet / erreur)
│   └── common/errors.ts                               # PUSH_DISABLED, PUSH_DEVICE_LIMIT
└── test/
    ├── unit/push-*.spec.ts                            # catégories, contenu, plage, adresses, libellé, tentatives
    └── integration/push-*.spec.ts, notification-preferences.spec.ts

frontend/
├── index.html                                         # manifeste, theme-color, apple-touch-icon
├── public/
│   ├── sw.js                                          # service worker (push, notificationclick ; sans fetch)
│   ├── manifest.json
│   └── icons/                                         # 180, 192, 512 px tirées de logo.png
├── src/
│   ├── features/push/
│   │   ├── api.ts                                     # config, abonnements
│   │   ├── pushSupport.ts                             # états (research R12)
│   │   ├── usePushDevice.ts                           # enregistrement du SW, abonnement, synchronisation, retrait
│   │   ├── NotificationsSection.tsx                   # section « Notifications » de « Mon profil »
│   │   └── DevicesList.tsx
│   ├── features/notifications/api.ts                  # + préférences
│   ├── features/notifications/useUrgentSound.ts       # son relié au compte + reprise unique
│   ├── features/auth/ProfilePage.tsx                  # + section
│   ├── features/auth/useCurrentUser.ts                # déconnexion : désabonnement de l'appareil
│   ├── features/admin/SettingsAdminPage.tsx           # + plage d'envoi
│   ├── features/coverage/CoverageDetailPage.tsx       # lu après ouverture (?notification=)
│   ├── features/requests/RequestDetailPage.tsx        # idem
│   ├── app/AppLayout.tsx                              # synchronisation de l'abonnement à l'ouverture
│   └── i18n/en/*.ts                                   # nouveaux libellés
└── tests/push/*.test.ts(x), notifications/*.test.tsx, sw.test.ts

e2e/
└── notifications-push.spec.ts                         # serveur sans clés : section, préférences, plage, axe, 320 px

deploy/.env.example, backend/.env.example              # PUSH_VAPID_* commentées
docs/notifications-push.md                             # activation (clés, sujet), fiche pour le registre RGPD
```

**Décision de structure** : disposition existante d'application web. Le push est un module backend autonome
branché sur le diffuseur des notifications. Le frontend a un dossier `features/push` ; le service worker et le
manifeste sont des fichiers statiques de `frontend/public`.

Dépendances de modules : `NotificationsModule` → `PushModule` ; `AuthModule` et `UsersModule` → `PushModule`.
`PushModule` n'importe ni `NotificationsModule` ni `AuthModule`. Il utilise les modules globaux (`ConfigModule`,
`SettingsModule`, `AuditModule`) et lit les préférences par Prisma.

## Suivi de la complexité

| Écart | Pourquoi c'est nécessaire | Alternative plus simple écartée parce que |
|---|---|---|
| Nouvelle dépendance `web-push` (3.6.7) | Le chiffrement (RFC 8291) et l'identification (RFC 8292) sont obligatoires pour envoyer un push à Chrome, Firefox, Safari ou Edge | Réécrire ces protocoles avec `node:crypto` : plus de code cryptographique à maintenir et à tester, plus de risque d'erreur |
| Service worker (nouveau type de composant) | Seul moyen d'afficher une notification quand l'application est fermée ou le téléphone verrouillé | Aucune : sans lui, pas de push. Gardé minimal (pas de `fetch`, pas de cache, JavaScript simple), au lieu de Workbox/`vite-plugin-pwa` |
| Manifeste d'application installable | iOS/iPadOS n'autorisent le push qu'aux applications ajoutées à l'écran d'accueil (D2) | Ne viser qu'Android et les ordinateurs : contraire à D2 (parc mixte) |
