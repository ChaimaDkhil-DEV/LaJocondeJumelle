import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../common/errors';
import { canManageAdministration } from '../common/authorization';
import { clientIp, requestPath } from '../common/request-info';
import { AuditService } from './audit.service';

/**
 * Routes /admin/* : réservées au super administrateur.
 * S'exécute après la garde de session globale ; chaque refus est journalisé (ACCESS_DENIED / NOT_SUPER_ADMIN).
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly audit: AuditService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.auth?.user;
    if (user && canManageAdministration(user)) return true;

    await this.audit.log('ACCESS_DENIED', {
      actorId: user?.id ?? null,
      ip: clientIp(req),
      details: { reason: 'NOT_SUPER_ADMIN', route: requestPath(req), method: req.method, channel: 'http' },
    });
    throw new AppException('FORBIDDEN');
  }
}
