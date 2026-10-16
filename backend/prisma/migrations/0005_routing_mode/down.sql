-- Retour arrière de 0005_routing_mode (non exécuté par Prisma).
--
-- Supprime le mode de routage. Le circuit de chaque catégorie, toujours tenu à jour, reste en place :
-- VIA_ADMIN redevient circuit B et DIRECT circuit A, sans perte. Une catégorie PEER redevient une
-- catégorie directe (circuit A) : ses demandes restent intactes, l'administration y retrouve les droits
-- d'avant la migration.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0005_routing_mode/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

ALTER TABLE "Category" DROP COLUMN "routingMode";
DROP TYPE "RoutingMode";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0005_routing_mode';

COMMIT;
