-- Retour arrière de 0023_parent_conversations (non exécuté par Prisma).
--
-- Les messages écrits par les parents n'existent pas dans la version précédente : ce script s'arrête
-- s'il en reste (aucune suppression silencieuse). Pour les retirer, après accord et sauvegarde :
-- c'est une suppression de données (versions et historique à ajout seul, notifications), à préparer
-- à part. Les notifications TEACHER_MESSAGE_NEW sont supprimées, puis le type NotificationType est
-- recréé sans cette valeur (PostgreSQL ne retire pas une valeur d'un type énuméré) : la migration peut
-- ensuite être réappliquée. Le script peut être relancé sans erreur.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0023_parent_conversations/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
DECLARE
  parent_messages boolean := false;
BEGIN
  -- Requête dynamique : la colonne n'existe plus si le script a déjà été exécuté.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ParentCommunication' AND column_name = 'author'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "ParentCommunication" WHERE "author"::text = ''PARENT'')'
      INTO parent_messages;
  END IF;
  IF parent_messages THEN
    RAISE EXCEPTION 'Des messages de parents existent : retour arrière de 0023 interrompu.';
  END IF;
END $$;

DROP INDEX IF EXISTS "ParentCommunication_teacherId_studentId_guardianId_idx";
ALTER TABLE "ParentCommunicationRevision" ALTER COLUMN "voiceFileId" SET NOT NULL;
ALTER TABLE "ParentCommunication" DROP COLUMN IF EXISTS "author";
DROP TYPE IF EXISTS "ParentCommunicationAuthor";

-- Type des notifications recréé sans TEACHER_MESSAGE_NEW (seule la colonne Notification.type l'utilise).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'TEACHER_MESSAGE_NEW'
  ) THEN
    DELETE FROM "Notification" WHERE "type"::text = 'TEACHER_MESSAGE_NEW';
    ALTER TYPE "NotificationType" RENAME TO "NotificationType_0023";
    CREATE TYPE "NotificationType" AS ENUM (
      'REQUEST_NEW', 'MESSAGE_NEW', 'ASSIGNED', 'STATUS_CHANGED', 'URGENT', 'TO_CORRECT', 'REJECTED',
      'CANCELLED', 'OVERDUE', 'CLOSED', 'COVERAGE_NEW', 'COVERAGE_TAKEN', 'COVERAGE_ACCEPTED',
      'COVERAGE_PRESENCE', 'COVERAGE_RELEASED', 'COVERAGE_RELIEF_REQUESTED', 'COVERAGE_LATE',
      'COVERAGE_UNFILLED', 'COVERAGE_EXTENDED', 'COVERAGE_RELIEVED', 'UNASSIGNED', 'COVERAGE_REQUESTED',
      'COVERAGE_EMPTY_CLASS', 'COVERAGE_TAKEOVER_EXPIRED', 'COVERAGE_ESCALATED',
      'COVERAGE_MORNING_REMINDER', 'COVERAGE_CLOSE_REMINDER', 'COVERAGE_DUPLICATE',
      'COVERAGE_SUPPORT_REMINDER', 'COVERAGE_DOUBLE_ASSIGNMENT', 'COVERAGE_LIFTED', 'COVERAGE_UPDATED',
      'COVERAGE_TEACHER_ARRIVED', 'COVERAGE_ATTENDANCE_ANOMALY', 'PARENT_COMM_TO_VALIDATE',
      'PARENT_COMM_RETURNED', 'PARENT_COMM_APPROVED', 'PARENT_COMM_REJECTED', 'PARENT_MESSAGE_NEW'
    );
    ALTER TABLE "Notification"
      ALTER COLUMN "type" TYPE "NotificationType" USING ("type"::text::"NotificationType");
    DROP TYPE "NotificationType_0023";
  END IF;
END $$;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0023_parent_conversations';

COMMIT;
