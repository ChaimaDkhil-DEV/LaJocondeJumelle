# Data Model: Lot 1 – Demandes de travail et messagerie vocale

**Date**: 2026-10-12 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Conventions : identifiants UUID ; horodatages `timestamptz` en UTC ; noms techniques en
anglais (code), libellés métier en français (interface). Les tables `RequestEvent` et
`AuditLog` sont en ajout seul (trigger PostgreSQL contre UPDATE/DELETE, research R6).

## Énumérations

| Énumération | Valeurs (code → libellé) |
|-------------|--------------------------|
| `Role` | `SUPER_ADMIN` → Super administrateur ; `MANAGER` → Administrateur/responsable ; `EMPLOYEE` → Employé |
| `Priority` | `NORMAL` → Normale ; `MEDIUM` → Moyenne ; `HIGH` → Haute ; `URGENT` → Urgente |
| `RequestStatus` | `DRAFT` → Brouillon ; `PENDING_ADMIN_VALIDATION` → En attente de validation administrative ; `SENT` → Envoyée ; `ACCEPTED` → Acceptée ; `IN_PROGRESS` → En cours ; `DONE` → Terminée ; `PENDING_FINAL_VALIDATION` → En attente de validation finale ; `TO_CORRECT` → À corriger ; `CLOSED` → Clôturée ; `REJECTED` → Refusée ; `CANCELLED` → Annulée |
| `Circuit` | `A_DIRECT` ; `B_ADMIN_VALIDATION` |
| `ClosureMode` | `AUTO` (après délai de grâce) ; `REQUESTER` ; `MANAGER` |
| `AssignmentMode` | `MANUAL` ; `AUTO` (circuit B uniquement) |
| `DeadlineStage` | `VALIDATION` ; `TAKEOVER` (prise en charge) ; `COMPLETION` (réalisation) |
| `MessageKind` | `TEXT` ; `VOICE` ; `SYSTEM` (commentaire obligatoire d'un refus, d'une correction…) |
| `FileKind` | `VOICE` ; `PHOTO` ; `DOCUMENT` |
| `Permission` | `REQUEST_CREATE` ; `PRIORITY_CHANGE_OWN` ; `PRIORITY_CHANGE_MANAGED` ; `REQUEST_REASSIGN` ; `AUDIT_READ` ; `ADMIN_MANAGE` |

## Entités

### User (Utilisateur)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| username | texte | unique, insensible à la casse, 3–64 caractères |
| displayName | texte | 1–100 caractères |
| jobTitle | texte ? | fonction affichée (ex. « Reprographie ») |
| role | Role | obligatoire |
| passwordHash | texte | Argon2id ; jamais renvoyé par l'API |
| mustChangePassword | booléen | vrai à la création et après réinitialisation |
| active | booléen | désactivation = suppression des sessions ; jamais de suppression physique |
| createdAt, updatedAt | horodatage | |

### Session

| Champ | Type | Règles |
|-------|------|--------|
| id | texte aléatoire (256 bits) | valeur du cookie, stockée hachée |
| userId | → User | |
| createdAt, lastSeenAt, expiresAt | horodatage | inactivité > `sessionIdleMinutes` ou âge > `sessionMaxHours` → invalide |

### RolePermission

| Champ | Type | Règles |
|-------|------|--------|
| role | Role | `SUPER_ADMIN` a toujours toutes les permissions (non stocké) |
| permission | Permission | clé unique (role, permission) |

### Category (Catégorie)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| name | texte | unique, 1–60 caractères (ex. « Photocopies ») |
| active | booléen | une catégorie inactive n'est plus proposée à la création |
| circuit | Circuit | |
| creatorRoles | Role[] | rôles autorisés à créer dans cette catégorie (FR-037) |
| closureMode | ClosureMode | |
| autoCloseAfterMinutes | entier ≥ 0 | si `closureMode = AUTO` ; 0 = immédiat |
| finalValidation | booléen | circuit B uniquement |
| assignmentMode | AssignmentMode | circuit B uniquement |
| autoAssigneeId | → User ? | obligatoire si `assignmentMode = AUTO` |
| photoRequired | booléen | photo exigée pour passer « Terminée » |

Relations :
- **CategoryRecipient** (categoryId, userId) : destinataires possibles en circuit A et
  employés affectables en circuit B. Seuls ces utilisateurs actifs peuvent être choisis
  (FR-004, contrainte 7).
