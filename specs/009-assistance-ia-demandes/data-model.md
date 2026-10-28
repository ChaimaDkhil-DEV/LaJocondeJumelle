# Data Model: Assistance IA à la création des demandes (socle)

Migration `0011_request_assist` (avec `down.sql`). Aucune donnée existante modifiée.

## Guideline (nouvelle table) — « Consigne »

| Champ | Type | Règles |
|-------|------|--------|
| `id` | UUID | clé |
| `title` | `VARCHAR(120)` | obligatoire, rogné, 1 à 120 caractères |
| `body` | `VARCHAR(4000)` | obligatoire, rogné, 1 à 4 000 caractères |
| `categoryId` | UUID, facultatif | `null` = consigne générale ; sinon catégorie de type `WORK` existante (FK `Category`, `ON DELETE RESTRICT`) |
| `active` | booléen | `true` par défaut |
| `updatedById` | UUID | auteur de la dernière modification (FK `User`) |
| `createdAt`, `updatedAt` | `timestamptz(3)` | |

Index : `(active, categoryId)`. Aucune donnée personnelle hors de l'auteur (FR-015).

Cycle de vie : création (active ou non) → modifications → activation / désactivation → suppression
définitive. Une consigne supprimée disparaît de la recherche ; l'historique des demandes garde
son identifiant et son titre au moment de la proposition, le journal d'audit son titre.

Recherche (research R5) : seules les lignes `active = true` et (`categoryId IS NULL` ou
`categoryId` ∈ catégories que l'utilisateur peut créer) sont lues.

## RequestEventType — nouvelle valeur `ASSIST_SUGGESTED`

Événement écrit par `RequestsService.create`, dans la transaction de création, uniquement pour un
envoi (pas un brouillon) accompagné d'un `assistToken` valide (research R6) :

```text
actorId   = le demandeur
fromValue = { title?, categoryId?, categoryName?, priority?, sources: [{ id, title }] }   // proposé
toValue   = { title, categoryId, categoryName, priority }                                // enregistré
comment   = null
```

Pas de texte transmis, de transcription, de justification ni d'audio (FR-024). L'historique reste
en ajout seul (trigger existant).

## AuditAction — nouvelle valeur `GUIDELINE_CHANGED`

Détails : `action` (`CREATED` | `UPDATED` | `DELETED`), `guidelineId`, `title`, `categoryId`,
`fields` (noms des champs modifiés), `after: { active }` pour une activation ou une
désactivation. Jamais le texte (`body`). Clés ajoutées à `ALLOWED_DETAIL_KEYS` : `guidelineId`,
`title`.

## Données non conservées

- **Proposition** : calculée à la demande, renvoyée au navigateur avec son jeton signé ; rien en
  base tant que la demande n'est pas envoyée.
- **Transcription et audio transmis pour la transcription** : effacés à la fin de l'appel
  (FR-009).

## Jeton de proposition (non stocké)

```text
base64url(JSON { v: 1, uid, iat, s: { title?, categoryId?, priority?, sources: [{ id, title }] } })
+ "." + base64url(HMAC-SHA256(clé dérivée de SESSION_SECRET, charge utile))
```

Valide 24 h, pour l'utilisateur `uid` seulement ; la catégorie proposée est relue en base à
l'écriture de l'événement (nom courant).
