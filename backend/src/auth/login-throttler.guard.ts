import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { clientIp, requestPath } from '../common/request-info';

function usernameOf(req: Request): string {
  const body = req.body as { username?: unknown } | undefined;
  return typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
}

/**
 * Limite les tentatives de connexion par couple (adresse IP, identifiant) : 5 par minute.
 * Chaque blocage est journalisé (ACCESS_DENIED / RATE_LIMITED).
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly audit: AuditService,
  ) {
    super(options, storage, reflector);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request;
    return `${clientIp(request) ?? 'inconnue'}|${usernameOf(request)}`;
  }

  protected override async throwThrottlingException(context: ExecutionContext): Promise<void> {
    const req = context.switchToHttp().getRequest<Request>();
    await this.audit.log('ACCESS_DENIED', {
      ip: clientIp(req),
      details: {
        reason: 'RATE_LIMITED',
        route: requestPath(req),
        method: req.method,
        channel: 'http',
        username: usernameOf(req),
      },
    });
    throw new AppException('RATE_LIMITED');
  }
}
