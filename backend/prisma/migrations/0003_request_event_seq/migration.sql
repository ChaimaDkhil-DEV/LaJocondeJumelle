-- N3 : ordre d'écriture des événements d'historique, pour départager ceux de même horodatage
-- (deux événements d'une même transaction tombent souvent dans la même milliseconde).
-- Ajout de colonne seul : le trigger « append-only » (UPDATE, DELETE) n'est pas déclenché.
ALTER TABLE "RequestEvent" ADD COLUMN "seq" BIGSERIAL NOT NULL;
