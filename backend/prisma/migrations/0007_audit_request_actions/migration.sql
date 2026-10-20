-- Journal d'audit : création d'une garde (COVERAGE_CREATED) et actions administratives sur les
-- demandes de travail (REQUEST_MANAGED : approbation, refus, réaffectation, annulation, validation
-- finale, renvoi à corriger, changement de priorité).
-- Ajout de valeurs d'énumération seul : aucune donnée modifiée. Pas de down.sql : PostgreSQL ne
-- retire pas une valeur d'énumération ; les valeurs restent inutilisées après un retour arrière du code.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'COVERAGE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'REQUEST_MANAGED';
