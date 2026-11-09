# Recherche (phase 0) : Notifications push et préférences utilisateur

**Spec** : [spec.md](spec.md) | **Plan** : [plan.md](plan.md) | **Date** : 2026-11-09

Chaque point : décision, justification, alternatives écartées. Les constats renvoient au code lu sur `master`
(commit `4dbc4b8`).

## R1 — Bibliothèque Web Push

- **Décision** : `web-push` **3.6.7**, épinglée exactement (`"web-push": "3.6.7"`), avec `@types/web-push` en
  dépendance de développement. Elle chiffre le contenu (RFC 8291), signe l'identification du serveur (VAPID,
  RFC 8292) et envoie la requête au service de push.
- **Justification** : bibliothèque de référence, stable depuis janvier 2024, quatre dépendances (`asn1.js`,
  `http_ece`, `https-proxy-agent`, `jws`). Le chiffrement Web Push est délicat à réécrire sans erreur.
- **Alternatives écartées** :
  - `web-push` 4.0.0 : publiée le 2026-11-06, trop récente pour la règle « version d'au moins deux semaines » et
    sans recul ; à réévaluer plus tard.
  - Réimplémenter RFC 8291/8292 avec `node:crypto` : plus de code sensible à écrire et tester, sans gain.
  - SDK d'un service tiers (FCM côté serveur, OneSignal…) : ajoute un sous-traitant au-delà des services de push
    des navigateurs, contraire à D9.
- **Contrôle** : `npm audit --audit-level=high` (script `verify`) doit rester vert après l'ajout.

## R2 — Point d'intégration : après validation de la transaction

- **Constat** : toutes les créations de notifications passent par `NotificationsService.notifyInTx` puis
  `flushAfterCommit`, appelé à 8 endroits (gardes, messages, transitions de demandes, demandes, deux jobs), qui
  délègue à un unique `NOTIFICATION_PUBLISHER` (aujourd'hui `SocketNotificationPublisher`).
- **Décision** : le jeton `NOTIFICATION_PUBLISHER` fournit une composition : la publication Socket.IO, attendue
  comme aujourd'hui, puis `PushDispatcher.enqueue(notifications)`, **non attendue** et qui ne lève jamais
  d'exception. Les 8 appels et `notifyInTx` ne changent pas.
- **Justification** : un seul point d'entrée, déjà situé après la validation de la transaction (FR-005) ; l'action
  métier ne paie ni la latence ni les erreurs du service de push.
- **Alternatives écartées** : appeler le push à chacun des 8 endroits (duplication, oubli probable) ; un
  intercepteur Prisma (avant la validation, donc contraire à FR-005).

## R3 — Correspondance types → catégories

- **Décision** : fonction pure `pushCategoryOf(type, requestKind)` adossée à une table
  `Record<NotificationType, …>` **exhaustive** : chaque valeur de l'énumération y figure, avec sa catégorie ou
  `null`. Un nouveau type ajouté plus tard casse la compilation tant qu'on n'a pas décidé. Règles :
  - `URGENT` (demande de travail) → `urgent` ; tout autre type d'une demande de travail → `null` (NC-1) ;
  - types de garde selon le tableau validé de la spec ; `ASSIGNED` → `coverage` seulement si la demande est une
    garde ; `CLOSED`, `CANCELLED`, `STATUS_CHANGED` sur une garde → `null` ;
  - `COVERAGE_TEACHER_ARRIVED` → `attendance`, avec un filtre de destinataire : push seulement si le destinataire
    est le surveillant affecté (`request.assigneeId`) au moment de l'envoi (D4).
- **Justification** : SC-002 se teste en parcourant l'énumération ; la priorité n'intervient jamais.
- **Alternatives écartées** : liste des types autorisés seule (un nouveau type serait ignoré silencieusement).

## R4 — Plage horaire

- **Décision** : trois réglages globaux dans le mécanisme existant (`SETTING_DEFAULTS`, `SETTING_RULES`, écran
  « Réglages », garde `SuperAdminGuard`, audit `SETTING_CHANGED` avec valeurs avant/après) :
  `pushWindowDays` (codes `MON` … `SUN`, défaut lundi à vendredi), `pushWindowStart` (`'07:30'`), `pushWindowEnd`
  (`'18:30'`). Des codes de jour plutôt que des numéros, parce que la règle `subset` et la lecture en base
  n'acceptent que des listes de chaînes. Contrôle croisé début < fin dans `AdminSettingsService.updateSettings` (valeurs fusionnées). La
  plage est évaluée **au premier envoi**, dans le fuseau de l'école (`SCHOOL_TIMEZONE`, fonctions de
  `common/school-time.ts`). Pas de plage à cheval sur minuit.
