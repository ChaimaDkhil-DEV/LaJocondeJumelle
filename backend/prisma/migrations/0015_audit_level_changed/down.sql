-- Retour arrière de 0015_audit_level_changed (non exécuté par Prisma).
--
-- Ce script ne supprime AUCUNE entrée du journal d'audit : il s'arrête si la valeur LEVEL_CHANGED a
-- déjà servi. Dans ce cas, le seul retour arrière fiable est la restauration de la sauvegarde prise
-- avant la migration (le journal d'audit est en ajout seul et ne doit pas être réécrit). Sinon,
-- PostgreSQL ne retirant pas une valeur d'énumération, l'énumération est recréée sans elle ; la
-- migration pourra alors être réappliquée sur cette base.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0015_audit_level_changed/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. **Redémarrez l'API** : ses connexions ouvertes
-- gardent en mémoire l'ancien type d'énumération, supprimé puis recréé ici. La ligne de suivi Prisma est
-- retirée en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AuditLog" WHERE "action"::text = 'LEVEL_CHANGED') THEN
    RAISE EXCEPTION 'Des modifications de niveaux sont déjà journalisées (LEVEL_CHANGED) : le journal d''audit ne se réécrit pas. Restaurez la sauvegarde prise avant la migration.';
  END IF;
END $$;

ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'ACCESS_DENIED', 'USER_CREATED',
  'USER_UPDATED', 'USER_DEACTIVATED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'ROLE_PERMISSIONS_CHANGED',
  'CATEGORY_CHANGED', 'DEADLINE_RULE_CHANGED', 'SETTING_CHANGED', 'GROUP_CHANGED', 'CLASS_CHANGED', 'QR_REVOKED',
  'AVAILABILITY_CHANGED', 'COVERAGE_MANAGED', 'COVERAGE_CREATED', 'REQUEST_MANAGED', 'FLOOR_CHANGED',
  'COVERAGE_ANONYMIZED', 'COVERAGE_MERGE_DECIDED', 'COVERAGE_STATS_EXPORTED', 'GUIDELINE_CHANGED',
  'STUDENT_CHANGED', 'ATTENDANCE_MANUAL', 'ATTENDANCE_CORRECTED');
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::text::"AuditAction";
DROP TYPE "AuditAction_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0015_audit_level_changed';

COMMIT;
