-- Retour arrière de 0013_school_students (non exécuté par Prisma).
--
-- Supprime les élèves, les niveaux et le rattachement des classes à un niveau (les classes
-- restent). La valeur d'audit STUDENT_CHANGED reste dans l'énumération : PostgreSQL ne retire pas
-- une valeur d'énumération ; elle reste inutilisée après le retour arrière du code.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0013_school_students/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DROP TABLE IF EXISTS "Student";
ALTER TABLE "SchoolClass" DROP CONSTRAINT IF EXISTS "SchoolClass_levelId_fkey";
DROP INDEX IF EXISTS "SchoolClass_levelId_idx";
ALTER TABLE "SchoolClass" DROP COLUMN IF EXISTS "levelId";
DROP TABLE IF EXISTS "GradeLevel";
DROP TYPE IF EXISTS "MealService";
DROP TYPE IF EXISTS "SchoolCycle";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0013_school_students';

COMMIT;
