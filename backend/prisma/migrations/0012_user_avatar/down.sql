-- Retour arrière de 0012_user_avatar (non exécuté par Prisma).
--
-- Les comptes reviennent à l'avatar par défaut : les colonnes de photo sont supprimées. Les
-- fichiers d'images restent dans FILES_DIR/avatars : les supprimer à la main si besoin (ils ne
-- sont plus servis).
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0012_user_avatar/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarUrl";
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarType";
DROP TYPE IF EXISTS "AvatarType";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0012_user_avatar';

COMMIT;