- **Justification** : aucune nouvelle table ni nouvelle route ; audit et droits déjà conformes à FR-010 et NC-10 ;
  un seul fuseau dans l'application.
- **Alternatives écartées** : table dédiée ; fuseau `Africa/Tunis` codé en dur (deux fuseaux divergeraient).

## R5 — Contenu du push et texte affiché

- **Décision** : le serveur n'envoie **aucun texte rédigé** : `{ "v": 1, "id", "type", "place", "url" }`, où
  `place` est le nom de la classe (garde) ou la référence (demande de travail). Le composant d'arrière-plan compose
  le titre à partir du libellé du type, dans la langue de l'appareil (`fr` ou `en`), transmise dans l'adresse
  d'enregistrement (`/sw.js?lang=fr`) ; le corps est `place`. Contrat :
  [contracts/push-payload.md](contracts/push-payload.md).
- **Justification** : la langue est choisie par navigateur (`ljj-language` en stockage local) et le serveur ne la
  connaît pas ; la stocker sur l'abonnement ajouterait une donnée hors de FR-011. Le contenu minimal rend le test
  SC-006 direct : aucun champ libre.
- **Alternatives écartées** : texte français composé par le serveur (anglais impossible) ; langue stockée sur
  l'abonnement (donnée en plus).

## R6 — Options d'envoi

- **Décision** : durée de validité `TTL: 1800` (30 min, NC-5) ; `urgency: 'high'` ; `topic` = identifiant de la
  notification sans tirets (32 caractères) pour qu'une nouvelle tentative remplace un message encore en attente
  chez le service de push ; délai d'attente de 10 s par requête. Côté appareil, `tag` = identifiant de la
  notification : un second affichage remplace le premier (FR-016).
- **Alternatives écartées** : `urgency: 'normal'` (les téléphones en économie d'énergie peuvent différer).

## R7 — Nouvelles tentatives et erreurs

- **Décision** (NC-4) : au plus **3 tentatives** par couple notification × abonnement, à 0 s, +5 s, +30 s, en
  mémoire (`setTimeout`), jamais au-delà de la durée de validité.
  - Réseau, délai dépassé, 429, 5xx → nouvelle tentative (un `Retry-After` plus long est respecté s'il reste dans
    la validité).
  - 404, 410 → suppression de l'abonnement, pas de nouvelle tentative.
  - Autres 4xx (400, 403 clé VAPID refusée, 413) → abandon, journalisé.
  - Succès → `lastSuccessAt` mis à jour.
  - Au plus 10 envois simultanés.
  - Avant chaque tentative, l'abonnement est relu en base : supprimé, transféré à un autre utilisateur ou compte
    inactif → abandon. Une tentative programmée ne peut donc pas contourner une déconnexion ni un transfert
    d'appareil.
- **Constat (redémarrage)** : la diffusion Socket.IO est en mémoire ; les jobs planifiés (`@Interval`, toutes les
  15 s) s'appuient sur l'état en base. Les tentatives en attente sont perdues au redémarrage, comme la diffusion
  actuelle ; **pas de file d'envoi persistante** (outbox), non justifiée par l'audit vu la validité de 30 min.

## R8 — Cycle de vie des abonnements et lien avec la session

- **Décision** :
  - L'abonnement porte un `sessionId` (colonne simple, **sans clé étrangère**) : la session qui l'a créé ou utilisé
    en dernier.
  - L'enregistrement (`PUT /api/push/subscriptions`) est un **upsert sur l'adresse d'envoi** : s'il existe pour un
    autre utilisateur, il lui est transféré (bascule NC-8a). Le même appel, refait à chaque ouverture de
    l'application, met à jour `sessionId` et `lastUsedAt` (au plus une écriture par 24 h, NC-3).
  - Suppressions :
    - déconnexion → `sessionId` = session fermée (et désabonnement côté navigateur) ;
    - changement de son mot de passe → abonnements de l'utilisateur dont `sessionId` diffère de la session
      courante ou est vide (NC-8b) ;
    - désactivation et réinitialisation par un administrateur → tous ses abonnements, **dans la transaction** qui
      supprime ses sessions (FR-020) ;
    - 404/410 → l'abonnement concerné ;
    - job horaire → `lastUsedAt` de plus de 90 jours.
  - Avant chaque envoi, le compte doit être actif (défense en profondeur).
- **Justification** : le serveur sait quel appareil se déconnecte sans recevoir l'adresse d'envoi ; sans clé
  étrangère, l'ordre des suppressions entre session et abonnement n'a pas d'importance (les sessions sont
  supprimées physiquement par `revoke`).
