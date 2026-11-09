---
description: "Liste des tâches : notifications push et préférences utilisateur (014)"
---

# Tâches : Notifications push et préférences utilisateur

**Entrée** : documents de conception de `specs/014-notifications-push-preferences/`

**Prérequis** : [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/http-api.md](contracts/http-api.md), [contracts/push-payload.md](contracts/push-payload.md),
[contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests** : OBLIGATOIRES. Principe I de la constitution (TDD, non négociable) : chaque tâche de test est écrite et
**vue en échec** avant la tâche d'implémentation qui la suit. Aucun test n'appelle un vrai service de push (FR-014).

**Organisation** : tâches regroupées par user story (spec.md, US1 à US6).

## Format : `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichiers différents, aucune dépendance envers une tâche non terminée)
- **[Story]** : user story de spec.md (US1 à US6)

## Conventions

- **Backend**
  - Tests unitaires dans `backend/test/unit/`, d'intégration dans `backend/test/integration/` (base de test,
    `npm run -w backend test:integration`).
  - Outils : `createTestApp(extraControllers, overrides)` et `sessionCookie` (`backend/test/utils/test-app.ts`),
    `seedDemo`, `loginAs`, `userId` (`utils/auth-helpers.ts`), `createCoverage`, `notificationsOf`
    (`utils/coverage-fixtures.ts`), `fixedNow` (`utils/clock.ts`), `openDatabase`, `seedBefore`
    (`utils/migration-db.ts`).
  - **Configuration push dans les tests** : `backend/.env` est chargé par `@prisma/client`
    (`backend/scripts/e2e-server.ts:47`) ; un test ne doit jamais dépendre de l'environnement local. Tout test
    d'intégration qui touche au push ou aux préférences remplace `APP_CONFIG` (`backend/src/config/config.module.ts`)
    avec `push` fixé explicitement : `null` (désactivé) ou
    `{ ...loadConfig(), push: { publicKey, privateKey, subject: 'mailto:test@ecole.example' } }`, clés produites dans
    le test par `webpush.generateVAPIDKeys()` (jamais versionnées).
  - **Envoyeur simulé** : remplacer `PUSH_SENDER` par un objet `{ send: jest.fn() }` qui enregistre les appels et
    renvoie `{ statusCode: 201 }` ou une erreur programmée.
  - **Abonnement de test** : `endpoint` `https://fcm.googleapis.com/fcm/send/test-<n>` ; `p256dh` et `auth` tirés
    d'une vraie paire (`crypto.createECDH('prime256v1')`, 16 octets aléatoires), en base64url.
- **Frontend** : tests dans `frontend/tests/<domaine>/`, `fetch` simulé dans chaque fichier comme dans les tests
  existants ; `navigator.serviceWorker`, `PushManager` et `Notification` simulés avec `vi.stubGlobal`.
- **Textes de l'interface** : en français via `t()`, mot pour mot comme dans [contracts/ui.md](contracts/ui.md),
  chacun avec son entrée anglaise dans `frontend/src/i18n/en/push.ts` (nouveau fichier, enregistré dans
  `frontend/src/i18n/en/index.ts`).
- **Migrations** : uniquement sur la base locale, selon `CLAUDE.md` ; jamais de `migrate reset`.

---

## Phase 1 : Mise en place

