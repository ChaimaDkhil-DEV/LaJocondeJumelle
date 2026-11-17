-- Responsable administratif d'une demande et transferts entre administrateurs (018).
-- Migration additive : deux colonnes nullables sur "Request" (responsable et date), l'historique des
-- responsables "RequestAssignment" (ajout seul), les propositions de transfert "RequestTransfer" et sept
-- types de notification. Aucune ligne existante n'est réécrite : toutes les demandes restent libres
-- ("adminOwnerId" NULL). Retour arrière : down.sql.

-- CreateEnum
CREATE TYPE "RequestAssignmentOperation" AS ENUM ('CLAIMED', 'REASSIGNED', 'RELEASED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "RequestTransferType" AS ENUM ('TAKEOVER_REQUEST', 'DELEGATION_REQUEST');

-- CreateEnum
CREATE TYPE "RequestTransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RequestTransferCancelCause" AS ENUM ('INITIATOR', 'REQUEST_FINISHED', 'OWNER_CHANGED', 'REASSIGNED_BY_SUPER_ADMIN', 'PARTICIPANT_UNAVAILABLE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TRANSFER_TAKEOVER_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'TRANSFER_DELEGATION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'TRANSFER_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'TRANSFER_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'TRANSFER_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'TRANSFER_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_OWNER_REASSIGNED';

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "adminOwnedAt" TIMESTAMPTZ(3),
ADD COLUMN     "adminOwnerId" UUID;

-- CreateTable
CREATE TABLE "RequestAssignment" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "previousAdminId" UUID,
    "actorId" UUID NOT NULL,
    "operation" "RequestAssignmentOperation" NOT NULL,
    "reason" VARCHAR(500),
    "transferId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" BIGSERIAL NOT NULL,

    CONSTRAINT "RequestAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestTransfer" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "initiatorId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "currentOwnerId" UUID NOT NULL,
    "type" "RequestTransferType" NOT NULL,
    "status" "RequestTransferStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(500) NOT NULL,
    "responseReason" VARCHAR(500),
    "cancelCause" "RequestTransferCancelCause",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),

    CONSTRAINT "RequestTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestAssignment_requestId_seq_idx" ON "RequestAssignment"("requestId", "seq");

-- CreateIndex
CREATE INDEX "RequestAssignment_adminId_createdAt_idx" ON "RequestAssignment"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestAssignment_previousAdminId_createdAt_idx" ON "RequestAssignment"("previousAdminId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestTransfer_requestId_status_idx" ON "RequestTransfer"("requestId", "status");

-- CreateIndex
CREATE INDEX "RequestTransfer_recipientId_status_idx" ON "RequestTransfer"("recipientId", "status");

-- CreateIndex
CREATE INDEX "RequestTransfer_initiatorId_status_idx" ON "RequestTransfer"("initiatorId", "status");

-- CreateIndex
CREATE INDEX "Request_adminOwnerId_status_idx" ON "Request"("adminOwnerId", "status");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_adminOwnerId_fkey" FOREIGN KEY ("adminOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignment" ADD CONSTRAINT "RequestAssignment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignment" ADD CONSTRAINT "RequestAssignment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignment" ADD CONSTRAINT "RequestAssignment_previousAdminId_fkey" FOREIGN KEY ("previousAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignment" ADD CONSTRAINT "RequestAssignment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignment" ADD CONSTRAINT "RequestAssignment_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "RequestTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTransfer" ADD CONSTRAINT "RequestTransfer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTransfer" ADD CONSTRAINT "RequestTransfer_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTransfer" ADD CONSTRAINT "RequestTransfer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTransfer" ADD CONSTRAINT "RequestTransfer_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Garanties que le schéma Prisma ne sait pas exprimer (data-model.md).
-- ---------------------------------------------------------------------------

-- Responsable et date vont ensemble : tous deux NULL (demande libre) ou tous deux renseignés.
ALTER TABLE "Request" ADD CONSTRAINT "Request_admin_owner_pair"
  CHECK (("adminOwnerId" IS NULL) = ("adminOwnedAt" IS NULL));

-- Une seule proposition en attente par demande (FR-013) : garantie par la base, pas seulement par le service.
CREATE UNIQUE INDEX "RequestTransfer_one_pending" ON "RequestTransfer"("requestId") WHERE "status" = 'PENDING';

-- Jamais de proposition à soi-même.
ALTER TABLE "RequestTransfer" ADD CONSTRAINT "RequestTransfer_not_self"
  CHECK ("initiatorId" <> "recipientId");

-- Demande de reprise : adressée au responsable. Délégation : proposée par le responsable.
ALTER TABLE "RequestTransfer" ADD CONSTRAINT "RequestTransfer_type_owner"
  CHECK (
    ("type" = 'TAKEOVER_REQUEST' AND "recipientId" = "currentOwnerId")
    OR ("type" = 'DELEGATION_REQUEST' AND "initiatorId" = "currentOwnerId")
  );

-- Historique des responsables en ajout seul, comme "RequestEvent" et "AuditLog" (fonction de 0001_init).
CREATE TRIGGER "RequestAssignment_append_only"
  BEFORE UPDATE OR DELETE ON "RequestAssignment"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER "RequestAssignment_no_truncate"
  BEFORE TRUNCATE ON "RequestAssignment"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();
