-- Retour arrière de 0028_remove_meal_service (non exécuté par Prisma).
--
-- Ce script recrée la structure (type, colonne, table d'historique et ses verrous d'ajout seul), mais
-- PAS les données : le service de restauration de chaque élève et l'historique de ses changements ont
-- été supprimés par la migration. Les élèves reçoivent « CANTINE » faute de valeur d'origine. Pour
-- retrouver les vraies valeurs, le seul retour arrière fiable est la restauration de la sauvegarde prise
-- avant la migration.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0028_remove_meal_service/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

CREATE TYPE "MealService" AS ENUM ('CANTINE', 'PANIER');

ALTER TABLE "Student" ADD COLUMN "mealService" "MealService" NOT NULL DEFAULT 'CANTINE';
ALTER TABLE "Student" ALTER COLUMN "mealService" DROP DEFAULT;

CREATE TABLE "StudentMealChange" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "fromService" "MealService" NOT NULL,
    "toService" "MealService" NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentMealChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentMealChange_studentId_createdAt_idx" ON "StudentMealChange"("studentId", "createdAt");

ALTER TABLE "StudentMealChange" ADD CONSTRAINT "StudentMealChange_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentMealChange" ADD CONSTRAINT "StudentMealChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "StudentMealChange_append_only"
  BEFORE UPDATE OR DELETE ON "StudentMealChange"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER "StudentMealChange_no_truncate"
  BEFORE TRUNCATE ON "StudentMealChange"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0028_remove_meal_service';

COMMIT;
