-- Retire les responsables de catégorie restés sur des comptes rétrogradés en employés : le rôle a
-- changé sans que ces lignes suivent, et elles donnaient encore accès aux demandes de la catégorie.
-- Le code refuse désormais de créer cette situation. Retour arrière : down.sql.

DELETE FROM "CategoryManager" m
USING "User" u
WHERE u."id" = m."userId" AND u."role" = 'EMPLOYEE';
