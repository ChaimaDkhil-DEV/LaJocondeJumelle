import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FINAL_STATUSES } from './domain/coverage-status';

const BATCH = 200;
/** Compte technique créé par la migration 0009 (R5). */
const ANONYMOUS_USERNAME = 'enseignant-anonymise';

/**
 * Anonymisation des affectations au bout de la durée de conservation (FR-023a, R5, data-model §8) :
 * enseignant, enseignant absent (texte libre), motif ; pour une demande d'enseignant, auteur
 * remplacé par le compte technique et consigne effacée. Conservés : dates, classe, étage, type,
 * source, statuts, durée. Jamais modifiés : historique (`RequestEvent`, ajout seul), journal
 * d'audit, notifications. Idempotent (`anonymizedAt`).
 */
@Injectable()
export class CoverageAnonymizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /** Un passage complet ; renvoie le nombre d'affectations anonymisées (0 si un autre passage est en cours). */
  async runOnce(now = new Date()): Promise<number> {
    const retentionMonths = await this.settings.get('coverageRetentionMonths');
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);

    return this.prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtext('coverage-anonymization-job')) AS locked`;
        if (!locked) return 0;
        // Créé par la migration 0009 ; recréé à l'identique s'il manque (base réinitialisée).
        const anonymous = await tx.user.upsert({
          where: { username: ANONYMOUS_USERNAME },
          update: {},
          create: {
            username: ANONYMOUS_USERNAME,
            displayName: 'Enseignant anonymisé',
            role: 'EMPLOYEE',
            passwordHash: '!',
            mustChangePassword: true,
            active: false,
          },
          select: { id: true },
        });

        let total = 0;
        for (;;) {
          const batch = await tx.request.findMany({
            where: {
              kind: 'COVERAGE',
              status: { in: [...FINAL_STATUSES] },
              coverage: { anonymizedAt: null, startAt: { lt: cutoff } },
            },
            select: { id: true, coverage: { select: { source: true } } },
            orderBy: { id: 'asc' },
            take: BATCH,
          });
          if (batch.length === 0) break;
          const ids = batch.map((r) => r.id);
          const teacherRequests = batch.filter((r) => r.coverage!.source === 'TEACHER_REQUEST').map((r) => r.id);
          await tx.coverageDetail.updateMany({
            where: { requestId: { in: ids } },
            data: { teacherId: null, absentTeacher: null, reason: null, anonymizedAt: now },
          });
          if (teacherRequests.length > 0) {
            await tx.request.updateMany({ where: { id: { in: teacherRequests } }, data: { requesterId: anonymous.id, description: null } });
          }
          await tx.requestEvent.createMany({
            data: ids.map((requestId) => ({
              requestId,
              actorId: null,
              type: 'ANONYMIZED' as const,
              toValue: { fields: ['teacherId', 'absentTeacher', 'reason', 'requesterId', 'description'], retentionMonths },
              createdAt: now,
            })),
          });
          total += ids.length;
        }
        if (total > 0) {
          await this.audit.log(
            'COVERAGE_ANONYMIZED',
            { actorId: null, targetType: 'Request', targetId: 'coverage', details: { count: total, retentionMonths, cutoff: cutoff.toISOString() } },
            tx,
          );
        }
        return total;
      },
      { timeout: 60_000 },
    );
  }
}
