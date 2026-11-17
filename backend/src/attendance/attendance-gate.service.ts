import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { CoverageAccessLoader } from '../coverage/coverage-access.loader';
import { CoverageActionsService } from '../coverage/coverage-actions.service';
import { moduleCapabilities } from '../coverage/domain/coverage-policy';
import { verifyQrToken } from '../coverage/domain/qr-token';
import type { RequestContext } from '../requests/requests.service';

/**
 * Contrôles communs au pointage (arrivée) et à la présence (départ, retour, liste) : qui peut scanner, qui
 * peut suivre, et quelle classe désigne un QR. Écrits une seule fois pour les deux services.
 */
@Injectable()
export class AttendanceGate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CoverageAccessLoader,
    private readonly actions: CoverageActionsService,
    private readonly audit: AuditService,
  ) {}

  /** Pointer son arrivée ou son départ : membre du groupe Enseignants ; sinon 404 journalisé (comme le module Gardes). */
  async assertTeacher(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (moduleCapabilities(await this.access.viewer(user)).recordArrival) return;
    await this.logDenied(user, ctx, 'NOT_TEACHER');
    throw new AppException('NOT_FOUND');
  }

  /** Suivi, saisie, correction, remplaçant, liste des présents : admin ou super administrateur du module. */
  async assertManager(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (moduleCapabilities(await this.access.viewer(user)).manage) return;
    await this.logDenied(user, ctx, 'NOT_MANAGER');
    throw new AppException('NOT_FOUND');
  }

  /** Classe du QR : signature, version en cours (non révoquée) et classe active. */
  async classFromToken(token: string) {
    const parsed = verifyQrToken(this.actions.key, token);
    const schoolClass = parsed ? await this.prisma.schoolClass.findUnique({ where: { id: parsed.classId } }) : null;
    if (!parsed || !schoolClass || !schoolClass.active || schoolClass.qrVersion !== parsed.version) throw new AppException('QR_INVALID');
    return schoolClass;
  }

  private async logDenied(user: AuthenticatedUser, ctx: RequestContext, reason: string): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      actorId: user.id,
      targetType: 'Attendance',
      targetId: 'attendance',
      ip: ctx.ip,
      details: { reason, route: ctx.route, method: ctx.method, channel: 'http' },
    });
  }
}
