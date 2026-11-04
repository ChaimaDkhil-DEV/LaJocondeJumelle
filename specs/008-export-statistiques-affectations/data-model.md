# Data Model: Export des statistiques des affectations (Assignment statistics export)

No new table. One file produced on demand (not stored) and one audit enumeration value.

## AuditAction (existing enumeration)

| Added value | Label (audit log) | Written when |
|-------------|-------------------|--------------|
| `COVERAGE_STATS_EXPORTED` | Export des statistiques des affectations (Assignment statistics export) | after a successful export is produced |

Migration `0010_audit_coverage_stats_export`: `ALTER TYPE "AuditAction" ADD VALUE
'COVERAGE_STATS_EXPORTED';`; `down.sql` modeled on `0008` (stops if the value is in use,
otherwise recreates the enumeration).

## AuditLog — export entry (existing table)

| Field | Value |
|-------|-------|
| `actorId` | session user (admin or super administrator) |
| `action` | `COVERAGE_STATS_EXPORTED` |
| `targetType` / `targetId` | `Request` / `coverage-stats` (like the existing denial) |
| `details` | `{ from: 'AAAA-MM-JJ', to: 'AAAA-MM-JJ', groupBy: 'teacher' \| 'class' \| 'period', period?: 'week' \| 'month' }` |
| `ip` | client address |

Rules: `period` only if `groupBy = period`; no statistical value, no teacher or class name.
Keys `from`, `to`, `groupBy`, `period` added to `ALLOWED_DETAIL_KEYS`. Append-only, never
modified (constitution, principle V).

## Export file (not stored)

Input: result of `CoverageStatsService.stats` (spec 004, data-model §7):
`{ from, to, groupBy, period, timezone, totals, rows[] }`.

Layout (research R3):

| Block | Content |
|-------|---------|
| Header | grouping label; Événements; Retards; Absences; Classes vides; Non pourvues; Annulées; Durée moyenne (Events; Delays; Absences; Empty classes; Unfilled; Cancelled; Average duration) |
| Rows | one per element of `rows`, in the order received |
| Total | « Total de la période » (Total for the period), then the same columns, from `totals` |
| Context | empty line; Du; Au; Fuseau; Regroupement; Période (if « Période »); Taux de non pourvue; Doublons non tranchés (counted once) (From; To; Time zone; Grouping; Period; Unfilled rate; Undecided duplicates) |

Formatting (research R2): integers as is; average duration in the page's format, empty if
`null`; rates `Math.round(rate × 100) %`.

Validation: that of `CoverageStatsQuery` (dates `AAAA-MM-JJ`, `groupBy`, `period`) and of
`stats` (`from ≤ to`, 400 days at most → `INVALID_RANGE`).
