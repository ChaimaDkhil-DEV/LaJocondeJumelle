-- Retour arrière de 0025_communications_enums (non exécuté par Prisma).
--
-- À exécuter APRÈS le down.sql de 0026_communications_conversations (qui utilise ces types).
-- Supprime les deux types créés. Les valeurs ajoutées aux énumérations existantes (AuditAction,
-- NotificationType, ParentCommunicationAuthor, ParentCommunicationEventType,
-- ParentCommunicationStatus, Permission) restent : PostgreSQL ne sait pas retirer une valeur
-- d'énumération ; elles ne sont plus utilisées par le code 015 et la migration se réapplique.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0025_communications_enums/down.sql --schema prisma/schema.prisma

BEGIN;

DROP TYPE IF EXISTS "ConversationStatus";
DROP TYPE IF EXISTS "ConversationType";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0025_communications_enums';

COMMIT;
