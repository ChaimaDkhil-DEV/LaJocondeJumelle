-- Retour arrière de 0021_parent_communications_integrity (non exécuté par Prisma).
--
-- Retire la contrainte de cible des notifications, les déclencheurs d'ajout seul et les contrôles des
-- numéros de version de la spec 015. À exécuter avant le down.sql de 0020_parent_communications.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0021_parent_communications_integrity/down.sql --schema prisma/schema.prisma

BEGIN;

ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_target_check";
DROP TRIGGER IF EXISTS "ParentCommunicationRevision_append_only" ON "ParentCommunicationRevision";
DROP TRIGGER IF EXISTS "ParentCommunicationRevision_no_truncate" ON "ParentCommunicationRevision";
DROP TRIGGER IF EXISTS "ParentCommunicationEvent_append_only" ON "ParentCommunicationEvent";
DROP TRIGGER IF EXISTS "ParentCommunicationEvent_no_truncate" ON "ParentCommunicationEvent";
ALTER TABLE "ParentCommunicationRevision" DROP CONSTRAINT IF EXISTS "ParentCommunicationRevision_number_check";
ALTER TABLE "ParentCommunication" DROP CONSTRAINT IF EXISTS "ParentCommunication_revision_check";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0021_parent_communications_integrity';

COMMIT;
