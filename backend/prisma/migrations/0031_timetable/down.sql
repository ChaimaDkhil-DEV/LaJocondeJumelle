-- Retour arrière de 0031_timetable (non exécuté par Prisma).
--
-- Rien à annuler avant : 0031 est la dernière migration. Ce script retire ce que la migration a créé : les tables
-- "TeachingSession" et "TimetableSeries", l'énumération "TeachingSessionStatus" et la valeur d'audit
-- TIMETABLE_CHANGED. Il ne supprime AUCUNE donnée : il s'arrête si des emplois du temps ont été saisis ou si la
-- valeur d'audit a déjà servi (le journal d'audit est en ajout seul et ne se réécrit pas). Dans ce cas, le seul
-- retour arrière fiable est la restauration de la sauvegarde prise avant la migration. L'extension btree_gist
-- reste installée (sans effet, et peut servir ailleurs). Les pointages ("TeacherAttendance", "TeacherDeparture")
-- ne sont pas touchés.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0031_timetable/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. **Redémarrez l'API** : ses connexions ouvertes gardent
-- en mémoire l'ancien type d'énumération "AuditAction", supprimé puis recréé ici. La ligne de suivi Prisma est
-- retirée en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TeachingSession") OR EXISTS (SELECT 1 FROM "TimetableSeries") THEN
    RAISE EXCEPTION 'Des emplois du temps sont enregistrés : restaurez la sauvegarde prise avant la migration 0031_timetable.';
  END IF;
  IF EXISTS (SELECT 1 FROM "AuditLog" WHERE "action"::text = 'TIMETABLE_CHANGED') THEN
    RAISE EXCEPTION 'Des modifications d''emplois du temps sont journalisées (TIMETABLE_CHANGED) : le journal d''audit ne se réécrit pas. Restaurez la sauvegarde prise avant la migration.';
  END IF;
END $$;

-- Tables vides : on retire d'abord les déclencheurs qui interdisent leur suppression.
DROP TRIGGER IF EXISTS "TeachingSession_no_delete" ON "TeachingSession";
DROP TRIGGER IF EXISTS "TeachingSession_no_truncate" ON "TeachingSession";
DROP TRIGGER IF EXISTS "TimetableSeries_no_delete" ON "TimetableSeries";
DROP TRIGGER IF EXISTS "TimetableSeries_no_truncate" ON "TimetableSeries";
DROP TABLE IF EXISTS "TeachingSession";
DROP TABLE IF EXISTS "TimetableSeries";
DROP TYPE IF EXISTS "TeachingSessionStatus";

-- PostgreSQL ne retire pas une valeur d'énumération : "AuditAction" est recréée avec toutes ses valeurs actuelles,
-- dans le même ordre, sauf TIMETABLE_CHANGED.
DO $$
DECLARE
  labels text;
BEGIN
  SELECT string_agg(quote_literal(e."enumlabel"), ', ' ORDER BY e."enumsortorder") INTO labels
  FROM pg_enum e JOIN pg_type t ON t."oid" = e."enumtypid"
  WHERE t."typname" = 'AuditAction' AND e."enumlabel" <> 'TIMETABLE_CHANGED';
  ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
  EXECUTE format('CREATE TYPE "AuditAction" AS ENUM (%s)', labels);
  ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::text::"AuditAction";
  DROP TYPE "AuditAction_old";
END $$;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0031_timetable';

COMMIT;
