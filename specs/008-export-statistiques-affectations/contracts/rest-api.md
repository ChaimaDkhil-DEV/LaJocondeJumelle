# REST contract: assignment statistics export

## `GET /api/coverage/stats/export.csv` (new)

Query parameters: those of `GET /api/coverage/stats` (`CoverageStatsQuery`), all optional.

| Parameter | Values | Default |
|-----------|--------|---------|
| `from` | `AAAA-MM-JJ` | 1st of the current month (school time zone) |
| `to` | `AAAA-MM-JJ` | today (school time zone) |
| `groupBy` | `teacher`, `class`, `period` | `teacher` |
| `period` | `week`, `month` (with `groupBy=period`) | `week` |

### Responses

| Case | Status | Body | Audit |
|------|--------|------|-------|
| admin or super administrator, valid period | `200` | CSV file (research R3) | `COVERAGE_STATS_EXPORTED` |
| other logged-in user | `404` `NOT_FOUND` | usual JSON error | `ACCESS_DENIED` (`NOT_COVERAGE_ADMIN`) |
| no session | `401` | usual JSON error | — (existing global behavior) |
| malformed parameter (`groupBy=enseignant`, invalid date) | `400` | validation error | — |
| `from > to` or more than 400 days | `400` `INVALID_RANGE` | same message as `GET /api/coverage/stats` | — |

Headers of the `200` response:

```text
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="statistiques-affectations-<regroupement>-<from>-au-<to>.csv"
Cache-Control: private, no-store
```

`<regroupement>` (grouping): `enseignant`, `classe`, `semaine` or `mois`.

Body: the existing `toCsv` — UTF-8 with BOM, `;` separator, CRLF line endings, cells starting
with `=`, `+`, `-`, `@` prefixed with an apostrophe.

Example (`groupBy=class`, excerpt):

```text
Classe;Événements;Retards;Absences;Classes vides;Non pourvues;Annulées;Durée moyenne
6e A;4;3;1;0;1;0;1 h 05
5e B;2;1;0;1;0;1;40 min
Total de la période;6;4;1;1;1;1;55 min

Du;2026-10-01
Au;2026-10-23
Fuseau;Europe/Paris
Regroupement;Classe
Taux de non pourvue;17 %
Doublons non tranchés (comptés une fois);0
```

## `GET /api/coverage/stats` (unchanged)

Response, access and checks identical. The `format` parameter is still rejected (`400`).

## `GET /api/admin/audit` (unchanged)

Accepts `action=COVERAGE_STATS_EXPORTED` (added enumeration value); the `details` of an export
entry are `from`, `to`, `groupBy` and `period`.
