# Research: Lot 1 – Demandes de travail et messagerie vocale

**Date**: 2026-10-12 | **Plan**: [plan.md](./plan.md)

La pile technique a été imposée par le client. Aucune entrée du contexte technique n'est restée
« NEEDS CLARIFICATION » ; les points ci-dessous fixent la façon d'utiliser cette pile pour
répondre à la spec et aux huit contraintes du plan.

## R1. Architecture d'ensemble

- **Decision**: une SPA React servie en fichiers statiques par Caddy ; une API NestJS unique
  (REST sous `/api`, Socket.IO sous `/socket.io`) derrière Caddy sur le même domaine ;
  PostgreSQL dans un conteneur ; volume disque privé pour les fichiers. Un seul processus API.
- **Rationale**: même origine pour la SPA, l'API et le WebSocket : cookies de session simples,
  pas de CORS, `<audio src="/api/files/…">` authentifié par cookie. Un seul processus suffit à
  l'échelle d'une école et évite toute coordination entre instances (principe II).
- **Alternatives considered**: rendu serveur (Next.js) — inutile pour une application
  authentifiée sans SEO ; API et frontend sur deux domaines — impose CORS et cookies
  inter-domaines.

## R2. Enregistrement et lecture des vocaux

- **Decision**:
  1. Enregistrement avec `MediaRecorder` ; format choisi dans l'ordre par
     `MediaRecorder.isTypeSupported` : `audio/webm;codecs=opus`, `audio/mp4` (AAC),
     `audio/ogg;codecs=opus`. Le type retenu est envoyé avec le fichier.
  2. Pré-écoute locale avant envoi à partir du Blob enregistré (le navigateur relit toujours
     son propre format). Bouton « Refaire » qui remplace l'enregistrement.
  3. Arrêt automatique à la durée maximale (réglage), avec avertissement à 80 % de la durée ;
     refus d'envoi si durée < 1 s.
  4. Côté serveur : ffprobe vérifie qu'il s'agit d'un flux audio valide et mesure la durée
     (refus si au-delà du maximum + 2 s de tolérance) ; ffmpeg convertit systématiquement en
     AAC mono 64 kbit/s dans un conteneur MP4 (`audio/mp4`, extension `.m4a`), avec
     `+faststart`. Le fichier d'origine est supprimé après conversion réussie.
  5. Lecture avec un lecteur basé sur l'élément `<audio>` natif, enveloppé dans des contrôles
     MUI accessibles (lecture/pause, barre de progression clavier, durée lue à l'écran) ; le
     serveur gère les requêtes HTTP Range, indispensables à Safari pour lire et se déplacer.
  6. Conversion synchrone dans la requête d'envoi (quelques centaines de millisecondes pour un
     vocal de quelques minutes) : pas de file de traitement.
  7. Contexte sécurisé obligatoire : HTTPS en production (Caddy) et sur téléphone en test
     (Caddy avec certificat interne, voir quickstart). Si `navigator.mediaDevices` ou
     `MediaRecorder` est absent, ou si l'autorisation du micro est refusée, l'interface
     explique comment l'autoriser et propose la description écrite (FR-002, US1 scénario 5).
- **Rationale**: AAC/MP4 est le seul format lu nativement par Safari (iOS et macOS), Chrome,
  Edge et Firefox sur toutes les plateformes cibles ; normaliser à l'arrivée supprime toute
  matrice de compatibilité à la lecture et toute logique de format côté client.
- **Alternatives considered**: conserver le format d'origine (lecture WebM incertaine sur
  anciennes versions d'iOS) ; convertir en Opus/WebM (illisible sur certains Safari) ;
  bibliothèque d'enregistrement tierce (recorder.js, encodage WAV) — fichiers lourds, dépendance
  inutile ; conversion asynchrone via une file — complexité sans bénéfice à ce volume.

## R3. Stockage et accès aux fichiers