- **Alternatives écartées** :
  - le navigateur seul retire l'abonnement à la déconnexion : peu fiable (onglet fermé, réseau) ;
  - une clé étrangère `onDelete: SetNull` : l'expiration effacerait le lien, et la déconnexion devrait supprimer
    l'abonnement avant la session.

## R9 — Protection des adresses d'envoi (NFR-001)

- **Décision** :
  - Adresse en `https:`, d'au plus 2048 caractères, sans identifiants dans l'URL, sur un port par défaut.
  - Hôte égal à `fcm.googleapis.com`, `updates.push.services.mozilla.com` ou `web.push.apple.com`, ou se terminant
    par `.notify.windows.com` (Edge).
  - Clés : `p256dh` en base64url de 65 octets commençant par `0x04`, `auth` de 16 octets.
  - Liste fixée dans le code ; toute autre adresse est refusée (400, champ `endpoint`).
- **Justification** : le serveur ferait sinon des requêtes vers des adresses choisies par le client (SSRF).
  Node ne suit pas les redirections par défaut.
- **Alternatives écartées** : liste réglable par variable d'environnement (aucun besoin actuel).

## R10 — Configuration et activation (D9, FR-013)

- **Décision** :
  - Variables `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` et `PUSH_VAPID_SUBJECT` (`mailto:` ou `https:`,
    exigé par Apple), lues dans `config.ts` comme celles de l'assistance.
  - Les trois absentes → push désactivé. Une ou deux seulement, ou un format invalide (clé publique de 65 octets,
    clé privée de 32 octets) → `ConfigError` au démarrage.
  - Clés générées par `npx web-push generate-vapid-keys`. La clé privée reste dans l'environnement du serveur ;
    `GET /api/push/config` ne donne que la clé publique.
- **Renouvellement des clés** : les abonnements existants ne valent plus. Le navigateur compare la clé de son
  abonnement à la clé publique et affiche « À réactiver » ; un clic réabonne (upsert).

## R11 — Composant d'arrière-plan (service worker)

- **Décision** :
  - Fichier JavaScript simple `frontend/public/sw.js`, servi tel quel à la racine (portée `/`). Il n'est enregistré
    que si le push est activé par l'établissement (`updateViaCache: 'none'`). Caddy le sert en `no-cache` (règle
    `@pages` existante), et la politique de sécurité actuelle l'autorise (`worker-src` retombe sur
    `script-src 'self'`).
  - Trois gestionnaires :
    - `push` : contrôle du contenu, puis affichage, sauf application au premier plan (R13) ;
    - `notificationclick` : met au premier plan un onglet existant ou en ouvre un, sur une adresse relative de
      l'application seulement ;
    - `install`/`activate` : `skipWaiting`, puis `clients.claim`.
  - **Aucun gestionnaire `fetch`, aucun cache** (NFR-003).
  - Pas de `pushsubscriptionchange` : le navigateur resynchronise l'abonnement à l'ouverture suivante.
- **Tests** : Vitest charge `sw.js` avec un `self` simulé ; un test vérifie que ses libellés correspondent à
  `NOTIFICATION_LABELS` et au dictionnaire anglais pour chaque type autorisé.
- **Alternatives écartées** :
  - `vite-plugin-pwa` / Workbox : nouvelle dépendance majeure, orientée cache hors ligne, hors périmètre ;
  - composant en TypeScript compilé par une seconde entrée Vite : configuration de build plus lourde pour ~80
    lignes.

## R12 — Application installable et parcours iPhone (D2, FR-002)

- **Décision** :
  - `frontend/public/manifest.json` : nom, `start_url` et `scope` `/`, `display: standalone`, couleurs, icônes
    192 et 512 px. Le nom en `.json` assure un type MIME sûr chez Caddy.
  - `apple-touch-icon` 180 px. Les icônes sont tirées de `logo.png` une fois et versionnées.
  - Liens ajoutés dans `index.html`.
