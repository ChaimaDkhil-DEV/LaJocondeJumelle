-- Retour arrière de 0018_clean_stale_category_managers (non exécuté par Prisma).
--
-- Ce script ne recrée AUCUNE ligne : elles donnaient un accès indu et ne doivent pas revenir. Pour les
-- retrouver malgré tout, restaurez la sauvegarde prise avant la migration. Le script retire seulement
-- la ligne de suivi Prisma ; un `prisma migrate deploy` ultérieur réappliquera la migration, sans effet
-- sur une base propre.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0018_clean_stale_category_managers/down.sql --schema prisma/schema.prisma

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0018_clean_stale_category_managers';
