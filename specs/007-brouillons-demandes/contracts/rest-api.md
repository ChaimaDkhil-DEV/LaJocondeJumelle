# Contrat REST — 007 Brouillons de demande de travail

## Modifié : `GET /api/requests?scope=…`

| `scope` | Contenu |
|---------|---------|
| `mine` | demandes dont l'utilisateur est l'auteur, **sauf** celles au statut `DRAFT` |
| `drafts` (**nouveau**) | demandes dont l'utilisateur est l'auteur, au statut `DRAFT` seulement |

Autres paramètres (filtres, `limit`, `cursor`) et forme de réponse (`{ items, nextCursor }`)
inchangés. `scope` inconnu : `400 VALIDATION_ERROR` (inchangé).

## Réutilisés sans changement

| Appel | Usage |
|-------|-------|
| `POST /api/requests` avec `asDraft: true` | enregistrer en brouillon ; `400` sur `asDraft` si `draftsEnabled` est désactivé |
| `GET /api/requests/:id` | ouvrir un brouillon (auteur seul ; `404` sinon) |
| `PATCH /api/requests/:id` | enregistrer un brouillon (champs changés ; `voiceFileId: null` retire le vocal) |
| `POST /api/requests/:id/actions` `{ action: "SUBMIT", version }` | envoyer ; contrôles de contenu, catégorie, destinataire |
| `DELETE /api/requests/:id` | supprimer (auteur seul, brouillon seulement) → `204` |
| `POST /api/files` (`kind: VOICE`) | téléverser un message vocal avant `POST`/`PATCH` |
