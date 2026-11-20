-- 0032_student_class_history (021) : historique des classes d'un élève, en ajout seul.
--
-- Une ligne dit « à partir de startedAt, l'élève est dans cette classe » ; une période finit quand la suivante du
-- même élève commence. Les élèves déjà inscrits reçoivent une ligne « reconstituée » à partir de leur classe
-- actuelle, datée de leur création : avant la date de cette migration (createdAt de la ligne), elle n'est pas
-- garantie, des changements de classe ayant pu ne pas être enregistrés. Aucune donnée existante n'est modifiée.
--
-- Pas de GRANT ici : le rôle d'exécution est recalculé après chaque migration (src/database/runtime-role.ts) et
-- perd UPDATE et DELETE sur les tables dont un déclencheur d'ajout seul les interdit.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'STUDENT_SITUATION_VIEWED';

-- CreateTable
CREATE TABLE "StudentClassHistory" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "studentId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "changedById" UUID,
    "reconstructed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentClassHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentClassHistory_studentId_startedAt_seq_idx" ON "StudentClassHistory"("studentId", "startedAt", "seq");

-- CreateIndex
CREATE INDEX "StudentClassHistory_classId_idx" ON "StudentClassHistory"("classId");

-- CreateIndex : journal d'audit lu par cible (journal d'un élève).
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentClassHistory" ADD CONSTRAINT "StudentClassHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClassHistory" ADD CONSTRAINT "StudentClassHistory_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClassHistory" ADD CONSTRAINT "StudentClassHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ajout seul (fonction forbid_modification() créée par 0001_init) : aucune ligne ne se modifie, ne se supprime ni
-- ne se vide, même par un bogue applicatif. Un changement de classe ajoute une ligne.
CREATE TRIGGER "StudentClassHistory_append_only"
  BEFORE UPDATE OR DELETE ON "StudentClassHistory"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER "StudentClassHistory_no_truncate"
  BEFORE TRUNCATE ON "StudentClassHistory"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

-- Reprise de l'existant : une ligne par élève, sa classe actuelle depuis sa création, sans auteur. `createdAt`
-- (maintenant) date la mise en service : c'est la limite de ce qui est garanti.
INSERT INTO "StudentClassHistory" ("id", "studentId", "classId", "startedAt", "changedById", "reconstructed", "createdAt")
SELECT gen_random_uuid(), s."id", s."classId", s."createdAt", NULL, true, now()
FROM "Student" s;
