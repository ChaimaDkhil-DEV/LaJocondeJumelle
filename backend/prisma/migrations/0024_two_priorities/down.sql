-- Retour arrière de 0024_two_priorities (non exécuté par Prisma).
--
-- Rétablit les quatre priorités (NORMAL, MEDIUM, HIGH, URGENT), puis :
--   * rend aux demandes converties leur priorité d'origine, lue dans l'événement PRIORITY_CHANGED
--     « migration-0024 ». Une demande dont la priorité a été changée depuis (son dernier événement
--     PRIORITY_CHANGED n'est pas celui de la migration) garde la priorité choisie. Chaque retour
--     ajoute un événement PRIORITY_CHANGED « migration-0024-down » : l'historique n'est jamais réécrit ;
--   * recrée les délais MEDIUM et HIGH de chaque catégorie, avec les valeurs copiées au journal
--     d'audit par la migration ; à défaut (catégorie créée depuis), les délais par défaut de
--     l'application (src/categories/category-defaults.ts de la version précédente).
-- Les notifications converties restent en NORMAL ou URGENT (valeurs toujours valides).
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0024_two_priorities/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

-- 1. Énumération à quatre valeurs.
ALTER TYPE "Priority" RENAME TO "Priority_two";
CREATE TYPE "Priority" AS ENUM ('NORMAL', 'MEDIUM', 'HIGH', 'URGENT');
ALTER TABLE "DeadlineRule" ALTER COLUMN "priority" TYPE "Priority" USING ("priority"::text::"Priority");
ALTER TABLE "Request" ALTER COLUMN "priority" TYPE "Priority" USING ("priority"::text::"Priority");
ALTER TABLE "Notification" ALTER COLUMN "priority" TYPE "Priority" USING ("priority"::text::"Priority");
DROP TYPE "Priority_two";

-- 2. Priorité d'origine des demandes converties et pas changées depuis.
WITH latest AS (
  SELECT DISTINCT ON (e."requestId") e."requestId", e."comment", e."fromValue", e."toValue"
  FROM "RequestEvent" e
  WHERE e."type" = 'PRIORITY_CHANGED'
  ORDER BY e."requestId", e."seq" DESC
), restored AS (
  UPDATE "Request" r
  SET "priority" = (l."fromValue"->>'priority')::"Priority",
      "version" = r."version" + 1,
      "updatedAt" = now()
  FROM latest l
  WHERE l."requestId" = r."id"
    AND l."comment" = 'migration-0024'
    AND r."priority"::text = l."toValue"->>'priority'
  RETURNING r."id", r."priority", r."createdAt", l."toValue"->>'priority' AS "migrated",
            to_char(r."currentDueAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "dueAt"
)
INSERT INTO "RequestEvent" ("id", "requestId", "actorId", "type", "fromValue", "toValue", "comment")
SELECT gen_random_uuid(), x."id", NULL, 'PRIORITY_CHANGED',
       jsonb_build_object('priority', x."migrated", 'dueAt', x."dueAt"),
       jsonb_build_object('priority', x."priority"::text, 'dueAt', x."dueAt"),
       'migration-0024-down'
FROM restored x
ORDER BY x."createdAt", x."id";

-- 3. Délais MEDIUM et HIGH : valeurs copiées par la migration, sinon délais par défaut.
WITH saved AS (
  SELECT DISTINCT ON (a."targetId") a."targetId" AS "categoryId", a."details"->'before' AS "rules"
  FROM "AuditLog" a
  WHERE a."action" = 'DEADLINE_RULE_CHANGED' AND a."details"->>'migration' = '0024_two_priorities'
  ORDER BY a."targetId", a."createdAt" DESC
), missing AS (
  SELECT c."id" AS "categoryId", c."kind", c."circuit", p."priority"
  FROM "Category" c
  CROSS JOIN (VALUES ('MEDIUM'), ('HIGH')) AS p("priority")
  WHERE NOT EXISTS (
    SELECT 1 FROM "DeadlineRule" d WHERE d."categoryId" = c."id" AND d."priority"::text = p."priority"
  )
)
INSERT INTO "DeadlineRule" ("id", "categoryId", "priority", "validationMinutes", "takeoverMinutes", "completionMinutes", "arrivalMinutes")
SELECT gen_random_uuid(), m."categoryId", m."priority"::"Priority",
       CASE WHEN rule.value IS NOT NULL THEN (rule.value->>'validationMinutes')::int
            WHEN m."kind" = 'COVERAGE' OR m."circuit" = 'A_DIRECT' THEN NULL
            WHEN m."priority" = 'MEDIUM' THEN 480 ELSE 120 END,
       CASE WHEN rule.value IS NOT NULL THEN (rule.value->>'takeoverMinutes')::int
            WHEN m."kind" = 'COVERAGE' THEN 2
            WHEN m."priority" = 'MEDIUM' THEN 480 ELSE 120 END,
       CASE WHEN rule.value IS NOT NULL THEN (rule.value->>'completionMinutes')::int
            WHEN m."kind" = 'COVERAGE' THEN NULL
            WHEN m."priority" = 'MEDIUM' THEN 2880 ELSE 1440 END,
       CASE WHEN rule.value IS NOT NULL THEN (rule.value->>'arrivalMinutes')::int
            WHEN m."kind" = 'COVERAGE' THEN 5
            ELSE NULL END
FROM missing m
LEFT JOIN saved s ON s."categoryId" = m."categoryId"::text
LEFT JOIN LATERAL (
  SELECT r AS value FROM jsonb_array_elements(s."rules") r WHERE r->>'priority' = m."priority" LIMIT 1
) rule ON true;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0024_two_priorities';

COMMIT;
