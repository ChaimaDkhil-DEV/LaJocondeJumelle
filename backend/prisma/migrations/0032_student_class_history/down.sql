-- Retour arrière de 0032_student_class_history (non exécuté par Prisma).
--
-- Rien à annuler avant : 0032 est la dernière migration. Ce script retire ce que la migration a créé : la table
-- "StudentClassHistory", l'index de lecture du journal par cible et la valeur d'audit STUDENT_SITUATION_VIEWED.
-- Il ne supprime AUCUNE donnée utile : il s'arrête si une ligne a été écrite après la mise en service (un
-- changement de classe, ou un élève créé depuis) ou si la valeur d'audit a déjà servi (le journal d'audit est en
-- ajout seul et ne se réécrit pas). Seules les lignes reconstituées par la migration sont retirées avec la table :
-- elles se recalculent depuis la classe actuelle. Dans le cas contraire, le seul retour arrière fiable est la
-- restauration de la sauvegarde prise avant la migration. Les élèves ne sont pas touchés.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0032_student_class_history/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. **Redémarrez l'API** : ses connexions ouvertes gardent
-- en mémoire l'ancien type d'énumération "AuditAction", supprimé puis recréé ici. La ligne de suivi Prisma est
-- retirée en fin de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "StudentClassHistory" WHERE NOT "reconstructed") THEN
    RAISE EXCEPTION 'Des changements de classe ont été enregistrés depuis la mise en service : restaurez la sauvegarde prise avant la migration 0032_student_class_history.';
  END IF;
  IF EXISTS (SELECT 1 FROM "AuditLog" WHERE "action"::text = 'STUDENT_SITUATION_VIEWED') THEN
    RAISE EXCEPTION 'Des consultations de situation sont journalisées (STUDENT_SITUATION_VIEWED) : le journal d''audit ne se réécrit pas. Restaurez la sauvegarde prise avant la migration.';
  END IF;
END $$;

-- Seules des lignes reconstituées subsistent : on retire d'abord les déclencheurs qui interdisent la suppression.
DROP TRIGGER IF EXISTS "StudentClassHistory_append_only" ON "StudentClassHistory";
DROP TRIGGER IF EXISTS "StudentClassHistory_no_truncate" ON "StudentClassHistory";
DROP TABLE IF EXISTS "StudentClassHistory";

DROP INDEX IF EXISTS "AuditLog_targetType_targetId_createdAt_idx";

-- PostgreSQL ne retire pas une valeur d'énumération : "AuditAction" est recréée avec toutes ses valeurs actuelles,
-- dans le même ordre, sauf STUDENT_SITUATION_VIEWED.
DO $$
DECLARE
  labels text;
BEGIN
  SELECT string_agg(quote_literal(e."enumlabel"), ', ' ORDER BY e."enumsortorder") INTO labels
  FROM pg_enum e JOIN pg_type t ON t."oid" = e."enumtypid"
  WHERE t."typname" = 'AuditAction' AND e."enumlabel" <> 'STUDENT_SITUATION_VIEWED';
  ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
  EXECUTE format('CREATE TYPE "AuditAction" AS ENUM (%s)', labels);
  ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::text::"AuditAction";
  DROP TYPE "AuditAction_old";
END $$;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0032_student_class_history';

COMMIT;
