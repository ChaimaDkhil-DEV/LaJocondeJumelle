# Contrat REST – Lot 1

**Base** : `/api` (même origine que la SPA). **Format** : JSON, sauf téléversements
(`multipart/form-data`) et téléchargements (binaire). Le contrat exécutable (OpenAPI) est
généré par le backend ; ce document en fixe le contenu attendu.

## Règles communes

- **Authentification** : cookie de session `sid` (`HttpOnly`, `Secure`, `SameSite=Strict`).
  Toutes les routes sauf `POST /auth/login` l'exigent → sinon `401 UNAUTHENTICATED`.
- **Requêtes modifiantes** : en-tête `Origin` égal au domaine de l'application, sinon `403`.
- **Validation** : DTO en liste blanche ; champ inconnu ou invalide → `400 VALIDATION_ERROR`
  avec la liste des champs en erreur.
- **Accès** : ressource non visible → `404 NOT_FOUND` (n'en révèle pas l'existence) ; action
  interdite sur une ressource visible → `403 FORBIDDEN`. Les deux sont journalisés
  (`ACCESS_DENIED`).
- **Format d'erreur** :
  `{ "error": { "code": "INVALID_TRANSITION", "message": "<texte français lisible>", "details": {…} } }`
- **Codes métier** : `INVALID_TRANSITION` (409), `STATE_CHANGED` (409, verrouillage optimiste),
  `RECIPIENT_NOT_ALLOWED` (422), `ASSIGNEE_REQUIRED` (422 : approbation en affectation manuelle
  sans employé choisi), `PHOTO_REQUIRED` (422), `REASON_REQUIRED` (422),
  `CONTENT_REQUIRED` (422 : ni vocal ni description), `FILE_TYPE_NOT_ALLOWED` (415),
  `FILE_TOO_LARGE` (413), `VOICE_TOO_LONG` (422), `VOICE_TOO_SHORT` (422),
  `PASSWORD_CHANGE_REQUIRED` (403), `RATE_LIMITED` (429).
- **Horloge** : toute réponse porte l'en-tête `X-Server-Time` (ISO 8601), utilisé pour les
  comptes à rebours.
- **Pagination** : `?cursor=<opaque>&limit=25` → `{ items: [...], nextCursor: string | null }`.

## Authentification

| Méthode | Route | Accès | Corps / réponse |
|---------|-------|-------|-----------------|
| POST | `/auth/login` | public, limité (5/min) | `{ username, password }` → `200 { user }` + cookie ; `401` message générique |
| POST | `/auth/logout` | connecté | `204` ; sockets de la session fermés |
| GET | `/auth/me` | connecté | `{ id, displayName, role, permissions[], mustChangePassword }` |
| POST | `/auth/password` | connecté | `{ currentPassword, newPassword }` → `204` (12 caractères minimum) |

Tant que `mustChangePassword` est vrai, seules `/auth/*` répondent ; les autres renvoient
`403 PASSWORD_CHANGE_REQUIRED`.

## Catégories (lecture pour la création)

| Méthode | Route | Accès | Réponse |
|---------|-------|-------|---------|
| GET | `/categories` | connecté | catégories actives où l'utilisateur peut créer : `{ id, name, circuit, photoRequired }` |
| GET | `/categories/:id/recipients` | connecté, droit de créer dans la catégorie | circuit A : destinataires actifs `{ id, displayName, jobTitle }` ; circuit B : `[]` |

## Demandes

| Méthode | Route | Accès | Corps / réponse |
|---------|-------|-------|-----------------|
| GET | `/requests` | connecté (filtre de visibilité) | filtres : `status[]`, `priority[]`, `categoryId[]`, `assigneeId`, `requesterId`, `from`, `to`, `overdue`, `q` (titre), `scope` (`mine`, `assigned`, `managed`, `all`) → liste paginée de `RequestSummary` |
| POST | `/requests` | `REQUEST_CREATE` + catégorie autorisée | `{ clientId, title, description?, voiceFileId?, categoryId, priority, recipientId?, asDraft? }` → `201 RequestDetail` ; renvoi du même `clientId` → `200` avec la demande existante |
| GET | `/requests/:id` | lecture autorisée | `RequestDetail` |
| PATCH | `/requests/:id` | demandeur, statut DRAFT | modification des champs du brouillon |
| DELETE | `/requests/:id` | demandeur, statut DRAFT | `204` (T19) |
| POST | `/requests/:id/actions` | selon la machine à états | `{ action, version, reason?, assigneeId?, proofFileIds? }` → `200 RequestDetail` |
| PATCH | `/requests/:id/priority` | voir data-model §Machine à états | `{ priority, version }` → `200 RequestDetail` |
| GET | `/requests/:id/history` | lecture autorisée | liste chronologique de `RequestEvent` avec nom de l'acteur |

