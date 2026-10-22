# Research — 007 Brouillons de demande de travail

Le serveur gère déjà les brouillons (création `asDraft`, `PATCH`, `DELETE`, action `SUBMIT`,
visibilité de l'auteur seul, réglage `draftsEnabled` qui ne bloque que la création). Décisions
fixées à partir de `master` (`c0f16fb`).

## R1 — Liste : onglet « Brouillons », « Envoyées » sans brouillon (Clarification Q1, FR-004, FR-004b)

- **Decision** : côté serveur, nouveau périmètre `scope=drafts` (demandes de l'utilisateur au statut
  `DRAFT`) et `scope=mine` **sans** brouillon (`status <> DRAFT`). Côté interface, onglet
  « Brouillons » (`?onglet=brouillons`) affiché seulement si une requête `scope=drafts&limit=1`
  renvoie au moins un élément.
- **Rationale** : le filtre de statut de l'API est une liste d'inclusion ; exclure les brouillons
  côté client obligerait à énumérer tous les autres statuts (fragile à l'ajout d'un statut). Le
  changement serveur est minime, testé, et ne touche aucune règle métier.
- **Alternatives considered** : `scope=mine&status=DRAFT` (incompatible avec « mine » sans
  brouillon) ; filtrage côté client (fragile, et pagination faussée) : rejetés.

## R2 — Tri et date affichée

- **Decision** : même tri que les autres listes (date de création décroissante, pagination par
  curseur existante) et même date affichée.
- **Rationale** : trier par dernière modification exigerait une autre pagination pour un seul
  onglet ; un brouillon vit peu et un auteur en a peu (principe II). Spécification alignée.

## R3 — Routes et formulaire

- **Decision** :
  - le formulaire de `CreateRequestPage.tsx` est extrait en un composant `RequestForm` réutilisé
    par « Nouvelle demande » et par une nouvelle page `DraftPage` (`/demandes/:id/brouillon`),
    pré-remplie depuis `GET /api/requests/:id` ;
  - un brouillon de la liste mène à `/demandes/:id/brouillon` ; un lien direct vers
    `/demandes/:id` d'un brouillon redirige vers cette page ;
  - titre de page : « Nouvelle demande » ou « Brouillon de demande ».
- **Rationale** : un seul formulaire (champs, règles de catégorie, destinataire, message vocal,
  accessibilité déjà vérifiée) ; pas de duplication.

## R4 — Enregistrer en brouillon (FR-001 à FR-003)

- **Decision** : bouton secondaire « Enregistrer en brouillon » dans « Nouvelle demande », affiché
  si `draftsEnabled` (réglages publics, `useClientSettings`). Validation réduite : catégorie et titre
  ; priorité « Normale » par défaut si non choisie ; description, vocal et destinataire facultatifs.
  Message vocal téléversé puis `POST /api/requests` avec `asDraft: true`. Succès : toast
  « Brouillon enregistré. » et ouverture du brouillon (`/demandes/:id/brouillon`).
- **Rationale** : mêmes appels que la création (le serveur exige titre, catégorie et priorité).

## R5 — Reprendre, enregistrer, envoyer, supprimer (FR-005 à FR-007, FR-009)

- **Decision** :
  - **Enregistrer le brouillon** : `PATCH /api/requests/:id` avec les seuls champs changés ; message
    vocal : nouvel enregistrement téléversé puis `voiceFileId`, suppression → `voiceFileId: null`.
  - **Envoyer** : validation complète (comme la création) ; enregistrement des changements s'il y en
    a (`PATCH`), puis `POST /api/requests/:id/actions` `{ action: 'SUBMIT', version }` avec la
    version renvoyée ; succès : toast « Votre demande a été envoyée. » et détail de la demande.
  - **Supprimer le brouillon** : confirmation (`ConfirmDialog` existant), `DELETE`, toast « Brouillon
    supprimé. », retour à « Mes demandes ».
  - Refus `STATE_CHANGED` ou `404` (brouillon envoyé, supprimé ailleurs) : message clair et retour à
    la liste.
- **Message vocal existant** : lecteur existant (`VoicePlayer`, fichier du serveur) avec « Remplacer »
  (réenregistrer) et « Supprimer » ; un nouvel enregistrement se fait avec `VoiceRecorder` comme à
  la création.

## R6 — Boîte d'envoi hors ligne

- **Decision** : la boîte d'envoi existante (envoi conservé en cas d'échec réseau à la création)
  reste réservée à la création directe. Un échec réseau à l'enregistrement d'un brouillon ou à
  l'envoi d'un brouillon affiche un message ; le formulaire garde ses valeurs, le brouillon reste
  sur le serveur.
- **Rationale** : le brouillon est déjà conservé côté serveur ; pas de double mécanisme (principe II).

## R7 — Stratégie de test (principe I)

- **Intégration backend** : `scope=drafts` (auteur seul, brouillons seulement), `scope=mine` sans
  brouillon, envoi d'un brouillon (statut et notifications comme une création), réglage désactivé
  (création refusée, reprise/envoi/suppression permis).
- **Frontend** : « Enregistrer en brouillon » (visible selon le réglage, validation réduite, appel
  `asDraft`), onglet « Brouillons » (présent/absent), page brouillon (pré-remplissage, vocal
  existant, enregistrer, envoyer, supprimer avec confirmation, erreurs).
- **e2e** (Chromium) : enregistrer en brouillon → onglet → reprendre → envoyer → destinataire
  notifié ; 320 px et clavier (V18).
