# Contrat REST : export des statistiques des affectations

## `GET /api/coverage/stats/export.csv` (nouveau)

Paramètres de requête : ceux de `GET /api/coverage/stats` (`CoverageStatsQuery`), tous
facultatifs.

| Paramètre | Valeurs | Défaut |
|-----------|---------|--------|
| `from` | `AAAA-MM-JJ` | 1er du mois en cours (fuseau de l'école) |
| `to` | `AAAA-MM-JJ` | aujourd'hui (fuseau de l'école) |
| `groupBy` | `teacher`, `class`, `period` | `teacher` |
| `period` | `week`, `month` (avec `groupBy=period`) | `week` |

### Réponses

| Cas | Statut | Corps | Audit |
|-----|--------|-------|-------|
| admin ou super administrateur, période valide | `200` | fichier CSV (research R3) | `COVERAGE_STATS_EXPORTED` |
| autre utilisateur connecté | `404` `NOT_FOUND` | erreur JSON habituelle | `ACCESS_DENIED` (`NOT_COVERAGE_ADMIN`) |
| sans session | `401` | erreur JSON habituelle | — (comportement global existant) |
| paramètre mal formé (`groupBy=enseignant`, date invalide) | `400` | erreur de validation | — |
| `from > to` ou plus de 400 jours | `400` `INVALID_RANGE` | même message que `GET /api/coverage/stats` | — |

En-têtes de la réponse `200` :

```text
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="statistiques-affectations-<regroupement>-<from>-au-<to>.csv"
Cache-Control: private, no-store
```

`<regroupement>` : `enseignant`, `classe`, `semaine` ou `mois`.

Corps : `toCsv` existant — UTF-8 avec BOM, séparateur `;`, fins de ligne CRLF, cellules commençant
par `=`, `+`, `-`, `@` préfixées d'une apostrophe.

Exemple (`groupBy=class`, extrait) :

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

## `GET /api/coverage/stats` (inchangé)

Réponse, accès et contrôles identiques. Le paramètre `format` reste refusé (`400`).

## `GET /api/admin/audit` (inchangé)

Accepte `action=COVERAGE_STATS_EXPORTED` (valeur d'énumération ajoutée) ; les `details`
d'une entrée d'export sont `from`, `to`, `groupBy` et `period`.
