# Data Model — 007 Brouillons de demande de travail

**Aucune modification de schéma, aucune migration.**

## Demande de travail au statut `DRAFT` (existante)

| Champ | Brouillon | Envoi (`SUBMIT`) |
|-------|-----------|------------------|
| `categoryId` | obligatoire, catégorie de demande de travail active permise à l'auteur | idem |
| `title` | obligatoire, 1 à 120 caractères | idem |
| `priority` | « Normale » par défaut si non choisie | obligatoire |
| `description` | facultative, 4000 caractères max | description **ou** message vocal |
| `voiceFileId` | facultatif ; remplaçable ; `null` pour le retirer | |
| `assigneeId` (destinataire) | facultatif | obligatoire en mode direct ou entre enseignants (règles de la catégorie) |
| `status` | `DRAFT` | `SENT` (mode direct) ou `PENDING_ADMIN_VALIDATION` (via l'administration) |

Règles existantes réutilisées : visible de son seul auteur ; aucun événement d'historique ni
notification tant qu'il est brouillon ; supprimable par son auteur seul (`DELETE`, message vocal
supprimé avec) ; version optimiste.

## Réglage `draftsEnabled` (existant)

Bloque la **création** d'un brouillon (`asDraft`) ; n'affecte ni la modification, ni l'envoi, ni la
suppression d'un brouillon existant.

## Périmètres de liste (`GET /api/requests?scope=`)

| Périmètre | Avant | Après |
|-----------|-------|-------|
| `mine` (« Envoyées ») | demandes de l'utilisateur, brouillons compris | demandes de l'utilisateur **sauf** brouillons |
| `drafts` (« Brouillons », nouveau) | — | brouillons de l'utilisateur seulement |
| `assigned`, `managed`, `all` | inchangés | inchangés |
