-- Lot 2 — Couverture de classe (garde / remplacement).
-- Migration ADDITIVE : aucune table ni colonne existante n'est supprimée ou renommée ;
-- les données existantes reçoivent des valeurs par défaut (kind = WORK, availability = AVAILABLE).
-- Sauvegarde recommandée avant exécution ; retour arrière : voir down.sql et docs/coverage-migration.md.

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('WORK', 'COVERAGE');

-- CreateEnum
CREATE TYPE "ProofMode" AS ENUM ('PHOTO', 'QR', 'BOTH');

-- CreateEnum
CREATE TYPE "PresenceMethod" AS ENUM ('PHOTO', 'QR');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'ABSENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequestStatus" ADD VALUE 'BROADCAST';
ALTER TYPE "RequestStatus" ADD VALUE 'UNFILLED';
ALTER TYPE "RequestStatus" ADD VALUE 'EN_ROUTE';
ALTER TYPE "RequestStatus" ADD VALUE 'LATE';
ALTER TYPE "RequestStatus" ADD VALUE 'ON_DUTY';
ALTER TYPE "RequestStatus" ADD VALUE 'RELIEF_PENDING';

-- AlterEnum
ALTER TYPE "DeadlineStage" ADD VALUE 'ARRIVAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequestEventType" ADD VALUE 'GROUP_ADDED';
ALTER TYPE "RequestEventType" ADD VALUE 'RELEASED';
ALTER TYPE "RequestEventType" ADD VALUE 'RELIEF_REQUESTED';
ALTER TYPE "RequestEventType" ADD VALUE 'PRESENCE_CONFIRMED';
ALTER TYPE "RequestEventType" ADD VALUE 'EXTENDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'GROUP_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'CLASS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'QR_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'AVAILABILITY_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'COVERAGE_MANAGED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_NEW';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_TAKEN';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_PRESENCE';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_RELEASED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_RELIEF_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_LATE';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_UNFILLED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_EXTENDED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_RELIEVED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "availability" "Availability" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "kind" "RequestKind" NOT NULL DEFAULT 'WORK',
ADD COLUMN     "proofMode" "ProofMode" NOT NULL DEFAULT 'PHOTO';

-- AlterTable
ALTER TABLE "DeadlineRule" ADD COLUMN     "arrivalMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "kind" "RequestKind" NOT NULL DEFAULT 'WORK';

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "room" VARCHAR(80),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "qrVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeGroup" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmployeeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeGroupMember" (
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "EmployeeGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "CoverageDetail" (
    "requestId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "absentTeacher" VARCHAR(100),
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "estimatedMinutes" INTEGER,
    "plannedEndAt" TIMESTAMPTZ(3),
    "broadcastAt" TIMESTAMPTZ(3),
    "departedAt" TIMESTAMPTZ(3),
    "presenceAt" TIMESTAMPTZ(3),
    "relievedAt" TIMESTAMPTZ(3),
    "durationMinutes" INTEGER,
    "releaseCount" INTEGER NOT NULL DEFAULT 0,
    "extensionCount" INTEGER NOT NULL DEFAULT 0,
    "cancelReason" VARCHAR(1000),
    "reliefForId" UUID,

    CONSTRAINT "CoverageDetail_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "CoverageTarget" (
    "requestId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageTarget_pkey" PRIMARY KEY ("requestId","groupId")
);

-- CreateTable
CREATE TABLE "CoveragePresence" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "method" "PresenceMethod" NOT NULL,
    "fileId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoveragePresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_name_key" ON "SchoolClass"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeGroup_name_key" ON "EmployeeGroup"("name");

-- CreateIndex
CREATE INDEX "EmployeeGroupMember_userId_idx" ON "EmployeeGroupMember"("userId");

-- CreateIndex
CREATE INDEX "CoverageDetail_reliefForId_idx" ON "CoverageDetail"("reliefForId");

-- CreateIndex
CREATE INDEX "CoverageDetail_classId_idx" ON "CoverageDetail"("classId");

-- CreateIndex
CREATE INDEX "CoverageDetail_startAt_idx" ON "CoverageDetail"("startAt");

-- CreateIndex
CREATE INDEX "CoverageTarget_groupId_idx" ON "CoverageTarget"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CoveragePresence_fileId_key" ON "CoveragePresence"("fileId");

-- CreateIndex
CREATE INDEX "CoveragePresence_requestId_idx" ON "CoveragePresence"("requestId");

-- CreateIndex
CREATE INDEX "Request_kind_status_idx" ON "Request"("kind", "status");

-- AddForeignKey
ALTER TABLE "EmployeeGroupMember" ADD CONSTRAINT "EmployeeGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "EmployeeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeGroupMember" ADD CONSTRAINT "EmployeeGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageDetail" ADD CONSTRAINT "CoverageDetail_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageDetail" ADD CONSTRAINT "CoverageDetail_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageDetail" ADD CONSTRAINT "CoverageDetail_reliefForId_fkey" FOREIGN KEY ("reliefForId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageTarget" ADD CONSTRAINT "CoverageTarget_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CoverageDetail"("requestId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageTarget" ADD CONSTRAINT "CoverageTarget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "EmployeeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoveragePresence" ADD CONSTRAINT "CoveragePresence_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoveragePresence" ADD CONSTRAINT "CoveragePresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoveragePresence" ADD CONSTRAINT "CoveragePresence_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Données par défaut (à valider avec l'école, modifiables depuis l'administration)
-- ---------------------------------------------------------------------------

-- Catégorie « Garde de classe » : créée par les responsables, preuve QR + photo, sans validation finale.
INSERT INTO "Category" ("id", "name", "active", "circuit", "creatorRoles", "closureMode", "autoCloseAfterMinutes",
                        "finalValidation", "assignmentMode", "photoRequired", "kind", "proofMode", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Garde de classe', true, 'A_DIRECT', ARRAY['MANAGER']::"Role"[], 'MANAGER', 0,
        false, 'MANUAL', false, 'COVERAGE', 'BOTH', now(), now())
ON CONFLICT ("name") DO NOTHING;

-- Délais : prise en charge 2 min, arrivée en classe 5 min, pour toutes les priorités.
INSERT INTO "DeadlineRule" ("id", "categoryId", "priority", "validationMinutes", "takeoverMinutes", "completionMinutes", "arrivalMinutes")
SELECT gen_random_uuid(), c."id", p.priority, NULL, 2, NULL, 5
FROM "Category" c
CROSS JOIN (VALUES ('NORMAL'::"Priority"), ('MEDIUM'::"Priority"), ('HIGH'::"Priority"), ('URGENT'::"Priority")) AS p(priority)
WHERE c."name" = 'Garde de classe' AND c."kind" = 'COVERAGE'
ON CONFLICT ("categoryId", "priority") DO NOTHING;

-- Les responsables existants gèrent la catégorie (le super administrateur a toujours tous les droits).
INSERT INTO "CategoryManager" ("categoryId", "userId")
SELECT c."id", u."id"
FROM "Category" c, "User" u
WHERE c."name" = 'Garde de classe' AND c."kind" = 'COVERAGE' AND u."role" = 'MANAGER' AND u."active"
ON CONFLICT DO NOTHING;

-- Groupe cible par défaut, vide : les membres sont ajoutés depuis l'administration.
INSERT INTO "EmployeeGroup" ("id", "name", "active", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Surveillants/Remplaçants', true, now(), now())
ON CONFLICT ("name") DO NOTHING;
