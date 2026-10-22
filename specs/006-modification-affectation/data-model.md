# Data Model — 006 Modification d'une affectation

**Aucune modification de schéma, aucune migration.** Les champs, l'événement et la notification
utilisés existent déjà.

## Affectation (`Request` de type `COVERAGE` + `CoverageDetail`, existants)

| Champ | Modifié | Règle |
|-------|---------|-------|
| `CoverageDetail.classId` | oui | classe **active** ; seulement si le statut est `PENDING`, `ACCEPTED`, `EN_ROUTE` ou `LATE` |
| `CoverageDetail.floorId` | oui (dérivé) | copie de l'étage de la nouvelle classe |
| `CoverageDetail.startAt` | oui | avant présence seulement ; entre 12 h avant et 7 jours après maintenant ; fuseau de l'école |
| `CoverageDetail.plannedEndAt` | oui | après le début ; pas déjà passée (pendant la présence : postérieure à maintenant) |
| `CoverageDetail.estimatedMinutes` | oui (dérivé) | `(plannedEndAt − startAt)` en minutes |
| `Request.title` | oui (dérivé) | suit la classe : préfixe existant (« Garde », « Retard », « Absence ») + nom de la classe |
| `Request.version` | +1 | contrôle optimiste ; version reçue différente → `409 STATE_CHANGED` |
| `Request.currentDueAt`, `warnAt` | oui (dérivés) | recalculés à partir du nouveau début tant que la présence n'est pas confirmée |
| `Request.status`, `assigneeId`, `departedAt`, `type`, `teacherId`, `reason` | **non** | statut inchangé, y compris `EN_ROUTE` |

## Champs modifiables selon le statut (`modifiableFields`)

| Statut | Champs |
|--------|--------|
| `PENDING` (En attente), `ACCEPTED` (Assignée), `EN_ROUTE` (En route), `LATE` (En retard) | `classId`, `date`, `startTime`, `endTime` |
| `ON_DUTY` (En cours), `RELIEF_PENDING` (Relève demandée) | `endTime` |
| `DONE`, `CLOSED`, `CANCELLED`, `UNFILLED` | aucun (action `UPDATE` refusée) |

## Événement d'historique (`RequestEvent`, type existant `UPDATED`)

```jsonc
{
  "type": "UPDATED",
  "actorId": "<admin>",
  "fromValue": { "classId": "…", "startAt": "ISO", "plannedEndAt": "ISO" },
  "toValue":   { "classId": "…", "startAt": "ISO", "plannedEndAt": "ISO", "byAdmin": true }
}
```

Jamais le motif. Noms de classe résolus à la lecture (`className`), comme les noms de personnes.

## Journal d'audit (`AuditLog`, action existante `COVERAGE_MANAGED`)

`details` : `{ action: "UPDATE", before: { classId, startAt, plannedEndAt }, after: { … } }` ;
`targetType: "Request"`, `targetId` : l'affectation. Jamais le motif.

## Rappels (`CoverageReminder`, existant)

Recalculés après modification : attente d'assignation pour `PENDING` (existant) ; rappels de fin
de créneau pour une affectation assignée ou en cours (comme la prolongation).

## Transitions

Règle ajoutée à la machine à états : `UPDATE`, acteur `ADMIN`, depuis `PENDING`, `ACCEPTED`,
`EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING`, vers le **même** statut. La règle existante de
l'enseignant (`UPDATE` depuis `PENDING`, acteur `REQUESTER_TEACHER`) est inchangée.
