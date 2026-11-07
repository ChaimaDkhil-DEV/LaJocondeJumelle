import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../common/errors';
import { canUseAdministrationSpace } from '../common/authorization';
import { clientIp, requestPath } from '../common/request-info';
import { AuditService } from './audit.service';

/**
 * Routes /admin/* ouvertes à l'administration (011) : données de référence et liste des employés,
 * pour l'admin et le super administrateur. S'exécute après la garde de session globale ; chaque refus
 * est journalisé (ACCESS_DENIED / NOT_ADMINISTRATION). Les autres routes /admin/* gardent SuperAdminGuard.
 */
@Injectable()
export class AdministrationGuard implements CanActivate {
  constructor(private readonly audit: AuditService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.auth?.user;
    if (user && canUseAdministrationSpace(user)) return true;

    await this.audit.log('ACCESS_DENIED', {
      actorId: user?.id ?? null,
      ip: clientIp(req),
      details: { reason: 'NOT_ADMINISTRATION', route: requestPath(req), method: req.method, channel: 'http' },
    });
    throw new AppException('FORBIDDEN');
  }
}
