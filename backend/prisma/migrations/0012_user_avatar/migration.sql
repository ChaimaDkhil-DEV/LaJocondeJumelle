-- Photo de profil (avatars). Chaque compte, existant ou futur, a l'avatar par défaut (DEFAULT,
-- avatarUrl nul) : l'interface le calcule (initiales sur une couleur stable), sans fichier.
-- Une photo choisie (CUSTOM) est servie par GET /api/users/:id/avatar ; avatarUrl en garde
-- l'adresse versionnée.

-- CreateEnum
CREATE TYPE "AvatarType" AS ENUM ('DEFAULT', 'CUSTOM');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarType" "AvatarType" NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN     "avatarUrl" VARCHAR(255);
