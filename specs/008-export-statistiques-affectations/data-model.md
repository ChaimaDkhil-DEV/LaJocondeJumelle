# Data Model: Export des statistiques des affectations

Aucune table nouvelle. Un fichier produit à la demande (non stocké) et une valeur d'énumération
d'audit.

## AuditAction (énumération existante)

| Valeur ajoutée | Libellé (journal d'audit) | Écrite quand |
|----------------|---------------------------|--------------|
| `COVERAGE_STATS_EXPORTED` | Export des statistiques des affectations | après la production d'un export réussi |

Migration `0010_audit_coverage_stats_export` : `ALTER TYPE "AuditAction" ADD VALUE
'COVERAGE_STATS_EXPORTED';` ; `down.sql` sur le modèle de `0008` (arrêt si la valeur est
utilisée, sinon recréation de l'énumération).

## AuditLog — entrée d'export (table existante)

| Champ | Valeur |
|-------|--------|
| `actorId` | utilisateur de la session (admin ou super administrateur) |
| `action` | `COVERAGE_STATS_EXPORTED` |
| `targetType` / `targetId` | `Request` / `coverage-stats` (comme le refus existant) |
| `details` | `{ from: 'AAAA-MM-JJ', to: 'AAAA-MM-JJ', groupBy: 'teacher' \| 'class' \| 'period', period?: 'week' \| 'month' }` |
| `ip` | adresse du client |

Règles : `period` seulement si `groupBy = period` ; aucune valeur statistique, aucun nom
d'enseignant ni de classe. Clés `from`, `to`, `groupBy`, `period` ajoutées à
`ALLOWED_DETAIL_KEYS`. Ajout seul, jamais modifiée (constitution, principe V).

## Fichier d'export (non stocké)

Entrée : résultat de `CoverageStatsService.stats` (spec 004, data-model §7) :
`{ from, to, groupBy, period, timezone, totals, rows[] }`.

Disposition (research R3) :

| Bloc | Contenu |
|------|---------|
| En-tête | libellé du regroupement ; Événements ; Retards ; Absences ; Classes vides ; Non pourvues ; Annulées ; Durée moyenne |
| Lignes | une par élément de `rows`, dans l'ordre reçu |
| Total | « Total de la période » puis les mêmes colonnes, depuis `totals` |
| Contexte | ligne vide ; Du ; Au ; Fuseau ; Regroupement ; Période (si « Période ») ; Taux de non pourvue ; Doublons non tranchés (comptés une fois) |

Mise en forme (research R2) : entiers tels quels ; durée moyenne au format de la page, vide si
`null` ; taux `Math.round(rate × 100) %`.

Validation : celle de `CoverageStatsQuery` (dates `AAAA-MM-JJ`, `groupBy`, `period`) et de
`stats` (`from ≤ to`, 400 jours au plus → `INVALID_RANGE`).
