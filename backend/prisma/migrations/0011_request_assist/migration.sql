-- Assistance IA à la création des demandes (spec 009) : consignes rédigées par le super
-- administrateur (Guideline), événement d'historique des propositions retenues à l'envoi
-- (ASSIST_SUGGESTED) et action d'audit des consignes (GUIDELINE_CHANGED, sans le texte).
-- Ajouts seuls : aucune donnée existante modifiée. Retour arrière : down.sql (refusé si les
-- nouvelles valeurs ont déjà servi, l'historique et le journal d'audit ne se réécrivent pas).

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'GUIDELINE_CHANGED';

-- AlterEnum
ALTER TYPE "RequestEventType" ADD VALUE 'ASSIST_SUGGESTED';

-- CreateTable
CREATE TABLE "Guideline" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "categoryId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Guideline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Guideline_active_categoryId_idx" ON "Guideline"("active", "categoryId");

-- AddForeignKey
ALTER TABLE "Guideline" ADD CONSTRAINT "Guideline_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guideline" ADD CONSTRAINT "Guideline_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
