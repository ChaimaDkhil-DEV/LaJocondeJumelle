import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { canManageMealServices } from '../common/authorization';
import { AppException } from '../common/errors';
import { clientIp, requestPath } from '../common/request-info';

/** Routes /meal-services/* : administration uniquement ; chaque refus est journalisé. */
@Injectable()
export class MealServiceGuard implements CanActivate {
  constructor(private readonly audit: AuditService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.auth?.user;
    if (user && canManageMealServices(user)) return true;

    await this.audit.log('ACCESS_DENIED', {
      actorId: user?.id ?? null,
      ip: clientIp(req),
      details: { reason: 'NOT_ADMINISTRATION', route: requestPath(req), method: req.method, channel: 'http' },
    });
    throw new AppException('FORBIDDEN');
  }
}
