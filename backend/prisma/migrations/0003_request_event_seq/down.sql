-- Retour arrière de 0003_request_event_seq (non exécuté par Prisma).
--
-- Retire la colonne d'ordre d'écriture « seq » de l'historique. Aucune donnée métier n'est perdue :
-- seul l'ordre de départage des événements de même horodatage disparaît. Le trigger « append-only »
-- (UPDATE, DELETE) n'est pas concerné par un DROP COLUMN.
--
-- Ordre : exécuter d'abord le down.sql de 0006_request_event_dashboard_indexes (index sur « seq »),
-- puis déployer la version précédente de l'application (le code actuel lit « seq »).
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0003_request_event_seq/down.sql --schema prisma/schema.prisma
-- La ligne de suivi Prisma est retirée en fin de script : un `prisma migrate deploy` ultérieur
-- réappliquera la migration.

BEGIN;

DROP INDEX IF EXISTS "RequestEvent_seq_idx";
ALTER TABLE "RequestEvent" DROP COLUMN "seq";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0003_request_event_seq';

COMMIT;
