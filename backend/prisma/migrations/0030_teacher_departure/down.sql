-- Retour arrière de 0030_teacher_departure (non exécuté par Prisma).
--
-- Rien à annuler avant : 0030 est la dernière migration. Ce script retire la table "TeacherDeparture",
-- seule chose créée par la migration (aucune colonne, aucun type, aucune valeur d'énumération ajoutés
-- ailleurs). Il ne supprime AUCUNE donnée : il s'arrête si des départs ont été enregistrés. Ce sont des
-- données de suivi du personnel qui ne se reconstituent pas ; dans ce cas, le seul retour arrière fiable
-- est la restauration de la sauvegarde prise avant la migration. Les pointages d'arrivée
-- ("TeacherAttendance") ne sont pas touchés. La fonction forbid_deletion() appartient à 0014 et reste.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0030_teacher_departure/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TeacherDeparture") THEN
    RAISE EXCEPTION 'Des départs d''enseignants sont enregistrés : restaurez la sauvegarde prise avant la migration 0030_teacher_departure.';
  END IF;
END $$;

-- Table vide : on retire d'abord les déclencheurs qui interdisent sa suppression.
DROP TRIGGER IF EXISTS "TeacherDeparture_no_delete" ON "TeacherDeparture";
DROP TRIGGER IF EXISTS "TeacherDeparture_no_truncate" ON "TeacherDeparture";
DROP TABLE IF EXISTS "TeacherDeparture";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0030_teacher_departure';

COMMIT;
