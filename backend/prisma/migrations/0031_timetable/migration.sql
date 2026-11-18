-- Emplois du temps des enseignants (020) : séries hebdomadaires et séances datées. Le statut de présence d'une
-- séance n'est pas stocké : il se calcule à la lecture à partir des pointages existants.
-- Migration additive : deux tables, une énumération, une valeur d'action d'audit ; aucune donnée existante
-- n'est modifiée. Retour arrière : down.sql.

-- Contraintes d'exclusion sur (identifiant, intervalle de temps) : extension fournie avec PostgreSQL et
-- marquée « trusted » (le propriétaire de la base peut la créer).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "TeachingSessionStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TIMETABLE_CHANGED';

-- CreateTable
CREATE TABLE "TimetableSeries" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "subject" VARCHAR(100),
    "room" VARCHAR(80),
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TimetableSeries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TimetableSeries_weekday" CHECK ("weekday" BETWEEN 1 AND 7),
    CONSTRAINT "TimetableSeries_period" CHECK ("endDate" >= "startDate")
);

-- CreateTable
CREATE TABLE "TeachingSession" (
    "id" UUID NOT NULL,
    "seriesId" UUID,
    "teacherId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "subject" VARCHAR(100),
    "room" VARCHAR(80),
    "status" "TeachingSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "detached" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" VARCHAR(500),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TeachingSession_pkey" PRIMARY KEY ("id"),
    -- Une séance finit après avoir commencé.
    CONSTRAINT "TeachingSession_range" CHECK ("endAt" > "startAt"),
    -- Une séance annulée a toujours un motif.
    CONSTRAINT "TeachingSession_cancel_reason" CHECK ("status" <> 'CANCELLED' OR "cancelReason" IS NOT NULL),
    -- Pas deux séances prévues qui se chevauchent pour un même enseignant, ni pour une même classe, même si
    -- deux administrateurs enregistrent au même instant. Intervalles [début, fin) : bout à bout, c'est permis.
    CONSTRAINT "TeachingSession_teacher_no_overlap"
      EXCLUDE USING gist ("teacherId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&) WHERE ("status" = 'SCHEDULED'),
    CONSTRAINT "TeachingSession_class_no_overlap"
      EXCLUDE USING gist ("classId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&) WHERE ("status" = 'SCHEDULED')
);

-- CreateIndex
CREATE INDEX "TimetableSeries_teacherId_idx" ON "TimetableSeries"("teacherId");

-- CreateIndex
CREATE INDEX "TimetableSeries_classId_idx" ON "TimetableSeries"("classId");

-- CreateIndex
CREATE INDEX "TeachingSession_localDate_idx" ON "TeachingSession"("localDate");

-- CreateIndex
CREATE INDEX "TeachingSession_teacherId_localDate_idx" ON "TeachingSession"("teacherId", "localDate");

-- CreateIndex
CREATE INDEX "TeachingSession_classId_localDate_idx" ON "TeachingSession"("classId", "localDate");

-- CreateIndex
CREATE INDEX "TeachingSession_seriesId_idx" ON "TeachingSession"("seriesId");

-- AddForeignKey
ALTER TABLE "TimetableSeries" ADD CONSTRAINT "TimetableSeries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSeries" ADD CONSTRAINT "TimetableSeries_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSeries" ADD CONSTRAINT "TimetableSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "TimetableSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Historique non supprimable (fonction forbid_deletion() créée par 0014_teacher_attendance) : une séance ou
-- une série erronée s'annule, elle ne se supprime pas.
CREATE TRIGGER "TimetableSeries_no_delete"
  BEFORE DELETE ON "TimetableSeries"
  FOR EACH ROW EXECUTE FUNCTION forbid_deletion();

CREATE TRIGGER "TimetableSeries_no_truncate"
  BEFORE TRUNCATE ON "TimetableSeries"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_deletion();

CREATE TRIGGER "TeachingSession_no_delete"
  BEFORE DELETE ON "TeachingSession"
  FOR EACH ROW EXECUTE FUNCTION forbid_deletion();

CREATE TRIGGER "TeachingSession_no_truncate"
  BEFORE TRUNCATE ON "TeachingSession"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_deletion();
