-- Journal d'audit : création et modification des niveaux scolaires (LEVEL_CHANGED).
-- Ajout de valeur d'énumération seul : aucune donnée modifiée. Retour arrière : down.sql (refusé si
-- la valeur a déjà servi, le journal d'audit ne se réécrit pas).

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'LEVEL_CHANGED';
