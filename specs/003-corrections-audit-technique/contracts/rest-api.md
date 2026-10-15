# Contrat REST — changements

Seule l'action d'approbation change. Le reste de l'API est celui de
[`specs/001-demandes-travail-vocales/contracts/rest-api.md`](../../001-demandes-travail-vocales/contracts/rest-api.md).

## `POST /api/requests/:id/actions` — action `APPROVE` (circuit B)

Corps inchangé : `{ "action": "APPROVE", "version": <int>, "assigneeId"?: "<uuid>" }`.

« Affectable » = compte actif **et** destinataire actuel de la catégorie. « Personne à
affecter » = `rulesSnapshot.autoAssigneeId` si la clé existe ; sinon (demande antérieure,
exception EXC-1, décision D9) `Category.autoAssigneeId` actuel. Algorithme complet :
[data-model.md](../data-model.md) §Résolution.

| Mode figé dans le snapshot | `assigneeId` fourni | Résultat | `assigneeSource` |
|---|---|---|---|
| `MANUAL` | oui, affectable | `200`, affecté à `assigneeId` | `MANAGER_CHOICE` |
| `MANUAL` | non | `422 ASSIGNEE_REQUIRED` (inchangé) | — |
| `MANUAL` | oui, non affectable | `422 RECIPIENT_NOT_ALLOWED` (inchangé) | — |
| `AUTO`, personne à affecter affectable | ignoré (FR-008) | `200`, affecté à la personne à affecter | `SNAPSHOT`, ou `CATEGORY_CURRENT` (EXC-1) |
| `AUTO`, personne à affecter absente ou non affectable (EXC-2, D8) | non | **`422 AUTO_ASSIGNEE_UNAVAILABLE`** (nouveau), aucune écriture | — |
| `AUTO`, personne à affecter absente ou non affectable (EXC-2, D8) | oui, affectable | `200`, affecté à `assigneeId` | `MANAGER_CHOICE` |
| `AUTO`, personne à affecter absente ou non affectable (EXC-2, D8) | oui, non affectable | `422 RECIPIENT_NOT_ALLOWED`, aucune écriture | — |

**Changements de comportement** (seuls autorisés par FR-023) : le mode et la personne viennent
désormais du snapshot, plus de la catégorie actuelle (D1) ; exception EXC-1 pour les demandes
antérieures (D9) ; refus puis choix par le responsable si la personne n'est plus affectable
(EXC-2, D8) ; source enregistrée dans `RequestEvent.toValue.assigneeSource`.

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
