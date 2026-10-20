-- Affectations des surveillants (004), étape 1 sur 2 : schéma, purement additif.
-- Valeurs d'énumération, types, tables et colonnes nullables ; aucune donnée modifiée.
-- Le renommage du rôle MANAGER -> ADMIN et la reprise des données sont dans 0009_supervision_data
-- (une valeur ajoutée par ADD VALUE n'est utilisable qu'après la validation de cette migration).
-- Retour arrière : down.sql (manuel), voir specs/004-retards-affectation-surveillants/contracts/migration.md.

-- CreateEnum
CREATE TYPE "CoverageSource" AS ENUM ('TEACHER_REQUEST', 'SUPERVISOR_REPORT', 'ADMIN_DIRECT');

-- CreateEnum
CREATE TYPE "CoverageType" AS ENUM ('LATENESS', 'ABSENCE', 'EMPTY_CLASS');

-- CreateEnum
CREATE TYPE "GroupSystemKey" AS ENUM ('TEACHERS', 'SUPERVISORS');

-- CreateEnum
CREATE TYPE "CoverageReminderKind" AS ENUM ('TAKEOVER', 'TAKEOVER_ESCALATION', 'MORNING', 'END_OF_SLOT', 'END_OF_SLOT_ADMIN', 'SUPPORT_DECISION', 'SUPPORT_ESCALATION');

-- CreateEnum
CREATE TYPE "MergeProposalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'FLOOR_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'COVERAGE_ANONYMIZED';
ALTER TYPE "AuditAction" ADD VALUE 'COVERAGE_MERGE_DECIDED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_EMPTY_CLASS';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_TAKEOVER_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_ESCALATED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_MORNING_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_CLOSE_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_DUPLICATE';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_SUPPORT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_DOUBLE_ASSIGNMENT';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_LIFTED';
ALTER TYPE "NotificationType" ADD VALUE 'COVERAGE_UPDATED';

-- AlterEnum
ALTER TYPE "RequestEventType" ADD VALUE 'UPDATED';
ALTER TYPE "RequestEventType" ADD VALUE 'TEACHER_SET';
ALTER TYPE "RequestEventType" ADD VALUE 'SUPPORT_JOINED';
ALTER TYPE "RequestEventType" ADD VALUE 'SUPPORT_RELEASED';
ALTER TYPE "RequestEventType" ADD VALUE 'MERGE_PROPOSED';
ALTER TYPE "RequestEventType" ADD VALUE 'MERGE_DECIDED';
ALTER TYPE "RequestEventType" ADD VALUE 'REMINDER_SENT';
ALTER TYPE "RequestEventType" ADD VALUE 'ESCALATED';
ALTER TYPE "RequestEventType" ADD VALUE 'ANONYMIZED';

-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "CoverageDetail" ADD COLUMN     "anonymizedAt" TIMESTAMPTZ(3),
ADD COLUMN     "floorId" UUID,
ADD COLUMN     "mergedIntoId" UUID,
ADD COLUMN     "reason" VARCHAR(1000),
ADD COLUMN     "source" "CoverageSource",
ADD COLUMN     "teacherId" UUID,
ADD COLUMN     "type" "CoverageType";

-- AlterTable
ALTER TABLE "EmployeeGroup" ADD COLUMN     "systemKey" "GroupSystemKey";

-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "floorId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "floorId" UUID;

-- CreateTable
CREATE TABLE "Floor" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageSupport" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMPTZ(3),
    "releasedById" UUID,

    CONSTRAINT "CoverageSupport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageMergeProposal" (
    "id" UUID NOT NULL,
    "sourceRequestId" UUID NOT NULL,
    "targetRequestId" UUID NOT NULL,
    "status" "MergeProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalPresentedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,

    CONSTRAINT "CoverageMergeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageReminder" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "kind" "CoverageReminderKind" NOT NULL,
    "targetUserId" UUID,
    "supportId" UUID,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "intervalMinutes" INTEGER,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolution" VARCHAR(30),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Floor_name_key" ON "Floor"("name");

-- CreateIndex
CREATE INDEX "CoverageSupport_requestId_idx" ON "CoverageSupport"("requestId");

-- CreateIndex
CREATE INDEX "CoverageSupport_userId_idx" ON "CoverageSupport"("userId");

-- CreateIndex
CREATE INDEX "CoverageMergeProposal_targetRequestId_idx" ON "CoverageMergeProposal"("targetRequestId");

-- CreateIndex
CREATE INDEX "CoverageMergeProposal_status_idx" ON "CoverageMergeProposal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CoverageMergeProposal_sourceRequestId_targetRequestId_key" ON "CoverageMergeProposal"("sourceRequestId", "targetRequestId");

-- CreateIndex
CREATE INDEX "CoverageReminder_resolvedAt_dueAt_idx" ON "CoverageReminder"("resolvedAt", "dueAt");

-- CreateIndex
CREATE INDEX "CoverageReminder_requestId_idx" ON "CoverageReminder"("requestId");

-- CreateIndex
CREATE INDEX "CoverageDetail_teacherId_idx" ON "CoverageDetail"("teacherId");

-- CreateIndex
CREATE INDEX "CoverageDetail_floorId_idx" ON "CoverageDetail"("floorId");

-- CreateIndex
CREATE INDEX "CoverageDetail_source_type_idx" ON "CoverageDetail"("source", "type");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeGroup_systemKey_key" ON "EmployeeGroup"("systemKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageDetail" ADD CONSTRAINT "CoverageDetail_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageDetail" ADD CONSTRAINT "CoverageDetail_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageDetail" ADD CONSTRAINT "CoverageDetail_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageSupport" ADD CONSTRAINT "CoverageSupport_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageSupport" ADD CONSTRAINT "CoverageSupport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageSupport" ADD CONSTRAINT "CoverageSupport_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageMergeProposal" ADD CONSTRAINT "CoverageMergeProposal_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageMergeProposal" ADD CONSTRAINT "CoverageMergeProposal_targetRequestId_fkey" FOREIGN KEY ("targetRequestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageMergeProposal" ADD CONSTRAINT "CoverageMergeProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageReminder" ADD CONSTRAINT "CoverageReminder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageReminder" ADD CONSTRAINT "CoverageReminder_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageReminder" ADD CONSTRAINT "CoverageReminder_supportId_fkey" FOREIGN KEY ("supportId") REFERENCES "CoverageSupport"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Un seul renfort actif par (affectation, surveillant) (FR-015i).
CREATE UNIQUE INDEX "CoverageSupport_active_key" ON "CoverageSupport"("requestId", "userId") WHERE "releasedAt" IS NULL;
