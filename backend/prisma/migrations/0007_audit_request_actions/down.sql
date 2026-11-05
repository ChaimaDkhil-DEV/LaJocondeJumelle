-- Retour arrière de 0007_audit_request_actions (non exécuté par Prisma).
--
-- Ce script ne supprime AUCUNE entrée du journal d'audit : il s'arrête si COVERAGE_CREATED ou
-- REQUEST_MANAGED ont déjà servi. Dans ce cas, le seul retour arrière fiable est la restauration de
-- la sauvegarde prise avant la migration (le journal d'audit est en ajout seul et ne doit pas être
-- réécrit). Sinon, PostgreSQL ne retirant pas une valeur d'énumération, l'énumération est recréée sans elles.
--
-- Ordre : cette migration ajoute des valeurs à « AuditAction » avant 0008, 0009 et 0010, qui en ajoutent
-- d'autres. Exécuter d'abord leurs down.sql (0010, puis 0009, puis 0008) : ce script recrée
-- l'énumération avec les seules valeurs antérieures à 0007 et échouerait sinon (ou perdrait ces valeurs).
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0007_audit_request_actions/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AuditLog" WHERE "action"::text IN ('COVERAGE_CREATED', 'REQUEST_MANAGED')) THEN
    RAISE EXCEPTION 'Le journal d''audit contient COVERAGE_CREATED ou REQUEST_MANAGED : il ne se réécrit pas. Restaurez la sauvegarde prise avant la migration.';
  END IF;
END $$;

ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'ACCESS_DENIED', 'USER_CREATED',
  'USER_UPDATED', 'USER_DEACTIVATED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'ROLE_PERMISSIONS_CHANGED',
  'CATEGORY_CHANGED', 'DEADLINE_RULE_CHANGED', 'SETTING_CHANGED', 'GROUP_CHANGED', 'CLASS_CHANGED', 'QR_REVOKED',
  'AVAILABILITY_CHANGED', 'COVERAGE_MANAGED');
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::text::"AuditAction";
DROP TYPE "AuditAction_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0007_audit_request_actions';

COMMIT;
