import { Injectable } from '@nestjs/common';
import type { Priority, RequestStatus } from '@prisma/client';
import type { PolicyUser } from '../common/authorization';
import { PrismaService } from '../common/prisma.service';
import { visibleRequestsWhere } from '../requests/domain/visibility';

/** Demande proche du texte soumis, telle qu'affichée dans le panneau (spec 010, FR-003). */
export interface SimilarRequest {
  id: string;
  reference: string;
  title: string;
  categoryName: string;
  priority: Priority;
  status: RequestStatus;
}

/** Candidats lus par la recherche plein texte, avant le filtre d'accès. */
const CANDIDATES = 20;
const RESULTS = 3;

/**
 * Demandes similaires (spec 010, US1, research R1) : recherche plein texte en français sur le titre
 * et la description, puis filtre d'accès par `visibleRequestsWhere` — la règle de la liste des
 * demandes, sans réécriture SQL : aucun résultat ne sort sans passer par elle. Brouillons et gardes
 * de classe exclus. La description sert à la recherche mais n'est jamais renvoyée.
 */
@Injectable()
export class SimilarRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(user: Pick<PolicyUser, 'id' | 'role' | 'active'>, text: string): Promise<SimilarRequest[]> {
    if (!text.trim() || !user.active) return [];
    // Requête construite comme pour les consignes : lexèmes du texte reliés par « ou », chacun cité.
    const ranked = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH q AS (
        SELECT to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) AS query
        FROM unnest(to_tsvector('french', ${text}))
      )
      SELECT r."id"
      FROM "Request" r, q
      WHERE q.query IS NOT NULL
        AND r."kind" = 'WORK'
        AND r."status" <> 'DRAFT'
        AND ts_rank(to_tsvector('french', r."title" || ' ' || coalesce(r."description", '')), q.query) > 0
      ORDER BY ts_rank(to_tsvector('french', r."title" || ' ' || coalesce(r."description", '')), q.query) DESC,
        r."createdAt" DESC
      LIMIT ${CANDIDATES}
    `;
    if (ranked.length === 0) return [];

    const visible = await this.prisma.request.findMany({
      where: { AND: [visibleRequestsWhere(user), { id: { in: ranked.map((r) => r.id) } }] },
      select: { id: true, reference: true, title: true, priority: true, status: true, category: { select: { name: true } } },
    });
    const byId = new Map(visible.map((r) => [r.id, r]));
    return ranked
      .map((r) => byId.get(r.id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
      .slice(0, RESULTS)
      .map(({ category, ...r }) => ({ ...r, categoryName: category.name }));
  }
}
