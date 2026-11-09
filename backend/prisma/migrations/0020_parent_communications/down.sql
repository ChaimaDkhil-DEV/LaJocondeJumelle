-- Retour arrière de 0020_parent_communications (non exécuté par Prisma).
--
-- Supprime les tables de la spec 015 et leurs données : représentants légaux et leurs élèves, classes
-- attribuées aux enseignants, communications aux parents (versions, historique, livraisons) et outbox.
-- Les notifications de communication sont supprimées ; celles des demandes sont gardées et requestId
-- redevient obligatoire. Les fichiers vocaux restent en base : sans rattachement, le nettoyage des
-- fichiers provisoires de la version précédente les supprime sous 24 h.
--
-- Les valeurs ajoutées aux types énumérés (rôle PARENT, permission, actions d'audit, types de
-- notification) ne peuvent pas être retirées par PostgreSQL sans recréer les types : elles restent,
-- inutilisées. Avant ce script, désactiver les comptes parents (rôle PARENT) et retirer la permission
-- PARENT_COMMUNICATION_VALIDATE des rôles :
--   UPDATE "User" SET "active" = false WHERE "role" = 'PARENT';
--   DELETE FROM "RolePermission" WHERE "permission" = 'PARENT_COMMUNICATION_VALIDATE';
-- Exécuter d'abord le down.sql de 0021_parent_communications_integrity (contrainte et déclencheurs).
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0020_parent_communications/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DELETE FROM "Notification" WHERE "communicationId" IS NOT NULL;
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_target_check";
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_communicationId_fkey";
DROP INDEX IF EXISTS "Notification_communicationId_idx";
ALTER TABLE "Notification" DROP COLUMN IF EXISTS "communicationId";
ALTER TABLE "Notification" ALTER COLUMN "requestId" SET NOT NULL;

-- Tables à ajout seul : la suppression de la table emporte ses déclencheurs.
DROP TABLE IF EXISTS "ParentCommunicationDelivery";
DROP TABLE IF EXISTS "ParentCommunicationEvent";
DROP TABLE IF EXISTS "ParentCommunicationRevision";
DROP TABLE IF EXISTS "ParentCommunication";
DROP TABLE IF EXISTS "OutboxEvent";
DROP TABLE IF EXISTS "TeacherClass";
DROP TABLE IF EXISTS "GuardianStudent";
DROP TABLE IF EXISTS "Guardian";

DROP TYPE IF EXISTS "OutboxStatus";
DROP TYPE IF EXISTS "CommunicationDeliveryStatus";
DROP TYPE IF EXISTS "CommunicationChannel";
DROP TYPE IF EXISTS "ParentCommunicationEventType";
DROP TYPE IF EXISTS "ParentCommunicationStatus";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0020_parent_communications';

COMMIT;
