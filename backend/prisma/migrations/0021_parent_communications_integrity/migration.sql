-- Communication enseignant / parents (015) : règles d'intégrité que Prisma ne génère pas.

-- Une notification est rattachée soit à une demande, soit à une communication aux parents : jamais aux deux,
-- jamais à aucune. Les notifications existantes ont toutes une demande.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_target_check"
  CHECK (("requestId" IS NOT NULL) <> ("communicationId" IS NOT NULL));

-- Une version soumise n'est jamais modifiée, et l'historique des décisions est conservé : ajout seul,
-- comme AuditLog, RequestEvent et StudentMealChange (forbid_modification vient de 0001_init).
CREATE TRIGGER "ParentCommunicationRevision_append_only"
  BEFORE UPDATE OR DELETE ON "ParentCommunicationRevision"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER "ParentCommunicationRevision_no_truncate"
  BEFORE TRUNCATE ON "ParentCommunicationRevision"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER "ParentCommunicationEvent_append_only"
  BEFORE UPDATE OR DELETE ON "ParentCommunicationEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER "ParentCommunicationEvent_no_truncate"
  BEFORE TRUNCATE ON "ParentCommunicationEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

-- Un numéro de version est positif, et la version approuvée ne dépasse jamais la dernière soumise.
ALTER TABLE "ParentCommunicationRevision" ADD CONSTRAINT "ParentCommunicationRevision_number_check" CHECK ("number" >= 1);
ALTER TABLE "ParentCommunication" ADD CONSTRAINT "ParentCommunication_revision_check"
  CHECK ("approvedRevision" IS NULL OR ("approvedRevision" >= 1 AND "approvedRevision" <= "currentRevision"));
