-- Historique des changements de service de restauration (cantine ou panier) d'un élève.
-- Nouvelle table seule : aucune donnée existante n'est modifiée, et les changements passés n'ayant
-- jamais été enregistrés, l'historique commence à cette migration. Retour arrière : down.sql.

-- CreateTable
CREATE TABLE "StudentMealChange" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "fromService" "MealService" NOT NULL,
    "toService" "MealService" NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentMealChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentMealChange_studentId_createdAt_idx" ON "StudentMealChange"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentMealChange" ADD CONSTRAINT "StudentMealChange_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMealChange" ADD CONSTRAINT "StudentMealChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ajout seul, comme AuditLog et RequestEvent (forbid_modification vient de 0001_init).
CREATE TRIGGER "StudentMealChange_append_only"
  BEFORE UPDATE OR DELETE ON "StudentMealChange"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER "StudentMealChange_no_truncate"
  BEFORE TRUNCATE ON "StudentMealChange"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();
