-- Affectations des surveillants (004), étape 2 sur 2 : reprise des données, une transaction
-- (Prisma envoie le fichier en une seule requête : PostgreSQL l'exécute en transaction implicite ;
-- pas de BEGIN/COMMIT explicite, qui masquerait le message des garde-fous).
-- Voir specs/004-retards-affectation-surveillants/contracts/migration.md (étape 2) et research.md R1, R7, R8.
-- Préalable : rapport de pré-contrôle (npm run preflight:supervision -w backend) et validations V1 à V3.
-- Aucune ligne de RequestEvent ni d'AuditLog n'est modifiée ni supprimée : chaque changement de
-- statut AJOUTE un événement (acteur SYSTEM, commentaire « migration-0009 »), repère du retour arrière.
-- Retour arrière : down.sql (manuel).
--
-- « Journée non terminée » est évaluée dans le fuseau Europe/Paris (défaut de SCHOOL_TIMEZONE) :
-- le SQL ne lit pas la configuration de l'API.

-- 1. Garde-fous : gardes sans équivalent évident (V2) et noms de groupe déjà pris.
DO $$
DECLARE
  unmatched text;
BEGIN
  SELECT string_agg(r."reference" || ' (' || r."status"::text || ')', ', ' ORDER BY r."reference")
    INTO unmatched
  FROM "Request" r
  LEFT JOIN "CoverageDetail" d ON d."requestId" = r."id"
  WHERE r."kind" = 'COVERAGE'
    AND (d."requestId" IS NULL
      OR r."status"::text NOT IN ('BROADCAST', 'UNFILLED', 'ACCEPTED', 'EN_ROUTE', 'LATE', 'ON_DUTY',
                                  'RELIEF_PENDING', 'DONE', 'CLOSED', 'CANCELLED')
      OR (r."status" = 'UNFILLED' AND d."plannedEndAt" IS NULL
          AND (d."startAt" AT TIME ZONE 'Europe/Paris')::date >= (now() AT TIME ZONE 'Europe/Paris')::date));
  IF unmatched IS NOT NULL THEN
    RAISE EXCEPTION 'Gardes sans équivalent évident, décision requise (validation V2) : %', unmatched;
  END IF;

  IF EXISTS (SELECT 1 FROM "EmployeeGroup" WHERE "name" IN ('Surveillants', 'Enseignants')) THEN
    RAISE EXCEPTION 'Un groupe porte déjà le nom « Surveillants » ou « Enseignants » : décision humaine requise avant la migration.';
  END IF;
END $$;

-- 2. Rôle : Responsable -> Admin (met à jour User.role, Category.creatorRoles, RolePermission).
ALTER TYPE "Role" RENAME VALUE 'MANAGER' TO 'ADMIN';

-- 3. Groupes à clé système, membres conservés (R7).
UPDATE "EmployeeGroup"
SET "name" = 'Surveillants', "systemKey" = 'SUPERVISORS', "updatedAt" = now()
WHERE "name" = 'Surveillants/Remplaçants';

INSERT INTO "EmployeeGroup" ("id", "name", "active", "systemKey", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Surveillants', true, 'SUPERVISORS', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "EmployeeGroup" WHERE "systemKey" = 'SUPERVISORS');

INSERT INTO "EmployeeGroup" ("id", "name", "active", "systemKey", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Enseignants', true, 'TEACHERS', now(), now());

-- 4. Gardes ouvertes -> « en attente » : diffusées, et non pourvues dont le créneau n'est pas fini
--    (FR-011c). Les délais d'origine sont conservés dans l'événement pour le retour arrière.
CREATE TEMP TABLE "migration_0009_open" ON COMMIT DROP AS
SELECT r."id", r."status"::text AS "fromStatus", r."currentStage", r."currentDueAt", r."warnAt", r."overdueStage",
       r."categoryId", r."priority", d."startAt"
FROM "Request" r
JOIN "CoverageDetail" d ON d."requestId" = r."id"
WHERE r."kind" = 'COVERAGE'
  AND (r."status" = 'BROADCAST' OR (r."status" = 'UNFILLED' AND d."plannedEndAt" > now()));

INSERT INTO "RequestEvent" ("id", "requestId", "actorId", "type", "fromValue", "toValue", "comment")
SELECT gen_random_uuid(), o."id", NULL, 'STATUS_CHANGED',
       jsonb_build_object('status', o."fromStatus", 'currentStage', o."currentStage", 'currentDueAt', o."currentDueAt",
                          'warnAt', o."warnAt", 'overdueStage', o."overdueStage"),
       jsonb_build_object('status', 'PENDING'),
       'migration-0009'
FROM "migration_0009_open" o;

UPDATE "Request" r
SET "status" = 'PENDING', "currentStage" = NULL, "currentDueAt" = NULL, "warnAt" = NULL, "overdueStage" = NULL,
    "version" = r."version" + 1, "updatedAt" = now()
FROM "migration_0009_open" o
WHERE r."id" = o."id";

-- Délai de prise en charge (R3) : max(maintenant, début - 60 min) + délai de la catégorie (2 min par défaut).
INSERT INTO "CoverageReminder" ("id", "requestId", "kind", "dueAt")
SELECT gen_random_uuid(), o."id", 'TAKEOVER',
       GREATEST(now(), o."startAt" - interval '60 minutes') + make_interval(mins => COALESCE(dr."takeoverMinutes", 2))
FROM "migration_0009_open" o
LEFT JOIN "DeadlineRule" dr ON dr."categoryId" = o."categoryId" AND dr."priority" = o."priority";

-- 5. Source des gardes existantes ; type inconnu (null), enseignant en texte libre conservé.
UPDATE "CoverageDetail" SET "source" = 'ADMIN_DIRECT' WHERE "source" IS NULL;

-- 6. Compte de démonstration : seulement s'il porte encore le nom du seed et si « admin » est libre.
UPDATE "User"
SET "username" = 'admin', "updatedAt" = now()
WHERE "username" = 'responsable' AND "displayName" = 'Responsable administratif'
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "username" = 'admin');

-- 7. Compte technique de l'anonymisation : inactif, mot de passe inutilisable (R5).
INSERT INTO "User" ("id", "username", "displayName", "jobTitle", "role", "passwordHash", "mustChangePassword", "active",
                    "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'enseignant-anonymise', 'Enseignant anonymisé', NULL, 'EMPLOYEE', '!', true, false, now(), now())
ON CONFLICT ("username") DO NOTHING;

-- 8. Réglages des affectations (data-model §3).
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('coverageUrgencyThresholdMinutes', '60'::jsonb, now()),
       ('coverageEscalationMinutes', '5'::jsonb, now()),
       ('coverageMorningReminderTime', '"07:00"'::jsonb, now()),
       ('coverageCloseReminderMinutes', '10'::jsonb, now()),
       ('coverageCloseEscalationMinutes', '10'::jsonb, now()),
       ('coverageSupportReminderMinutes', '10'::jsonb, now()),
       ('coverageSupportReminderMax', '3'::jsonb, now()),
       ('coverageRetentionMonths', '12'::jsonb, now())
ON CONFLICT ("key") DO NOTHING;