- **Decision**:
  - Volume Docker dédié monté uniquement dans le conteneur API (`/data/files`), jamais exposé
    par Caddy. Chemin `/{yyyy}/{mm}/{uuid}` sans extension ; le type, la taille, le nom
    d'origine et l'auteur sont en base (`File`).
  - Téléversement en `multipart/form-data` par Multer avec limite de taille, puis :
    détection du type réel par octets magiques (`file-type`) ; liste blanche de types ;
    vocaux → ffprobe/ffmpeg (R2) ; photos → sharp (rotation selon EXIF, suppression de toutes
    les métadonnées, ré-encodage JPEG qualité 85, côté long ≤ 2560 px).
  - Formats autorisés par défaut (réglables) : photos JPEG, PNG, WebP ; fichiers PDF. HEIC
    refusé avec un message clair : iOS convertit déjà en JPEG les photos choisies via un champ
    fichier web, et sharp ne décode pas le HEIC de façon fiable.
  - Téléchargement uniquement par `GET /api/files/:id` : session requise, contrôle
    `canReadRequest` sur la demande parente, envoi par `res.sendFile` (gère Range/ETag),
    en-têtes `Content-Type` stocké, `X-Content-Type-Options: nosniff`,
    `Cache-Control: private, no-store`, `Content-Disposition: inline` pour images/audio et
    `attachment` pour les autres. Accès refusé → 404 et entrée d'audit.
  - Prise de photo : `<input type="file" accept="image/*" capture="environment">` pour
    l'appareil, et le même champ sans `capture` pour la galerie.
  - Limite de corps de requête aussi appliquée par Caddy (`request_body max_size`).
- **Rationale**: même origine et cookie de session : pas besoin d'URL signées ; le contrôle
  d'accès est le même code que pour la demande. Le champ fichier natif est la façon la plus
  fiable et la plus accessible de prendre une photo sur mobile.
- **Alternatives considered**: URL signées à durée limitée (utile seulement avec un stockage
  objet externe) ; stockage S3/MinIO (service supplémentaire injustifié sur un VPS) ;
  `getUserMedia` pour la photo (interface caméra à réécrire, moins accessible).

## R4. Délais, retards et clôture automatique

- **Decision**:
  - À chaque entrée dans une étape suivie, le service calcule l'échéance à partir des durées
    copiées dans la demande à sa création (instantané des règles, FR-022) et enregistre
    `currentStage`, `currentDueAt` et `warnAt` (échéance − seuil d'alerte).
    Étapes : VALIDATION (de la soumission à la décision), TAKEOVER (de l'affectation à
    l'acceptation), COMPLETION (de l'acceptation à « Terminée » ; redémarre à chaque retour
    « À corriger »).
  - Job `@Interval(15_000)` (@nestjs/schedule) : `UPDATE … WHERE currentDueAt < now() AND
    overdueStage IS DISTINCT FROM currentStage RETURNING …` pour marquer le retard de façon
    idempotente ; pour chaque ligne : événement d'historique `OVERDUE`, notifications aux
    responsables de la catégorie et à l'employé affecté, émission Socket.IO.
  - Le même job clôt les demandes « Terminée » dont `autoCloseAt` est dépassé (catégories en
    clôture automatique), avec l'acteur `SYSTEM`.
  - « Proche de l'échéance » est calculé à la lecture (`now ≥ warnAt`), sans job.
  - Le temps restant affiché côté client est un compte à rebours calculé depuis `currentDueAt`
    et corrigé du décalage d'horloge mesuré à la connexion (`serverTime` renvoyé par l'API).
- **Rationale**: un intervalle de 15 s garantit SC-006 (< 30 s) ; la mise à jour
  conditionnelle évite les doubles notifications même si un tick est lent ; l'état en base
  permet le rattrapage après un redémarrage, sans file ni Redis.
- **Alternatives considered**: minuterie par demande en mémoire (perdue au redémarrage) ;
  `pg_cron` (logique métier dans la base, moins testable) ; file BullMQ (exige Redis).

## R5. Machine à états et concurrence