- **CategoryManager** (categoryId, userId) : responsables de la catégorie ; ils approuvent,
  refusent, affectent, réaffectent, valident, clôturent (selon `closureMode`) et reçoivent les
  alertes de retard. Rôle requis : `MANAGER` ou `SUPER_ADMIN`.

### DeadlineRule (Règle de délai)

| Champ | Type | Règles |
|-------|------|--------|
| categoryId | → Category | clé unique (categoryId, priority) |
| priority | Priority | |
| validationMinutes | entier > 0 ? | null = non suivi ; circuit B seulement |
| takeoverMinutes | entier > 0 ? | null = non suivi |
| completionMinutes | entier > 0 ? | null = non suivi |

Le seuil « proche de l'échéance » est global (`deadlineWarnPercent`).

### Setting (Réglage global)

Paires clé/valeur typées, modifiables par le super administrateur, chaque modification
auditée. Clés et valeurs par défaut : voir [§Valeurs par défaut](#valeurs-par-défaut-provisoires).

### Request (Demande)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| reference | texte | lisible, unique, ex. `D-2026-000123` |
| clientId | UUID | unique par (requesterId, clientId) : idempotence des renvois (R10) |
| title | texte | 1–120 caractères, obligatoire |
| description | texte ? | ≤ 4 000 caractères |
| voiceFileId | → File ? | au moins `voiceFileId` ou `description` à l'envoi (FR-002) |
| categoryId | → Category | catégorie active où le demandeur peut créer |
| priority | Priority | |
| requesterId | → User | |
| assigneeId | → User ? | défini à l'envoi en circuit A (destinataire choisi), à l'approbation en circuit B ; doit appartenir à `CategoryRecipient` |
| status | RequestStatus | |
| version | entier | verrouillage optimiste (R5) |
| rulesSnapshot | objet | copie à la création : circuit, closureMode, autoCloseAfterMinutes, finalValidation, assignmentMode, photoRequired, durées de délai (FR-022) |
| currentStage | DeadlineStage ? | étape suivie en cours |
| currentDueAt, warnAt | horodatage ? | |
| overdueStage | DeadlineStage ? | étape en retard actuellement ; remis à null à la fin de l'étape |
| autoCloseAt | horodatage ? | si « Terminée » et clôture automatique |
| rejectionReason | texte ? | obligatoire si `REJECTED` |
| createdAt, submittedAt, approvedAt, rejectedAt, assignedAt, acceptedAt, startedAt, doneAt, finalValidatedAt, closedAt, cancelledAt | horodatage ? | horodatage de chaque étape (FR-028) ; la dernière occurrence ; l'historique garde toutes les occurrences |

Index : `status`, `categoryId`, `assigneeId`, `requesterId`, `priority`, `createdAt`,
`currentDueAt`.

### Message

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| requestId | → Request | |
| authorId | → User ? | auteur du message ; pour un message `SYSTEM` (motif de refus, commentaire de correction), l’auteur de l’action |
| clientId | UUID | unique par (authorId, clientId) |
| kind | MessageKind | |
| text | texte ? | ≤ 4 000 caractères ; obligatoire si `TEXT` |
| voiceFileId | → File ? | obligatoire si `VOICE` |
| createdAt | horodatage | jamais modifié ni supprimé (FR-012) |

### File (Fichier : vocal, photo ou document)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | sert aussi de nom sur disque |
| requestId | → Request | rattachement obligatoire (contrôle d'accès hérité) |
| messageId | → Message ? | si joint à un message |
| uploaderId | → User | |
| kind | FileKind | |
| mimeType | texte | type **après** traitement (`audio/mp4`, `image/jpeg`, `application/pdf`…) |
| originalName | texte | nettoyé, ≤ 255 caractères |
| sizeBytes | entier | |
| durationSeconds | décimal ? | vocaux, mesuré par ffprobe |
| storagePath | texte | jamais renvoyé par l'API |
| isCompletionProof | booléen | photo jointe lors du passage « Terminée » |
| createdAt | horodatage | |

Un fichier téléversé mais non rattaché dans les 24 h (brouillon abandonné) est supprimé par le
job planifié.

### RequestEvent (Événement d'historique – ajout seul)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| requestId | → Request | |
| actorId | → User ? | null = `SYSTEM` (job) |
| type | texte | `CREATED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`, `ASSIGNED`, `REASSIGNED`, `MESSAGE_ADDED`, `FILE_ADDED`, `OVERDUE` |
| fromValue, toValue | JSON ? | valeurs avant/après (statut, priorité, affecté, étape en retard…) |
| comment | texte ? | motif ou commentaire obligatoire le cas échéant |
| createdAt | horodatage | |

### AuditLog (Journal d'audit – ajout seul)

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| actorId | → User ? | null si inconnu (échec de connexion) |
| action | texte | `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `ACCESS_DENIED`, `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `PASSWORD_RESET`, `ROLE_PERMISSIONS_CHANGED`, `CATEGORY_CHANGED`, `DEADLINE_RULE_CHANGED`, `SETTING_CHANGED` |
| targetType, targetId | texte ? | |
| details | JSON ? | valeurs avant/après ; jamais de mot de passe, jeton ni contenu de message |
| ip | texte ? | |
| createdAt | horodatage | |

### Notification

| Champ | Type | Règles |
|-------|------|--------|
| id | UUID | |
| userId | → User | destinataire |
| type | texte | `REQUEST_NEW`, `MESSAGE_NEW`, `ASSIGNED`, `STATUS_CHANGED`, `URGENT`, `TO_CORRECT`, `REJECTED`, `CANCELLED`, `OVERDUE`, `CLOSED` |
| requestId | → Request | |
| priority | Priority | copie, pour l'affichage distinct des urgences |
| readAt | horodatage ? | |
| createdAt | horodatage | |

## Machine à états

Acteurs : **R** = demandeur ; **E** = employé affecté ; **M** = responsable de la catégorie
(ou super administrateur) ; **S** = système (job ou règle automatique).

| # | De | Action | Vers | Acteur | Gardes et effets |
|---|----|--------|------|--------|------------------|
| T1 | DRAFT | SUBMIT | SENT | R | circuit A ; destinataire ∈ CategoryRecipient actif ; vocal ou description ; démarre TAKEOVER |
| T2 | DRAFT | SUBMIT | PENDING_ADMIN_VALIDATION | R | circuit B ; vocal ou description ; démarre VALIDATION |
| T3 | PENDING_ADMIN_VALIDATION | APPROVE | SENT | M | affecté choisi (MANUAL) ou `autoAssigneeId` (AUTO), ∈ CategoryRecipient actif ; démarre TAKEOVER |
| T4 | PENDING_ADMIN_VALIDATION | REJECT | REJECTED | M | motif obligatoire |
| T5 | PENDING_ADMIN_VALIDATION | CANCEL | CANCELLED | R | |
| T6 | SENT | ACCEPT | ACCEPTED | E | démarre COMPLETION |
| T7 | SENT | DECLINE | REJECTED | E | motif obligatoire |
| T8 | SENT | CANCEL | CANCELLED | R | |
| T9 | ACCEPTED | START | IN_PROGRESS | E | |
| T10 | IN_PROGRESS | COMPLETE | DONE | E | si `photoRequired` : au moins une photo `isCompletionProof` ; puis T11 ou T12 automatiquement |
| T11 | DONE | (auto) | PENDING_FINAL_VALIDATION | S | si `finalValidation` |
| T12 | DONE | (auto) | — | S | si `closureMode = AUTO` : fixe `autoCloseAt` |
| T13 | DONE | CLOSE | CLOSED | R ou M selon `closureMode` ; S si `AUTO` et `autoCloseAt` dépassé | |
| T14 | PENDING_FINAL_VALIDATION | VALIDATE_FINAL | CLOSED | M | |
| T15 | DONE | REQUEST_CORRECTION | TO_CORRECT | R | commentaire obligatoire ; annule `autoCloseAt` |
| T16 | PENDING_FINAL_VALIDATION | REQUEST_CORRECTION | TO_CORRECT | M | commentaire obligatoire |
| T17 | TO_CORRECT | RESUME | IN_PROGRESS | E | redémarre COMPLETION |
| T18 | SENT, ACCEPTED, IN_PROGRESS, TO_CORRECT | REASSIGN | SENT | M | nouvel affecté ∈ CategoryRecipient actif ; démarre TAKEOVER |
| T19 | DRAFT | (suppression) | — | R | seul cas de suppression |

- `CLOSED`, `REJECTED`, `CANCELLED` sont finaux (FR-016).
- Toute autre combinaison (statut, action, acteur) est refusée (FR-015), journalisée en
  `ACCESS_DENIED` si l'acteur n'a pas le droit, et renvoie `409 INVALID_TRANSITION` si le
  statut ne permet pas l'action.
- Changement de priorité (hors machine à états) : R avec `PRIORITY_CHANGE_OWN` tant que le
  statut est DRAFT, PENDING_ADMIN_VALIDATION ou SENT ; M avec `PRIORITY_CHANGE_MANAGED` tant
  que la demande n'est pas finale ni DONE. Les échéances en cours ne sont pas recalculées
  (instantané, FR-022) ; l'événement `PRIORITY_CHANGED` est tracé.
- Chaque transition écrit un `RequestEvent` `STATUS_CHANGED`, met à jour l'horodatage
  d'étape, gère `currentStage`/`currentDueAt`/`overdueStage` et crée les notifications.

## Matrice d'accès

| Ressource / action | Demandeur | Employé affecté | Responsable de la catégorie | Super admin | Autres |
|--------------------|-----------|-----------------|-----------------------------|-------------|--------|
| Voir la demande, son fil, ses vocaux et fichiers | ✅ | ✅ (affecté actuel) | ✅ | ✅ | ❌ 404 |
| Voir une demande en circuit B avant approbation | ✅ | — (pas encore d'affecté) | ✅ | ✅ | ❌ 404 |
| Écrire dans le fil, joindre des fichiers | ✅ (statut non final) | ✅ (statut non final) | ✅ (statut non final) | ✅ | ❌ |
| Transitions | selon la machine à états | selon la machine à états | selon la machine à états | comme M | ❌ |
| Gérer comptes, rôles, catégories, délais, réglages | ❌ | ❌ | ❌ | ✅ | ❌ |
| Lire le journal d'audit | ❌ | ❌ | ❌ | ✅ | ❌ |

- Un employé réaffecté perd l'accès à la demande (minimisation) ; ses actions restent dans
  l'historique.
- Toutes les listes, la recherche et les compteurs appliquent la même règle de visibilité.

## Délais

| Étape | Démarre à | S'arrête à | Durée prise dans |
|-------|-----------|------------|------------------|
| VALIDATION | T2 (soumission en circuit B) | T3, T4 ou T5 | `rulesSnapshot.validationMinutes` |
| TAKEOVER | T1, T3, T18 (affectation) | T6, T7, T8 ou T18 | `rulesSnapshot.takeoverMinutes` |
| COMPLETION | T6 (acceptation), T17 (reprise après correction) | T10, T18 | `rulesSnapshot.completionMinutes` |

- `warnAt = currentDueAt − durée × deadlineWarnPercent / 100`.
- Retard : `overdueStage := currentStage` et événement `OVERDUE` (une seule fois par
  occurrence d'étape) ; la demande reste visible ; à la fin de l'étape `overdueStage := null`,
  le retard restant visible dans l'historique (FR-026).

## Valeurs par défaut provisoires

Valeurs chargées par le seed, **à confirmer avec le client** et modifiables par le super
administrateur.

| Réglage | Valeur par défaut |
|---------|-------------------|
| `voiceMaxSeconds` | 180 (3 min) |
| `voiceMaxBytes` | 5 Mo (avant conversion) |
| `attachmentMaxBytes` | 10 Mo par fichier |
| `attachmentMaxPerMessage` | 5 |
| `allowedPhotoTypes` | image/jpeg, image/png, image/webp |
| `allowedDocumentTypes` | application/pdf |
| `draftsEnabled` | vrai |
| `deadlineWarnPercent` | 20 |
| `sessionIdleMinutes` | 60 |
| `sessionMaxHours` | 12 |

Délais par défaut pour toute nouvelle catégorie (minutes) :

| Priorité | Validation | Prise en charge | Réalisation |
|----------|-----------:|----------------:|------------:|
| Normale | 1 440 (24 h) | 1 440 (24 h) | 4 320 (72 h) |
| Moyenne | 480 (8 h) | 480 (8 h) | 2 880 (48 h) |
| Haute | 120 (2 h) | 120 (2 h) | 1 440 (24 h) |
| Urgente | 30 | 15 | 120 (2 h) |

Catégorie d'exemple créée par le seed : **Photocopies** — circuit A, clôture automatique après
24 h, photo non obligatoire, Urgente : prise en charge 1 min et réalisation 5 min (exemple de
la spec, non définitif). Destinataires et responsables à désigner par le client.
Catégories de démonstration : **Petits travaux (démo photo)** — circuit A, photo de preuve
obligatoire, clôture par le demandeur ; **Intervention technique (démo circuit B)** — validation
administrative et validation finale, photo obligatoire.

Permissions par défaut : `EMPLOYEE` → `REQUEST_CREATE`, `PRIORITY_CHANGE_OWN` ;
`MANAGER` → `REQUEST_CREATE`, `PRIORITY_CHANGE_OWN`, `PRIORITY_CHANGE_MANAGED`,
`REQUEST_REASSIGN`.
