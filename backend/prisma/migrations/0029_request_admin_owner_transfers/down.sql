-- Retour arrière de 0029_request_admin_owner_transfers (non exécuté par Prisma).
--
-- Rien à annuler avant : 0029 est la dernière migration. Ce script retire tout ce que la migration a
-- créé — les colonnes "Request"."adminOwnerId" et "adminOwnedAt", les tables "RequestAssignment" et
-- "RequestTransfer", leurs types — et PERD donc les responsables, leur historique et les propositions de
-- transfert enregistrés depuis. Pour les conserver, le seul retour arrière fiable est la restauration de la
-- sauvegarde prise avant la migration. Les demandes elles-mêmes, leur statut et leur historique ne sont
-- pas touchés.
--
-- Les sept valeurs ajoutées à "NotificationType" sont retirées elles aussi : PostgreSQL ne sachant pas
-- retirer une valeur d'énumération, le type est recréé avec ses 43 valeurs d'avant la migration, après
-- suppression des notifications des nouveaux types. Sans cela, la migration ne pourrait pas être
-- réappliquée (ADD VALUE échouerait sur une valeur déjà présente).
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0029_request_admin_owner_transfers/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DELETE FROM "Notification"
WHERE "type"::text IN ('TRANSFER_TAKEOVER_REQUESTED', 'TRANSFER_DELEGATION_REQUESTED', 'TRANSFER_ACCEPTED',
                       'TRANSFER_REJECTED', 'TRANSFER_CANCELLED', 'TRANSFER_EXPIRED', 'ADMIN_OWNER_REASSIGNED');

DELETE FROM "Setting" WHERE "key" = 'transferResponseMinutes';

-- Les verrous d'ajout seul de "RequestAssignment" partent avec la table.
DROP TABLE "RequestAssignment";
DROP TABLE "RequestTransfer";

ALTER TABLE "Request" DROP CONSTRAINT "Request_admin_owner_pair";
ALTER TABLE "Request" DROP CONSTRAINT "Request_adminOwnerId_fkey";
DROP INDEX "Request_adminOwnerId_status_idx";
ALTER TABLE "Request" DROP COLUMN "adminOwnerId", DROP COLUMN "adminOwnedAt";

DROP TYPE "RequestAssignmentOperation";
DROP TYPE "RequestTransferCancelCause";
DROP TYPE "RequestTransferStatus";
DROP TYPE "RequestTransferType";

-- "NotificationType" tel qu'avant la migration ; seule la colonne "Notification"."type" l'utilise.
ALTER TYPE "NotificationType" RENAME TO "NotificationType_0029";
CREATE TYPE "NotificationType" AS ENUM (
  'REQUEST_NEW', 'MESSAGE_NEW', 'ASSIGNED', 'STATUS_CHANGED', 'URGENT', 'TO_CORRECT', 'REJECTED', 'CANCELLED', 'OVERDUE', 'CLOSED',
  'COVERAGE_NEW', 'COVERAGE_TAKEN', 'COVERAGE_ACCEPTED', 'COVERAGE_PRESENCE', 'COVERAGE_RELEASED', 'COVERAGE_RELIEF_REQUESTED',
  'COVERAGE_LATE', 'COVERAGE_UNFILLED', 'COVERAGE_EXTENDED', 'COVERAGE_RELIEVED', 'UNASSIGNED', 'COVERAGE_REQUESTED',
  'COVERAGE_EMPTY_CLASS', 'COVERAGE_TAKEOVER_EXPIRED', 'COVERAGE_ESCALATED', 'COVERAGE_MORNING_REMINDER', 'COVERAGE_CLOSE_REMINDER',
  'COVERAGE_DUPLICATE', 'COVERAGE_SUPPORT_REMINDER', 'COVERAGE_DOUBLE_ASSIGNMENT', 'COVERAGE_LIFTED', 'COVERAGE_UPDATED',
  'COVERAGE_TEACHER_ARRIVED', 'COVERAGE_ATTENDANCE_ANOMALY', 'PARENT_COMM_TO_VALIDATE', 'PARENT_COMM_RETURNED', 'PARENT_COMM_APPROVED',
  'PARENT_COMM_REJECTED', 'PARENT_MESSAGE_NEW', 'TEACHER_MESSAGE_NEW', 'COMM_INTERNAL_NEW', 'COMM_ADMIN_REPLY', 'COMM_PARENT_NEW'
);
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";
DROP TYPE "NotificationType_0029";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0029_request_admin_owner_transfers';

COMMIT;
