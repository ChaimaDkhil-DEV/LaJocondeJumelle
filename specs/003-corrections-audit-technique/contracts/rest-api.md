# Contrat REST — changements

Seule l'action d'approbation change. Le reste de l'API est celui de
[`specs/001-demandes-travail-vocales/contracts/rest-api.md`](../../001-demandes-travail-vocales/contracts/rest-api.md).

## `POST /api/requests/:id/actions` — action `APPROVE` (circuit B)

Corps inchangé : `{ "action": "APPROVE", "version": <int>, "assigneeId"?: "<uuid>" }`.

| Mode figé dans le snapshot | `assigneeId` fourni | Résultat |
|---|---|---|
| `MANUAL` | oui, affectable | `200`, affecté à `assigneeId` |
| `MANUAL` | non | `422 ASSIGNEE_REQUIRED` (inchangé) |
| `MANUAL` | oui, non affectable | `422 RECIPIENT_NOT_ALLOWED` (inchangé) |
| `AUTO`, personne figée affectable | ignoré | `200`, affecté à la personne figée |
| `AUTO`, personne figée non affectable | non | **`422 AUTO_ASSIGNEE_UNAVAILABLE`** (nouveau) |
| `AUTO`, personne figée non affectable | oui, affectable | `200`, affecté à `assigneeId` |
| `AUTO`, personne figée non affectable | oui, non affectable | `422 RECIPIENT_NOT_ALLOWED` |

**Changement de comportement** (seul autorisé par FR-023) : le mode et la personne viennent
désormais du snapshot, plus de la catégorie actuelle. Une modification de la catégorie après la
soumission n'a plus d'effet sur l'approbation.

### Nouveau code d'erreur

```json
{
  "error": {
    "code": "AUTO_ASSIGNEE_UNAVAILABLE",
    "message": "La personne désignée pour cette catégorie n'est plus disponible. Choisissez l'employé qui réalisera la demande.",
    "details": null
  }
}
```

Statut HTTP `422`. Ajouté au catalogue `ERROR_CATALOG`. L'interface affiche alors le sélecteur
d'employé dans la boîte d'approbation.

## Lecture de fichiers — inchangé

`GET /api/files/:id` garde exactement ses réponses (`200`, `404` + audit `ACCESS_DENIED`) ; seule
l'organisation interne change (registre par type de demande, research R8).
