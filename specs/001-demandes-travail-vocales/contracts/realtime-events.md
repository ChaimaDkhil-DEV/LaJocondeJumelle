# Contrat temps réel (Socket.IO) – Lot 1

**Chemin** : `/socket.io` (même origine). **Transport** : WebSocket, repli long-polling
autorisé. Notifications **dans l'application uniquement** : ni push, ni e-mail, ni service
worker.

## Connexion

- Authentification à la poignée de main par le cookie de session `sid` et contrôle de
  l'en-tête `Origin`. Session absente ou expirée → `connect_error` avec
  `{ code: "UNAUTHENTICATED" }` ; le client renvoie vers la page de connexion.
- Le serveur place le socket dans la seule salle `user:{userId}`. Le client ne peut rejoindre
  aucune salle lui-même et n'émet aucun événement métier : toutes les écritures passent par
  REST.
- Déconnexion, expiration de session ou désactivation du compte → le serveur ferme les sockets
  de l'utilisateur.
- À chaque `connect` (y compris reconnexion), le client appelle
  `GET /notifications?unread=true` et invalide ses requêtes en cache, ce qui rattrape tout
  événement manqué.

## Événements serveur → client

Tous les événements sont émis **après** validation de la transaction en base et ne
contiennent que des identifiants et des métadonnées ; le client relit les données par REST
(même contrôle d'accès).

| Événement | Charge utile | Émis vers | Effet côté client |
|-----------|--------------|-----------|-------------------|
| `notification:new` | `{ id, type, priority, requestId, reference, title, createdAt }` | destinataire de la notification | badge et liste mis à jour ; annonce `aria-live` ; style distinct si `priority = URGENT` |
| `request:updated` | `{ requestId, status, version, overdueStage }` | demandeur, affecté, responsables de la catégorie | invalide la liste et le détail de la demande |
| `message:new` | `{ requestId, messageId }` | participants autorisés sauf l'auteur | invalide le fil ; nouveau message affiché sans rechargement |
| `session:ended` | `{ reason: "LOGOUT" \| "EXPIRED" \| "DEACTIVATED" }` | sockets de l'utilisateur | retour à la page de connexion |

Types de notification (`type`) : `REQUEST_NEW`, `MESSAGE_NEW`, `ASSIGNED`, `STATUS_CHANGED`,
`URGENT`, `TO_CORRECT`, `REJECTED`, `CANCELLED`, `OVERDUE`, `CLOSED`.

## Qui est notifié

| Événement métier | Notifiés |
|------------------|----------|
| Demande envoyée (circuit A) | affecté (`REQUEST_NEW`, ou `URGENT` si urgente) |
| Demande soumise (circuit B) | responsables de la catégorie |
| Approbation / affectation / réaffectation | demandeur (`STATUS_CHANGED`), nouvel affecté (`ASSIGNED` ou `URGENT`) |
| Refus (T4, T7) | demandeur (`REJECTED`, avec motif dans la demande) |
| Annulation | affecté ou responsables (`CANCELLED`) |
| Acceptée, En cours, Terminée, En attente de validation finale | demandeur (`STATUS_CHANGED`) ; responsables si validation finale |
| À corriger | affecté (`TO_CORRECT`) |
| Clôture | demandeur et affecté (`CLOSED`) |
| Nouveau message | autres participants (`MESSAGE_NEW`) |
| Retard | responsables de la catégorie et affecté (`OVERDUE`, étape précisée) |

L'auteur d'une action n'est jamais notifié de sa propre action.

## Garanties

- Ordre : par utilisateur, dans l'ordre de validation des transactions (un seul processus).
- Persistance : chaque notification existe en base avant émission ; aucune perte si
  l'utilisateur est hors ligne (FR-033).
- Délai cible : < 5 s entre l'action et l'affichage (SC-003), < 30 s pour les retards
  (SC-006).
