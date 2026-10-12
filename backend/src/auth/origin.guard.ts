import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { clientIp, requestPath } from './request-info';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Protection CSRF (research R7) : toute requête modifiante doit porter un en-tête Origin
 * (ou, à défaut, Referer) égal à l'origine de l'application. Refus journalisé.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = originOf(req.headers.origin) ?? originOf(req.headers.referer);
    if (origin === this.config.appOrigin) return true;

    await this.audit.log('ACCESS_DENIED', {
      ip: clientIp(req),
      details: { reason: 'ORIGIN_MISMATCH', route: requestPath(req), method: req.method, channel: 'http' },
    });
    throw new AppException('FORBIDDEN');
  }
}
