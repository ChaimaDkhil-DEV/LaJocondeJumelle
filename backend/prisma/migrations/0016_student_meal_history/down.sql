-- Retour arrière de 0016_student_meal_history (non exécuté par Prisma).
--
-- Ce script ne supprime AUCUN historique : il s'arrête si un changement de service a déjà été
-- enregistré. Cet historique ne se reconstitue pas : dans ce cas, le seul retour arrière fiable est la
-- restauration de la sauvegarde prise avant la migration. Le service actuel de chaque élève reste
-- dans "Student" et n'est pas touché.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0016_student_meal_history/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "StudentMealChange") THEN
    RAISE EXCEPTION 'Des changements de service de restauration sont enregistrés : restaurez la sauvegarde prise avant la migration 0016_student_meal_history.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS "StudentMealChange_append_only" ON "StudentMealChange";
DROP TRIGGER IF EXISTS "StudentMealChange_no_truncate" ON "StudentMealChange";
DROP TABLE IF EXISTS "StudentMealChange";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0016_student_meal_history';

COMMIT;
