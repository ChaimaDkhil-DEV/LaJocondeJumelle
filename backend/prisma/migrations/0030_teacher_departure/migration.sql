-- Enseignants présents dans l'établissement (019) : départ d'un enseignant, enregistré par un second scan
-- du QR d'une classe ou saisi par l'administration, et clos par son retour.
-- Migration additive : une table nouvelle, aucune donnée existante n'est modifiée, aucun type ni aucune
-- valeur d'énumération ajoutés (la méthode réutilise "AttendanceMethod"). Retour arrière : down.sql.

-- CreateTable
CREATE TABLE "TeacherDeparture" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "departedAt" TIMESTAMPTZ(3) NOT NULL,
    "method" "AttendanceMethod" NOT NULL,
    "classId" UUID,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" UUID NOT NULL,
    "comment" VARCHAR(500),
    "returnedAt" TIMESTAMPTZ(3),
    "returnedById" UUID,

    CONSTRAINT "TeacherDeparture_pkey" PRIMARY KEY ("id"),
    -- Un retour a une heure et un auteur, ou ni l'un ni l'autre.
    CONSTRAINT "TeacherDeparture_return_pair" CHECK (("returnedAt" IS NULL) = ("returnedById" IS NULL)),
    -- On ne revient pas avant d'être parti.
    CONSTRAINT "TeacherDeparture_return_after" CHECK ("returnedAt" IS NULL OR "returnedAt" >= "departedAt")
);

-- CreateIndex
CREATE INDEX "TeacherDeparture_localDate_idx" ON "TeacherDeparture"("localDate");

-- CreateIndex
CREATE INDEX "TeacherDeparture_teacherId_localDate_idx" ON "TeacherDeparture"("teacherId", "localDate");

-- Un seul départ en cours (sans retour) par enseignant et par jour : deux scans simultanés n'en créent
-- qu'un. Index partiel, que Prisma ne sait pas décrire dans schema.prisma.
CREATE UNIQUE INDEX "TeacherDeparture_one_open" ON "TeacherDeparture"("teacherId", "localDate") WHERE "returnedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "TeacherDeparture" ADD CONSTRAINT "TeacherDeparture_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherDeparture" ADD CONSTRAINT "TeacherDeparture_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherDeparture" ADD CONSTRAINT "TeacherDeparture_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherDeparture" ADD CONSTRAINT "TeacherDeparture_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Historique non supprimable, comme les pointages d'arrivée (fonction créée par 0014_teacher_attendance) :
-- un départ se clôt par un retour, il ne se supprime pas.
CREATE TRIGGER "TeacherDeparture_no_delete"
  BEFORE DELETE ON "TeacherDeparture"
  FOR EACH ROW EXECUTE FUNCTION forbid_deletion();

CREATE TRIGGER "TeacherDeparture_no_truncate"
  BEFORE TRUNCATE ON "TeacherDeparture"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_deletion();
