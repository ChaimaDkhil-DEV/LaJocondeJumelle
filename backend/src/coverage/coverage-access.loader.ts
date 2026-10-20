import { Injectable } from '@nestjs/common';
import type { Request } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma.service';
import { groupFlagsOf } from './coverage-groups';
import type { CoverageFacts, CoverageViewer } from './domain/coverage-policy';
import { isCoverageStatus, type CoverageRules } from './domain/coverage-state-machine';

/** Instantané des règles d'une affectation, copié dans Request.rulesSnapshot à la création. */
export interface CoverageRulesSnapshot extends CoverageRules {
  kind: 'COVERAGE';
  takeoverMinutes: number | null;
  arrivalMinutes: number | null;
}

export function readCoverageRules(request: Pick<Request, 'rulesSnapshot'>): CoverageRulesSnapshot {
  const raw = request.rulesSnapshot as Partial<CoverageRulesSnapshot> | null;
  return {
    kind: 'COVERAGE',
    proofMode: raw?.proofMode ?? 'PHOTO',
    finalValidation: raw?.finalValidation ?? false,
    takeoverMinutes: raw?.takeoverMinutes ?? null,
    arrivalMinutes: raw?.arrivalMinutes ?? null,
  };
}

/** Charge depuis la base ce qu'il faut à la politique d'accès des affectations (coverage-policy.ts). */
@Injectable()
export class CoverageAccessLoader {
  constructor(private readonly prisma: PrismaService) {}

  /** Utilisateur et son appartenance aux groupes à clé système (R7). */
  async viewer(user: Pick<AuthenticatedUser, 'id' | 'role' | 'active'>): Promise<CoverageViewer> {
    return { id: user.id, role: user.role, active: user.active, ...(await groupFlagsOf(this.prisma, user.id)) };
  }

  async facts(
    request: Pick<Request, 'id' | 'kind' | 'status' | 'assigneeId' | 'requesterId' | 'rulesSnapshot'>,
  ): Promise<CoverageFacts | null> {
    if (request.kind !== 'COVERAGE' || !isCoverageStatus(request.status)) return null;
    const [detail, supports] = await Promise.all([
      this.prisma.coverageDetail.findUnique({ where: { requestId: request.id }, select: { source: true } }),
      this.prisma.coverageSupport.findMany({ where: { requestId: request.id, releasedAt: null }, select: { userId: true } }),
    ]);
    const rules = readCoverageRules(request);
    return {
      status: request.status,
      assigneeId: request.assigneeId,
      rules: { proofMode: rules.proofMode, finalValidation: rules.finalValidation },
      requesterId: request.requesterId,
      source: detail?.source ?? null,
      supportUserIds: new Set(supports.map((s) => s.userId)),
    };
  }
}
