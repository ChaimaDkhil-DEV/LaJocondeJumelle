import { Inject, Injectable } from '@nestjs/common';
import webpush from 'web-push';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';

/** Abonnement d'un appareil tel que l'exige le protocole Web Push. */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushSendOptions {
  /** Sujet de remplacement : un message en attente chez le service de push est remplacé (research R6). */
  topic: string;
}

/** Code HTTP du service de push, ou null pour une erreur réseau, un délai dépassé ou un envoi impossible. */
export interface PushSendResult {
  statusCode: number | null;
  /** En-tête retry-after en secondes, s'il est présent et lisible. */
  retryAfterSeconds?: number;
}

export interface PushSender {
  send(target: PushTarget, payload: string, options: PushSendOptions): Promise<PushSendResult>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Validité d'un push chez le service de push : 30 min, fixe pour toutes les catégories (NC-5). */
export const PUSH_TTL_SECONDS = 1800;
const REQUEST_TIMEOUT_MS = 10_000;

function retryAfterSeconds(headers: unknown): number | undefined {
  const raw = (headers as Record<string, unknown> | undefined)?.['retry-after'];
  return typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : undefined;
}

/**
 * Envoi par la bibliothèque web-push (014, research R1) : contenu chiffré (RFC 8291), serveur identifié
 * par les clés de l'établissement (RFC 8292). Aucune exception ne sort : le dispatcher décide des nouvelles
 * tentatives à partir du code rendu. Rien n'est journalisé ici (ni contenu, ni adresse, ni clé).
 */
@Injectable()
export class WebPushSender implements PushSender {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(target: PushTarget, payload: string, options: PushSendOptions): Promise<PushSendResult> {
    const push = this.config.push;
    if (!push) return { statusCode: null };
    try {
      const response = await webpush.sendNotification(target, payload, {
        TTL: PUSH_TTL_SECONDS,
        urgency: 'high',
        topic: options.topic,
        timeout: REQUEST_TIMEOUT_MS,
        vapidDetails: { subject: push.subject, publicKey: push.publicKey, privateKey: push.privateKey },
      });
      return { statusCode: response.statusCode };
    } catch (error) {
      if (error instanceof webpush.WebPushError) {
        const after = retryAfterSeconds(error.headers);
        return after === undefined ? { statusCode: error.statusCode } : { statusCode: error.statusCode, retryAfterSeconds: after };
      }
      return { statusCode: null };
    }
  }
}
