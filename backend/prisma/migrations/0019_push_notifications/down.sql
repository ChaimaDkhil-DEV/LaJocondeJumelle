-- Retour arrière de 0019_push_notifications (non exécuté par Prisma).
--
-- Supprime les deux tables de la spec 014 et leurs données : abonnements push des appareils et
-- préférences de notification. Après une réapplication, chaque appareil doit être réabonné et les
-- préférences reprennent leurs valeurs par défaut. Aucune autre table n'est touchée ; aucune migration
-- ne dépend de ces tables : ce script s'exécute en premier.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0019_push_notifications/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DROP TABLE IF EXISTS "PushSubscription";

DROP TABLE IF EXISTS "NotificationPreference";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0019_push_notifications';

COMMIT;
