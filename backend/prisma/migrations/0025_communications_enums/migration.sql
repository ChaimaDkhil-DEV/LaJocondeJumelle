-- 017 : communications centrées sur l'administration — valeurs d'énumération seulement.
-- Séparée de 0026 : PostgreSQL refuse d'utiliser une valeur d'énumération dans la transaction qui
-- l'ajoute. IF NOT EXISTS : la migration se réapplique après down.sql (les valeurs ajoutées ne
-- peuvent pas être retirées d'une énumération PostgreSQL).

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('INTERNAL', 'PARENT', 'LEGACY_TEACHER_PARENT');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMUNICATION_CONVERSATION_CHANGED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMM_INTERNAL_NEW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMM_ADMIN_REPLY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMM_PARENT_NEW';

-- AlterEnum
ALTER TYPE "ParentCommunicationAuthor" ADD VALUE IF NOT EXISTS 'ADMIN';

-- AlterEnum
ALTER TYPE "ParentCommunicationEventType" ADD VALUE IF NOT EXISTS 'SENT';

-- AlterEnum
ALTER TYPE "ParentCommunicationStatus" ADD VALUE IF NOT EXISTS 'SENT';

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'PARENT_COMM_SEND_DIRECT';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'PARENT_COMM_SUBMIT_FOR_APPROVAL';
