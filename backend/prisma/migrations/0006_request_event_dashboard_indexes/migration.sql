-- Tableau de bord du super administrateur : index de lecture sur l'historique des demandes.
-- - "seq" : fil d'activité trié par ordre d'écriture (ORDER BY seq DESC, curseur seq < x) sans
--   parcourir toute la table ;
-- - ("actorId", "createdAt") : dernière action de chaque employé.
-- Index seuls : aucune donnée modifiée. Retour arrière : down.sql.

-- CreateIndex
CREATE INDEX "RequestEvent_seq_idx" ON "RequestEvent"("seq");

-- CreateIndex
CREATE INDEX "RequestEvent_actorId_createdAt_idx" ON "RequestEvent"("actorId", "createdAt");
