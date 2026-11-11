-- 017 : communications centrées sur l'administration.
--
-- Nouvelle table Conversation (INTERNAL : un enseignant <-> l'administration ; PARENT : l'administration
-- <-> un représentant ; LEGACY_TEACHER_PARENT : archive des échanges directs 015). Chaque ligne de
-- ParentCommunication devient un message d'une conversation.
--
-- Reprise des données 015 : une archive clôturée par trio (enseignant, élève, représentant), à laquelle
-- chaque message est rattaché. Aucun message, version, événement, livraison ni notification n'est
-- modifié : seules les colonnes conversationId et authorId sont renseignées (updatedAt est géré par
-- l'application, pas par la base, et reste inchangé).
--
-- La base impose ensuite : les participants selon le type, l'immuabilité des archives et des
-- participants, la cible du lien PARENT -> INTERNAL, aucun message dans une archive ni dans une
-- conversation clôturée, au moins une version pour un message envoyé directement.

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "studentId" UUID NOT NULL,
    "teacherId" UUID,
    "guardianId" UUID,
    "createdById" UUID,
    "responsibleAdminId" UUID,
    "linkedInternalId" UUID,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMPTZ(3),
    "closedById" UUID,
    "lastMessageAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- AlterTable : participants portés par la conversation pour les messages 017 ; renseignés sur les messages 015.
ALTER TABLE "ParentCommunication" ADD COLUMN     "authorId" UUID,
ADD COLUMN     "conversationId" UUID,
ALTER COLUMN "teacherId" DROP NOT NULL,
ALTER COLUMN "studentId" DROP NOT NULL,
ALTER COLUMN "guardianId" DROP NOT NULL;

-- Reprise 015 : une archive par trio, clôturée à la date de la migration, créée à la date du premier message.
INSERT INTO "Conversation" ("id", "type", "studentId", "teacherId", "guardianId", "status", "closedAt",
                            "lastMessageAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'LEGACY_TEACHER_PARENT', m."studentId", m."teacherId", m."guardianId", 'CLOSED',
       CURRENT_TIMESTAMP, max(m."updatedAt"), min(m."createdAt"), CURRENT_TIMESTAMP
FROM "ParentCommunication" m
GROUP BY m."teacherId", m."studentId", m."guardianId";

-- Rattachement des messages et auteur : l'enseignant, ou le compte parent du représentant.
UPDATE "ParentCommunication" m
SET "conversationId" = c."id",
    "authorId" = CASE WHEN m."author" = 'TEACHER' THEN m."teacherId" ELSE g."userId" END
FROM "Conversation" c, "Guardian" g
WHERE c."type" = 'LEGACY_TEACHER_PARENT'
  AND c."teacherId" = m."teacherId"
  AND c."studentId" = m."studentId"
  AND c."guardianId" = m."guardianId"
  AND g."id" = m."guardianId";

ALTER TABLE "ParentCommunication" ALTER COLUMN "conversationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Conversation_type_status_lastMessageAt_idx" ON "Conversation"("type", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_teacherId_type_idx" ON "Conversation"("teacherId", "type");

-- CreateIndex
CREATE INDEX "Conversation_guardianId_type_idx" ON "Conversation"("guardianId", "type");

-- CreateIndex
CREATE INDEX "Conversation_studentId_idx" ON "Conversation"("studentId");

-- CreateIndex
CREATE INDEX "ParentCommunication_conversationId_createdAt_idx" ON "ParentCommunication"("conversationId", "createdAt");

-- Une seule archive par trio.
CREATE UNIQUE INDEX "Conversation_legacy_trio_key" ON "Conversation"("teacherId", "studentId", "guardianId")
  WHERE "type" = 'LEGACY_TEACHER_PARENT';

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_responsibleAdminId_fkey" FOREIGN KEY ("responsibleAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_linkedInternalId_fkey" FOREIGN KEY ("linkedInternalId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunication" ADD CONSTRAINT "ParentCommunication_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentCommunication" ADD CONSTRAINT "ParentCommunication_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Participants selon le type (FR-001, FR-002).
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_participants_check" CHECK (
  ("type" = 'INTERNAL' AND "teacherId" IS NOT NULL AND "guardianId" IS NULL)
  OR ("type" = 'PARENT' AND "guardianId" IS NOT NULL AND "teacherId" IS NULL)
  OR ("type" = 'LEGACY_TEACHER_PARENT' AND "teacherId" IS NOT NULL AND "guardianId" IS NOT NULL)
);

-- Le lien vers une conversation interne ne part que d'une conversation parent (FR-004).
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_link_check" CHECK ("linkedInternalId" IS NULL OR "type" = 'PARENT');

-- Clôturée <=> date de clôture (FR-005).
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_closed_check" CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL));

-- Un message envoyé directement a sa version 1 (FR-008).
ALTER TABLE "ParentCommunication" ADD CONSTRAINT "ParentCommunication_sent_check" CHECK ("status" <> 'SENT' OR "currentRevision" >= 1);

-- Archives en lecture seule, participants immuables, cible du lien (D3, FR-002, FR-004).
CREATE FUNCTION conversation_guard() RETURNS trigger AS $$
DECLARE
  target RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."type" = 'LEGACY_TEACHER_PARENT' THEN
      RAISE EXCEPTION 'Conversation % : une archive 015 est en lecture seule', OLD."id";
    END IF;
    IF NEW."type" IS DISTINCT FROM OLD."type" OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
       OR NEW."teacherId" IS DISTINCT FROM OLD."teacherId" OR NEW."guardianId" IS DISTINCT FROM OLD."guardianId" THEN
      RAISE EXCEPTION 'Conversation % : le type, l''élève et les participants ne changent jamais', OLD."id";
    END IF;
  ELSIF NEW."type" = 'LEGACY_TEACHER_PARENT' THEN
    RAISE EXCEPTION 'Les archives 015 ne sont créées que par la migration 0026';
  END IF;
  IF NEW."linkedInternalId" IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW."linkedInternalId" IS DISTINCT FROM OLD."linkedInternalId") THEN
    SELECT c."type", c."studentId" INTO target FROM "Conversation" c WHERE c."id" = NEW."linkedInternalId";
    IF NOT FOUND OR target."type" <> 'INTERNAL' OR target."studentId" <> NEW."studentId" THEN
      RAISE EXCEPTION 'Conversation % : le lien doit viser une conversation interne du même élève', NEW."id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Conversation_guard"
  BEFORE INSERT OR UPDATE ON "Conversation"
  FOR EACH ROW EXECUTE FUNCTION conversation_guard();

-- Aucun message dans une archive ni dans une conversation clôturée ; un message ne change pas de conversation.
CREATE FUNCTION parent_communication_conversation_guard() RETURNS trigger AS $$
DECLARE
  conv RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."conversationId" IS NOT NULL AND NEW."conversationId" IS DISTINCT FROM OLD."conversationId" THEN
      RAISE EXCEPTION 'Message % : la conversation d''un message ne change jamais', OLD."id";
    END IF;
    RETURN NEW;
  END IF;
  SELECT c."type", c."status" INTO conv FROM "Conversation" c WHERE c."id" = NEW."conversationId";
  IF FOUND AND conv."type" = 'LEGACY_TEACHER_PARENT' THEN
    RAISE EXCEPTION 'Conversation % : une archive 015 ne reçoit plus de message', NEW."conversationId";
  END IF;
  IF FOUND AND conv."status" = 'CLOSED' THEN
    RAISE EXCEPTION 'Conversation % : conversation clôturée', NEW."conversationId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ParentCommunication_conversation_guard"
  BEFORE INSERT OR UPDATE ON "ParentCommunication"
  FOR EACH ROW EXECUTE FUNCTION parent_communication_conversation_guard();

-- D6 : la surveillante générale (rôle ADMIN) soumet ses messages aux parents pour validation par défaut.
-- L'envoi direct s'accorde dans « Réglages › Permissions par rôle ».
INSERT INTO "RolePermission" ("role", "permission")
VALUES ('ADMIN', 'PARENT_COMM_SUBMIT_FOR_APPROVAL')
ON CONFLICT DO NOTHING;
