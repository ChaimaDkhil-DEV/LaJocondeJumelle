# Data model: Section « Surveillance » (012)

**No change.** No schema change, no migration, no new API route, no change to statuses or rights.

## Existing statuses and their filter (read only, frontend grouping)

The server already groups the coverage statuses into a main status (`mainStatus`); the filters of
« Suivi des interventions » select main statuses through the existing list route
(`GET /api/coverage?mainStatus=…`).

| Filter | `mainStatus` | Precise statuses shown on the row (unchanged) |
|---|---|---|
| En attente | `PENDING` | En attente |
| Prise en charge | `ASSIGNED`, `IN_PROGRESS` | Assignée, En route, En retard, En cours, Relève demandée |
| Terminée | `DONE`, `CANCELLED`, `UNFILLED` | Terminée, Clôturée après validation, Annulée, Non pourvue |

## Page state kept in the address

| Parameter | Values | Default |
|---|---|---|
| `onglet` | `absences-retards`, `affectation`, `suivi` (admin); group keys unchanged | first tab of the account |
| `filtre` | `en-attente`, `prise-en-charge`, `terminee` | `prise-en-charge` (only with `onglet=suivi`) |

Former keys mapping: research R4.
