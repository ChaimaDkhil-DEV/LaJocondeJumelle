-- Retour arrière de 0009_supervision_data (non exécuté par Prisma, voir
-- specs/004-retards-affectation-surveillants/contracts/migration.md). À lancer avant 0008/down.sql,
-- après avoir redéployé la version précédente de l'application.
--
-- Aucun événement n'est supprimé ni modifié : chaque statut rétabli AJOUTE un événement inverse
-- (commentaire « migration-0009-down »). Le script s'arrête si des affectations ont été créées
-- après la migration : restaurez alors la sauvegarde prise avant la migration.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0009_supervision_data/down.sql --schema prisma/schema.prisma

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "CoverageDetail"
             WHERE "source" IN ('TEACHER_REQUEST', 'SUPERVISOR_REPORT') OR "type" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "Request" r
                WHERE r."status" = 'PENDING'
                  AND NOT EXISTS (SELECT 1 FROM "RequestEvent" e
                                  WHERE e."requestId" = r."id" AND e."comment" = 'migration-0009'))
  THEN
    RAISE EXCEPTION 'Des affectations créées après la migration existent : restaurez la sauvegarde prise avant la migration 0009_supervision_data.';
  END IF;
END $$;

-- Gardes encore « en attente » : statut et délais d'origine, lus dans l'événement de migration.
CREATE TEMP TABLE "migration_0009_down" ON COMMIT DROP AS
SELECT e."requestId", e."fromValue"
FROM "RequestEvent" e
JOIN "Request" r ON r."id" = e."requestId"
WHERE e."comment" = 'migration-0009' AND e."type" = 'STATUS_CHANGED' AND r."status" = 'PENDING';

INSERT INTO "RequestEvent" ("id", "requestId", "actorId", "type", "fromValue", "toValue", "comment")
SELECT gen_random_uuid(), m."requestId", NULL, 'STATUS_CHANGED',
       jsonb_build_object('status', 'PENDING'), jsonb_build_object('status', m."fromValue"->>'status'),
       'migration-0009-down'
FROM "migration_0009_down" m;

UPDATE "Request" r
SET "status" = (m."fromValue"->>'status')::"RequestStatus",
    "currentStage" = (m."fromValue"->>'currentStage')::"DeadlineStage",
    "currentDueAt" = (m."fromValue"->>'currentDueAt')::timestamptz,
    "warnAt" = (m."fromValue"->>'warnAt')::timestamptz,
    "overdueStage" = (m."fromValue"->>'overdueStage')::"DeadlineStage",
    "version" = r."version" + 1,
    "updatedAt" = now()
FROM "migration_0009_down" m
WHERE r."id" = m."requestId";

DELETE FROM "CoverageReminder";
UPDATE "CoverageDetail" SET "source" = NULL WHERE "source" = 'ADMIN_DIRECT';

ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'MANAGER';

UPDATE "EmployeeGroup"
SET "name" = 'Surveillants/Remplaçants', "systemKey" = NULL, "updatedAt" = now()
WHERE "systemKey" = 'SUPERVISORS';
DELETE FROM "EmployeeGroup" g
WHERE g."systemKey" = 'TEACHERS'
  AND NOT EXISTS (SELECT 1 FROM "EmployeeGroupMember" m WHERE m."groupId" = g."id")
  AND NOT EXISTS (SELECT 1 FROM "CoverageTarget" t WHERE t."groupId" = g."id");
UPDATE "EmployeeGroup" SET "systemKey" = NULL, "updatedAt" = now() WHERE "systemKey" = 'TEACHERS';

UPDATE "User"
SET "username" = 'responsable', "updatedAt" = now()
WHERE "username" = 'admin' AND "displayName" = 'Responsable administratif'
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "username" = 'responsable');

DELETE FROM "User" u
WHERE u."username" = 'enseignant-anonymise'
  AND NOT EXISTS (SELECT 1 FROM "Request" r WHERE r."requesterId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "RequestEvent" e WHERE e."actorId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."actorId" = u."id");

DELETE FROM "Setting"
WHERE "key" IN ('coverageUrgencyThresholdMinutes', 'coverageEscalationMinutes', 'coverageMorningReminderTime',
                'coverageCloseReminderMinutes', 'coverageCloseEscalationMinutes', 'coverageSupportReminderMinutes',
                'coverageSupportReminderMax', 'coverageRetentionMonths');

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0009_supervision_data';

COMMIT;
