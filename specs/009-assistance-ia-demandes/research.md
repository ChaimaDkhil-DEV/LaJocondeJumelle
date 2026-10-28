# Research: Assistance IA à la création des demandes (socle)

Décisions de conception, chacune avec sa raison et les alternatives écartées.

## R1 — Fournisseurs interchangeables, aucun appel externe

- **Décision** : deux interfaces côté serveur, `TranscriptionProvider` et `SuggestionProvider`,
  choisies par la configuration (`ASSIST_TRANSCRIPTION_PROVIDER`, `ASSIST_SUGGESTION_PROVIDER`).
  Ce lot fournit deux implémentations de chacune : `disabled` (par défaut) et `demo`
  (déterministe, locale, sans réseau). `demo` est refusé au démarrage quand
  `NODE_ENV=production` (`ConfigError`) : une fausse transcription ne doit jamais atteindre les
  utilisateurs réels.
- **Pourquoi** : décision de cadrage (« socle d'abord ») ; l'application n'appelle aujourd'hui
  aucun tiers (`docs/ARCHITECTURE.md`) et ce lot ne change pas cet état (SC-009). Un fournisseur
  réel s'ajoutera par une nouvelle implémentation, sans toucher au parcours (FR-020).
- **Alternatives écartées** : brancher dès maintenant un fournisseur en ligne (décision RGPD non
  prise) ; un modèle local (charge serveur et dépendances lourdes pour un lot de démonstration).

## R2 — Fournisseur de démonstration

- **Transcription `demo`** : renvoie un texte fixe (`ASSIST_DEMO_TRANSCRIPT`, sinon une phrase
  par défaut signalée comme démonstration) après les contrôles audio réels (R4). Elle prouve le
  parcours, pas la reconnaissance vocale.
- **Propositions `demo`** (fonction pure `demoSuggest`) :
  - catégorie : celle de la consigne la mieux classée rattachée à une catégorie ; sinon une
    catégorie dont un mot du nom (4 lettres ou plus, sans accents) figure dans le texte ; sinon
    aucune ;
  - priorité : la mention « Priorité : Normale | Moyenne | Haute | Urgente » de la première consigne
    retenue qui en contient une ; sinon `URGENT` si le texte contient « urgent » ; sinon aucune ;
  - titre : la première phrase du texte, coupée à 120 caractères sur un mot ;
  - justification : « D'après la consigne « … ». » ou « D'après le nom de la catégorie « … ». » ;
  - informations manquantes : « Décrivez le besoin en quelques mots. » sous 4 mots.
- **Pourquoi** : résultats prévisibles pour les tests unitaires, d'intégration et e2e, sans coût
  ni réseau ; elle ignore par construction toute instruction contenue dans le texte.

## R3 — Validation stricte des réponses (FR-005, FR-012)

- **Décision** : une fonction pure `sanitizeSuggestion(raw: unknown, allowed)` contrôle chaque
  champ séparément : `categoryId` ∈ catégories autorisées pour cet utilisateur, `priority` ∈
  `Priority` (Prisma), longueurs (titre 120, justification 500, 3 informations manquantes de
  200 caractères), `sourceIds` ⊂ consignes effectivement transmises. Un champ invalide est
  écarté et compté (`discarded`) ; si rien ne reste, la réponse vaut « aucune proposition
  fiable ». La réponse du fournisseur est typée `unknown` : aucun champ n'est utilisé sans ce
  contrôle.
- **Pourquoi** : même un fournisseur réel compromis ou trompé par une injection ne peut produire
  qu'une proposition bornée ; rien n'est exécuté.
- **Alternative écartée** : ajouter zod ou ajv (nouvelle dépendance pour une seule structure ;
  class-validator sert aux corps de requête, pas aux réponses internes).

## R4 — Transcription sans fichier conservé (FR-008, FR-009)

- **Décision** : `POST /api/assist/transcriptions` reçoit l'enregistrement (multipart, comme
  `POST /api/files`), applique les mêmes contrôles (taille `voiceMaxBytes`, signature, ffprobe,
  durée `voiceMaxSeconds`, conversion) grâce à une fonction extraite de `FilesService.upload`
  (`prepareVoice`), transcrit le fichier converti puis l'efface dans un `finally`. Aucune ligne
  `File` n'est créée.
- **Pourquoi** : dans le formulaire, le vocal reste dans le navigateur jusqu'à l'envoi
  (`submitRequest`, boîte d'envoi hors ligne) ; le téléverser plus tôt créerait un fichier
  provisoire de plus et changerait le parcours d'envoi. Le vocal est transmis deux fois (moins de
  2 Mo pour 180 s à 64 kbit/s) : coût accepté.
- **Alternative écartée** : téléverser le vocal en provisoire et transcrire par identifiant
  (fichiers orphelins, double rattachement à gérer).

## R5 — Consignes et recherche plein texte PostgreSQL (FR-015 à FR-017)

- **Décision** : table `Guideline` (titre, texte, catégorie facultative, active, auteur de la
  dernière modification). Recherche par `$queryRaw` paramétré :
  - requête construite côté base à partir des lexèmes du texte :
    `to_tsquery('simple', string_agg(quote_literal(lexeme), ' | '))` sur
    `unnest(to_tsvector('french', $texte))` (« ou » entre les mots, sans double racinisation) ;
  - document : `to_tsvector('french', title || ' ' || body)` ;
  - filtres : `active = true` et (`categoryId IS NULL` ou `categoryId = ANY($catégoriesAutorisées)`) ;
  - classement `ts_rank`, rang > 0, 5 résultats au plus ; extrait = 200 premiers caractères.
