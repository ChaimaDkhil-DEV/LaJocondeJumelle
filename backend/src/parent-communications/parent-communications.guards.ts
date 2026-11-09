import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { groupFlagsOf } from '../common/group-flags';
import { PrismaService } from '../common/prisma.service';
import { clientIp, requestPath } from '../common/request-info';
import { ParentCommunicationsService } from './parent-communications.service';

/**
 * Communication aux parents (015) : refus avant toute lecture du corps ou des filtres (403, jamais 400
 * pour un utilisateur non autorisé), journalisé (ACCESS_DENIED). S'exécute après la garde de session
 * globale ; le service vérifie encore les droits (défense en profondeur).
 */
abstract class CommunicationAccessGuard implements CanActivate {
  protected abstract readonly reason: string;

  constructor(protected readonly audit: AuditService) {}

  protected abstract allowed(user: AuthenticatedUser): Promise<boolean>;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.auth?.user;
    if (user && (await this.allowed(user))) return true;
    await this.audit.log('ACCESS_DENIED', {
      actorId: user?.id ?? null,
      ip: clientIp(req),
      details: {
        reason: this.reason,
        route: requestPath(req),
        method: req.method,
        channel: 'http',
      },
    });
    throw new AppException('FORBIDDEN');
  }
}

/** « Communications à valider » : permission PARENT_COMMUNICATION_VALIDATE. */
@Injectable()
export class CommunicationValidatorGuard extends CommunicationAccessGuard {
  protected readonly reason = 'NOT_COMMUNICATION_VALIDATOR';

  constructor(
    audit: AuditService,
    private readonly communications: ParentCommunicationsService,
  ) {
    super(audit);
  }

  protected allowed(user: AuthenticatedUser): Promise<boolean> {
    return Promise.resolve(this.communications.isValidator(user));
  }
}

/** « Communication avec les parents » : membres actifs du groupe Enseignants. */
@Injectable()
export class CommunicationTeacherGuard extends CommunicationAccessGuard {
  protected readonly reason = 'NOT_TEACHER';

  constructor(
    audit: AuditService,
    private readonly prisma: PrismaService,
  ) {
    super(audit);
  }

  protected async allowed(user: AuthenticatedUser): Promise<boolean> {
    return (
      user.active && user.role !== 'PARENT' && (await groupFlagsOf(this.prisma, user.id)).isTeacher
    );
  }
}