- **États** (fonction pure `pushSupportState`, ordre d'évaluation) :
  1. `disabled` (établissement) ;
  2. `unsupported` (pas de service worker, de `PushManager` ou de `Notification`, ou iOS/iPadOS < 16.4) ;
  3. `ios-install` (iOS/iPadOS ≥ 16.4 hors écran d'accueil) ;
  4. `denied` ;
  5. `reactivate` (clé changée) ;
  6. `inactive` ;
  7. `active`.
  iPadOS récent se détecte par `MacIntel` et l'écran tactile ; le mode écran d'accueil par
  `display-mode: standalone` ou `navigator.standalone`.

## R13 — Application au premier plan (D10)

- **Décision** : dans `push`, si une fenêtre de l'application est visible et active
  (`clients.matchAll({ type: 'window', includeUncontrolled: true })`, `focused` ou `visibilityState === 'visible'`),
  pas de notification système : l'alerte dans l'application arrive par Socket.IO. **Exception iPhone/iPad** :
  WebKit exige d'afficher chaque push et peut retirer l'abonnement sinon. La notification y est donc toujours
  affichée (limite déjà notée dans la spec).
- **Alternatives écartées** : serveur qui saute le push si l'utilisateur a une connexion Socket.IO (empêcherait
  ses autres appareils de le recevoir, contraire à D10).

## R14 — Lecture après ouverture (FR-008)

- **Décision** : le clic ouvre `url?notification=<id>`. Les pages de détail (`CoverageDetailPage`,
  `RequestDetailPage`) appellent l'existant `POST /api/notifications/read { ids: [id] }` **après le chargement
  réussi** de la ressource (droits vérifiés par le serveur), puis retirent le paramètre de l'adresse. Le retour
  après connexion conserve chemin et paramètres (`RequireAuth` : `from: pathname + search`, vérifié).
- **Alternatives écartées** : marquer lu dans le service worker au clic (contraire à FR-008).

## R15 — Préférences et son des urgences (FR-009, NC-6, NC-9)

- **Décision** :
  - Table `NotificationPreference` (une ligne par utilisateur, créée à la première modification) : quatre booléens
    à `true` par défaut, et `urgentSound` **nullable** (`null` = jamais réglé = actif).
  - `PATCH` partiel champ par champ : la dernière écriture l'emporte, catégorie par catégorie.
  - Le navigateur lit le son des urgences sur le compte. Une valeur locale `off` est reprise une fois si
    `urgentSound` vaut encore `null`, puis la clé locale est supprimée dans tous les cas.
  - Les préférences fonctionnent même si le push est désactivé (le son en dépend).
- **Alternatives écartées** : préférences en JSON sur `User` (moins lisible, validation plus faible) ; reprise
  inconditionnelle de la valeur locale (écraserait un choix fait sur un autre appareil).

## R16 — Libellé de l'appareil

- **Décision** : calculé par le serveur à partir de l'en-tête `User-Agent`, avec une courte liste fixe (iPhone,
  iPad, Android, Windows, macOS, Linux × Safari, Chrome, Edge, Firefox, Samsung Internet). Valeur par défaut :
  « Appareil inconnu ». L'en-tête brut n'est jamais conservé.
- **Alternatives écartées** : libellé envoyé par le navigateur (donnée non fiable à valider).

## R17 — Limites, conservation, journalisation

- **Décision** :
  - Au plus **10 appareils** par utilisateur. Le 11e est refusé avec un message invitant à en retirer un.
  - Job `push-subscriptions-cleanup` toutes les heures : suppression des `lastUsedAt` de plus de 90 jours.
  - Journaux (FR-012, NFR-006) : type, code de réponse, empreinte de l'adresse (12 premiers caractères
    hexadécimaux du SHA-256). Jamais le contenu, l'adresse ou les clés.
  - Les actions sur ses propres appareils et préférences ne sont pas journalisées dans l'audit (hypothèse de la
    spec) ; la tentative de retirer l'appareil d'un autre donne 404 et `ACCESS_DENIED`.
  - À la première activation, les quatre catégories sont actives (aucune ligne de préférences = tout actif).

## R18 — Stratégie de test (FR-014, principe I)

- **Unitaires backend (Jest)** : correspondance exhaustive (chaque valeur de `NotificationType` × nature de
  demande), filtre D4, contenu (SC-006), plage horaire (bords, jours, fuseau), validation des adresses, libellé
  d'appareil, politique de nouvelles tentatives (horloge simulée, envoyeur simulé).
- **Intégration backend (Jest, base de test)** :
  - routes push et préférences : droits, upsert et bascule, limite de 10, 404 et `ACCESS_DENIED` ;
  - suppressions de D8 et NC-8b ;
  - réglages de plage : validation, audit, refus pour `ADMIN` ;
  - chaîne complète : action → notification → envoyeur simulé, injecté par le jeton `PUSH_SENDER` ;
  - push désactivé ; envoyeur en échec sans effet sur l'action (SC-005).
- **Frontend (Vitest)** : section « Notifications push » dans chaque état, au plus 3 actions pour désactiver une
  catégorie, liste d'appareils, reprise du son, plage dans « Réglages », lecture après ouverture ; service worker
  avec un `self` simulé.
- **Bout en bout (Playwright + axe)** : serveur sans clés (push désactivé), donc état « Désactivé par
  l'établissement », préférences, son, plage horaire, accessibilité, 320 px et paysage. **Aucun abonnement réel** :
  Chromium contacterait FCM.
- **Préproduction** : mesure SC-001 sur appareils réels (protocole dans [quickstart.md](quickstart.md)).
