-- Retour arrière de 0008_supervision_schema (non exécuté par Prisma, voir
-- specs/004-retards-affectation-surveillants/contracts/migration.md). À lancer après 0009/down.sql.
--
-- Ce script ne supprime AUCUNE donnée métier : il s'arrête si le module des affectations a déjà
-- servi (tables nouvelles non vides, colonnes nouvelles renseignées, nouvelles valeurs utilisées).
-- Dans ce cas, le seul retour arrière fiable est la restauration de la sauvegarde prise avant la
-- migration (l'historique et le journal d'audit sont en ajout seul et ne doivent pas être réécrits).
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0008_supervision_schema/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'Role' AND e.enumlabel = 'ADMIN') THEN
    RAISE EXCEPTION 'La migration 0009_supervision_data est encore appliquée : exécutez d''abord 0009_supervision_data/down.sql.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Floor") OR EXISTS (SELECT 1 FROM "CoverageSupport")
     OR EXISTS (SELECT 1 FROM "CoverageMergeProposal") OR EXISTS (SELECT 1 FROM "CoverageReminder")
     OR EXISTS (SELECT 1 FROM "CoverageDetail"
                WHERE "source" IS NOT NULL OR "type" IS NOT NULL OR "teacherId" IS NOT NULL OR "reason" IS NOT NULL
                   OR "floorId" IS NOT NULL OR "mergedIntoId" IS NOT NULL OR "anonymizedAt" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "SchoolClass" WHERE "floorId" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "User" WHERE "floorId" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "EmployeeGroup" WHERE "systemKey" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "Request" WHERE "status"::text = 'PENDING')
     OR EXISTS (SELECT 1 FROM "RequestEvent"
                WHERE "type"::text IN ('UPDATED', 'TEACHER_SET', 'SUPPORT_JOINED', 'SUPPORT_RELEASED', 'MERGE_PROPOSED',
                                       'MERGE_DECIDED', 'REMINDER_SENT', 'ESCALATED', 'ANONYMIZED'))
     OR EXISTS (SELECT 1 FROM "AuditLog"
                WHERE "action"::text IN ('FLOOR_CHANGED', 'COVERAGE_ANONYMIZED', 'COVERAGE_MERGE_DECIDED'))
     OR EXISTS (SELECT 1 FROM "Notification"
                WHERE "type"::text IN ('COVERAGE_REQUESTED', 'COVERAGE_EMPTY_CLASS', 'COVERAGE_TAKEOVER_EXPIRED',
                                       'COVERAGE_ESCALATED', 'COVERAGE_MORNING_REMINDER', 'COVERAGE_CLOSE_REMINDER',
                                       'COVERAGE_DUPLICATE', 'COVERAGE_SUPPORT_REMINDER', 'COVERAGE_DOUBLE_ASSIGNMENT',
                                       'COVERAGE_LIFTED', 'COVERAGE_UPDATED'))
  THEN
    RAISE EXCEPTION 'Le module des affectations contient des données : restaurez la sauvegarde prise avant la migration 0008_supervision_schema.';
  END IF;
END $$;

-- Tables du module (les clés étrangères partent avec elles).
DROP TABLE "CoverageReminder";
DROP TABLE "CoverageMergeProposal";
DROP TABLE "CoverageSupport";

-- Colonnes ajoutées (leurs index et clés étrangères partent avec elles).
ALTER TABLE "CoverageDetail"
  DROP COLUMN "anonymizedAt",
  DROP COLUMN "floorId",
  DROP COLUMN "mergedIntoId",
  DROP COLUMN "reason",
  DROP COLUMN "source",
  DROP COLUMN "teacherId",
  DROP COLUMN "type";
ALTER TABLE "EmployeeGroup" DROP COLUMN "systemKey";
ALTER TABLE "SchoolClass" DROP COLUMN "floorId";
ALTER TABLE "User" DROP COLUMN "floorId";
DROP TABLE "Floor";

DROP TYPE "CoverageSource";
DROP TYPE "CoverageType";
DROP TYPE "GroupSystemKey";
DROP TYPE "CoverageReminderKind";
DROP TYPE "MergeProposalStatus";

-- Valeurs ajoutées aux énumérations existantes : PostgreSQL ne sait pas retirer une valeur, on
-- recrée donc chaque type avec ses valeurs de 0007 (aucune ligne n'utilise les nouvelles, vérifié plus haut).
ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PENDING_ADMIN_VALIDATION', 'SENT', 'ACCEPTED', 'IN_PROGRESS', 'DONE',
  'PENDING_FINAL_VALIDATION', 'TO_CORRECT', 'CLOSED', 'REJECTED', 'CANCELLED',
  'BROADCAST', 'UNFILLED', 'EN_ROUTE', 'LATE', 'ON_DUTY', 'RELIEF_PENDING');
ALTER TABLE "Request" ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::text::"RequestStatus";
DROP TYPE "RequestStatus_old";

ALTER TYPE "RequestEventType" RENAME TO "RequestEventType_old";
CREATE TYPE "RequestEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'REASSIGNED',
  'MESSAGE_ADDED', 'FILE_ADDED', 'OVERDUE', 'GROUP_ADDED', 'RELEASED', 'RELIEF_REQUESTED', 'PRESENCE_CONFIRMED', 'EXTENDED');
ALTER TABLE "RequestEvent" ALTER COLUMN "type" TYPE "RequestEventType" USING "type"::text::"RequestEventType";
DROP TYPE "RequestEventType_old";

ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'ACCESS_DENIED', 'USER_CREATED',
  'USER_UPDATED', 'USER_DEACTIVATED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'ROLE_PERMISSIONS_CHANGED',
  'CATEGORY_CHANGED', 'DEADLINE_RULE_CHANGED', 'SETTING_CHANGED', 'GROUP_CHANGED', 'CLASS_CHANGED', 'QR_REVOKED',
  'AVAILABILITY_CHANGED', 'COVERAGE_MANAGED', 'COVERAGE_CREATED', 'REQUEST_MANAGED');
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::text::"AuditAction";
DROP TYPE "AuditAction_old";

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM ('REQUEST_NEW', 'MESSAGE_NEW', 'ASSIGNED', 'STATUS_CHANGED', 'URGENT',
  'TO_CORRECT', 'REJECTED', 'CANCELLED', 'OVERDUE', 'CLOSED', 'COVERAGE_NEW', 'COVERAGE_TAKEN', 'COVERAGE_ACCEPTED',
  'COVERAGE_PRESENCE', 'COVERAGE_RELEASED', 'COVERAGE_RELIEF_REQUESTED', 'COVERAGE_LATE', 'COVERAGE_UNFILLED',
  'COVERAGE_EXTENDED', 'COVERAGE_RELIEVED', 'UNASSIGNED');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";
DROP TYPE "NotificationType_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0008_supervision_schema';

COMMIT;
