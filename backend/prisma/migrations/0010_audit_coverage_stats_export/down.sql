-- Retour arrière de 0010_audit_coverage_stats_export (non exécuté par Prisma).
--
-- Ce script ne supprime AUCUNE entrée du journal d'audit : il s'arrête si la valeur
-- COVERAGE_STATS_EXPORTED a déjà servi. Dans ce cas, le seul retour arrière fiable est la
-- restauration de la sauvegarde prise avant la migration (le journal d'audit est en ajout seul et
-- ne doit pas être réécrit). Sinon, PostgreSQL ne retirant pas une valeur d'énumération,
-- l'énumération est recréée sans elle.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0010_audit_coverage_stats_export/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AuditLog" WHERE "action"::text = 'COVERAGE_STATS_EXPORTED') THEN
    RAISE EXCEPTION 'Des exports des statistiques sont déjà journalisés (COVERAGE_STATS_EXPORTED) : le journal d''audit ne se réécrit pas. Restaurez la sauvegarde prise avant la migration.';
  END IF;
END $$;

ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'ACCESS_DENIED', 'USER_CREATED',
  'USER_UPDATED', 'USER_DEACTIVATED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'ROLE_PERMISSIONS_CHANGED',
  'CATEGORY_CHANGED', 'DEADLINE_RULE_CHANGED', 'SETTING_CHANGED', 'GROUP_CHANGED', 'CLASS_CHANGED', 'QR_REVOKED',
  'AVAILABILITY_CHANGED', 'COVERAGE_MANAGED', 'COVERAGE_CREATED', 'REQUEST_MANAGED', 'FLOOR_CHANGED',
  'COVERAGE_ANONYMIZED', 'COVERAGE_MERGE_DECIDED');
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::text::"AuditAction";
DROP TYPE "AuditAction_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0010_audit_coverage_stats_export';

COMMIT;
