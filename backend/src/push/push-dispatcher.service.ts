import { Inject, Injectable } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';

/**
 * Envoi des notifications en push (014, research R2). Appelé par le diffuseur composé après la
 * validation de la transaction ; jamais attendu, ne lève jamais d'exception (FR-005). Sans effet tant
 * que l'établissement n'a pas configuré ses clés (D9, FR-013).
 * Complété en US1 (T021) : décision d'envoi, contenu, nouvelles tentatives.
 */
@Injectable()
export class PushDispatcher {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  enqueue(notifications: Notification[]): void {
    if (!this.config.push || notifications.length === 0) return;
  }
}
