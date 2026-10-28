# REST API: Assistance IA (socle)

Règles communes : session obligatoire (`SessionGuard`), contrôle d'origine sur les écritures
(`OriginGuard`), erreurs au format existant `{ error: { code, message, fields? } }`.

## GET /api/settings/client (existant, étendu)

Ajoute deux booléens, issus de la configuration du serveur :

```json
{ "...": "...", "assistSuggestions": false, "assistTranscription": false }
```

## POST /api/assist/transcriptions

- Accès : utilisateur qui peut créer une demande de travail (au moins une catégorie autorisée) ;
  sinon `NOT_FOUND` (404) et `ACCESS_DENIED` journalisé.
- Corps : `multipart/form-data`, champ `file` (enregistrement du formulaire).
- Contrôles : ceux de `POST /api/files` pour un vocal (taille, signature, durée, conversion).
- Limite d'appels : partagée avec les propositions (research R7).
- `200` : `{ "text": "…" }` (au plus 4 000 caractères).
- Erreurs : `ASSIST_DISABLED` (404) si la transcription est désactivée ; `FILE_TOO_LARGE` (413),
  `FILE_TYPE_NOT_ALLOWED` (415), `VOICE_TOO_SHORT` / `VOICE_TOO_LONG` (existants) ;
  `TRANSCRIPTION_EMPTY` (422) ; `ASSIST_RATE_LIMITED` (429) ; `ASSIST_UNAVAILABLE` (503).
- Aucun fichier conservé, aucune ligne `File`.

## POST /api/assist/suggestions

- Accès et limite : comme ci-dessus.
- Corps (JSON, class-validator) :

```json
{ "text": "La photocopieuse du 1er étage ne marche plus" }
```

  `text` : obligatoire, rogné, 1 à 4 000 caractères (description et transcription réunies par le
  navigateur).

- `200` :

```json
{
  "suggestion": {
    "title": "La photocopieuse du 1er étage ne marche plus",
    "categoryId": "…",
    "priority": "HIGH",
    "reason": "D'après la consigne « Pannes de reprographie ».",
    "missing": []
  },
  "sources": [{ "id": "…", "title": "Pannes de reprographie", "excerpt": "…" }],
  "noGuideline": false,
  "token": "…"
}
```

  Chaque champ de `suggestion` est facultatif ; `suggestion: null` et `token: null` quand aucune
  proposition fiable n'a pu être faite. `noGuideline: true` quand aucune consigne n'a été
  retrouvée.

- Erreurs : `VALIDATION_ERROR` (400), `ASSIST_DISABLED` (404), `ASSIST_RATE_LIMITED` (429),
  `ASSIST_UNAVAILABLE` (503).
- Aucune écriture métier (FR-010).

## POST /api/requests (existant, étendu)

`CreateRequestDto.assistToken?: string` (au plus 4 000 caractères). Ignoré pour un brouillon et
quand il est invalide, expiré ou d'un autre utilisateur ; sinon un événement `ASSIST_SUGGESTED`
est écrit (data-model). Tous les autres contrôles et réponses sont inchangés.

## /api/admin/guidelines (super administrateur, `SuperAdminGuard`)

| Méthode | Chemin | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/api/admin/guidelines` | — | `200` liste triée par titre : `{ id, title, body, categoryId, categoryName, active, updatedAt, updatedBy }` |
| POST | `/api/admin/guidelines` | `{ title, body, categoryId: string \| null, active }` | `201` consigne |
| PATCH | `/api/admin/guidelines/:id` | champs facultatifs | `200` consigne |
| DELETE | `/api/admin/guidelines/:id` | — | `204` |

Erreurs : `VALIDATION_ERROR` (catégorie inconnue ou de type garde : champ `categoryId`),
`NOT_FOUND`. Chaque écriture : `GUIDELINE_CHANGED` dans le journal d'audit.
