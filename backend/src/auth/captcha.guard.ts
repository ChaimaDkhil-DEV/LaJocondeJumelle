import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AppException, type ErrorCode } from '../common/errors';
import { clientIp, requestPath } from '../common/request-info';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { MAX_CAPTCHA_TOKEN_LENGTH, TurnstileService, type CaptchaVerdict } from './turnstile.service';

const CAPTCHA_ACTION = 'captchaAction';

/** Action Turnstile d'une route protégée par CaptchaGuard : un jeton émis pour une autre action y est refusé. */
export const CaptchaAction = (action: string) => SetMetadata(CAPTCHA_ACTION, action);

const REFUSALS = {
  INVALID: 'CAPTCHA_INVALID',
  EXPIRED: 'CAPTCHA_EXPIRED',
  UNAVAILABLE: 'CAPTCHA_UNAVAILABLE',
} as const satisfies Record<Exclude<CaptchaVerdict, 'VALID'>, ErrorCode>;

/** Jeton Turnstile du corps de la requête (champ `captchaToken`), ou null s'il ne peut pas en être un. */
function captchaTokenOf(req: Request): string | null {
  const token = (req.body as { captchaToken?: unknown } | undefined)?.captchaToken;
  return typeof token === 'string' && token !== '' && token.length <= MAX_CAPTCHA_TOKEN_LENGTH ? token : null;
}

/**
 * CAPTCHA d'une route publique : `@CaptchaAction('…')` et `@UseGuards(…, CaptchaGuard)`, après la limite de débit de la
 * route. Le jeton est vérifié avant tout traitement de la requête ; les refus sont journalisés (blocage et panne : une
 * fois par adresse IP et par fenêtre). Sans effet si Turnstile n'est pas configuré.
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly turnstile: TurnstileService,
    private readonly attempts: LoginAttemptLimiter,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.turnstile.enabled) return true;
    const action = this.reflector.get<string | undefined>(CAPTCHA_ACTION, context.getHandler());
    if (!action) throw new Error('CaptchaGuard exige @CaptchaAction sur la route');

    const req = context.switchToHttp().getRequest<Request>();
    const ip = clientIp(req);
    // Un jeton refusé compte pour l'adresse IP, jamais pour un identifiant : un robot ne verrouille aucun compte.
    const attempt = this.attempts.reserveCaptcha(ip);
    if (!attempt.allowed) {
      if (attempt.firstBlock) await this.deny(req, 'RATE_LIMITED');
      throw new AppException('RATE_LIMITED', undefined, 'Trop de tentatives. Patientez quelques minutes avant de réessayer.');
    }

    const token = captchaTokenOf(req);
    const verdict = token === null ? null : await this.turnstile.verify(token, action);
    // Une panne de Cloudflare n'est pas la faute de l'école : elle refuse sans compter comme un échec.
    if (verdict === 'VALID' || verdict === 'UNAVAILABLE') this.attempts.releaseCaptcha(ip);
    if (verdict === 'VALID') return true;

    const code = verdict === null ? 'CAPTCHA_REQUIRED' : REFUSALS[verdict];
    if (verdict !== 'UNAVAILABLE' || this.attempts.firstOutage(ip)) await this.deny(req, code);
    throw new AppException(code);
  }

  private async deny(req: Request, reason: ErrorCode): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      ip: clientIp(req),
      details: { reason, route: requestPath(req), method: req.method, channel: 'http' },
    });
  }
}
