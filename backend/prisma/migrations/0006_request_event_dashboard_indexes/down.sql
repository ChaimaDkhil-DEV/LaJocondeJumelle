-- Retour arrière de 0006_request_event_dashboard_indexes.
BEGIN;

DROP INDEX IF EXISTS "RequestEvent_actorId_createdAt_idx";
DROP INDEX IF EXISTS "RequestEvent_seq_idx";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0006_request_event_dashboard_indexes';

COMMIT;
