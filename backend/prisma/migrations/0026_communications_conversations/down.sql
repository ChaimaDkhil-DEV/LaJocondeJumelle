-- Retour arrière de 0026_communications_conversations (non exécuté par Prisma).
--
-- Rétablit exactement le schéma et les données 015 : les archives disparaissent, les messages 015 (tous
-- rattachés à une archive) sont inchangés. À exécuter avant le down.sql de 0025_communications_enums,
-- après une sauvegarde.
--
-- Refusé s'il existe une conversation INTERNAL ou PARENT : leurs messages (auteur administration,
-- participants portés par la conversation) n'ont pas de place dans le schéma 015. Dans ce cas, restaurer
-- la sauvegarde prise avant la migration 0026.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0026_communications_conversations/down.sql --schema prisma/schema.prisma

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Conversation" WHERE "type" <> 'LEGACY_TEACHER_PARENT') THEN
    RAISE EXCEPTION 'Retour arrière 0026 refusé : des conversations 017 (INTERNAL ou PARENT) existent. Restaurez la sauvegarde prise avant la migration 0026.';
  END IF;
END $$;

DELETE FROM "RolePermission" WHERE "permission" IN ('PARENT_COMM_SEND_DIRECT', 'PARENT_COMM_SUBMIT_FOR_APPROVAL');

DROP TRIGGER IF EXISTS "ParentCommunication_conversation_guard" ON "ParentCommunication";
DROP FUNCTION IF EXISTS parent_communication_conversation_guard();
DROP TRIGGER IF EXISTS "Conversation_guard" ON "Conversation";
DROP FUNCTION IF EXISTS conversation_guard();

ALTER TABLE "ParentCommunication" DROP CONSTRAINT IF EXISTS "ParentCommunication_sent_check";
ALTER TABLE "ParentCommunication" DROP CONSTRAINT IF EXISTS "ParentCommunication_authorId_fkey";
ALTER TABLE "ParentCommunication" DROP CONSTRAINT IF EXISTS "ParentCommunication_conversationId_fkey";
DROP INDEX IF EXISTS "ParentCommunication_conversationId_createdAt_idx";

ALTER TABLE "ParentCommunication" DROP COLUMN "authorId",
DROP COLUMN "conversationId",
ALTER COLUMN "teacherId" SET NOT NULL,
ALTER COLUMN "studentId" SET NOT NULL,
ALTER COLUMN "guardianId" SET NOT NULL;

DROP TABLE "Conversation";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0026_communications_conversations';

COMMIT;
