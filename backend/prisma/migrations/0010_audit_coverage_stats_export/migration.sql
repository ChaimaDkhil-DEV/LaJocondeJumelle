-- Journal d'audit : export des statistiques des affectations (COVERAGE_STATS_EXPORTED, spec 008,
-- FR-009) ; détails limités à la période et au regroupement.
-- Ajout de valeur d'énumération seul : aucune donnée modifiée. Retour arrière : down.sql (refusé si
-- la valeur a déjà servi, le journal d'audit ne se réécrit pas).

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'COVERAGE_STATS_EXPORTED';
