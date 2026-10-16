-- Notifications du super administrateur (demandes de travail) : trois alertes seulement, une fois
-- par demande et par type. Les marqueurs sont posés par mise à jour conditionnelle (aucun doublon,
-- même avec plusieurs instances du job). Ajouts seuls : aucune donnée existante n'est modifiée.
-- Retour arrière : down.sql (voir son en-tête).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'UNASSIGNED';

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "superAdminOverdueNotifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "superAdminUnassignedNotifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "superAdminUrgentNotifiedAt" TIMESTAMPTZ(3);
