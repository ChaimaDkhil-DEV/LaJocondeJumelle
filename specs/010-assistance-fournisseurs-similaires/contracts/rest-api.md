# REST API: fournisseurs réels et demandes similaires (010)

## POST /api/assist/suggestions (étendu)

Accès, limite, erreurs et corps inchangés (spec 009). Réponse `200` : champ ajouté `similar`
(toujours présent, éventuellement vide).

```json
{
  "suggestion": { "...": "inchangé" },
  "sources": [],
  "noGuideline": false,
  "token": "…",
  "similar": [
    {
      "id": "…",
      "reference": "D-2026-000042",
      "title": "Photocopieuse du 1er étage en panne",
      "categoryName": "Photocopies",
      "priority": "HIGH",
      "status": "IN_PROGRESS"
    }
  ]
}
```

`similar` : 3 au plus, uniquement des demandes de travail visibles par l'utilisateur, hors
brouillons. Aucun champ supplémentaire (ni description, ni personnes).

## Requêtes sortantes (connecteurs réels, désactivés par défaut)

### Whisper (serveur de l'établissement)

`POST {ASSIST_WHISPER_URL}/v1/audio/transcriptions`, `multipart/form-data` :
`file` (audio/mp4), `model`, `language=fr`, `response_format=json`. En-tête
`Authorization: Bearer {ASSIST_WHISPER_API_KEY}` si la clé est définie.
Réponse attendue : `{ "text": "…" }`. Tout autre cas : `ASSIST_UNAVAILABLE`.

### Claude (API Messages d'Anthropic, par le SDK officiel)

Bêta `server-side-fallback-2026-07-01`, `fallbacks: "default"`, modèle `ASSIST_CLAUDE_MODEL`,
`output_config.format` de type `json_schema` :

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["title", "categoryId", "priority", "reason", "missing", "sourceIds"],
  "properties": {
    "title": { "type": ["string", "null"] },
    "categoryId": { "enum": ["<ids des catégories autorisées>", null] },
    "priority": { "enum": ["NORMAL", "MEDIUM", "HIGH", "URGENT", null] },
    "reason": { "type": ["string", "null"] },
    "missing": { "type": "array", "items": { "type": "string" } },
    "sourceIds": { "type": "array", "items": { "type": "string" } }
  }
}
```

Contenu transmis : texte de la demande (entre `<demande>`), catégories autorisées (id, nom),
consignes autorisées retrouvées (id, titre, texte), demandes similaires (titre, catégorie,
priorité). Les `null` sont retirés avant `sanitizeSuggestion`.
