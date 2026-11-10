-- Deux priorités métier : URGENT et NORMAL (016, accueil de l'enseignant).
-- Correspondance : MEDIUM vers NORMAL, HIGH vers URGENT (une demande « Haute » ne doit pas perdre son
-- caractère pressant). Prisma envoie le fichier en une seule requête : PostgreSQL l'exécute en
-- transaction implicite (pas de BEGIN/COMMIT explicite, voir 0009).
--
-- Aucune ligne de RequestEvent ni d'AuditLog n'est modifiée ni supprimée :
--   * chaque demande convertie reçoit un événement PRIORITY_CHANGED (acteur système, commentaire
--     « migration-0024 ») : l'historique reste complet et down.sql s'en sert pour rendre la priorité
--     d'origine ;
--   * les délais des priorités retirées sont copiés au journal d'audit (DEADLINE_RULE_CHANGED, une
--     entrée par catégorie, détails « before » / « after ») avant leur suppression.
-- Les échéances en cours ne sont pas recalculées (instantané des règles et échéance conservés). La
-- version de chaque demande convertie est incrémentée : une page ouverte sur l'ancienne priorité est
-- invitée à se recharger avant toute action.
-- Retour arrière : down.sql (manuel).

-- 1. Historique des demandes converties (brouillons compris).
INSERT INTO "RequestEvent" ("id", "requestId", "actorId", "type", "fromValue", "toValue", "comment")
SELECT gen_random_uuid(), r."id", NULL, 'PRIORITY_CHANGED',
       jsonb_build_object('priority', r."priority"::text, 'dueAt', due."at"),
       jsonb_build_object('priority', CASE r."priority" WHEN 'MEDIUM' THEN 'NORMAL' ELSE 'URGENT' END, 'dueAt', due."at"),
       'migration-0024'
FROM "Request" r
CROSS JOIN LATERAL (
  SELECT to_char(r."currentDueAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "at"
) due
WHERE r."priority" IN ('MEDIUM', 'HIGH')
ORDER BY r."createdAt", r."id";

-- 2. Délais des priorités retirées, copiés au journal d'audit (même forme que l'écran d'administration).
INSERT INTO "AuditLog" ("id", "actorId", "action", "targetType", "targetId", "details")
SELECT gen_random_uuid(), NULL, 'DEADLINE_RULE_CHANGED', 'Category', d."categoryId"::text,
       jsonb_build_object(
         'migration', '0024_two_priorities',
         'before', jsonb_agg(jsonb_build_object(
           'priority', d."priority"::text,
           'validationMinutes', d."validationMinutes",
           'takeoverMinutes', d."takeoverMinutes",
           'completionMinutes', d."completionMinutes",
           'arrivalMinutes', d."arrivalMinutes") ORDER BY d."priority"),
         'after', COALESCE(jsonb_agg(jsonb_build_object(
           'priority', d."priority"::text,
           'validationMinutes', d."validationMinutes",
           'takeoverMinutes', d."takeoverMinutes",
           'completionMinutes', d."completionMinutes",
           'arrivalMinutes', d."arrivalMinutes") ORDER BY d."priority") FILTER (WHERE d."priority" IN ('NORMAL', 'URGENT')), '[]'::jsonb))
FROM "DeadlineRule" d
GROUP BY d."categoryId"
HAVING bool_or(d."priority" IN ('MEDIUM', 'HIGH'));

-- 3. Conversion des données.
UPDATE "Request"
SET "priority" = CASE "priority" WHEN 'MEDIUM' THEN 'NORMAL'::"Priority" ELSE 'URGENT'::"Priority" END,
    "version" = "version" + 1,
    "updatedAt" = now()
WHERE "priority" IN ('MEDIUM', 'HIGH');

UPDATE "Notification"
SET "priority" = CASE "priority" WHEN 'MEDIUM' THEN 'NORMAL'::"Priority" ELSE 'URGENT'::"Priority" END
WHERE "priority" IN ('MEDIUM', 'HIGH');

DELETE FROM "DeadlineRule" WHERE "priority" IN ('MEDIUM', 'HIGH');

-- 4. Énumération réduite à deux valeurs.
ALTER TYPE "Priority" RENAME TO "Priority_old";
CREATE TYPE "Priority" AS ENUM ('NORMAL', 'URGENT');
ALTER TABLE "DeadlineRule" ALTER COLUMN "priority" TYPE "Priority" USING ("priority"::text::"Priority");
ALTER TABLE "Request" ALTER COLUMN "priority" TYPE "Priority" USING ("priority"::text::"Priority");
ALTER TABLE "Notification" ALTER COLUMN "priority" TYPE "Priority" USING ("priority"::text::"Priority");
DROP TYPE "Priority_old";
