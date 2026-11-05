import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from './errors';

/** Envois autorisés par utilisateur et par fenêtre, tous points d'envoi confondus (pièces, vocaux, photos de profil). */
export const UPLOAD_RATE_LIMIT = 30;
export const UPLOAD_RATE_WINDOW_MS = 60_000;

/** Fenêtre glissante en mémoire (l'API tourne en une seule instance, comme la limite de l'assistance). */
export class UserRateLimiter {
  private readonly calls = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** `true` si l'appel est accepté (et compté) ; un refus ne consomme rien. */
  tryConsume(key: string): boolean {
    const now = this.now();
    const recent = (this.calls.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.calls.set(key, recent);
      return false;
    }
    recent.push(now);
    this.calls.set(key, recent);
    return true;
  }
}

const limiter = new UserRateLimiter(UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS);

/**
 * Limite les envois de fichiers par utilisateur. Placée avant l'intercepteur Multer : un envoi refusé
 * n'écrit rien sur le disque. S'exécute après la garde de session globale (l'utilisateur est connu).
 */
@Injectable()
export class UploadRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const userId = context.switchToHttp().getRequest<Request>().auth?.user.id;
    if (!userId) return true; // sans session, la garde globale a déjà répondu 401
    if (!limiter.tryConsume(userId)) throw new AppException('RATE_LIMITED', undefined, 'Trop d’envois en peu de temps. Patientez une minute avant de réessayer.');
    return true;
  }
}
