-- Retrait du service de restauration (cantine ou panier) des élèves.
-- Supprime la table d'historique "StudentMealChange" (ses verrous d'ajout seul partent avec elle), la
-- colonne "Student"."mealService" et le type "MealService". Les données de restauration sont perdues :
-- prendre une sauvegarde avant de déployer. Retour arrière de la structure : down.sql.

-- DropTable
DROP TABLE "StudentMealChange";

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "mealService";

-- DropEnum
DROP TYPE "MealService";
