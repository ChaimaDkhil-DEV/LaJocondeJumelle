import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { isAllowedOrigin } from '../common/origin';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { clientIp, requestPath } from '../common/request-info';
import { INTEGRATION_ROUTE } from './integration-route.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF (research R7) : toute requête modifiante doit porter un en-tête Origin
 * (ou, à défaut, Referer) égal à l'origine de l'application. Refus journalisé. Exception : les routes
 * @IntegrationRoute() (n8n, 015), sans cookie, protégées par leur propre secret partagé.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(INTEGRATION_ROUTE, [context.getHandler(), context.getClass()])) return true;

    if (isAllowedOrigin(req.headers, this.config.allowedOrigins, { allowReferer: true })) return true;

    await this.audit.log('ACCESS_DENIED', {
      ip: clientIp(req),
      details: { reason: 'ORIGIN_MISMATCH', route: requestPath(req), method: req.method, channel: 'http' },
    });
    throw new AppException('FORBIDDEN');
  }
}
