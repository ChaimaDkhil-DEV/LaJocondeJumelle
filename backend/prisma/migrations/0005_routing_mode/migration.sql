-- Mode de routage des catégories de demandes de travail (VIA_ADMIN, DIRECT, PEER).
-- Valeur reprise du circuit existant : circuit B -> VIA_ADMIN, circuit A -> DIRECT. Aucune catégorie ne
-- devient PEER automatiquement (choix du super administrateur). Les demandes existantes ne sont pas
-- modifiées : leur instantané de règles (circuit) reste la référence de leur traitement.
-- Retour arrière : down.sql.

-- CreateEnum
CREATE TYPE "RoutingMode" AS ENUM ('VIA_ADMIN', 'DIRECT', 'PEER');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "routingMode" "RoutingMode" NOT NULL DEFAULT 'DIRECT';

-- Reprise des catégories existantes
UPDATE "Category" SET "routingMode" = 'VIA_ADMIN' WHERE "circuit" = 'B_ADMIN_VALIDATION';
