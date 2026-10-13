import { Injectable } from '@nestjs/common';
import type { Request } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { CoverageFacts } from './domain/coverage-policy';
import { isCoverageStatus, type CoverageRules } from './domain/coverage-state-machine';

/** Instantané des règles d'une couverture, copié dans Request.rulesSnapshot à la création. */
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

/** Charge depuis la base ce qu'il faut à la politique d'accès des couvertures (coverage-policy.ts). */
@Injectable()
export class CoverageAccessLoader {
  constructor(private readonly prisma: PrismaService) {}

  async facts(
    request: Pick<Request, 'id' | 'kind' | 'status' | 'assigneeId' | 'requesterId' | 'categoryId' | 'rulesSnapshot'>,
    userId: string,
  ): Promise<CoverageFacts | null> {
    if (request.kind !== 'COVERAGE' || !isCoverageStatus(request.status)) return null;
    const [managers, membership] = await Promise.all([
      this.prisma.categoryManager.findMany({ where: { categoryId: request.categoryId }, select: { userId: true } }),
      this.prisma.coverageTarget.findFirst({
        where: { requestId: request.id, group: { members: { some: { userId } } } },
        select: { groupId: true },
      }),
    ]);
    const rules = readCoverageRules(request);
    return {
      status: request.status,
      assigneeId: request.assigneeId,
      rules: { proofMode: rules.proofMode, finalValidation: rules.finalValidation },
      requesterId: request.requesterId,
      managerIds: new Set(managers.map((m) => m.userId)),
      inTargetGroup: membership !== null,
    };
  }
}
