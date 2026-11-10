-- 015 : conversations entre parents et enseignants. Le parent peut écrire à l'enseignant de son enfant ; chaque
-- message, dans les deux sens, passe par la validation de l'administration. Les messages existants
-- sont tous de l'enseignant (author = TEACHER par défaut).

-- CreateEnum
CREATE TYPE "ParentCommunicationAuthor" AS ENUM ('TEACHER', 'PARENT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TEACHER_MESSAGE_NEW';

-- AlterTable
ALTER TABLE "ParentCommunication" ADD COLUMN     "author" "ParentCommunicationAuthor" NOT NULL DEFAULT 'TEACHER';

-- AlterTable : le vocal reste obligatoire pour l'enseignant (contrôlé par le service), facultatif pour le parent.
ALTER TABLE "ParentCommunicationRevision" ALTER COLUMN "voiceFileId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ParentCommunication_teacherId_studentId_guardianId_idx" ON "ParentCommunication"("teacherId", "studentId", "guardianId");
