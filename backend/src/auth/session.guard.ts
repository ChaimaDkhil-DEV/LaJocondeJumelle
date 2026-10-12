import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { ALLOW_PENDING_PASSWORD_CHANGE } from './allow-pending-password-change.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { clientIp, requestPath } from './request-info';
import { SessionService } from './session.service';

export const SESSION_COOKIE = 'sid';

/**
 * Garde globale : toute route exige une session valide, sauf @Public().
 * Chaque refus (401) est journalisé en ACCESS_DENIED / UNAUTHENTICATED (principe V).
 * Un utilisateur devant changer son mot de passe n'accède qu'aux routes /auth/*.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const result = await this.sessions.validate(token);

    if (!result.ok) {
      await this.audit.log('ACCESS_DENIED', {
        ip: clientIp(req),
        details: {
          reason: 'UNAUTHENTICATED',
          status: result.reason,
          route: requestPath(req),
          method: req.method,
          channel: 'http',
        },
      });
      throw new AppException('UNAUTHENTICATED');
    }

    req.auth = { user: result.user, sessionId: result.session.id };

    if (
      result.user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, targets)
    ) {
      throw new AppException('PASSWORD_CHANGE_REQUIRED');
    }
    return true;
  }
}
