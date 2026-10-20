import type { Prisma, RoutingMode } from '@prisma/client';
import type { PolicyUser } from '../../common/authorization';

/**
 * Équivalent SQL (filtre Prisma) de canReadRequest, pour les listes, la recherche et les compteurs :
 * - brouillons : auteur uniquement ;
 * - autres statuts : demandeur, employé affecté actuel, responsables de la catégorie ;
 * - super administrateur : toutes les demandes hors brouillons des autres.
 * Un compte désactivé ne voit rien. Les couvertures de classe (kind = COVERAGE) sont exclues :
 * elles ont leurs propres écrans et leur propre politique (coverage/).
 */
export function visibleRequestsWhere(user: Pick<PolicyUser, 'id' | 'role' | 'active'>): Prisma.RequestWhereInput {
  if (!user.active) return { id: { in: [] } };

  const notOthersDrafts: Prisma.RequestWhereInput = {
    OR: [{ status: { not: 'DRAFT' } }, { requesterId: user.id }],
  };

  if (user.role === 'SUPER_ADMIN') return { AND: [{ kind: 'WORK' }, notOthersDrafts] };

  return {
    AND: [
      { kind: 'WORK' },
      notOthersDrafts,
      {
        OR: [
          { requesterId: user.id },
          { assigneeId: user.id },
          { category: { managers: { some: { userId: user.id } } } },
          // Administration : consultation des demandes directes et entre enseignants (lecture seule).
          ...(user.role === 'ADMIN' ? [{ category: { routingMode: { in: ['DIRECT', 'PEER'] as RoutingMode[] } } }] : []),
        ],
      },
    ],
  };
}