- [X] T001 Sur la branche `014-notifications-push-preferences`, lancer `npm run lint`, `npm test`, `npm run -w frontend typecheck`, `npm run -w backend typecheck` et `npm audit --audit-level=high` ; noter dans la description de la future pull request tout test déjà rouge avant la fonctionnalité
- [X] T002 Ajouter `web-push` en version exacte 3.6.7 aux dépendances de `backend/package.json` (`npm install -w backend web-push@3.6.7 --save-exact`) et `@types/web-push` en dépendance de développement, avec une version publiée depuis plus de deux semaines (`npm view @types/web-push time`). Relancer `npm audit --audit-level=high` : aucune vulnérabilité haute ou critique (research R1)
- [X] T003 [P] Dans `backend/.env.example` et `deploy/.env.example`, ajouter les variables commentées `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT` avec : « les trois ou aucune ; sans elles, le push est désactivé », la commande `npm exec -w backend -- web-push generate-vapid-keys`, et « sujet : mailto: ou https:, jamais localhost ». Dans `deploy/.env.example`, à côté de `SCHOOL_TIMEZONE`, préciser que la plage d'envoi des push utilise ce fuseau et qu'il vaut `Africa/Tunis` pour l'établissement (le défaut du code reste `Europe/Paris`). Ajouter aussi les trois variables à l'environnement du service `api` de `deploy/docker-compose.yml` (`${PUSH_VAPID_…:-}`), qui liste explicitement les variables transmises : sans cela, le push ne pourrait pas être activé en production (constat fait pendant l'implémentation)

---

## Phase 2 : Fondations (prérequis bloquants)

**Objet** : configuration, tables, codes d'erreur, envoyeur et branchement après validation des transactions.

**⚠️ Aucune user story ne commence avant la fin de cette phase.**

- [X] T004 [P] Tests en échec dans `backend/test/unit/config.spec.ts` pour `loadConfig(env).push` :
  - aucune des trois variables → `null` ;
  - les trois valides → `{ publicKey, privateKey, subject }` ;
  - une ou deux absentes → `ConfigError` qui nomme les variables manquantes ;
  - clé publique qui n'est pas du base64url de 65 octets commençant par `0x04` → `ConfigError` ;
  - clé privée qui n'est pas du base64url de 32 octets → `ConfigError` ;
  - sujet qui ne commence ni par `mailto:` ni par `https:` → `ConfigError` ;
  - variables présentes mais vides ou faites d'espaces → traitées comme absentes (`null`) ;
  - la clé privée n'apparaît dans aucun message d'erreur.
- [X] T005 Implémenter `parsePush(env)` dans `backend/src/config/config.ts` et le champ `push: { publicKey: string; privateKey: string; subject: string } | null` d'`AppConfig` ; faire passer T004 (research R10)
- [X] T006 [P] Test de migration en échec `backend/test/integration/migration-0019.spec.ts`, sur le modèle de `migration-0018.spec.ts` (`openDatabase`, `seedBefore` jusqu'à `0018_clean_stale_category_managers`) :
  - `0019_push_notifications` conserve les données existantes et crée `PushSubscription` et `NotificationPreference` ;
  - l'unicité de `PushSubscription.endpoint` est appliquée ;
  - supprimer un `User` supprime ses abonnements et ses préférences (cascade) ;
  - `down.sql` supprime les deux tables et la ligne `_prisma_migrations` de `0019`, et laisse les autres tables intactes.
- [X] T007 Dans `backend/prisma/schema.prisma`, ajouter les modèles de [data-model.md](data-model.md), avec les relations `pushSubscriptions` et `notificationPreference` sur `User` :
  - `PushSubscription` :
    - `id` UUID ;
    - `userId` UUID → `User`, « `onDelete: Cascade` » ;
    - `sessionId` « texte (128), nullable », sans relation ;
    - `endpoint` « texte (2048), unique » ;
    - `p256dh` « texte (128) » ;
    - `auth` « texte (64) » ;
    - `deviceLabel` « texte (80) » ;
    - `createdAt` défaut maintenant ;
    - `lastSuccessAt` horodatage nullable ;
    - `lastUsedAt` défaut maintenant ;
    - index sur `userId`, `sessionId`, `lastUsedAt`.
  - `NotificationPreference` :
    - `userId` clé primaire → `User`, « `onDelete: Cascade` » ;
    - `urgent`, `coverage`, `unfilled`, `attendance` booléens « défaut `true` » ;
    - `urgentSound` « booléen, nullable » ;
    - `updatedAt` `@updatedAt`.

  Écrire ensuite **en une fois** `backend/prisma/migrations/0019_push_notifications/migration.sql`, à partir de la sortie de `npm exec -w backend -- prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` (le hook l'applique à la base locale). Vérifier `npm exec -w backend -- prisma migrate status` → « Database schema is up to date! », puis `npm exec -w backend -- prisma generate`. Conformément à `CLAUDE.md`, lancer ensuite `npm exec -w backend -- prisma migrate dev --name push_notifications` : il doit répondre qu'aucun changement n'est à migrer, sans créer de dossier. S'il propose une réinitialisation (« reset »), refuser et signaler la dérive. Une fois appliqué, `migration.sql` n'est plus jamais modifié : toute correction passe par une nouvelle migration. Faire passer la partie « montée » de T006.
- [X] T008 Écrire `backend/prisma/migrations/0019_push_notifications/down.sql` sur le modèle de `0017_drop_coverage_target/down.sql` :
  - en-tête « Retour arrière de 0019_push_notifications (non exécuté par Prisma) », avec la commande `npx prisma db execute --file …` ;
  - `BEGIN;`, `DROP TABLE` des deux tables, suppression de la ligne `_prisma_migrations` de `0019`, `COMMIT;`.

  Faire passer T006.
- [X] T009 [P] Ajouter dans `backend/src/common/errors.ts` les codes `PUSH_DISABLED` (409, « Les notifications push ne sont pas activées par l'établissement. ») et `PUSH_DEVICE_LIMIT` (409, « Vous avez déjà 10 appareils abonnés. Retirez-en un pour activer celui-ci. »)
- [X] T010 [P] Tests en échec dans `backend/test/unit/push-sender.spec.ts` pour `WebPushSender` (`backend/src/push/web-push.sender.ts`), avec `jest.mock('web-push')` :
  - `send(subscription, payload, options)` appelle `sendNotification` avec `{ TTL: 1800, urgency: 'high', topic, timeout: 10000, vapidDetails: { subject, publicKey, privateKey } }` ;
  - renvoie `{ statusCode }` en cas de succès ;
  - une `WebPushError` devient `{ statusCode, retryAfterSeconds }` (en-tête `retry-after` lu s'il est présent) ;
  - une erreur réseau ou un délai dépassé devient `{ statusCode: null }` ;
  - aucune exception ne sort de `send`.
- [X] T011 Implémenter `backend/src/push/web-push.sender.ts` (interface `PushSender`, jeton `PUSH_SENDER`, classe `WebPushSender` construite avec `APP_CONFIG`) et `backend/src/push/push.module.ts` (fournit `PUSH_SENDER` ; `PushDispatcher` y est ajouté en T013) ; enregistrer `PushModule` dans `backend/src/app.module.ts` ; faire passer T010
- [X] T012 [P] Tests en échec dans `backend/test/unit/notification-publisher.spec.ts` pour `CompositeNotificationPublisher` :
  - `publish(n)` attend la publication Socket.IO, puis appelle `PushDispatcher.enqueue(n)` **sans l'attendre** (une promesse d'`enqueue` jamais résolue ne bloque pas `publish`) ;
  - une exception ou un rejet d'`enqueue` ne remonte jamais ;
  - une liste vide n'appelle rien.
- [X] T013 Créer `backend/src/notifications/composite-notification.publisher.ts` et fournir `NOTIFICATION_PUBLISHER` avec cette classe dans `backend/src/notifications/notifications.module.ts` (importe `PushModule`, garde `SocketNotificationPublisher` comme fournisseur) ; créer `backend/src/push/push-dispatcher.service.ts` avec `enqueue(notifications): void`, qui ne fait rien si `config.push` est `null` (complété en US1), le déclarer et l'exporter dans `backend/src/push/push.module.ts` ; faire passer T012 ; les 8 appels à `flushAfterCommit` restent inchangés (research R2)

**Point d'étape** : configuration lue, tables créées, push branché après validation et sans effet tant qu'il est désactivé.

---

## Phase 3 : User Story 1 — Recevoir une affectation téléphone verrouillé (Priorité : P1) 🎯 MVP

**Objectif** : pour un abonnement présent en base, chaque notification autorisée part en push avec un contenu
minimal ; le service worker l'affiche (sauf au premier plan) ; l'ouverture marque la notification lue.

**Test indépendant** : avec l'envoyeur simulé et un abonnement inséré en base, affecter une garde : un envoi par
abonnement du surveillant, contenu `{ v, id, type: 'ASSIGNED', place: <classe>, url: '/gardes/<id>' }` ; le service
worker simulé affiche « Demande affectée » / « <classe> » ; la page de la garde ouverte avec `?notification=<id>`
marque la notification lue.

### Tests de la User Story 1 (écrits d'abord, vus en échec) ⚠️

- [X] T014 [P] [US1] Tests en échec dans `backend/test/unit/push-category.spec.ts` pour `pushCategoryOf(type, kind)` et `pushRecipientAllowed(type, recipientId, assigneeId)` (`backend/src/push/domain/push-category.ts`) :
  - parcourir **toutes** les valeurs de `NotificationType` (`@prisma/client`) × `'WORK'`/`'COVERAGE'` contre la table attendue :
    - `URGENT`/WORK → `urgent` ;
    - `ASSIGNED`/COVERAGE → `coverage` ;
    - sur COVERAGE, `coverage` pour `COVERAGE_REQUESTED`, `COVERAGE_EMPTY_CLASS`, `COVERAGE_LIFTED`, `COVERAGE_UPDATED`, `COVERAGE_EXTENDED`, `COVERAGE_RELIEF_REQUESTED`, `COVERAGE_LATE`, `COVERAGE_DOUBLE_ASSIGNMENT`, `COVERAGE_SUPPORT_REMINDER` ;
    - sur COVERAGE, `unfilled` pour `COVERAGE_TAKEOVER_EXPIRED`, `COVERAGE_ESCALATED`, `COVERAGE_UNFILLED` ;
    - sur COVERAGE, `attendance` pour `COVERAGE_TEACHER_ARRIVED`, `COVERAGE_ATTENDANCE_ANOMALY` ;
    - tout le reste → `null`, y compris `ASSIGNED`/WORK, `MESSAGE_NEW`, `OVERDUE`, `UNASSIGNED`, `CLOSED`/`CANCELLED`/`STATUS_CHANGED` sur une garde, et les types de garde sur une demande WORK (NC-1, NC-2) ;
  - `pushRecipientAllowed('COVERAGE_TEACHER_ARRIVED', a, a)` → vrai, `(…, a, b)` → faux, `(…, a, null)` → faux ; vrai pour tout autre type (D4) ;
  - la signature ne reçoit pas de priorité.
- [X] T015 [P] [US1] Tests en échec dans `backend/test/unit/push-payload.spec.ts` pour `buildPushPayload({ notificationId, type, requestId, kind, reference, className })` (`backend/src/push/domain/push-payload.ts`) :
  - le JSON a exactement les clés `v`, `id`, `type`, `place`, `url` ;
  - `place` = `className` pour COVERAGE, `reference` pour WORK ;
  - `url` = `/gardes/<requestId>` ou `/demandes/<requestId>` ;
  - **SC-006** : pour chacun des 16 types envoyés en push, avec une demande dont le titre, la description, le message et les noms valent des sentinelles (`'TITRE-SECRET'`, `'DESCRIPTION-SECRETE'`, `'Mme Sentinelle'`), le JSON ne contient aucune sentinelle, ni `priority`, ni `status` ;
  - taille inférieure à 1 Ko.
- [X] T016 [P] [US1] Tests en échec dans `backend/test/unit/push-retry.spec.ts` pour `nextAttemptDelayMs(attempt, result, elapsedMs)` (`backend/src/push/domain/push-retry.ts`, attempt de 1 à 3, validité 1 800 000 ms) :
  - 2xx → `'done'` ;
  - 404 ou 410 → `'delete'` ;
  - 400, 403, 413 → `'drop'` ;
  - `null` (réseau ou délai), 429, 5xx → 5 000 après la tentative 1, 30 000 après la 2, `'drop'` après la 3 ;
  - `retryAfterSeconds` plus grand que le délai prévu → le délai devient `retryAfterSeconds × 1000` s'il tient dans la validité, sinon `'drop'` ;
  - jamais de délai qui dépasse la validité.
- [X] T017 [US1] Tests d'intégration en échec dans `backend/test/integration/push-dispatch.spec.ts` (push activé et envoyeur simulé, voir Conventions ; utilitaire `waitForSends(n)` qui attend les appels de l'envoyeur) :
  - (a) une garde affectée à un surveillant qui a deux abonnements → deux envois, contenu conforme à [push-payload.md](contracts/push-payload.md), `topic` = id sans tirets ;
  - (b) `ASSIGNED` d'une demande de travail non urgente → aucun envoi ;
  - (c) soumission d'une demande de travail urgente → un envoi `URGENT` avec `place` = référence ;
  - (d) arrivée d'un enseignant sur une garde affectée (route de pointage existante) → envoi au seul surveillant affecté ; aucun envoi aux administrateurs, qui ont bien la notification en base (D4) ;
  - (e) destinataire désactivé directement en base → aucun envoi ;
  - (f) `APP_CONFIG.push` à `null` → l'envoyeur n'est jamais appelé ;
  - (g) réponse 410 → abonnement supprimé ; réponse 201 → `lastSuccessAt` renseigné ;
  - (h) un journal d'erreur d'envoi contient le type, le code et une empreinte de 12 caractères hexadécimaux, mais ni l'`endpoint`, ni le contenu, ni les clés (espion sur `Logger`) ;
  - (i) **(US5-4)** session de l'abonné supprimée en base (`prisma.session.deleteMany`, expiration simulée, sans déconnexion) → l'envoi a quand même lieu (D8) ;
  - (j) à (l) : minuteries simulées (`jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })`, puis `jest.advanceTimersByTimeAsync(5_000)`), 1re tentative en réponse 500 :
    - (j) abonnement supprimé en base (`prisma.pushSubscription.delete`, comme le fera la déconnexion en US5) avant la 2e tentative → aucune 2e tentative ;
    - (k) abonnement transféré en base à un autre utilisateur (`prisma.pushSubscription.update({ data: { userId: <autre> } })`, comme le fera la bascule en US2) avant la 2e tentative → aucune 2e tentative, rien n'est envoyé à son nom ;
    - (l) compte désactivé en base (`prisma.user.update({ data: { active: false } })`) avant la 2e tentative → aucune 2e tentative.

    Ces trois cas n'utilisent que la base : T017 ne dépend ni de la route `PUT` (US2, T032) ni de la suppression à la déconnexion (US5, T063).

    *Écart (implémentation)* : au lieu des minuteries simulées de Jest, qui risquaient de bloquer Prisma et le serveur HTTP, l'attente entre deux tentatives passe par un ordonnanceur injectable (`PUSH_SCHEDULER`, `timerScheduler` par défaut) ; le test le remplace et libère chaque attente lui-même. `PushDispatcher.settled()` attend la fin de tous les envois en cours.

### Implémentation de la User Story 1

- [X] T018 [P] [US1] Implémenter `backend/src/push/domain/push-category.ts` avec une table `Record<NotificationType, …>` exhaustive (research R3) ; faire passer T014
- [X] T019 [P] [US1] Implémenter `backend/src/push/domain/push-payload.ts` ; faire passer T015
- [X] T020 [P] [US1] Implémenter `backend/src/push/domain/push-retry.ts` (research R7) ; faire passer T016
- [X] T021 [US1] Compléter `enqueue` dans `backend/src/push/push-dispatcher.service.ts` :
  - pour chaque notification, lire la demande (`kind`, `reference`, `assigneeId`, nom de la classe via `coverage.class.name`) et le destinataire (`active`) ;
  - appliquer `pushCategoryOf` et `pushRecipientAllowed`, puis lire les abonnements du destinataire ;
  - envoyer chaque `buildPushPayload` par `PUSH_SENDER`, au plus 10 envois simultanés, avec nouvelles tentatives par `setTimeout` selon `nextAttemptDelayMs` ;
  - **avant chaque tentative, y compris la première**, relire l'abonnement par son `id` avec son `userId` et `user.active` ; s'il n'existe plus, appartient à un autre utilisateur ou si le compte est inactif → abandon sans envoi (FR-020, NC-8a) ;
  - `'delete'` → supprimer l'abonnement ; succès → mettre à jour `lastSuccessAt` ;
  - journaliser avec `Logger` le type, le code et l'empreinte SHA-256 de l'`endpoint` (12 caractères) seulement ;
  - toute erreur est attrapée.

  Faire passer T017.
- [X] T022 [P] [US1] Tests en échec dans `frontend/tests/push/sw.test.ts`, qui charge le texte de `frontend/public/sw.js` et l'exécute avec un `self` simulé (registre `addEventListener`, `registration.showNotification`, `clients.matchAll`, `clients.openWindow`, `location.search`, `navigator.userAgent`, `waitUntil`) :
  - `push` valide avec `?lang=fr` → `showNotification('Classe vide signalée', { body: 'CE1 Vert', tag: <id>, data: { url, id } })` ; avec `?lang=en` → libellé anglais ;
  - fenêtre visible et active sur un agent utilisateur d'ordinateur ou Android → pas d'affichage ; même situation avec un agent utilisateur iPhone → affichage (D10, research R13) ;
  - contenu invalide (`v` ≠ 1, type inconnu, `url` absolue `https://exemple.test/`) → rien sur ordinateur, « Nouvelle notification » sur iPhone ;
  - `notificationclick` → met au premier plan une fenêtre existante et la dirige vers `url?notification=<id>`, sinon `openWindow` ; jamais une autre origine ;
  - aucun écouteur `fetch` enregistré ;
  - les libellés de `sw.js` sont égaux à `NOTIFICATION_LABELS` (`frontend/src/features/notifications/api.ts`) et à leur traduction anglaise pour les 16 types envoyés en push.
- [X] T023 [US1] Écrire `frontend/public/sw.js` (JavaScript simple, sans import ; `install` → `skipWaiting`, `activate` → `clients.claim` ; `push`, `notificationclick` ; libellés fr/en des 16 types ; icône `/icons/icon-192.png`) selon [contracts/push-payload.md](contracts/push-payload.md) ; faire passer T022. *Ajout (implémentation)* : bloc `frontend/public/sw.js` dans `eslint.config.mjs` (`sourceType: 'script'`, `globals.serviceworker`), sans lequel le lint refuse `self`. Premier plan = fenêtre `visible` **et** `focused` ; tous les appareils Apple (iPhone, iPad, Safari macOS) affichent toujours.
- [X] T024 [P] [US1] Tests en échec dans `frontend/tests/push/read-after-open.test.tsx` :
  - `CoverageDetailPage` (`/gardes/<id>?notification=<nid>`) et `RequestDetailPage` (`/demandes/<id>?notification=<nid>`) : après le chargement réussi → un seul `POST /api/notifications/read { ids: [nid] }`, puis le paramètre est retiré de l'adresse (`replace`) ;
  - chargement en 403 ou 404 → aucun `POST` ;
  - sans paramètre → aucun `POST` ;
  - **(US1-3)** sans session (`GET /api/auth/me` → 401) sur `/gardes/<id>?notification=<nid>` → redirection vers `/connexion` avec `state.from` = `/gardes/<id>?notification=<nid>`, aucun `POST` ; après connexion et retour vers `from`, chargement réussi → un seul `POST /api/notifications/read { ids: [nid] }`.
- [X] T025 [US1] Créer `frontend/src/features/push/useMarkReadFromPush.ts` (paramètre `notification`, réutilise `useMarkRead` de `frontend/src/features/notifications/api.ts`) et l'appeler dans `frontend/src/features/coverage/CoverageDetailPage.tsx` et `frontend/src/features/requests/RequestDetailPage.tsx` une fois les données chargées ; faire passer T024

**Point d'étape** : la chaîne serveur → service de push simulé → service worker → page fonctionne pour tout
abonnement en base.

---

## Phase 4 : User Story 2 — Activer le push sur son appareil, y compris sur iPhone (Priorité : P1)

**Objectif** : l'utilisateur abonne son appareil depuis « Mon profil » ; sur iPhone, le parcours écran d'accueil
est expliqué ; l'abonnement est resynchronisé à chaque ouverture.

**Test indépendant** : simuler chaque état (`disabled`, `unsupported`, `ios-install`, `denied`, `reactivate`,
`inactive`, `active`) : bons messages, aucune demande d'autorisation avant le clic, `PUT /api/push/subscriptions`
après activation.

### Tests de la User Story 2 (écrits d'abord, vus en échec) ⚠️

- [X] T026 [P] [US2] Tests en échec dans `backend/test/unit/push-endpoint.spec.ts` pour `validatePushSubscription({ endpoint, keys })` (`backend/src/push/domain/push-endpoint.ts`) :
  - acceptés : `https://fcm.googleapis.com/fcm/send/x`, `https://updates.push.services.mozilla.com/wpush/v2/x`, `https://web.push.apple.com/x`, `https://wns2-par02p.notify.windows.com/w/?token=x` ;
  - refusés (champ `endpoint`) :
    - `http://fcm.googleapis.com/…`, `https://fcm.googleapis.com.evil.example/…`, `https://evil.example/…` ;
    - `https://user:pw@fcm.googleapis.com/…`, `https://fcm.googleapis.com:8443/…` ;
    - adresse de 2049 caractères ;
  - refusés (champ `keys`) : `p256dh` qui ne fait pas 65 octets ou ne commence pas par `0x04` ; `auth` qui ne fait pas 16 octets (research R9).
- [X] T027 [P] [US2] Tests en échec dans `backend/test/unit/device-label.spec.ts` pour `deviceLabel(userAgent)` (`backend/src/push/domain/device-label.ts`) :
  - agents utilisateurs réels → « iPhone · Safari », « iPad · Safari », « Android · Chrome », « Android · Samsung Internet », « Windows · Edge », « Windows · Chrome », « macOS · Safari », « Linux · Firefox » ;
  - vide ou inconnu → « Appareil inconnu » ;
  - résultat de 80 caractères au plus.
- [X] T028 [P] [US2] Tests d'intégration en échec dans `backend/test/integration/push-subscriptions.spec.ts` selon [contracts/http-api.md](contracts/http-api.md) :
  - `GET /api/push/config` → `{ enabled: true, publicKey }`, ou `{ enabled: false, publicKey: null }` sans clés ;
  - `PUT /api/push/subscriptions`, création :
    - 201 `{ id, deviceLabel: 'Android · Chrome', created: true }` avec un `User-Agent` Android ;
  - `PUT /api/push/subscriptions`, même `endpoint` :
    - 200 `created: false` ;
    - `sessionId` mis à jour ;
    - `lastUsedAt` inchangé avant 24 h (`fixedNow`), mis à jour après 25 h (NC-3) ;
  - `PUT /api/push/subscriptions`, même `endpoint` par un autre utilisateur → l'abonnement lui est transféré (NC-8a) ;
  - erreurs :
    - adresse ou clés invalides → 400 `VALIDATION_ERROR` ; champ inconnu → 400 ;
    - push désactivé → 409 `PUSH_DISABLED` ;
    - 11e appareil → 409 `PUSH_DEVICE_LIMIT` ;
    - sans session → 401 ;
  - aucune réponse ne contient l'`endpoint`, `p256dh` ou `auth`.

### Implémentation de la User Story 2

  *Écart (implémentation) : la règle des 24 h est vérifiée en reculant lastUsedAt en base (23 h, puis 25 h), faute d’horloge injectable dans les routes HTTP. Le format d’erreur réel est { error: { code, message, details } } ; contracts/http-api.md est corrigé.*
- [X] T029 [P] [US2] Implémenter `backend/src/push/domain/push-endpoint.ts` (liste d'hôtes fixe, research R9) ; faire passer T026
- [X] T030 [P] [US2] Implémenter `backend/src/push/domain/device-label.ts` ; faire passer T027
- [X] T031 [US2] Créer `backend/src/push/push.dto.ts` (`UpsertPushSubscriptionDto` : `endpoint` chaîne de 2048 caractères au plus ; `keys` objet imbriqué `p256dh`, `auth`) et `backend/src/push/push-subscriptions.service.ts` :
  - `upsert(user, sessionId, dto, userAgent, now)` :
    - valide la configuration et `validatePushSubscription` ;
    - limite de 10 appareils (hors abonnement transféré ou déjà possédé) ;
    - bascule vers le nouvel utilisateur ;
    - `lastUsedAt` réécrit seulement s'il date de plus de 24 h ;
  - `listForUser(userId, sessionId)` renvoie `current` ;
  - le libellé est calculé par `deviceLabel`, l'agent utilisateur brut n'est jamais conservé.
- [X] T032 [US2] Créer `backend/src/push/push.controller.ts` (`GET /api/push/config`, `PUT /api/push/subscriptions` avec 201 ou 200, `GET /api/push/subscriptions`) avec `@CurrentUser()` et la session courante, comme `auth.controller.ts` ; faire passer T028
  *Avancé depuis T063 (US5) : DELETE /api/push/subscriptions/current et deleteForSession, testés dans T028, car « Désactiver sur cet appareil » (US2) en a besoin.*
- [X] T033 [P] [US2] Tests en échec dans `frontend/tests/push/push-support.test.ts` pour `pushSupportState(env)` (`frontend/src/features/push/pushSupport.ts`), où `env` contient `pushEnabled`, `hasServiceWorker`, `hasPushManager`, `hasNotification`, `permission`, `userAgent`, `platform`, `maxTouchPoints`, `standalone`, `subscriptionKey`, `serverKey` :
  - ordre `disabled` → `unsupported` → `ios-install` → `denied` → `reactivate` → `inactive` → `active` (research R12) ;
  - iPhone iOS 16.3 → `unsupported` ;
  - iPhone iOS 16.4 hors écran d'accueil → `ios-install` ;
  - iPadOS (`MacIntel` et `maxTouchPoints` 5) hors écran d'accueil → `ios-install` ;
  - Android Chrome hors écran d'accueil → `inactive` (pas d'installation exigée) ;
  - clés différentes → `reactivate`.
- [X] T034 [US2] Implémenter `frontend/src/features/push/pushSupport.ts` (fonction pure et lecteur `readPushEnvironment()` pour le navigateur) ; faire passer T033
- [X] T035 [P] [US2] Tests en échec dans `frontend/tests/push/notifications-section.test.tsx` (bloc « Cet appareil » de `NotificationsSection`) :
  - à l'affichage, `Notification.requestPermission` n'est **pas** appelé (FR-001) ;
  - le clic « Activer les notifications sur cet appareil » :
    - appelle `requestPermission`, `navigator.serviceWorker.register('/sw.js?lang=fr', { scope: '/', updateViaCache: 'none' })` et `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` ;
    - envoie `PUT /api/push/subscriptions` avec `subscription.toJSON()` ;
    - affiche « Les notifications push sont actives sur cet appareil. » ;
  - chaque état affiche son message de [contracts/ui.md](contracts/ui.md), mot pour mot (`ios-install` en liste numérotée, sans bouton d'activation) ;
  - 409 `PUSH_DEVICE_LIMIT` → `Alert` avec le message du serveur ;
  - « Désactiver sur cet appareil » → `unsubscribe()` et `DELETE /api/push/subscriptions/current` ;
  - le bloc d'état a `role="status"` ;
  - la note sur les appareils partagés est affichée.
- [X] T036 [US2] Créer `frontend/src/features/push/api.ts` (requêtes TanStack Query : configuration, abonnements, `PUT`, `DELETE current`) et `frontend/src/features/push/usePushDevice.ts` :
  - enregistrement de `/sw.js?lang=<language()>` ;
  - abonnement, désabonnement, comparaison des clés.
- [X] T037 [US2] Créer `frontend/src/features/push/NotificationsSection.tsx` (titre de niveau 2 « Notifications », bloc « Cet appareil », note sur les appareils partagés) et l'ajouter en dernière `SectionCard` de `frontend/src/features/auth/ProfilePage.tsx` ; faire passer T035
  *Les tests existants frontend/tests/auth/profile.test.tsx et change-password.test.tsx visaient toute zone role="status" de « Mon profil » : ils visent désormais le message de confirmation du changement de mot de passe.*
- [X] T038 [P] [US2] Tests en échec dans `frontend/tests/push/push-sync.test.tsx` : au montage d'`AppLayout`, push activé, autorisation accordée et abonnement existant dans le navigateur avec la même clé → un seul `PUT /api/push/subscriptions` ; clé différente → aucun `PUT` ; push désactivé ou pas d'abonnement → aucun appel ni enregistrement du service worker
  *Écart TDD : usePushSync a été écrit avec usePushDevice (T036) avant ce test, qui a donc passé du premier coup. Contrôle par mutation : sans l’envoi au serveur, 2 tests sur 7 échouent.*
- [X] T039 [US2] Appeler la synchronisation de `usePushDevice` dans `frontend/src/app/AppLayout.tsx` (une fois par chargement, erreurs ignorées) ; faire passer T038
- [X] T040 [P] [US2] Tests en échec dans `frontend/tests/push/manifest.test.ts`, qui lit les fichiers :
  - `frontend/public/manifest.json` contient `name` « La Joconde Jumelle », `start_url` `/`, `scope` `/`, `display` `standalone`, des icônes 192 et 512 qui existent dans `frontend/public/icons/` ;
  - `frontend/index.html` contient `<link rel="manifest" href="/manifest.json">`, `<meta name="theme-color">` et `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`.
- [X] T041 [US2] Créer `frontend/public/manifest.json` et les icônes `frontend/public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180 px), tirées une fois de `frontend/public/logo.png` avec `sharp` (déjà installé dans `backend`), en commande ponctuelle, sans script versionné ; ajouter les liens dans `frontend/index.html` ; faire passer T040
- [X] T042 [US2] Créer `frontend/src/i18n/en/push.ts` avec les traductions de tous les textes ajoutés en US1 et US2, l'enregistrer dans `frontend/src/i18n/en/index.ts`, et vérifier que les tests de `frontend/tests/i18n/` passent

**Point d'étape** : MVP (US1 + US2) utilisable sur appareil réel, push activé.

---

## Phase 5 : User Story 3 — Choisir ses catégories (Priorité : P1)

**Objectif** : quatre interrupteurs sur le compte, relus à chaque envoi ; son des urgences sur le compte.

**Test indépendant** : désactiver « Couverture », affecter une garde : aucun envoi, notification en base ; le
réglage est identique sur une seconde session.

### Tests de la User Story 3 (écrits d'abord, vus en échec) ⚠️

- [X] T043 [P] [US3] Tests d'intégration en échec dans `backend/test/integration/notification-preferences.spec.ts` :
  - `GET /api/notifications/preferences` sans ligne → toutes les catégories `true`, `urgentSound: true`, `urgentSoundSet: false` ;
  - `PATCH { categories: { coverage: false } }` → 200 avec les préférences complètes ; les autres champs sont inchangés ;
  - deux sessions du même utilisateur qui modifient des champs différents l'une après l'autre → les deux valeurs sont conservées (NC-9) ;
  - `PATCH { urgentSound: false }` → `urgentSoundSet: true` ;
  - corps vide, champ inconnu ou valeur non booléenne → 400 `VALIDATION_ERROR` ;
  - fonctionne avec le push désactivé.
- [X] T044 [P] [US3] Ajouter à `backend/test/integration/push-dispatch.spec.ts` des tests en échec : catégorie `coverage` désactivée → aucun envoi pour une affectation de garde, notification bien en base ; catégorie `urgent` toujours active → envoi pour une demande urgente

### Implémentation de la User Story 3

- [X] T045 [US3] Créer `backend/src/notifications/notification-preferences.service.ts` (`get(userId)` avec les défauts, `patch(userId, dto)` en upsert champ par champ) et `backend/src/notifications/notification-preferences.controller.ts` (`GET`, `PATCH` `/api/notifications/preferences`, DTO avec objet imbriqué `categories` de booléens facultatifs et `urgentSound` booléen facultatif, au moins un champ), déclarés dans `notifications.module.ts` ; faire passer T043
- [X] T046 [US3] Dans `backend/src/push/push-dispatcher.service.ts`, lire la ligne `NotificationPreference` du destinataire **directement par `PrismaService`** au moment de l'envoi (absente → tout actif) et ne rien envoyer si sa catégorie est désactivée. Ne pas injecter `NotificationPreferencesService` : `NotificationsModule` importe déjà `PushModule` (T013), l'inverse créerait une dépendance circulaire. Faire passer T044.
- [X] T047 [P] [US3] Tests en échec dans `frontend/tests/push/notifications-categories.test.tsx` (bloc « Catégories » de `NotificationsSection`) :
  - quatre `Switch` avec les libellés et descriptions de [contracts/ui.md](contracts/ui.md) ;
  - un changement envoie aussitôt `PATCH` et annonce « Préférence enregistrée. » ; une erreur rétablit la valeur et affiche un message ;
  - désactiver « Couverture » prend 2 actions depuis « Mon profil » (SC-004 : 3 au plus) ;
  - bloc visible dans les états `disabled` et `unsupported` ;
  - mention « Ces choix s'appliquent à tous vos appareils abonnés. »
- [X] T048 [US3] Ajouter à `frontend/src/features/notifications/api.ts` les requêtes `useNotificationPreferences` et `useUpdateNotificationPreferences`, puis le bloc « Catégories » dans `NotificationsSection.tsx` ; faire passer T047
  *Les préférences ont leur propre clé de requête (notification-preferences), distincte de celle des notifications, et la section lit les catégories avec prudence (valeur par défaut si la réponse est inattendue).*
- [X] T049 [P] [US3] Tests en échec dans `frontend/tests/notifications/urgent-sound-account.test.tsx` :
  - `useUrgentSound` lit `urgentSound` du compte ;
  - le bouton de la cloche envoie `PATCH { urgentSound }` ;
  - valeur locale `lajoconde.signalSonoreUrgences` = `off` avec `urgentSoundSet: false` → un seul `PATCH { urgentSound: false }`, puis la clé locale est supprimée ;
  - avec `urgentSoundSet: true` → aucun `PATCH`, clé supprimée ;
  - l'interrupteur « Signal sonore pour les urgences » de `NotificationsSection` partage la même valeur.

  Adapter les tests existants de `frontend/tests/notifications/urgent-alert.test.tsx` et `NotificationCenter.test.tsx` qui supposent le stockage local.
- [X] T050 [US3] Réécrire `frontend/src/features/notifications/useUrgentSound.ts` sur la préférence du compte, avec reprise unique (NC-6), et ajouter l'interrupteur du son dans `NotificationsSection.tsx` ; ajouter les traductions dans `frontend/src/i18n/en/push.ts` ; faire passer T049

**Point d'étape** : préférences effectives à l'envoi, son des urgences partagé entre appareils.

---

## Phase 6 : User Story 4 — Régler la plage horaire de l'établissement (Priorité : P2)

**Objectif** : le super administrateur règle jours et heures ; hors plage, aucun push, sans exception ni envoi
différé.

**Test indépendant** : régler une plage fermée, provoquer une notification autorisée : aucun envoi ; trois entrées
d'audit `SETTING_CHANGED` ; refus pour `ADMIN`.

### Tests de la User Story 4 (écrits d'abord, vus en échec) ⚠️

- [X] T051 [P] [US4] Tests en échec dans `backend/test/unit/push-window.spec.ts` pour `isWithinPushWindow(instant, { days, start, end }, timeZone)` (`backend/src/push/domain/push-window.ts`), fuseau `Africa/Tunis`, plage `MON`–`FRI` de `07:30` à `18:30` :
  - lundi 07:29 faux, 07:30 vrai, 18:29 vrai, 18:30 faux (fin exclue) ;
  - samedi faux ; `SUN` compris s'il est configuré ;
  - l'instant UTC `06:30Z` vaut 07:30 à Tunis ;
  - utilise `localDate` et `localTime` de `backend/src/common/school-time.ts`.
- [X] T052 [P] [US4] Tests d'intégration en échec dans `backend/test/integration/push-window-settings.spec.ts` :
  - `GET /api/admin/settings` → défauts `pushWindowDays` `["MON","TUE","WED","THU","FRI"]`, `07:30`, `18:30` ;
  - `PUT` valide par le super administrateur → 200, et une entrée `SETTING_CHANGED` par clé modifiée avec `before` et `after` ;
  - fin ≤ début → 400 sur `pushWindowEnd`, message « L'heure de fin doit être après l'heure de début. » ;
  - liste de jours vide ou code inconnu → 400 ;
  - utilisateur `ADMIN` → 403 ;
  - `GET /api/settings/client` renvoie les trois clés.
- [X] T053 [P] [US4] Ajouter à `backend/test/integration/push-dispatch.spec.ts` des tests en échec : plage fermée à l'instant de l'envoi (`fixedNow`) → aucun envoi, notification en base ; plage réouverte plus tard → toujours aucun envoi pour cette notification (pas d'envoi différé, NC-7)

### Implémentation de la User Story 4

  *Les tests du dispatcher ouvrent la plage toute la journée, tous les jours (00:00–23:59, minute 23:59 exclue) : sans cela, la plage par défaut les ferait échouer la nuit et le week-end. Plage fermée simulée par « tous les jours sauf aujourd’hui ».*
- [X] T054 [US4] Dans `backend/src/settings/settings.service.ts`, ajouter à `SETTING_DEFAULTS` `pushWindowDays: ['MON','TUE','WED','THU','FRI']`, `pushWindowStart: '07:30'`, `pushWindowEnd: '18:30'`, et à `SETTING_RULES` `subset` (avec les sept codes de jour) et `time`. Ajouter à la règle `subset` un libellé facultatif, pour un message adapté aux jours (« Au moins un jour parmi : … »). Dans `backend/src/settings/admin-settings.service.ts`, ajouter le contrôle croisé début < fin sur les valeurs fusionnées et exposer les trois clés dans `clientSettings()`. Faire passer T052.
  *Tests existants adaptés au nouveau contrat : admin-categories.spec.ts (GET /api/settings/client comparé à un objet exact) et le jeu SETTINGS de frontend/tests/admin/admin-pages.test.tsx.*
- [X] T055 [US4] Implémenter `backend/src/push/domain/push-window.ts` ; faire passer T051
- [X] T056 [US4] Dans `backend/src/push/push-dispatcher.service.ts`, évaluer la plage au premier envoi avec `config.schoolTimezone` et les réglages lus par `SettingsService` ; faire passer T053
- [X] T057 [P] [US4] Tests en échec dans `frontend/tests/admin/push-window-settings.test.tsx` (`SettingsAdminPage`) :
  - groupe « Plage d'envoi des notifications push » : `fieldset` et `legend` avec sept cases (lundi à dimanche), champs « Heure de début » et « Heure de fin » ;
  - texte d'aide de [contracts/ui.md](contracts/ui.md) ;
  - ligne d'état « Notifications push : activées » ou « désactivées (clés non configurées) », selon `GET /api/push/config` ;
  - enregistrement par le bouton existant ; erreur du serveur affichée sur le champ « Heure de fin ».
- [X] T058 [US4] Ajouter ce groupe dans `frontend/src/features/admin/SettingsAdminPage.tsx` ; faire passer T057
- [X] T059 [US4] Tests puis implémentation dans `NotificationsSection.tsx` de la mention « Envoi du lundi au vendredi, de 07:30 à 18:30 (heure de l'école). En dehors, les notifications restent dans l'application. », construite à partir de `GET /api/settings/client` (jours formatés selon la langue) ; ajouter les traductions dans `frontend/src/i18n/en/push.ts` et `admin.ts`

**Point d'étape** : la plage s'applique et sa modification est auditée.

---

## Phase 7 : User Story 5 — Gérer ses appareils et ne plus rien recevoir après déconnexion (Priorité : P2)

**Objectif** : liste et retrait des appareils ; suppressions D8 et NC-8 ; nettoyage à 90 jours.

**Test indépendant** : deux appareils, en retirer un, se déconnecter de l'autre : plus aucun envoi vers eux,
lignes supprimées.

### Tests de la User Story 5 (écrits d'abord, vus en échec) ⚠️

  *Mise en forme des jours dans frontend/src/features/push/pushWindowText.ts (« du lundi au vendredi », « tous les jours », « le lundi, le mercredi et le samedi »), testée dans frontend/tests/push/push-window-text.test.tsx avant l’implémentation.*
- [X] T060 [P] [US5] Tests d'intégration en échec dans `backend/test/integration/push-lifecycle.spec.ts` :
  - `GET /api/push/subscriptions` → seulement les siens, `current` vrai pour celui de la session ;
  - `DELETE /api/push/subscriptions/:id` :
    - le sien → 204 ;
    - celui d'un autre → 404 et une entrée d'audit `ACCESS_DENIED`, sans `endpoint` dans les détails ;
    - identifiant inconnu → 404 ;
  - `DELETE /api/push/subscriptions/current` → 204, même sans abonnement ;
  - `POST /api/auth/logout` → supprime les abonnements de la session fermée seulement ;
  - `POST /api/auth/password` → supprime ceux de l'utilisateur dont `sessionId` diffère de la session courante ou est vide, garde celui de la session courante (NC-8b) ;
  - réinitialisation du mot de passe et désactivation par l'administrateur (routes existantes de `admin-users`) → plus aucun abonnement ni session ;
  - un abonnement restant pour un compte désactivé n'est jamais servi (vérification par l'envoyeur simulé) ;
  - parcours complet pendant une tentative en attente (push activé, envoyeur simulé qui répond 500 à la 1re tentative, minuteries simulées comme dans T017) :
    - `POST /api/auth/logout` de la session liée avant la 2e tentative → aucune 2e tentative (FR-020, SC-003) ;
    - même `endpoint` enregistré par un autre utilisateur (`PUT /api/push/subscriptions`) avant la 2e tentative → aucune 2e tentative, rien n'est envoyé à son nom (NC-8a).
  *Une session par compte, ouverte une fois et partagée : le limiteur de connexions (5 par minute et par compte) refusait sinon les connexions répétées. La réinitialisation par l’administration répond 200.*
- [X] T061 [P] [US5] Tests d'intégration en échec dans `backend/test/integration/push-subscriptions-cleanup-job.spec.ts`, sur le modèle de `orphan-files-job.spec.ts` : avec `fixedNow`, un abonnement dont `lastUsedAt` date de 91 jours est supprimé, un de 89 jours est conservé

### Implémentation de la User Story 5

- [X] T062 [US5] Dans `backend/src/push/push-subscriptions.service.ts`, ajouter :
  - `deleteOwn(user, id, ctx)` : 404 si absent ou appartenant à un autre ; dans ce second cas, `ACCESS_DENIED` par `AuditService.log` comme `request-transitions.service.ts` `logDenied` ;
  - `deleteForSession(sessionId)` ;
  - `deleteOtherDevices(userId, keepSessionId)` ;
  - `deleteAllForUser(userId, tx?)`.
- [X] T063 [US5] Dans `backend/src/push/push.controller.ts`, ajouter `DELETE /api/push/subscriptions/current` **avant** `DELETE /api/push/subscriptions/:id` (`ParseUUIDPipe`), puis brancher les suppressions :
  - `backend/src/auth/auth.service.ts` : `logout` (avant ou après `sessions.revoke`, sans incidence) et `changePassword` ;
  - `backend/src/users/users.service.ts` : désactivation dans `update` et `resetPassword`, dans la transaction existante (FR-020).

  Faire passer T060.
  *Déjà fait en US2 (T032) : DELETE /api/push/subscriptions/current et deleteForSession. Reste : DELETE /:id, les branchements auth et utilisateurs.*
- [X] T064 [US5] Créer `backend/src/scheduler/push-subscriptions-cleanup.job.ts` (`@Interval` d'une heure, suppression des `lastUsedAt` de plus de 90 jours, nombre supprimé journalisé) et l'enregistrer dans `backend/src/scheduler/scheduler.module.ts` ; faire passer T061
- [X] T065 [P] [US5] Tests en échec dans `frontend/tests/push/devices-list.test.tsx` et `frontend/tests/auth/logout-push.test.tsx` :
  - liste `<ul>` des appareils avec libellé, « Activé le … », « Dernière utilisation le … », badge « Cet appareil » ;
  - bouton « Retirer iPhone · Safari » avec confirmation → `DELETE /api/push/subscriptions/<id>`, puis liste mise à jour ;
  - état vide « Aucun appareil abonné. » ;
  - déconnexion : `unsubscribe()` et `DELETE /api/push/subscriptions/current` avant `POST /api/auth/logout` ; un échec de ces deux appels n'empêche pas la déconnexion.
- [X] T066 [US5] Créer `frontend/src/features/push/DevicesList.tsx` (bloc « Mes appareils » de `NotificationsSection`) et modifier `useLogout` dans `frontend/src/features/auth/useCurrentUser.ts` ; ajouter les traductions ; faire passer T065

**Point d'étape** : cycle de vie complet des abonnements.

---

## Phase 8 : User Story 6 — Sans push, l'application fonctionne comme aujourd'hui (Priorité : P2)

**Objectif** : prouver que le push est un canal en plus, jamais une condition.

**Test indépendant** : envoyeur en panne ou clés absentes : actions et notifications dans l'application identiques.

  *La liste « Mes appareils » est relue après chaque activation ou désactivation de l’appareil courant.*
- [X] T067 [P] [US6] Tests d'intégration dans `backend/test/integration/push-resilience.spec.ts` :
  - envoyeur qui lève une exception, ou dont la promesse ne se résout jamais → une affectation de garde, une transition de demande et un message réussissent quand même, avec les mêmes notifications en base que sans push (SC-005) ;
  - la réponse HTTP ne dépend pas de l'envoyeur.

  Corriger le code si un test échoue.
  *Défaut trouvé et corrigé : une exception de l’envoyeur laissait une promesse rejetée non traitée (risque d’arrêt du processus Node). Le dispatcher la traite désormais comme une erreur réseau (nouvelle tentative) et attrape toute erreur d’un envoi.*
- [X] T068 [US6] Lancer sans modification les suites existantes sur les notifications (`npm run -w backend test:integration -- notifications realtime coverage messages`, `npm run -w frontend test -- notifications`) : toutes passent (SC-005)
  *Toutes les suites passent : 961 tests d’intégration (1 ignoré), 680 tests frontend. Quelques tests existants ont été adaptés au nouveau contrat (liste dans docs/validation/verification-014.md, « Existing expectations modified »).*
- [X] T069 [US6] Dans `backend/scripts/e2e-server.ts`, forcer `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` et `PUSH_VAPID_SUBJECT` à `''` dans `env`, comme le sont déjà les `ASSIST_*`, pour que le serveur e2e soit toujours sans push. Puis créer `e2e/notifications-push.spec.ts` (serveur e2e sans clés) :
  - « Mon profil » affiche « Les notifications push ne sont pas activées par l'établissement. » ;
  - désactiver « Couverture » persiste après rechargement ;
  - l'interrupteur du son persiste ;
  - en super administrateur, régler la plage et voir l'erreur fin ≤ début ;
  - aucune violation axe sur « Mon profil » et « Réglages » ;
  - à 320 px en portrait et en paysage, pas de défilement horizontal.

  Ajouter le parcours à `e2e/a11y-responsive.spec.ts` s'il liste les pages contrôlées.

---

## Phase 9 : Finitions et points transversaux

  *Scénarios qui modifient des réglages limités au profil chromium (comptes partagés entre profils), contrôle 320 px limité à mobile-320. Lancé sur ces deux profils : 3 réussis.*
- [X] T070 [P] Créer `docs/notifications-push.md` :
  - activation : générer les clés, les trois variables, sujet `mailto:` ou `https:`, HTTPS obligatoire, redémarrage ; un renouvellement des clés oblige chaque appareil à réactiver ;
  - fuseau : régler `SCHOOL_TIMEZONE=Africa/Tunis`, sinon la plage est évaluée à l'heure de Paris (une heure d'écart en été) ;
  - limite iPhone et iPad : écran d'accueil, iOS 16.4 ;
  - fiche pour le registre RGPD, reprise de « Données personnelles et conservation » de la spec : finalité, données, durées, services de push destinataires des métadonnées, activation sur décision de l'établissement.

  Ajouter un lien dans `README.md`, à l'endroit où les autres variables d'environnement sont décrites.
- [X] T071 [P] Vérifier que `backend/test/unit/architecture-layers.spec.ts` passe (le dossier `push` est hors de la liste `LAYERS`, donc non contrôlé) et que `npm run -w backend typecheck` et `npm run -w frontend typecheck` passent
- [ ] T072 Lancer `npm run verify` (lint, tous les tests, `npm audit --audit-level=high`) et `npm run test:e2e` ; tout doit passer avant tout commit (mémoire du projet : CI complète en local)
- [ ] T073 Dérouler les scénarios manuels de [quickstart.md](quickstart.md) sur Android et iPhone via HTTPS (démonstration en ligne ou préproduction), mesurer SC-001 selon le protocole, et consigner les résultats et leurs conditions dans `docs/validation/verification-014.md`. En préproduction, derrière Caddy (le tunnel de démonstration passe par Vite et ne le teste pas) :
  - `curl -I https://<domaine>/sw.js` → `Cache-Control: no-cache` et un type JavaScript ;
  - `curl -I https://<domaine>/manifest.json` → `application/json` ;
  - console du navigateur sans violation de la politique de sécurité du contenu, à l'enregistrement du service worker et à l'affichage d'une notification ;
  - vérifier la valeur de `SCHOOL_TIMEZONE` (`Africa/Tunis`) ;
  - résultats consignés dans `docs/validation/verification-014.md`.
- [X] T074 Relire la spec contre le code livré : chaque FR-001 à FR-020, NFR-001 à NFR-006 et SC-001 à SC-006 a un test ou une vérification consignée ; noter tout écart dans `docs/validation/verification-014.md`

---

## Dépendances et ordre d'exécution

### Dépendances entre phases

- **Mise en place (phase 1)** : aucune dépendance.
- **Fondations (phase 2)** : après la phase 1 ; **bloque toutes les user stories**.
- **US1 (phase 3)** : après les fondations. Cœur de l'envoi, nécessaire au MVP.
- **US2 (phase 4)** : après les fondations ; indépendante de US1 côté code (abonnement), mais un essai sur appareil
  réel demande US1 et US2.
- **US3 (phase 5)** : backend (T043–T046) après les fondations, T046 après T021 ; interface (T047–T050) après T037
  (US2), qui crée `NotificationsSection.tsx`.
- **US4 (phase 6)** : backend (T051–T056) après les fondations, T056 après T021 (et après T046 si US3 est faite) ;
  T057–T058 indépendants ; T059 après T037.
- **US5 (phase 7)** : backend après T031–T032 (US2) ; interface (T065–T066) après T037.
- **US6 (phase 8)** : après US1 (dispatcher) ; T069 après US3, US4 et US5 (il parcourt leurs écrans).
- **Finitions (phase 9)** : après toutes les user stories voulues.

### Dans chaque user story

- Tests écrits et **vus en échec** avant l'implémentation.
- Domaine pur avant service, service avant contrôleur, backend avant interface.
- `push-dispatcher.service.ts` est modifié successivement par T021, T046, T056 : jamais en parallèle.
- `NotificationsSection.tsx` est modifié par T037, T048, T050, T059, T066 : jamais en parallèle.

### Parallélisation possible

- Phase 2 : T004, T006, T009, T010, T012 (fichiers distincts).
- US1 : T014, T015, T016, T022, T024 ensemble, puis T018, T019, T020 ensemble.
- US2 : T026, T027, T028, T033, T035, T038, T040 ensemble, puis T029, T030 ensemble.
- Backend et frontend d'une même story peuvent avancer en parallèle une fois le contrat figé.

## Exemple de parallélisation : User Story 1

```text
Tâche : « Tests pushCategoryOf / pushRecipientAllowed dans backend/test/unit/push-category.spec.ts » (T014)
Tâche : « Tests buildPushPayload dans backend/test/unit/push-payload.spec.ts » (T015)
Tâche : « Tests nextAttemptDelayMs dans backend/test/unit/push-retry.spec.ts » (T016)
Tâche : « Tests du service worker dans frontend/tests/push/sw.test.ts » (T022)
Tâche : « Tests de lecture après ouverture dans frontend/tests/push/read-after-open.test.tsx » (T024)
```

## Stratégie de mise en œuvre

### MVP d'abord (US1 + US2)

1. Phases 1 et 2.
2. US1 (envoi, service worker, lecture après ouverture), puis US2 (abonnement, parcours iPhone, manifeste).
3. **Arrêt et validation** : scénarios 1 à 3 de [quickstart.md](quickstart.md) sur appareil réel.

US1 seule ne se démontre que par les tests (pas d'abonnement sans US2) ; le MVP démontrable est donc US1 + US2.

### Livraison progressive

1. MVP (US1 + US2) → validation.
2. US3 (catégories, son) → indispensable avant d'activer le push en production : sans elle, impossible de couper
   une catégorie.
3. US4 (plage horaire) → à livrer avant l'activation en production (protection du temps personnel).
4. US5 (appareils, déconnexion) → **à livrer avant l'activation en production** (appareils partagés, SC-003).
5. US6 + finitions → vérification finale, documentation, mesure SC-001.

Le push reste désactivé en production (aucune clé) tant que US3, US4 et US5 ne sont pas livrées et que
l'établissement n'a pas décidé l'activation (D9).

## Notes

  *Compte rendu : docs/validation/verification-014.md (rapprochement exigences ↔ tests, attentes modifiées, défaut corrigé, contrôles manuels en attente). docs/notifications-push.md rédigé en anglais, comme les autres documents de docs/.*
- [P] = fichiers différents, aucune dépendance envers une tâche non terminée.
- Une migration appliquée n'est jamais modifiée : toute correction passe par une nouvelle migration (CLAUDE.md).
- Commiter après chaque tâche ou groupe logique, seulement après `npm run verify` en local.
- S'arrêter à chaque point d'étape pour valider la story.
