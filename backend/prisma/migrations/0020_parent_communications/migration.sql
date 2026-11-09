-- CreateEnum
CREATE TYPE "ParentCommunicationStatus" AS ENUM ('DRAFT', 'PENDING_ADMIN_VALIDATION', 'RETURNED_FOR_CORRECTION', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParentCommunicationEventType" AS ENUM ('CREATED', 'UPDATED', 'SUBMITTED', 'APPROVED', 'RETURNED', 'REJECTED', 'CANCELLED', 'READ');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CommunicationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'GUARDIAN_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'TEACHER_CLASSES_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PARENT_COMMUNICATION_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PARENT_COMMUNICATION_DECIDED';
ALTER TYPE "AuditAction" ADD VALUE 'PARENT_COMMUNICATION_READ';
ALTER TYPE "AuditAction" ADD VALUE 'PARENT_COMMUNICATION_DELIVERY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PARENT_COMM_TO_VALIDATE';
ALTER TYPE "NotificationType" ADD VALUE 'PARENT_COMM_RETURNED';
ALTER TYPE "NotificationType" ADD VALUE 'PARENT_COMM_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'PARENT_COMM_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'PARENT_MESSAGE_NEW';

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'PARENT_COMMUNICATION_VALIDATE';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PARENT';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "communicationId" UUID,
ALTER COLUMN "requestId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Guardian" (
    "id" UUID NOT NULL,
    "firstName" VARCHAR(60) NOT NULL,
    "lastName" VARCHAR(60) NOT NULL,
    "relationship" VARCHAR(40),
    "phone" VARCHAR(20),
    "email" VARCHAR(254),
    "userId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianStudent" (
    "guardianId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianStudent_pkey" PRIMARY KEY ("guardianId","studentId")
);

-- CreateTable
CREATE TABLE "TeacherClass" (
    "teacherId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherClass_pkey" PRIMARY KEY ("teacherId","classId")
);

-- CreateTable
CREATE TABLE "ParentCommunication" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "status" "ParentCommunicationStatus" NOT NULL DEFAULT 'DRAFT',
    "draftText" VARCHAR(2000),
    "draftVoiceFileId" UUID,
    "currentRevision" INTEGER NOT NULL DEFAULT 0,
    "approvedRevision" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "decisionReason" VARCHAR(1000),
    "decidedById" UUID,
    "submittedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ParentCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentCommunicationRevision" (
    "id" UUID NOT NULL,
    "communicationId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "voiceFileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentCommunicationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentCommunicationEvent" (
    "id" UUID NOT NULL,
    "communicationId" UUID NOT NULL,
    "type" "ParentCommunicationEventType" NOT NULL,
    "actorId" UUID,
    "revision" INTEGER,
    "reason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentCommunicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentCommunicationDelivery" (
    "id" UUID NOT NULL,
    "communicationId" UUID NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "status" "CommunicationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(500),
    "providerMessageId" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ParentCommunicationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "aggregateId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" VARCHAR(500),
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_userId_key" ON "Guardian"("userId");

-- CreateIndex
CREATE INDEX "Guardian_lastName_firstName_idx" ON "Guardian"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "GuardianStudent_studentId_idx" ON "GuardianStudent"("studentId");

-- CreateIndex
CREATE INDEX "TeacherClass_classId_idx" ON "TeacherClass"("classId");

-- CreateIndex
CREATE INDEX "ParentCommunication_teacherId_status_idx" ON "ParentCommunication"("teacherId", "status");

-- CreateIndex
CREATE INDEX "ParentCommunication_status_submittedAt_idx" ON "ParentCommunication"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ParentCommunication_guardianId_status_idx" ON "ParentCommunication"("guardianId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ParentCommunicationRevision_communicationId_number_key" ON "ParentCommunicationRevision"("communicationId", "number");

-- CreateIndex
CREATE INDEX "ParentCommunicationEvent_communicationId_createdAt_idx" ON "ParentCommunicationEvent"("communicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParentCommunicationDelivery_communicationId_channel_key" ON "ParentCommunicationDelivery"("communicationId", "channel");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_nextAttemptAt_idx" ON "OutboxEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_type_aggregateId_key" ON "OutboxEvent"("type", "aggregateId");

-- CreateIndex
CREATE INDEX "Notification_communicationId_idx" ON "Notification"("communicationId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "ParentCommunication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianStudent" ADD CONSTRAINT "GuardianStudent_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianStudent" ADD CONSTRAINT "GuardianStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClass" ADD CONSTRAINT "TeacherClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClass" ADD CONSTRAINT "TeacherClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunication" ADD CONSTRAINT "ParentCommunication_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunication" ADD CONSTRAINT "ParentCommunication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunication" ADD CONSTRAINT "ParentCommunication_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunication" ADD CONSTRAINT "ParentCommunication_draftVoiceFileId_fkey" FOREIGN KEY ("draftVoiceFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunication" ADD CONSTRAINT "ParentCommunication_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunicationRevision" ADD CONSTRAINT "ParentCommunicationRevision_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "ParentCommunication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunicationRevision" ADD CONSTRAINT "ParentCommunicationRevision_voiceFileId_fkey" FOREIGN KEY ("voiceFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunicationEvent" ADD CONSTRAINT "ParentCommunicationEvent_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "ParentCommunication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunicationEvent" ADD CONSTRAINT "ParentCommunicationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunicationDelivery" ADD CONSTRAINT "ParentCommunicationDelivery_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "ParentCommunication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