- **Decision**: module pur `request-state-machine.ts` : table de transitions
  `{from, action, to, actor, guards}` (voir data-model) et fonction
  `applyAction(request, action, actor, context) → Result`. Le service applique la transition en
  base avec un verrouillage optimiste : `updateMany({ where: { id, status: from, version } })` ;
  0 ligne → 409 `STATE_CHANGED`, l'interface recharge la demande et l'explique à
  l'utilisateur. La transition, l'événement d'historique et les notifications sont écrits dans
  la même transaction ; l'émission Socket.IO a lieu après validation.
- **Rationale**: une seule source de vérité testable sans base ; le verrouillage optimiste
  règle le cas limite « deux utilisateurs changent le statut en même temps ».
- **Alternatives considered**: bibliothèque de machines à états (XState) — inutile pour une
  table de 20 lignes ; verrou `SELECT … FOR UPDATE` — fonctionne aussi mais garde la ligne
  verrouillée plus longtemps.

## R6. Historique et journal d'audit non modifiables

- **Decision**: deux tables en ajout seul : `RequestEvent` (historique de chaque demande) et
  `AuditLog` (actions sensibles hors demande : connexions, échecs, refus d'accès, comptes,
  rôles, catégories, réglages). Une migration SQL crée sur les deux tables un trigger
  `BEFORE UPDATE OR DELETE` qui lève une exception. Aucune route d'écriture ; lecture de
  l'audit réservée au super administrateur. Les entrées ne contiennent ni mot de passe, ni
  jeton, ni contenu de message (seulement des identifiants et les valeurs avant/après des
  champs métier).
- **Rationale**: la protection est assurée par la base elle-même, même en cas de bogue
  applicatif (principe V).
- **Alternatives considered**: rôle PostgreSQL séparé sans droit UPDATE/DELETE (plus lourd à
  gérer avec Prisma et ses migrations) ; chaînage cryptographique des entrées (non demandé).

## R7. Authentification et sessions

- **Decision**: identifiant + mot de passe ; hachage Argon2id ; comptes créés par le super
  administrateur avec mot de passe provisoire à changer à la première connexion (pas d'e-mail
  dans ce lot). Session serveur stockée en base (`Session`), cookie `HttpOnly`, `Secure`,
  `SameSite=Strict` ; expiration après 60 min d'inactivité et 12 h au maximum (réglables).
  Vérification de l'en-tête `Origin` sur toutes les requêtes modifiantes et à la poignée de
  main Socket.IO. Limitation des tentatives de connexion (@nestjs/throttler, 5 par minute et
  par identifiant/IP). Désactiver un compte supprime ses sessions et déconnecte ses sockets.
- **Rationale**: sessions révocables immédiatement, authentification identique pour REST et
  WebSocket, aucune donnée sensible en stockage navigateur.
- **Alternatives considered**: JWT en stockage local (vol par XSS, révocation difficile) ;
  SSO de l'école (non demandé, à envisager dans un lot ultérieur).

## R8. Autorisations

- **Decision**: module pur `access-policy.ts` combinant le rôle global (SUPER_ADMIN, MANAGER,
  EMPLOYEE), les permissions configurables par rôle (`RolePermission`) et l'appartenance aux
  catégories (`CategoryRecipient`, `CategoryManager`). Fonctions : `canReadRequest`,
  `allowedActions`, `canCreateInCategory`, `canPickRecipient`. Les listes et la recherche
  appliquent le même filtre en SQL (`WHERE` de visibilité). Tout refus : 404 pour une
  ressource (ne révèle pas son existence) ou 403 pour une action sur une ressource visible ;
  dans les deux cas une entrée `ACCESS_DENIED` est écrite dans l'audit.
- **Rationale**: une seule politique, testée par une table de cas exhaustive, appliquée aux
  routes REST, aux fichiers et aux salles Socket.IO.
- **Alternatives considered**: bibliothèque CASL — puissante mais superflue pour trois rôles
  et quelques relations.

## R9. Temps réel et notifications

- **Decision**: gateway Socket.IO authentifiée par le cookie de session à la poignée de main ;
  chaque socket rejoint uniquement `user:{userId}`. Toute notification est d'abord écrite en
  base (`Notification`), puis émise après validation de la transaction. Le client, à chaque
  connexion ou reconnexion, récupère les non lues par REST, puis invalide les requêtes
  TanStack Query concernées à chaque événement. Les demandes urgentes portent
  `priority: URGENT` pour un affichage distinct (couleur + icône + texte, pas la couleur
  seule). Adaptateur Socket.IO en mémoire (un seul processus).
