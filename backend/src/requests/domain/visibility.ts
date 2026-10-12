import type { Prisma } from '@prisma/client';
import type { PolicyUser } from './access-policy';

/**
 * Équivalent SQL (filtre Prisma) de canReadRequest, pour les listes, la recherche et les compteurs :
 * - brouillons : auteur uniquement ;
 * - autres statuts : demandeur, employé affecté actuel, responsables de la catégorie ;
 * - super administrateur : toutes les demandes hors brouillons des autres.
 * Un compte désactivé ne voit rien.
 */
export function visibleRequestsWhere(user: Pick<PolicyUser, 'id' | 'role' | 'active'>): Prisma.RequestWhereInput {
  if (!user.active) return { id: { in: [] } };

  const notOthersDrafts: Prisma.RequestWhereInput = {
    OR: [{ status: { not: 'DRAFT' } }, { requesterId: user.id }],
  };

  if (user.role === 'SUPER_ADMIN') return notOthersDrafts;

  return {
    AND: [
      notOthersDrafts,
      {
        OR: [
          { requesterId: user.id },
          { assigneeId: user.id },
          { category: { managers: { some: { userId: user.id } } } },
        ],
      },
    ],
  };
}
