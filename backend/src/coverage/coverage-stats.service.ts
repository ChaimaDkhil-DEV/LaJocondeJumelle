import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { addDays, atLocalTime, localDate } from '../common/school-time';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import type { RequestContext } from '../requests/requests.service';
import type { CoverageStatsQuery } from './coverage.dto';
import { computeCoverageStats } from './domain/coverage-stats';
import { isCoverageAdmin } from './domain/coverage-policy';

/** Période maximale d'une requête de statistiques (calcul à la demande, sans table d'agrégats). */
const MAX_DAYS = 400;

/**
 * Statistiques des affectations (US5, FR-022, data-model §7) : admin et super administrateur
 * seulement (données par enseignant, FR-023) ; aucun export.
 */
@Injectable()
export class CoverageStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async stats(user: AuthenticatedUser, query: CoverageStatsQuery, ctx: RequestContext) {
    if (!isCoverageAdmin(user)) {
      await this.audit.log('ACCESS_DENIED', {
        actorId: user.id,
        targetType: 'Request',
        targetId: 'coverage-stats',
        ip: ctx.ip,
        details: { reason: 'NOT_COVERAGE_ADMIN', route: ctx.route, method: ctx.method, channel: 'http' },
      });
      throw new AppException('NOT_FOUND');
    }
    const tz = this.config.schoolTimezone;
    const today = localDate(new Date(), tz);
    // Par défaut : du début du mois en cours à aujourd'hui (fuseau de l'école).
    const from = query.from ?? `${today.slice(0, 7)}-01`;
    const to = query.to ?? today;
    if (from > to || addDays(from, MAX_DAYS) < to) throw new AppException('INVALID_RANGE');
    const groupBy = query.groupBy ?? 'teacher';
    const period = query.period ?? 'week';

    const rows = await this.prisma.request.findMany({
      where: {
        kind: 'COVERAGE',
        coverage: { startAt: { gte: atLocalTime(from, '00:00', tz), lt: atLocalTime(addDays(to, 1), '00:00', tz) } },
      },
      select: {
        id: true,
        status: true,
        coverage: {
          select: {
            type: true,
            startAt: true,
            durationMinutes: true,
            mergedIntoId: true,
            reliefForId: true,
            anonymizedAt: true,
            teacher: { select: { id: true, displayName: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
    });
    const ids = rows.map((r) => r.id);
    const proposals = await this.prisma.coverageMergeProposal.findMany({
      where: { OR: [{ sourceRequestId: { in: ids } }, { targetRequestId: { in: ids } }] },
      select: { sourceRequestId: true, targetRequestId: true, status: true, finalPresentedAt: true },
    });

    const result = computeCoverageStats(
      rows.map((r) => ({ id: r.id, status: r.status, ...r.coverage! })),
      proposals.map((p) => ({ sourceId: p.sourceRequestId, targetId: p.targetRequestId, status: p.status, finalPresentedAt: p.finalPresentedAt })),
      { groupBy, period, timezone: tz },
    );
    return { from, to, groupBy, period, timezone: tz, ...result };
  }
}
