-- Retour arrière de 0017_drop_coverage_target (non exécuté par Prisma).
--
-- Recrée la table vide, avec son index et ses clés étrangères : la migration ne s'applique qu'à une
-- table vide, aucune donnée n'est donc à reconstituer. À exécuter avant le down.sql de 0009, qui lit
-- cette table.
--
-- Usage :
--   npx prisma db execute --file prisma/migrations/0017_drop_coverage_target/down.sql --schema prisma/schema.prisma
-- puis redéployer la version précédente de l'application. La ligne de suivi Prisma est retirée en fin
-- de script : un `prisma migrate deploy` ultérieur réappliquera la migration.

BEGIN;

CREATE TABLE "CoverageTarget" (
    "requestId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageTarget_pkey" PRIMARY KEY ("requestId","groupId")
);

CREATE INDEX "CoverageTarget_groupId_idx" ON "CoverageTarget"("groupId");

ALTER TABLE "CoverageTarget" ADD CONSTRAINT "CoverageTarget_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CoverageDetail"("requestId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoverageTarget" ADD CONSTRAINT "CoverageTarget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "EmployeeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '0017_drop_coverage_target';

COMMIT;
