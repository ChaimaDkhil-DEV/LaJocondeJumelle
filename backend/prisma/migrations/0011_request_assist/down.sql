-- Retour arrière de 0011_request_assist (non exécuté par Prisma).
--
-- Ce script ne supprime AUCUNE entrée de l'historique ni du journal d'audit : il s'arrête si
-- ASSIST_SUGGESTED ou GUIDELINE_CHANGED a déjà servi. Dans ce cas, le seul retour arrière fiable
-- est la restauration de la sauvegarde prise avant la migration (historique et journal d'audit en
-- ajout seul). Les consignes (table "Guideline") sont supprimées : elles se ressaisissent.
-- PostgreSQL ne retirant pas une valeur d'énumération, les deux énumérations sont recréées sans
-- elles.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0011_request_assist/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "RequestEvent" WHERE "type"::text = 'ASSIST_SUGGESTED') THEN
    RAISE EXCEPTION 'Des propositions automatiques figurent dans l''historique des demandes (ASSIST_SUGGESTED) : l''historique ne se réécrit pas. Restaurez la sauvegarde prise avant la migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM "AuditLog" WHERE "action"::text = 'GUIDELINE_CHANGED') THEN
    RAISE EXCEPTION 'Des modifications de consignes sont journalisées (GUIDELINE_CHANGED) : le journal d''audit ne se réécrit pas. Restaurez la sauvegarde prise avant la migration.';
  END IF;
END $$;

DROP TABLE "Guideline";

ALTER TYPE "RequestEventType" RENAME TO "RequestEventType_old";
CREATE TYPE "RequestEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'REASSIGNED',
  'MESSAGE_ADDED', 'FILE_ADDED', 'OVERDUE', 'GROUP_ADDED', 'RELEASED', 'RELIEF_REQUESTED', 'PRESENCE_CONFIRMED',
  'EXTENDED', 'UPDATED', 'TEACHER_SET', 'SUPPORT_JOINED', 'SUPPORT_RELEASED', 'MERGE_PROPOSED', 'MERGE_DECIDED',
  'REMINDER_SENT', 'ESCALATED', 'ANONYMIZED');
ALTER TABLE "RequestEvent" ALTER COLUMN "type" TYPE "RequestEventType" USING "type"::text::"RequestEventType";
DROP TYPE "RequestEventType_old";

ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'ACCESS_DENIED', 'USER_CREATED',
  'USER_UPDATED', 'USER_DEACTIVATED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'ROLE_PERMISSIONS_CHANGED',
  'CATEGORY_CHANGED', 'DEADLINE_RULE_CHANGED', 'SETTING_CHANGED', 'GROUP_CHANGED', 'CLASS_CHANGED', 'QR_REVOKED',
  'AVAILABILITY_CHANGED', 'COVERAGE_MANAGED', 'COVERAGE_CREATED', 'REQUEST_MANAGED', 'FLOOR_CHANGED',
  'COVERAGE_ANONYMIZED', 'COVERAGE_MERGE_DECIDED', 'COVERAGE_STATS_EXPORTED');
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::text::"AuditAction";
DROP TYPE "AuditAction_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0011_request_assist';

COMMIT;
