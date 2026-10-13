import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { clientIp, requestPath } from '../auth/request-info';
import { AppException } from './errors';

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
    if (user?.role === 'SUPER_ADMIN' && user.active) return true;

    await this.audit.log('ACCESS_DENIED', {
      actorId: user?.id ?? null,
      ip: clientIp(req),
      details: { reason: 'NOT_SUPER_ADMIN', route: requestPath(req), method: req.method, channel: 'http' },
    });
    throw new AppException('FORBIDDEN');
  }
}
