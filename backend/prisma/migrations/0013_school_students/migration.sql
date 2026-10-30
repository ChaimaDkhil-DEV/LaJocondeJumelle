-- Niveaux scolaires et élèves. Une classe peut être rattachée à un niveau (levelId nul pour les
-- salles sans élèves et les classes existantes). Chaque élève appartient à une classe (le niveau
-- s'en déduit) et a exactement un service de restauration : colonne obligatoire de type
-- "MealService" (CANTINE ou PANIER), jamais deux indicateurs indépendants.
-- Ajout seul : aucune donnée existante modifiée.

-- CreateEnum
CREATE TYPE "SchoolCycle" AS ENUM ('PREPARATORY', 'PRIMARY');

-- CreateEnum
CREATE TYPE "MealService" AS ENUM ('CANTINE', 'PANIER');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'STUDENT_CHANGED';

-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "levelId" UUID;

-- CreateTable
CREATE TABLE "GradeLevel" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "cycle" "SchoolCycle" NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GradeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" UUID NOT NULL,
    "firstName" VARCHAR(60) NOT NULL,
    "lastName" VARCHAR(60) NOT NULL,
    "classId" UUID NOT NULL,
    "parentPhone" VARCHAR(20) NOT NULL,
    "mealService" "MealService" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradeLevel_name_key" ON "GradeLevel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GradeLevel_position_key" ON "GradeLevel"("position");

-- CreateIndex
CREATE INDEX "Student_classId_idx" ON "Student"("classId");

-- CreateIndex
CREATE INDEX "Student_lastName_firstName_idx" ON "Student"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "SchoolClass_levelId_idx" ON "SchoolClass"("levelId");

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
