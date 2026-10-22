# Contrat REST — 006 Modification d'une affectation

## `PATCH /api/coverage/:id` (nouveau)

Session requise ; **admins et super administrateur** seulement. En-tête `Origin` exigé (comme
toute écriture).

Corps (`UpdateCoverageDto`) — tous les champs sauf `version` sont facultatifs ; au moins un doit
différer de la valeur actuelle pour qu'il y ait modification :

```jsonc
{
  "version": 7,                 // obligatoire, entier : version lue
  "classId": "uuid",            // classe active
  "date": "2026-10-23",         // AAAA-MM-JJ, fuseau de l'école
  "startTime": "09:30",         // HH:MM
  "endTime": "10:30"            // HH:MM
}
```

Réponse `200` : détail de l'affectation (`CoverageDetail`, même forme que `GET /api/coverage/:id`),
avec `version` incrémentée. Valeurs identiques : `200`, détail inchangé, sans événement ni
notification.

| Code | Cas |
|------|-----|
| 200 | modifiée (ou rien à modifier) |
| 400 `VALIDATION_ERROR` | champ mal formé ; champ non modifiable dans ce statut (`fields[].field` = `classId`, `date` ou `startTime`, message « Non modifiable pendant la présence en classe. ») ; début hors de la fenêtre 12 h avant / 7 jours après ; fin non postérieure à maintenant pendant la présence |
| 400 `INVALID_RANGE` | fin avant le début, ou fin déjà passée |
| 400 `CLASS_INACTIVE` | classe introuvable ou désactivée |
| 404 `NOT_FOUND` | affectation inexistante, ou rôle non admin (refus journalisé `ACCESS_DENIED`) |
| 409 `INVALID_TRANSITION` | statut définitif (terminée, clôturée, annulée, non pourvue) |
| 409 `STATE_CHANGED` | version différente (modification concurrente) |
| 409 `NOT_AVAILABLE` | surveillant indisponible sur le nouveau créneau ; `message` nomme le conflit, `details.conflict = { id, className, startAt, plannedEndAt }` si une autre affectation ou un renfort chevauche |

Exemple de refus nommé :

```json
{
  "error": {
    "code": "NOT_AVAILABLE",
    "message": "Surveillant déjà affecté : 2e année Bleu, 22/10 09:00–10:00. Réassignez d’abord, puis modifiez.",
    "details": { "conflict": { "id": "uuid", "className": "2e année Bleu", "startAt": "ISO", "plannedEndAt": "ISO" } }
  }
}
```

## `GET /api/coverage/:id` — champ ajouté au détail

```jsonc
{
  "allowedActions": ["UPDATE", "REASSIGN", "EXTEND", "CANCEL"],
  "modifiableFields": ["classId", "date", "startTime", "endTime"]   // AJOUTÉ ; [] si rien
}
```

`modifiableFields` est renseigné pour les admins (vide pour les autres rôles).

## Historique (`GET /api/coverage/:id`, `history[]`) — événement `UPDATED`

`fromValue` / `toValue` : `classId`, `className` (résolu à la lecture), `startAt`, `plannedEndAt` ;
`toValue.byAdmin: true` pour une modification par un admin. Jamais le motif.

## Notification `COVERAGE_UPDATED` (existante)

Destinataires : surveillant affecté (s'il y en a un) et autres admins. Libellé affiché :
« Affectation modifiée », suivi du titre de l'affectation, qui porte la classe.
