-- 017 (FR-007) : un message porte un texte, un vocal, ou les deux. Le texte d'une version devient
-- facultatif ; la base exige au moins un texte non vide ou un vocal. Les versions 015 (texte
-- toujours renseigné) respectent déjà cette règle.

-- AlterTable
ALTER TABLE "ParentCommunicationRevision" ALTER COLUMN "text" DROP NOT NULL;

ALTER TABLE "ParentCommunicationRevision" ADD CONSTRAINT "ParentCommunicationRevision_content_check"
  CHECK (("text" IS NOT NULL AND btrim("text") <> '') OR "voiceFileId" IS NOT NULL);
