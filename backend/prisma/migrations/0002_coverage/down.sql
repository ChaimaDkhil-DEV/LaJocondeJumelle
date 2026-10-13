-- Retour arrière de 0002_coverage (non exécuté par Prisma : voir docs/coverage-migration.md).
--
-- Ce script ne supprime AUCUNE donnée métier : il s'arrête si le module de couverture a déjà servi
-- (demandes de couverture, historique, notifications ou journal d'audit utilisant les nouvelles valeurs).
-- Dans ce cas, le seul retour arrière fiable est la restauration de la sauvegarde prise avant la migration
-- (l'historique et le journal d'audit sont en ajout seul et ne doivent pas être réécrits).
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0002_coverage/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Request" WHERE "kind" = 'COVERAGE'
                OR "status"::text IN ('BROADCAST', 'UNFILLED', 'EN_ROUTE', 'LATE', 'ON_DUTY', 'RELIEF_PENDING')
                OR "currentStage"::text = 'ARRIVAL' OR "overdueStage"::text = 'ARRIVAL')
     OR EXISTS (SELECT 1 FROM "RequestEvent"
                WHERE "type"::text IN ('GROUP_ADDED', 'RELEASED', 'RELIEF_REQUESTED', 'PRESENCE_CONFIRMED', 'EXTENDED'))
     OR EXISTS (SELECT 1 FROM "AuditLog"
                WHERE "action"::text IN ('GROUP_CHANGED', 'CLASS_CHANGED', 'QR_REVOKED', 'AVAILABILITY_CHANGED', 'COVERAGE_MANAGED'))
     OR EXISTS (SELECT 1 FROM "Notification" WHERE "type"::text LIKE 'COVERAGE\_%')
  THEN
    RAISE EXCEPTION 'Le module de couverture contient des données : restaurez la sauvegarde prise avant la migration 0002_coverage.';
  END IF;
END $$;

-- Données par défaut créées par la migration (catégorie de couverture et son paramétrage).
DELETE FROM "DeadlineRule" WHERE "categoryId" IN (SELECT "id" FROM "Category" WHERE "kind" = 'COVERAGE');
DELETE FROM "CategoryManager" WHERE "categoryId" IN (SELECT "id" FROM "Category" WHERE "kind" = 'COVERAGE');
DELETE FROM "CategoryRecipient" WHERE "categoryId" IN (SELECT "id" FROM "Category" WHERE "kind" = 'COVERAGE');
DELETE FROM "Category" WHERE "kind" = 'COVERAGE';

-- Tables du module.
DROP TABLE "CoveragePresence";
DROP TABLE "CoverageTarget";
DROP TABLE "CoverageDetail";
DROP TABLE "EmployeeGroupMember";
DROP TABLE "EmployeeGroup";
DROP TABLE "SchoolClass";

-- Colonnes ajoutées.
DROP INDEX "Request_kind_status_idx";
ALTER TABLE "Request" DROP COLUMN "kind";
ALTER TABLE "DeadlineRule" DROP COLUMN "arrivalMinutes";
ALTER TABLE "Category" DROP COLUMN "kind", DROP COLUMN "proofMode";
ALTER TABLE "User" DROP COLUMN "availability";

DROP TYPE "RequestKind";
DROP TYPE "ProofMode";
DROP TYPE "PresenceMethod";
DROP TYPE "Availability";

-- Valeurs ajoutées aux énumérations existantes : PostgreSQL ne sait pas retirer une valeur,
-- on recrée donc chaque type avec ses valeurs d'origine (aucune ligne n'utilise les nouvelles, vérifié plus haut).
ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PENDING_ADMIN_VALIDATION', 'SENT', 'ACCEPTED', 'IN_PROGRESS', 'DONE',
  'PENDING_FINAL_VALIDATION', 'TO_CORRECT', 'CLOSED', 'REJECTED', 'CANCELLED');
ALTER TABLE "Request" ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::text::"RequestStatus";
DROP TYPE "RequestStatus_old";

ALTER TYPE "DeadlineStage" RENAME TO "DeadlineStage_old";
CREATE TYPE "DeadlineStage" AS ENUM ('VALIDATION', 'TAKEOVER', 'COMPLETION');
ALTER TABLE "Request"
  ALTER COLUMN "currentStage" TYPE "DeadlineStage" USING "currentStage"::text::"DeadlineStage",
  ALTER COLUMN "overdueStage" TYPE "DeadlineStage" USING "overdueStage"::text::"DeadlineStage";
DROP TYPE "DeadlineStage_old";

ALTER TYPE "RequestEventType" RENAME TO "RequestEventType_old";
CREATE TYPE "RequestEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'REASSIGNED',
  'MESSAGE_ADDED', 'FILE_ADDED', 'OVERDUE');
ALTER TABLE "RequestEvent" ALTER COLUMN "type" TYPE "RequestEventType" USING "type"::text::"RequestEventType";
DROP TYPE "RequestEventType_old";

ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'ACCESS_DENIED', 'USER_CREATED',
  'USER_UPDATED', 'USER_DEACTIVATED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'ROLE_PERMISSIONS_CHANGED',
  'CATEGORY_CHANGED', 'DEADLINE_RULE_CHANGED', 'SETTING_CHANGED');
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::text::"AuditAction";
DROP TYPE "AuditAction_old";

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM ('REQUEST_NEW', 'MESSAGE_NEW', 'ASSIGNED', 'STATUS_CHANGED', 'URGENT',
  'TO_CORRECT', 'REJECTED', 'CANCELLED', 'OVERDUE', 'CLOSED');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";
DROP TYPE "NotificationType_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0002_coverage';

COMMIT;
