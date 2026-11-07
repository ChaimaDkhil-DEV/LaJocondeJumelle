-- Suppression de "CoverageTarget" : l'application ne l'écrit plus depuis la fin de la diffusion des
-- gardes (004) et ne la lit plus. Ses anciennes lignes seraient de l'historique : la migration
-- s'arrête s'il en existe, sans rien modifier. Retour arrière : down.sql.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "CoverageTarget") THEN
    RAISE EXCEPTION 'CoverageTarget contient des lignes : suppression refusée pour ne pas perdre cet historique. Exportez-les ou décidez de leur sort, puis redéployez.';
  END IF;
END $$;

-- DropTable (ses clés étrangères et son index disparaissent avec elle)
DROP TABLE "CoverageTarget";