- **Rationale**: aucune notification perdue si l'utilisateur est hors ligne (FR-033) ; les
  données transitent toujours par REST, avec le même contrôle d'accès.
- **Alternatives considered**: diffuser les données complètes par WebSocket (deux chemins de
  contrôle d'accès) ; Server-Sent Events (pile imposée : Socket.IO).

## R10. Envois échoués et conservation locale

- **Decision**: chaque création de demande ou de message reçoit un `clientId` (UUID généré
  côté client). En cas d'échec réseau, le contenu (champs + Blob audio + photos) est conservé
  dans IndexedDB (idb-keyval) dans une « boîte d'envoi » visible, avec bouton « Réessayer ».
  Le serveur rend la création idempotente par contrainte unique `(authorId, clientId)` :
  un nouvel essai d'un envoi déjà reçu renvoie la ressource existante.
- **Rationale**: répond à FR-008 et SC-007 sans service worker (interdit dans ce lot) et sans
  créer de doublons.
- **Alternatives considered**: synchronisation en arrière-plan (Background Sync, exige un
  service worker) ; ne rien conserver (contraire à la spec).

## R11. Recherche et performances

- **Decision**: filtres en SQL avec index sur `(status)`, `(categoryId)`, `(assigneeId)`,
  `(requesterId)`, `(priority)`, `(createdAt)`, `(currentDueAt)` ; recherche par titre avec
  `ILIKE` ; pagination par curseur (`createdAt`, `id`), 25 éléments par page.
- **Rationale**: largement suffisant pour 100 000 lignes (SC-009) sans moteur de recherche.
- **Alternatives considered**: extension `pg_trgm` ou recherche plein texte (à ajouter si la
  recherche devient lente) ; moteur externe (injustifié).

## R12. Déploiement, sauvegardes et exploitation

- **Decision**: Docker Compose sur le VPS : `caddy` (HTTPS Let's Encrypt, HSTS, CSP stricte,
  sert la SPA), `api` (Node 24 + ffmpeg, utilisateur non root, applique
  `prisma migrate deploy` au démarrage), `db` (PostgreSQL 17, port non exposé), `backup`
  (chaque nuit : `pg_dump` compressé + archive du volume fichiers, conservation 14 jours,
  copie hors du VPS à configurer). Secrets dans un fichier `.env` hors dépôt. Journaux JSON sur
  la sortie standard, sans données personnelles sensibles. Restauration testée et décrite dans
  le quickstart.
- **Rationale**: correspond à la pile imposée, une seule machine, restauration simple.
- **Alternatives considered**: Kubernetes, stockage objet, base gérée — disproportionnés.

## R13. Décisions de produit prises pour ce plan (à confirmer avec le client)

- **Clôture automatique différée** : pour une catégorie en clôture automatique, la demande
  « Terminée » est clôturée après un délai de grâce (`autoCloseAfterMinutes`, défaut 1 440 min,
  soit 24 h) et non immédiatement, afin que le demandeur puisse encore la renvoyer « À
  corriger » (US2). Réglable par catégorie ; 0 = clôture immédiate.
- **Réaffectation** : un responsable de la catégorie peut réaffecter une demande « Envoyée »,
  « Acceptée », « En cours » ou « À corriger » ; elle repasse alors « Envoyée » pour le nouvel
  employé et un nouveau délai de prise en charge démarre (FR-027).
- **Affectation automatique (circuit B)** : un employé désigné par catégorie
  (`autoAssigneeId`).
- **Brouillons** : activés par défaut (réglage global) ; un brouillon peut être supprimé par son
  auteur, c'est le seul cas de suppression.
- **Fuseau horaire** : horodatages stockés en UTC, affichés dans le fuseau du navigateur.
- **Conservation des données** : durées provisoires documentées dans la spec (section
  « Données personnelles »), à valider avant la mise en production ; aucune purge automatique
  dans ce lot.
