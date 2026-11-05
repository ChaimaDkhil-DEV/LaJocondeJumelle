-- Retour arrière de 0014_teacher_attendance (non exécuté par Prisma).
--
-- Ce script ne supprime AUCUNE donnée métier : il s'arrête si le pointage des enseignants a déjà servi
-- (pointages enregistrés, remplaçant désigné, historique, journal d'audit ou notifications portant les
-- nouvelles valeurs). Les pointages sont des données de suivi du personnel qui ne se reconstituent pas :
-- dans ce cas, le seul retour arrière fiable est la restauration de la sauvegarde prise avant la
-- migration (l'historique et le journal d'audit sont en ajout seul et ne doivent pas être réécrits).
--
-- Les valeurs d'énumération ajoutées (AuditAction, NotificationType, RequestEventType) restent :
-- PostgreSQL ne retire pas une valeur d'énumération ; elles restent inutilisées après le retour arrière
-- du code.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0014_teacher_attendance/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée
-- en fin de script. ATTENTION : comme les valeurs d'énumération restent, réappliquer ensuite
-- `migrate deploy` sur cette même base échouerait (« enum label already exists ») ; pour revenir à la
-- version avec pointage, restaurez la sauvegarde prise avant ce retour arrière.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TeacherAttendance")
     OR EXISTS (SELECT 1 FROM "CoverageDetail" WHERE "substituteTeacherId" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "RequestEvent" WHERE "type"::text IN ('TEACHER_ARRIVED', 'SUBSTITUTE_SET'))
     OR EXISTS (SELECT 1 FROM "AuditLog" WHERE "action"::text IN ('ATTENDANCE_MANUAL', 'ATTENDANCE_CORRECTED'))
     OR EXISTS (SELECT 1 FROM "Notification"
                WHERE "type"::text IN ('COVERAGE_TEACHER_ARRIVED', 'COVERAGE_ATTENDANCE_ANOMALY'))
  THEN
    RAISE EXCEPTION 'Le pointage des enseignants contient des données : restaurez la sauvegarde prise avant la migration 0014_teacher_attendance.';
  END IF;
END $$;

-- Table vide : on retire d'abord le déclencheur qui interdit sa suppression.
DROP TRIGGER IF EXISTS "TeacherAttendance_no_delete" ON "TeacherAttendance";
DROP TRIGGER IF EXISTS "TeacherAttendance_no_truncate" ON "TeacherAttendance";
DROP TABLE IF EXISTS "TeacherAttendance";
DROP FUNCTION IF EXISTS forbid_deletion();

ALTER TABLE "CoverageDetail" DROP CONSTRAINT IF EXISTS "CoverageDetail_substituteTeacherId_fkey";
DROP INDEX IF EXISTS "CoverageDetail_substituteTeacherId_idx";
ALTER TABLE "CoverageDetail" DROP COLUMN IF EXISTS "substituteTeacherId";

DROP TYPE IF EXISTS "AttendanceStatus";
DROP TYPE IF EXISTS "AttendanceMethod";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0014_teacher_attendance';

COMMIT;
