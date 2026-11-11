-- Retour arrière de 0027_communications_voice_only (non exécuté par Prisma).
--
-- Rétablit le texte obligatoire des versions. Refusé s'il existe une version sans texte (vocal seul,
-- 017) : les versions sont en ajout seul et ne peuvent pas être complétées ; restaurer la sauvegarde
-- prise avant la migration. À exécuter avant le down.sql de 0026_communications_conversations.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0027_communications_voice_only/down.sql --schema prisma/schema.prisma

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ParentCommunicationRevision" WHERE "text" IS NULL) THEN
    RAISE EXCEPTION 'Retour arrière 0027 refusé : des versions sans texte (vocal seul, 017) existent. Restaurez la sauvegarde prise avant la migration 0027.';
  END IF;
END $$;

ALTER TABLE "ParentCommunicationRevision" DROP CONSTRAINT IF EXISTS "ParentCommunicationRevision_content_check";
ALTER TABLE "ParentCommunicationRevision" ALTER COLUMN "text" SET NOT NULL;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0027_communications_voice_only';

COMMIT;