`action` ∈ `SUBMIT`, `APPROVE`, `REJECT`, `DECLINE`, `CANCEL`, `ACCEPT`, `START`, `COMPLETE`,
`CLOSE`, `VALIDATE_FINAL`, `REQUEST_CORRECTION`, `RESUME`, `REASSIGN`.
`reason` obligatoire pour `REJECT`, `DECLINE`, `REQUEST_CORRECTION` ; `assigneeId` pour
`APPROVE` (affectation manuelle) et `REASSIGN` ; `proofFileIds` pour `COMPLETE` si photo exigée.

**RequestSummary** : `id, reference, title, category{id,name}, priority, status,
requester{id,displayName}, assignee{id,displayName}|null, createdAt, currentStage,
currentDueAt, warnAt, overdueStage, hasVoice, unreadCount`.

**RequestDetail** : RequestSummary + `description, voice{fileId,durationSeconds}|null,
rulesSnapshot{circuit, photoRequired, closureMode, finalValidation}, timestamps{…}, version,
rejectionReason, allowedActions[]` (calculé par la politique d'accès pour l'utilisateur
courant : seule source pour l'affichage des boutons).

## Fil de discussion

| Méthode | Route | Accès | Corps / réponse |
|---------|-------|-------|-----------------|
| GET | `/requests/:id/messages` | lecture autorisée | liste paginée `{ id, kind, author{id,displayName}|null, text, voice, attachments[], createdAt }` |
| POST | `/requests/:id/messages` | participant, statut non final | `{ clientId, text?, voiceFileId?, attachmentFileIds? }` → `201` ; idempotent par `clientId` |

## Fichiers

| Méthode | Route | Accès | Corps / réponse |
|---------|-------|-------|-----------------|
| POST | `/files` | connecté | `multipart` : `file`, `kind` (`VOICE`, `PHOTO`, `DOCUMENT`), `requestId?` → `201 { id, kind, mimeType, sizeBytes, durationSeconds? }`. Sans `requestId` (création en cours), le fichier est provisoire et rattaché à la création de la demande ; supprimé s'il n'est pas rattaché sous 24 h. |
| GET | `/files/:id` | lecture autorisée sur la demande parente (ou auteur d'un fichier provisoire) | binaire ; requêtes `Range` acceptées (`206`) ; en-têtes : type stocké, `nosniff`, `Cache-Control: private, no-store`, `Content-Disposition` |

Traitement : vocal → ffprobe + conversion AAC/MP4 ; photo → sharp (sans métadonnées) ;
document → contrôle d'octets magiques uniquement. Erreurs : `FILE_TYPE_NOT_ALLOWED`,
`FILE_TOO_LARGE`, `VOICE_TOO_LONG`, `VOICE_TOO_SHORT`.

## Notifications

| Méthode | Route | Accès | Réponse |
|---------|-------|-------|---------|
| GET | `/notifications?unread=true` | connecté | liste paginée `{ id, type, priority, request{id,reference,title}, createdAt, readAt }` + `unreadTotal` |
| POST | `/notifications/read` | connecté | `{ ids[] }` ou `{ all: true }` → `204` |

## Administration (super administrateur uniquement)

| Méthode | Route | Objet |
|---------|-------|-------|
| GET, POST | `/admin/users` | lister, créer (mot de passe provisoire renvoyé une seule fois) |
| PATCH | `/admin/users/:id` | nom, fonction, rôle, activation |
| POST | `/admin/users/:id/reset-password` | nouveau mot de passe provisoire |
| GET, PUT | `/admin/role-permissions` | permissions par rôle |
| GET, POST | `/admin/categories` | lister, créer |
| PATCH | `/admin/categories/:id` | circuit, modes, photo, activation |
| PUT | `/admin/categories/:id/recipients` | `{ userIds[] }` |
| PUT | `/admin/categories/:id/managers` | `{ userIds[] }` (rôle MANAGER ou SUPER_ADMIN) |
| GET, PUT | `/admin/categories/:id/deadlines` | règles par priorité |
| GET, PUT | `/admin/settings` | réglages globaux |
| GET | `/admin/audit` | filtres `actorId`, `action`, `from`, `to` ; lecture seule |

Chaque écriture d'administration produit une entrée `AuditLog` avec les valeurs avant/après.
Les modifications de catégorie et de délais ne s'appliquent qu'aux nouvelles demandes.
