-- Retour arrière de 0022_admin_validates_parent_communications (non exécuté par Prisma).
--
-- Retire au rôle ADMIN la permission de valider les communications aux parents : seul le super
-- administrateur valide de nouveau. Attention : la retire aussi si elle avait été accordée à la main
-- dans les réglages avant cette migration. À exécuter avant le down.sql de
-- 0021_parent_communications_integrity.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0022_admin_validates_parent_communications/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DELETE FROM "RolePermission" WHERE "role" = 'ADMIN' AND "permission" = 'PARENT_COMMUNICATION_VALIDATE';

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0022_admin_validates_parent_communications';

COMMIT;