- **Pourquoi** : quelques dizaines de consignes ; la configuration `french` de PostgreSQL 17
  suffit, sans extension ni index (balayage négligeable). Les filtres d'accès sont dans la
  requête : une consigne non autorisée n'est jamais lue (FR-016, SC-006).
- **Alternatives écartées** : pgvector (changement d'image `postgres:17`, fournisseur
  d'embeddings, donc appel externe ou modèle local) ; recherche en mémoire dans Node (accents et
  racines français à refaire).

## R6 — Lier la proposition à la demande créée sans la stocker (FR-023, FR-025)

- **Décision** : la réponse de `POST /api/assist/suggestions` contient un `token` signé
  (HMAC-SHA256, clé dérivée de `SESSION_SECRET` avec un préfixe propre à cet usage, `node:crypto`)
  qui porte l'utilisateur, l'heure d'émission et les valeurs proposées (titre, catégorie,
  priorité, sources : identifiant et titre). `CreateRequestDto` accepte un `assistToken`
  facultatif. À l'envoi (pas pour un brouillon), si le jeton est valide, du même utilisateur et
  émis depuis moins de 24 h, `create` écrit dans la même transaction un `RequestEvent`
  `ASSIST_SUGGESTED` : `fromValue` = valeurs proposées et sources, `toValue` = valeurs réellement
  enregistrées. Un jeton absent, invalide ou expiré est ignoré : la création n'en dépend jamais.
- **Pourquoi** : aucune proposition n'est conservée tant que la demande n'est pas envoyée
  (formulaire abandonné : aucune trace) ; les valeurs proposées ne peuvent pas être falsifiées par
  le navigateur ; 24 h couvrent l'envoi différé par la boîte d'envoi hors ligne.
- **Alternatives écartées** : table des propositions (données conservées pour des formulaires
  abandonnés) ; valeurs proposées renvoyées en clair par le navigateur (historique falsifiable).

## R7 — Limite d'appels par utilisateur (FR-014)

- **Décision** : `AssistRateLimiter`, fenêtre glissante en mémoire par utilisateur, partagée par
  la transcription et les propositions : `ASSIST_RATE_LIMIT` (10 par défaut) appels par 5 minutes.
  Dépassement : `ASSIST_RATE_LIMITED` (429, message adapté à la fenêtre de 5 minutes) et `ACCESS_DENIED` journalisé avec
  `reason: RATE_LIMITED`, comme la connexion.
- **Pourquoi** : l'API tourne en un seul conteneur (`deploy/docker-compose.yml`) ; la clé est
  l'utilisateur, pas l'adresse IP (établissement derrière une même adresse).
- **Alternative écartée** : un second throttler nommé dans `ThrottlerModule` : il s'appliquerait
  aussi à `LoginThrottlerGuard`, qui parcourt tous les throttlers déclarés.

## R8 — Délai et erreurs (FR-021, FR-024)

- **Décision** : chaque appel de fournisseur reçoit un `AbortSignal.timeout(ASSIST_TIMEOUT_MS)`
  (15 000 ms par défaut, borné à 1 000 à 20 000 ms). Délai dépassé ou erreur :
  `ASSIST_UNAVAILABLE` (503, nouveau code d'erreur, message « Les propositions ne sont pas
  disponibles pour le moment. Vous pouvez remplir la demande vous-même. ») ; transcription vide :
  `TRANSCRIPTION_EMPTY` (422). Journal applicatif : type d'erreur, fournisseur et durée, jamais le
  texte ni l'audio. Assistance désactivée : `ASSIST_DISABLED` (404), et le formulaire ne propose
  pas l'action.
- **Pourquoi** : 15 s laissent de la marge sous les 20 s de SC-005 (conversion audio comprise).

## R9 — Interface

- **Décision** : `AssistPanel` (nouveau, `features/assist/`) placé dans `CreateRequestPage` sous
  les champs, hors de `RequestFields` (la reprise de brouillon reste inchangée). Il lit
  `useClientSettings()` (`assistSuggestions`, `assistTranscription`, ajoutés à
  `GET /api/settings/client`) et `navigator.onLine`. Les actions « Appliquer » appellent les
  setters existants de `useRequestForm` ; la réponse la plus récente seule est affichée (compteur
  de requête) ; arrivée des propositions et erreurs annoncées par une région `aria-live`.
  `assistToken` est joint à `submitRequest` (et à la boîte d'envoi).
- **Consignes** : onglet « Consignes » de l'espace Administrateur (`/admin/consignes`), même
  modèle que « Catégories » (liste, dialogue de saisie, confirmation de suppression).

## R10 — Tests

- Unitaires (Jest) : `sanitizeSuggestion`, `demoSuggest`, jeton (signature, expiration,
  utilisateur), `AssistRateLimiter`, configuration (`demo` refusé en production, bornes du
  délai).
- Intégration (Jest + PostgreSQL embarqué) : recherche des consignes (filtres d'accès, consignes
  inactives ou supprimées, aucun résultat), propositions (catégorie non autorisée jamais
  proposée, texte avec instructions, fournisseur en échec ou trop lent, réponse mal formée),
  aucune écriture métier, création avec jeton (événement, valeurs retenues, validation
  administrative inchangée), jeton invalide ignoré, brouillon sans événement, refus d'accès,
  limite d'appels, transcription (audio effacé, vocal vide refusé), CRUD des consignes et audit.
- Interface (Vitest) : panneau (désactivé, hors ligne, chargement, erreur, appliquer, ne remplace
  pas la description sans confirmation, dernière réponse seule), gestion des consignes.
- E2E (Playwright, fournisseurs `demo` dans `e2e-server`) : parcours complet et audit axe à
  320 px.
