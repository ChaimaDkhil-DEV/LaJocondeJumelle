-- Retour arrière de 0004_superadmin_notifications (non exécuté par Prisma).
--
-- Supprime les trois marqueurs d'alerte du super administrateur et la valeur UNASSIGNED du type
-- NotificationType. PostgreSQL ne sait pas retirer une valeur d'énumération : le type est recréé.
-- Les notifications UNASSIGNED déjà envoyées sont supprimées (la table Notification n'est pas en
-- ajout seul ; l'historique des demandes et le journal d'audit ne sont pas touchés).
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0004_superadmin_notifications/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DELETE FROM "Notification" WHERE "type"::text = 'UNASSIGNED';

ALTER TABLE "Request"
  DROP COLUMN "superAdminUrgentNotifiedAt",
  DROP COLUMN "superAdminUnassignedNotifiedAt",
  DROP COLUMN "superAdminOverdueNotifiedAt";

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM (
  'REQUEST_NEW', 'MESSAGE_NEW', 'ASSIGNED', 'STATUS_CHANGED', 'URGENT', 'TO_CORRECT', 'REJECTED',
  'CANCELLED', 'OVERDUE', 'CLOSED',
  'COVERAGE_NEW', 'COVERAGE_TAKEN', 'COVERAGE_ACCEPTED', 'COVERAGE_PRESENCE', 'COVERAGE_RELEASED',
  'COVERAGE_RELIEF_REQUESTED', 'COVERAGE_LATE', 'COVERAGE_UNFILLED', 'COVERAGE_EXTENDED', 'COVERAGE_RELIEVED'
);
ALTER TABLE "Notification"
  ALTER COLUMN "type" TYPE "NotificationType" USING ("type"::text::"NotificationType");
DROP TYPE "NotificationType_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0004_superadmin_notifications';

COMMIT;
