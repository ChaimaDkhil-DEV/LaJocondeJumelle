-- Pointage des enseignants par QR (lot 3) : arrivée scannée ou saisie par la surveillante, rattachée à la
-- demande de retard/absence annoncée, remplaçant autorisé sur la demande d'absence.
-- Migration additive : aucune donnée existante n'est modifiée. Retour arrière : down.sql (les valeurs
-- d'énumération ajoutées restent, PostgreSQL ne les retire pas).

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('QR', 'MANUAL');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('ARRIVED', 'ON_TIME', 'LATE', 'ABSENT');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_MANUAL';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_CORRECTED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_TEACHER_ARRIVED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_ATTENDANCE_ANOMALY';

-- AlterEnum
ALTER TYPE "RequestEventType" ADD VALUE 'TEACHER_ARRIVED';
ALTER TYPE "RequestEventType" ADD VALUE 'SUBSTITUTE_SET';

-- AlterTable
ALTER TABLE "CoverageDetail" ADD COLUMN     "substituteTeacherId" UUID;

-- CreateTable
CREATE TABLE "TeacherAttendance" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "method" "AttendanceMethod" NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "arrivedAt" TIMESTAMPTZ(3),
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" UUID NOT NULL,
    "comment" VARCHAR(500),
    "requestId" UUID,
    "announcedLateMinutes" INTEGER,
    "substituteForId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TeacherAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherAttendance_localDate_idx" ON "TeacherAttendance"("localDate");

-- CreateIndex
CREATE INDEX "TeacherAttendance_classId_localDate_idx" ON "TeacherAttendance"("classId", "localDate");

-- CreateIndex
CREATE INDEX "TeacherAttendance_requestId_idx" ON "TeacherAttendance"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAttendance_teacherId_classId_localDate_key" ON "TeacherAttendance"("teacherId", "classId", "localDate");

-- CreateIndex
CREATE INDEX "CoverageDetail_substituteTeacherId_idx" ON "CoverageDetail"("substituteTeacherId");

-- AddForeignKey
ALTER TABLE "CoverageDetail" ADD CONSTRAINT "CoverageDetail_substituteTeacherId_fkey" FOREIGN KEY ("substituteTeacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_substituteForId_fkey" FOREIGN KEY ("substituteForId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Historique non supprimable : un pointage peut être corrigé (le détail de chaque correction est
-- ajouté au journal d'audit, en ajout seul) mais jamais supprimé ni vidé, même par un bogue applicatif.
-- ---------------------------------------------------------------------------
CREATE FUNCTION forbid_deletion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La table % ne peut pas être vidée ni ses lignes supprimées : % interdit', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "TeacherAttendance_no_delete"
  BEFORE DELETE ON "TeacherAttendance"
  FOR EACH ROW EXECUTE FUNCTION forbid_deletion();

CREATE TRIGGER "TeacherAttendance_no_truncate"
  BEFORE TRUNCATE ON "TeacherAttendance"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_deletion();
